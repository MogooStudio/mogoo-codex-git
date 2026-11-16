import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { AppError } from './git.mjs';

export async function codexBinary() {
  const candidates = [process.env.CODEX_APP_RUNTIME_CLI_PATH];
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const bin = path.join(process.env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const entries = await readdir(bin, { withFileTypes: true }).catch(() => []);
    const versions = await Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      const binary = path.join(bin, entry.name, 'codex.exe');
      return { binary, file: await stat(binary).catch(() => null) };
    }));
    candidates.push(path.join(bin, 'codex.exe'), ...versions.filter(entry => entry.file?.isFile())
      .sort((a, b) => b.file.mtimeMs - a.file.mtimeMs).map(entry => entry.binary));
  } else if (process.platform === 'darwin') {
    for (const folder of ['/Applications', path.join(homedir(), 'Applications')]) {
      for (const app of ['Codex.app', 'ChatGPT.app']) {
        candidates.push(path.join(folder, app, 'Contents', 'Resources', 'codex'));
      }
    }
  }
  for (const candidate of candidates) {
    if (candidate && (await stat(candidate).catch(() => null))?.isFile()) return candidate;
  }
  return process.platform === 'win32' ? 'codex.exe' : 'codex';
}

export async function readThreadCwd(threadId) {
  const env = { ...process.env };
  delete env.CODEX_THREAD_ID;
  delete env.CODEX_SESSION_ID;
  delete env.CODEX_APP_TOOLS_PIPE_PATH;
  const child = spawn(await codexBinary(), [
    'app-server', '-c', 'model_provider="openai"', '--disable', 'hooks', '--disable', 'plugins', '--disable', 'apps',
  ], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  child.on('error', () => lines.close());
  child.stdin.on('error', () => lines.close());
  const deadline = setTimeout(() => child.kill(), 10000);
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  try {
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'mogoo-codex-git', version: '1' } } });
    for await (const line of lines) {
      let response;
      try { response = JSON.parse(line); } catch { continue; }
      if (response?.id === 1 && !response.error) {
        send({ method: 'initialized' });
        send({ id: 2, method: 'thread/read', params: { threadId, includeTurns: false } });
      }
      if (response?.id === 2) {
        const thread = response.result?.thread;
        if (thread?.id === threadId && typeof thread.cwd === 'string' && path.isAbsolute(thread.cwd)) return thread.cwd;
        break;
      }
      if (response?.id === 1 && response.error) break;
    }
    throw new AppError('无法读取当前聊天的工作目录。请重新打开 Git 面板，或在聊天中说“打开 Git 面板”。');
  } finally {
    clearTimeout(deadline);
    child.stdin.end();
    child.kill();
  }
}
