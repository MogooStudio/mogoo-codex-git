import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPluginUpdater, fetchLatest, latestTag } from '../server/plugin-update.mjs';

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

test('私有发行源在 HTTP 拒绝访问时通过无交互 Git 凭据读取稳定标签', async () => {
  for (const status of [401, 403, 404]) {
    const response = new Response('authentication required', { status });
    let calls = 0;
    const result = await fetchLatest({
      request: async () => response,
      runGit: async (command, args, options) => {
        calls++;
        assert.equal(response.bodyUsed, true);
        assert.equal(command, 'git');
        assert.deepEqual(args, ['ls-remote', '--tags', '--refs', '--', repository.url]);
        assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
        assert.equal(options.env.GCM_INTERACTIVE, '0');
        assert.equal(options.windowsHide, true);
        assert.equal(options.timeout, 10000);
        assert.equal(options.maxBuffer, 1024 * 1024);
        return { stdout: ['v0.1.9', 'v0.1.10', 'v0.2.0-rc.1', 'v0.3.0^{}', 'v00.4.0']
          .map(tag => `${'b'.repeat(40)}\trefs/tags/${tag}`).join('\r\n') + '\r\n' };
      },
    });
    assert.equal(result, '0.1.10');
    assert.equal(calls, 1);
  }
  await assert.rejects(fetchLatest({
    request: async () => new Response('unavailable', { status: 503 }),
    runGit: async () => assert.fail('HTTP service failures must not invoke Git'),
  }), /Release source unavailable/);
});

test('HTTP 连接失败、超时或读取中断时，回退到无交互 Git 标签查询', async t => {
  const failures = [
    ['connection', async () => { throw new TypeError('fetch failed'); }],
    ['timeout', async () => { throw new DOMException('request timed out', 'TimeoutError'); }],
    ['body', async () => new Response(new ReadableStream({
      start(controller) { controller.error(new TypeError('connection reset')); },
    }), { headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } })],
  ];
  for (const [label, request] of failures) await t.test(label, async () => {
    let calls = 0;
    const result = await fetchLatest({ request, runGit: async (command, args, options) => {
      calls++;
      assert.equal(command, 'git');
      assert.deepEqual(args, ['ls-remote', '--tags', '--refs', '--', repository.url]);
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
      assert.equal(options.env.GCM_INTERACTIVE, '0');
      assert.equal(options.timeout, 10000);
      assert.equal(options.maxBuffer, 1024 * 1024);
      return { stdout: `${'b'.repeat(40)}\trefs/tags/v${version}\n` };
    } });
    assert.equal(result, version);
    assert.equal(calls, 1);
  });
});

test('HTTP 错误响应的清理失败不改变认证回退或服务错误拒绝', async () => {
  for (const status of [401, 403, 404, 503]) {
    let calls = 0;
    const result = fetchLatest({
      request: async () => new Response(new ReadableStream({
        start(controller) { controller.error(new TypeError('connection reset')); },
      }), { status }),
      runGit: async () => {
        calls++;
        return { stdout: `${'b'.repeat(40)}\trefs/tags/v${version}\n` };
      },
    });
    if (status === 503) {
      await assert.rejects(result, /^Error: Release source unavailable$/);
      assert.equal(calls, 0);
    } else {
      assert.equal(await result, version);
      assert.equal(calls, 1);
    }
  }
});

test('无效或过大的 HTTP 标签响应不触发 Git 回退', async () => {
  const oversized = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
    cancel() { throw new TypeError('connection reset while cancelling'); },
  });
  for (const body of [null, 'invalid refs', 'a'.repeat(1024 * 1024 + 1), oversized]) {
    await assert.rejects(fetchLatest({
      request: async () => new Response(body, { headers: { 'Content-Type': 'application/x-git-upload-pack-advertisement' } }),
      runGit: async () => assert.fail('Invalid responses must not invoke Git'),
    }), /Invalid ref advertisement|Ref advertisement too large/);
  }
});

test('HTTP 和 Git 都不可用时，只返回通用错误', async () => {
  await assert.rejects(fetchLatest({
    request: async () => { throw new TypeError('proxy-private-diagnostic'); },
    runGit: async () => { throw new Error('credential-helper-private-diagnostic'); },
  }), error => {
    assert.equal(error.message, 'Release source unavailable');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('私有源凭据失败或超大标签响应只返回通用错误，不暴露 Git 输出', async () => {
  for (const runGit of [
    async () => { throw new Error('credential-helper-private-diagnostic'); },
    async () => ({ stdout: 'a'.repeat(1024 * 1024 + 1) }),
  ]) {
    await assert.rejects(fetchLatest({ request: async () => new Response('', { status: 404 }), runGit }), error => {
      assert.equal(error.message, 'Release source unavailable');
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('升级后不沿用旧版版本检查的失败冷却', async t => {
  const { home } = await fixture(t);
  const state = path.join(home, 'mogoo-codex-git', 'update');
  await mkdir(state, { recursive: true });
  await writeFile(path.join(state, 'remote.json'), JSON.stringify({
    latest: null, status: 'unavailable', checkedAt: Date.now(), checkedWith: '0.0.0',
  }));
  let checks = 0;
  const update = createPluginUpdater({ home, readLatest: async () => { checks++; return next; } });
  const result = await update({ action: 'check' });
  assert.equal(result.remoteStatus, 'ok');
  assert.equal(result.latest, next);
  assert.equal(checks, 1);
  assert.equal(JSON.parse(await readFile(path.join(state, 'remote.json'), 'utf8')).checkedWith, version);
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
