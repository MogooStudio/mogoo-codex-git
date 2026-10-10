import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { chatContext } from '../server/chat-context.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
export const instanceId = createHash('sha256').update(`${projectDir.toLowerCase()}@${packageInfo.version}`).digest('hex').slice(0, 16);

export function chatUrl(base, cwd) {
  const url = new URL(base);
  url.searchParams.set('cwd', cwd);
  return url.href;
}

async function inspectService(base) {
  try {
    const response = await fetch(`${base}/api/health`, { headers: { 'X-Git-Lens': '1' }, signal: AbortSignal.timeout(1000) });
    const data = await response.json().catch(() => null);
    return data?.app === 'git-lens' && data?.protocol === 2 && data?.instance === instanceId ? 'ready' : 'occupied';
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return 'stopped';
    return 'occupied';
  }
}

export async function openChat({ cwd, port }) {
  if (!cwd) throw new Error('启动入口没有传入当前聊天目录，拒绝使用工具安装目录代替。');
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('无效的面板端口。');
  const context = await chatContext(cwd);
  if (port === undefined) {
    const candidates = await Promise.all(Array.from({ length: 10 }, async (_, offset) => {
      const candidate = 4317 + offset;
      return { port: candidate, state: await inspectService(`http://127.0.0.1:${candidate}`) };
    }));
    const selected = candidates.find(candidate => candidate.state === 'ready') || candidates.find(candidate => candidate.state === 'stopped');
    if (!selected) throw new Error('4317–4326 端口均被占用，请通过 GIT_LENS_PORT 指定可用端口。');
    port = selected.port;
  }
  const base = `http://127.0.0.1:${port}`;
  const service = await inspectService(base);
  if (service === 'occupied') throw new Error(`端口 ${port} 被其他服务或旧版 mogoo-codex-git 占用，请先确认并重启对应服务。`);
  if (service === 'stopped') {
    try { await access(path.join(projectDir, 'dist', 'index.html')); }
    catch { throw new Error('缺少内置界面，请重新安装完整插件；源码开发环境可运行 pnpm build。'); }
    const child = spawn(process.execPath, [path.join(projectDir, 'server', 'index.mjs')], {
      cwd: projectDir, detached: true, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, GIT_LENS_PORT: String(port) },
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    child.unref();
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      await delay(200);
      const state = await inspectService(base);
      if (state === 'ready') { ready = true; break; }
      if (state === 'occupied') throw new Error('服务启动期间端口被其他程序占用。');
    }
    if (!ready) throw new Error('mogoo-codex-git 服务未能在 8 秒内启动，请查看 pnpm start 的错误输出。');
  }
  return { ...context, url: chatUrl(base, context.cwd), serviceReused: service === 'ready' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { cwd: { type: 'string' }, port: { type: 'string' } } });
    const configuredPort = values.port ?? process.env.GIT_LENS_PORT;
    console.log(JSON.stringify(await openChat({ cwd: values.cwd, port: configuredPort === undefined ? undefined : Number(configuredPort) })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
