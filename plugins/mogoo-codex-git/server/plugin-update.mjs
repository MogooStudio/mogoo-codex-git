import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { codexBinary } from './codex-thread.mjs';
import { AppError } from './git.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const { name, version: running, repository } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const source = repository.url;
const pluginId = `${name}@${name}`;
const upgrade = ['plugin', 'marketplace', 'upgrade', name, '--json'];
const install = ['plugin', 'add', pluginId, '--json'];
const changelog = source.replace(/\.git$/, '/blob/main/CHANGELOG.zh.md');
const hour = 3_600_000;
const stableVersion = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
const versionOf = value => typeof value === 'string' && stableVersion.test(value) ? value : null;
const compare = (a, b) => (a || '').localeCompare(b || '', 'en', { numeric: true });
const newest = (...values) => values.filter(Boolean).sort(compare).at(-1) ?? null;
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const readState = file => readJson(file).catch(() => null);
const exec = promisify(execFile);

export function latestTag(data) {
  if (data.length > 1024 * 1024 || !data.subarray(-4).equals(Buffer.from('0000'))) throw new Error('Invalid ref advertisement');
  let latest = null;
  for (let offset = 0; offset < data.length;) {
    const header = data.toString('ascii', offset, offset + 4);
    if (!/^[0-9a-f]{4}$/i.test(header)) throw new Error('Invalid ref packet');
    const length = parseInt(header, 16);
    if (length === 0) { offset += 4; continue; }
    if (length < 4 || length > 65520 || offset + length > data.length) throw new Error('Incomplete ref packet');
    const line = data.toString('utf8', offset + 4, offset + length).split('\0', 1)[0].trimEnd();
    const tag = line.match(/^(?:[0-9a-f]{40}|[0-9a-f]{64}) refs\/tags\/v([0-9.]+)$/i);
    latest = newest(latest, versionOf(tag?.[1]));
    offset += length;
  }
  return latest;
}

async function fetchLatest() {
  const response = await fetch(`${source}/info/refs?service=git-upload-pack`, {
    redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/x-git-upload-pack-advertisement' },
  });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('application/x-git-upload-pack-advertisement')) {
    await response.body?.cancel();
    throw new Error('Release source unavailable');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 1024 * 1024) throw new Error('Ref advertisement too large');
    chunks.push(chunk);
  }
  return latestTag(Buffer.concat(chunks));
}

async function writeState(file, value) {
  const temp = `${file}.${randomUUID()}`;
  try {
    await writeFile(temp, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally { await unlink(temp).catch(() => {}); }
}

async function lockFresh(dir, lease) {
  const info = await stat(dir).catch(() => null);
  return Boolean(info && Date.now() - info.mtimeMs < lease);
}

async function takeLock(dir, lease) {
  const temp = await mkdtemp(path.join(path.dirname(dir), '.lock-'));
  const owner = randomUUID();
  const release = async directory => {
    await unlink(path.join(directory, owner)).catch(() => {});
    await rmdir(directory).catch(() => {});
  };
  try {
    await writeFile(path.join(temp, owner), '');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // A new lock arrives already containing a unique owner file, so stale
        // cleanup can never remove a lock another process just acquired.
        await rename(temp, dir);
        return () => release(dir);
      } catch (error) {
        const holders = await readdir(dir).catch(() => null);
        if (!holders) {
          if (attempt === 0) continue;
          throw error;
        }
        if (holders.length && await lockFresh(dir, lease)) return null;
        for (const holder of holders) {
          if (/^[0-9a-f-]{36}$/.test(holder)) await unlink(path.join(dir, holder)).catch(() => {});
        }
        await rmdir(dir).catch(() => {});
      }
    }
    return null;
  } finally { await release(temp); }
}

async function manifestVersion(root) {
  const manifest = await readState(path.join(root, '.codex-plugin', 'plugin.json'));
  return manifest?.name === name ? versionOf(manifest.version) : null;
}

export function createPluginUpdater({
  home = path.resolve(process.env.CODEX_HOME || path.join(homedir(), '.codex')),
  projectRoot = project, readLatest = fetchLatest,
  runCodex = async args => (await exec(await codexBinary(), args, {
    cwd: home, env: { ...process.env, CODEX_HOME: home, GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true, timeout: args[2] === 'list' ? 5000 : 60000, maxBuffer: 1024 * 1024,
  })).stdout,
} = {}) {
  const base = path.join(home, 'plugins', 'cache', name, name);
  const market = path.join(home, '.tmp', 'marketplaces', name);
  const state = path.join(home, 'mogoo-codex-git', 'update');
  const file = key => path.join(state, key + '.json');
  const checkLock = path.join(state, 'check.lock');
  const installLock = path.join(state, 'install.lock');
  const checkLease = 60_000, installLease = 300_000;
  const fromCache = path.relative(base, path.resolve(projectRoot)) === running;

  async function local() {
    const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
    const versions = await Promise.all(entries.filter(entry => entry.isDirectory() && versionOf(entry.name)).map(async entry => {
      const value = await manifestVersion(path.join(base, entry.name));
      return value === entry.name ? value : null;
    }));
    return { installed: newest(...versions), snapshot: await manifestVersion(path.join(market, 'plugins', name)) };
  }

  async function publicMarket() {
    // Use Codex's own interpretation of its configuration and verify the exact source.
    const { marketplaces } = JSON.parse(await runCodex(['plugin', 'marketplace', 'list', '--json']));
    return marketplaces.filter(entry => entry.name === name).length === 1 && marketplaces.some(entry =>
      entry.name === name && path.resolve(entry.root) === market &&
      entry.marketplaceSource?.sourceType === 'git' && entry.marketplaceSource?.source === source);
  }
  let sourceStatus;
  async function canInstall() {
    if (!fromCache || await manifestVersion(projectRoot) !== running) return false;
    if (!sourceStatus || Date.now() >= sourceStatus.until) {
      sourceStatus = { until: Date.now() + 30_000, result: publicMarket().catch(() => false) };
    }
    return sourceStatus.result;
  }

  async function status(native) {
    const [versions, remote, auto, dismissed, checking, recorded, installing] = await Promise.all([
      local(), readState(file('remote')), readState(file('auto')), readState(file('dismissed')),
      lockFresh(checkLock, checkLease), readState(file('operation')), lockFresh(installLock, installLease),
    ]);
    const { installed, snapshot } = versions;
    const remoteVersion = versionOf(remote?.latest);
    const latest = compare(remoteVersion, newest(installed, snapshot)) < 0 ? null : remoteVersion;
    const pending = compare(installed, running) > 0;
    const floor = newest(running, installed);
    const publicInstall = native && !pending && !installing && compare(newest(snapshot, latest), floor) > 0 && await canInstall();
    const target = pending ? installed : newest(latest, publicInstall ? snapshot : null);
    const available = !pending && compare(target, floor) > 0 && dismissed?.version !== target;
    let operation = recorded?.target && compare(recorded.target, running) > 0 ? recorded : null;
    if (operation?.state === 'running' && !installing) {
      operation = { state: 'error', target: operation.target, message: '更新已中断，请检查已安装版本后重试。' };
    }
    if (pending && !installing && compare(installed, operation?.target) >= 0) operation = null;
    const commands = [upgrade, install].map(args => 'codex ' + args.join(' '));
    return {
      running, ...versions, latest, target, pending, available, checking, operation,
      checkedAt: remote?.checkedAt ?? null, remoteStatus: remote?.status ?? 'unknown',
      autoCheck: auto?.enabled !== false, dismissed: Boolean(target && dismissed?.version === target),
      canInstall: available && publicInstall,
      changelog, commands,
    };
  }

  async function check(force) {
    if (!force && (await readState(file('auto')))?.enabled === false) return;
    const due = remote => {
      const failed = remote?.status === 'unavailable';
      const age = Date.now() - (remote?.checkedAt ?? 0);
      return (!failed && force) || !Number.isFinite(age) || age < 0 || age >= (failed ? hour : 6 * hour);
    };
    if (!due(await readState(file('remote')))) return;
    await mkdir(state, { recursive: true, mode: 0o700 });
    const release = await takeLock(checkLock, checkLease);
    if (!release) return;
    try {
      const previous = await readState(file('remote'));
      if (!due(previous)) return;
      const remote = await Promise.resolve().then(readLatest)
        .then(value => ({ latest: versionOf(value), status: 'ok' }),
          () => ({ latest: versionOf(previous?.latest), status: 'unavailable' }));
      await writeState(file('remote'), { ...remote, checkedAt: Date.now() });
    } finally { await release(); }
  }

  async function installTarget(target) {
    const release = await takeLock(installLock, installLease);
    if (!release) return;
    const report = (state, message) => writeState(file('operation'), { state, target, message });
    try { await report('running', '正在确认已安装版本…'); }
    catch (error) { await release(); throw error; }
    void (async () => {
      try {
        if (compare((await local()).installed, target) < 0) {
          if (!await publicMarket()) throw new AppError('发行来源已变化，请重新检查更新。');
          if (compare((await local()).snapshot, target) < 0) {
            await report('running', '正在刷新插件市场…');
            await runCodex(upgrade);
          }
          const versions = await local();
          if (compare(versions.installed, target) < 0) {
            if (versions.snapshot !== target || !await publicMarket()) {
              throw new AppError('市场版本或来源已变化，请重新检查后确认更新。');
            }
            await report('running', '正在安装新版插件…');
            const ready = await local();
            if (compare(ready.installed, target) < 0) {
              if (ready.snapshot !== target) throw new AppError('市场版本已变化，请重新确认更新。');
              await runCodex(install);
            }
          }
        }
        if (compare((await local()).installed, target) < 0) throw new AppError('Codex 尚未报告新版已安装，请查看安装状态。');
        await report('success', '新版已安装。新开聊天或重启 Codex 后生效。');
      } catch (error) {
        if (compare((await local()).installed, target) >= 0) {
          await report('success', '新版已安装。新开聊天或重启 Codex 后生效。');
        } else {
          await report('error', error instanceof AppError ? error.message : '更新未完成。可稍后重试，或复制命令手动更新。');
        }
      } finally { await release(); }
    })().catch(() => {});
  }

  return async ({ action, enabled, target, confirmed }, native = false) => {
    switch (action) {
      case 'status': break;
      case 'auto': await check(false); break;
      case 'check': await check(true); break;
      case 'configure':
        if (!native || typeof enabled !== 'boolean') throw new AppError('无效的更新设置。');
        await mkdir(state, { recursive: true, mode: 0o700 });
        await writeState(file('auto'), { enabled });
        break;
      case 'dismiss': {
        const info = await status(native);
        if (!native || !info.available || target !== info.target) throw new AppError('没有可忽略的新版。');
        await mkdir(state, { recursive: true, mode: 0o700 });
        await writeState(file('dismissed'), { version: target });
        break;
      }
      case 'install': {
        if (!native || confirmed !== true || !versionOf(target)) throw new AppError('请先在 Git 面板确认更新。');
        const info = await status(native);
        if (compare(info.installed, target) >= 0 || info.operation?.state === 'running') return info;
        if (!info.canInstall || target !== info.target) throw new AppError('可安装版本已变化，请重新检查。');
        await mkdir(state, { recursive: true, mode: 0o700 });
        await installTarget(target);
        break;
      }
      default: throw new AppError('未知插件更新操作。');
    }
    return status(native);
  };
}
