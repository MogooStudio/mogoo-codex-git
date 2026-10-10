import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AppError, resolveRepo, repository, history, commit, patch } from './git.mjs';
import { chatContext } from './chat-context.mjs';
import { instanceId } from '../scripts/open-chat.mjs';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
export async function createServer({ dev = false } = {}) {
  const vite = dev ? await (await import('vite')).createServer({ root: projectDir, server: { middlewareMode: true, hmr: false }, appType: 'spa' }) : null;
  const server = http.createServer(async (req, res) => {
    const host = req.headers.host || '';
    const origin = `http://${host}`;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    const json = (data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const port = server.address()?.port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) throw new AppError('仅允许本机访问。', 403);
      if (req.method !== 'GET') throw new AppError('只读服务仅支持 GET 请求。', 405);
      if (req.headers.origin && req.headers.origin !== origin) throw new AppError('不允许跨站访问。', 403);
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-git-lens'] !== '1') throw new AppError('需要面板请求标识。', 403);
        if (url.pathname === '/api/health') return json({ app: 'git-lens', protocol: 2, instance: instanceId });
        if (url.pathname === '/api/context') return json(await chatContext(url.searchParams.get('cwd')));
        const known = ['/api/repository', '/api/history', '/api/commit', '/api/patch'];
        if (!known.includes(url.pathname)) throw new AppError('接口不存在。', 404);
        const root = await resolveRepo(url.searchParams.get('path'));
        if (url.pathname === '/api/repository') return json(await repository(root));
        if (url.pathname === '/api/history') return json(await history(root, url.searchParams.get('ref'), url.searchParams.get('limit')));
        if (url.pathname === '/api/commit') return json(await commit(root, url.searchParams.get('oid')));
        if (url.pathname === '/api/patch') return json(await patch(root, Object.fromEntries(url.searchParams)));
      }
      if (vite) return vite.middlewares(req, res);
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
      const absolute = path.resolve(projectDir, 'dist', file);
      const relative = path.relative(path.join(projectDir, 'dist'), absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new AppError('路径不可访问。', 403);
      let data;
      try { data = await readFile(absolute); } catch { throw new AppError('页面不存在，请先运行 pnpm build。', 404); }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (error) { json({ error: error.message || '读取失败。' }, error.status || 500); }
  });
  server.on('close', () => vite?.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const server = await createServer({ dev: process.argv.includes('--dev') });
  const port = Number(process.env.GIT_LENS_PORT || 4317);
  server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`mogoo-codex-git 只读面板：http://127.0.0.1:${server.address().port}`));
}
