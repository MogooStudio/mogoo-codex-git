import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { instanceId } from './instance.mjs';

export const tokenFile = process.env.GIT_LENS_TOKEN_FILE
  || path.join(os.homedir(), '.mogoo-codex-git', `${instanceId}.token`);

export async function authToken() {
  await mkdir(path.dirname(tokenFile), { recursive: true });
  try {
    const handle = await open(tokenFile, 'wx', 0o600);
    try { await handle.writeFile(randomBytes(32).toString('base64url')); }
    finally { await handle.close(); }
  } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await chmod(tokenFile, 0o600);
  for (let attempt = 0; attempt < 40; attempt++) {
    const token = (await readFile(tokenFile, 'utf8')).trim();
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) return token;
    await delay(25);
  }
  throw new Error('面板鉴权令牌文件无效，请删除后重试。');
}
