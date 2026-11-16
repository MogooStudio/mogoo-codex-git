import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPluginUpdater, latestTag } from '../server/plugin-update.mjs';

const { name, version, repository } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
const next = `${major}.${minor}.${patch + 10}`;
const later = `${major}.${minor}.${patch + 11}`;

async function fixture(t) {
  const parent = await realpath(os.tmpdir());
  const home = await mkdtemp(path.join(parent, 'mogoo-update-test-'));
  t.after(async () => {
    assert.equal(path.dirname(home), parent);
    assert.ok(path.basename(home).startsWith('mogoo-update-test-'));
    await rm(home, { recursive: true, force: true });
  });
  const cache = path.join(home, 'plugins', 'cache', name, name);
  const market = path.join(home, '.tmp', 'marketplaces', name);
  const projectRoot = path.join(cache, version);
  const manifest = async (root, value) => {
    const folder = path.join(root, '.codex-plugin');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'plugin.json'), JSON.stringify({ name, version: value }));
  };
  const staged = value => manifest(path.join(market, 'plugins', name), value);
  const installed = value => manifest(path.join(cache, value), value);
  await Promise.all([staged(version), installed(version)]);
  return { home, market, projectRoot, staged, installed };
}

test('发行标签按数字版本排序，跳过预览和解引用标签，拒绝残缺响应', () => {
  const packet = line => (Buffer.byteLength(line) + 4).toString(16).padStart(4, '0') + line;
  const refs = ['v0.1.10', 'v0.1.9', 'v0.2.0-rc.1', 'v0.3.0^{}', 'v00.4.0']
    .map(tag => packet(`${'a'.repeat(40)} refs/tags/${tag}\n`)).join('');
  assert.equal(latestTag(Buffer.from(packet('# service=git-upload-pack\n') + '0000' + refs + '0000')), '0.1.10');
  assert.throws(() => latestTag(Buffer.from('0050abc0000')), /Incomplete/);
});

test('跨面板共用检查缓存和开关，手动检查尊重失败冷却', async t => {
  const { home } = await fixture(t);
  const started = Promise.withResolvers(), finish = Promise.withResolvers();
  let checks = 0;
  const a = createPluginUpdater({ home, readLatest: async () => {
    checks++;
    started.resolve();
    return finish.promise;
  } });
  const b = createPluginUpdater({ home, readLatest: async () => { checks++; throw new Error('offline'); } });
  const first = a({ action: 'auto' });
  await started.promise;
  assert.equal((await b({ action: 'auto' })).checking, true);
  finish.resolve(next);
  assert.equal((await first).latest, next);
  assert.equal((await b({ action: 'auto' })).latest, next);
  assert.equal(checks, 1);
  await a({ action: 'configure', enabled: false }, true);
  assert.equal((await b({ action: 'auto' })).autoCheck, false);
  assert.equal((await b({ action: 'check' })).remoteStatus, 'unavailable');
  assert.equal((await a({ action: 'check' })).latest, next);
  assert.equal(checks, 2);
});

async function afterInstall(update) {
  for (let i = 0; i < 100; i++) {
    const status = await update({ action: 'status' }, true);
    if (status.operation?.state !== 'running') return status;
    await delay(20);
  }
  assert.fail('Install did not settle');
}

test('GitHub 单仓库：默认标签请求、更新内容和确认后的完整升级流程使用同一来源', async t => {
  const { home, market, projectRoot, staged, installed } = await fixture(t);
  const github = 'https://github.com/MogooStudio/mogoo-codex-git.git';
  const packet = line => (Buffer.byteLength(line) + 4).toString(16).padStart(4, '0') + line;
  const advertisement = packet('# service=git-upload-pack\n') + '0000'
    + packet(`${'a'.repeat(40)} HEAD\0multi_ack thin-pack\n`)
    + packet(`${'b'.repeat(40)} refs/tags/v${next}\n`) + '0000';
  const requests = [], commands = [];
  // Exercise the real fetchLatest path without contacting or changing a remote.
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(url);
    assert.equal(url, `${github}/info/refs?service=git-upload-pack`);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/x-git-upload-pack-advertisement' });
    return new Response(advertisement, { headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } });
  });
  const update = createPluginUpdater({ home, projectRoot, runCodex: async args => {
    if (args[2] === 'list') return JSON.stringify({ marketplaces: [
      { name, root: market, marketplaceSource: { sourceType: 'git', source: github } },
    ] });
    commands.push(args);
    if (args[2] === 'upgrade') await staged(next);
    if (args[1] === 'add') await installed(next);
    return '';
  } });
  const checked = await update({ action: 'check' }, true);
  assert.equal(checked.latest, next);
  assert.equal(checked.remoteStatus, 'ok');
  assert.equal(checked.canInstall, true);
  assert.equal(checked.changelog, 'https://github.com/MogooStudio/mogoo-codex-git/blob/main/CHANGELOG.zh.md');
  await update({ action: 'install', target: next, confirmed: true }, true);
  const result = await afterInstall(update);
  assert.deepEqual(requests, [`${github}/info/refs?service=git-upload-pack`]);
  assert.deepEqual(commands, [
    ['plugin', 'marketplace', 'upgrade', name, '--json'],
    ['plugin', 'add', `${name}@${name}`, '--json'],
  ]);
  assert.equal(result.installed, next);
  assert.equal(result.pending, true);
});

test('只允许确认后的原生面板更新，已就绪快照跳过升级，CLI 失败后以安装结果为准', async t => {
  const { home, market, projectRoot, staged, installed } = await fixture(t);
  await staged(next);
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const commands = [];
  const runCodex = async args => {
    if (args[2] === 'list') return JSON.stringify({ marketplaces: [
      { name, root: market, marketplaceSource: { sourceType: 'git', source: repository.url } },
    ] });
    commands.push(args);
    started.resolve();
    await gate.promise;
    await installed(next);
    throw new Error('Codex failed to clean an old cache after activating the new one');
  };
  const update = createPluginUpdater({ home, projectRoot, readLatest: async () => next, runCodex });
  const second = createPluginUpdater({ home, projectRoot, runCodex });
  assert.equal((await update({ action: 'check' }, true)).canInstall, true);
  await assert.rejects(update({ action: 'install', target: next }, true), /确认更新/);
  await assert.rejects(update({ action: 'install', target: next, confirmed: true }), /确认更新/);
  await update({ action: 'install', target: next, confirmed: true }, true);
  await started.promise;
  await second({ action: 'install', target: next, confirmed: true }, true);
  gate.resolve();
  const result = await afterInstall(update);
  assert.deepEqual(commands, [['plugin', 'add', `${name}@${name}`, '--json']]);
  assert.equal(result.installed, next);
  assert.equal(result.pending, true);
  await assert.rejects(update({ action: 'dismiss', target: next }, true), /没有可忽略/);
});

test('忽略仅针对当前版本，市场来源错误或升级后版本变化时不安装', async t => {
  const { home, market, projectRoot, staged } = await fixture(t);
  let source = 'https://example.test/other.git';
  const commands = [];
  const newer = `${major}.${minor}.${patch + 12}`;
  const makeUpdater = readLatest => createPluginUpdater({ home, projectRoot, readLatest, runCodex: async args => {
    if (args[2] === 'list') return JSON.stringify({ marketplaces: [
      { name, root: market, marketplaceSource: { sourceType: 'git', source } },
    ] });
    commands.push(args);
    if (args[2] === 'upgrade') await staged(newer);
  } });
  const update = makeUpdater(async () => next);
  assert.equal((await update({ action: 'check' }, true)).canInstall, false);
  await assert.rejects(update({ action: 'install', target: next, confirmed: true }, true), /重新检查/);
  assert.equal((await update({ action: 'dismiss', target: next }, true)).available, false);
  source = repository.url;
  const official = makeUpdater(async () => next);
  await assert.rejects(official({ action: 'install', target: next, confirmed: true }, true), /重新检查/);
  const subsequent = makeUpdater(async () => later);
  assert.equal((await subsequent({ action: 'check' }, true)).available, true);
  // The next release supersedes the version accepted by the user during upgrade.
  await subsequent({ action: 'install', target: later, confirmed: true }, true);
  const result = await afterInstall(subsequent);
  assert.equal(result.operation?.state, 'error');
  assert.deepEqual(commands, [['plugin', 'marketplace', 'upgrade', name, '--json']]);
});
