import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/index.mjs';
import { createPanelHandler } from '../server/git-panel.mjs';
import { openChat } from '../scripts/open-chat.mjs';
import { prepareBrowserPanel } from '../server/browser-panel.mjs';

test('Codex 浏览器链接保留真实 worktree 和聊天目录，并拒绝过期或跨聊天仓库', async t => {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-lens-external-')));
  t.after(async () => {
    assert.equal(path.dirname(base), await realpath(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('git-lens-external-'));
    await rm(base, { recursive: true, force: true });
  });
  const root = path.join(base, '主仓库 # & 空格'), tree = path.join(base, '聊天 worktree'), outside = path.join(base, '非仓库');
  await mkdir(root); await mkdir(outside);
  const git = (...args) => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'ignore' });
  git('init', '-b', 'main');
  await writeFile(path.join(root, 'README.md'), 'main\n');
  git('add', '.'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'initial');
  git('worktree', 'add', '-b', 'chat-feature', tree);
  const nested = path.join(tree, '子目录');
  await mkdir(nested);
  const server = await createServer({ update: async () => ({}) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const prepared = [];
  const browserLink = async args => {
      const result = await prepareBrowserPanel(args, { open: options => openChat({ ...options, port }) });
      const parsed = new URL(result.url);
      assert.equal(parsed.searchParams.get('cwd'), nested);
      const response = await fetch(`http://127.0.0.1:${port}/api/context?${parsed.searchParams}`, { headers: { 'X-Git-Lens': '1', 'X-Git-Lens-Token': parsed.searchParams.get('token') } });
      const context = await response.json();
      assert.equal(context.root, tree);
      assert.equal(context.isWorktree, true);
      prepared.push(result.url);
      return result;
  };
  const threadId = '11111111-1111-4111-8111-111111111111';
  let cwd = nested;
  const handle = createPanelHandler({ lookupCwd: async () => cwd, browserLink });
  const call = (name, args, id = threadId) => handle('tools/call', { name, arguments: args, _meta: { threadId: id } });
  const tools = (await handle('tools/list')).tools;
  assert.equal(tools.some(tool => tool.name === 'git_panel_open_external'), false);
  const tool = tools.find(tool => tool.name === 'git_panel_browser_link');
  assert.deepEqual(tool._meta.ui.visibility, ['app']);
  await assert.rejects(() => call(tool.name, { path: tree }, ''), /聊天标识/);
  await assert.rejects(() => call(tool.name, { path: tree }), /仓库关联/);
  await call('git_panel_read', { endpoint: 'context', params: {} });
  await assert.rejects(() => call(tool.name, { path: root }), /仓库关联/);
  await assert.rejects(() => call(tool.name, { path: tree, url: 'https://example.com' }), /无效/);
  assert.deepEqual((await call(tool.name, { path: tree })).structuredContent, { url: prepared[0], root: tree });
  assert.equal(prepared.length, 1);
  cwd = root;
  await assert.rejects(() => call(tool.name, { path: tree }), /仓库关联/);
  cwd = outside;
  await assert.rejects(() => call(tool.name, { path: tree }), /仓库关联/);
  assert.equal(prepared.length, 1, '仓库变化后不准备过期链接');
  const writes = await fetch(`http://127.0.0.1:${port}/api/browser-link?${new URLSearchParams({ path: tree })}`, {
    headers: { 'X-Git-Lens': '1', 'X-Git-Lens-Token': new URL(prepared[0]).searchParams.get('token') },
  });
  assert.equal(writes.status, 404, '网页不能绕过当前聊天绑定来准备链接');
});

test('浏览器链接：服务返回不同仓库、不可用状态或准备失败时不返回成功', async () => {
  const args = { cwd: '/chat', root: '/repo' };
  await assert.rejects(() => prepareBrowserPanel(args, {
    open: async () => ({ state: 'ready', root: '/other', url: 'http://127.0.0.1:4317/?cwd=other' }),
  }), /仓库关联/);
  await assert.rejects(() => prepareBrowserPanel(args, {
    open: async () => ({ state: 'no-repository', root: '' }),
  }), /仓库关联/);
  await assert.rejects(() => prepareBrowserPanel(args, {
    open: async () => { throw new Error('服务启动失败'); },
  }), /服务启动失败/);
});
