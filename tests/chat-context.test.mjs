import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chatContext } from '../server/chat-context.mjs';
import { createPanelHandler } from '../server/git-panel.mjs';
import { createServer } from '../server/index.mjs';
import { chatUrl, openChat } from '../scripts/open-chat.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('聊天目录绑定：子目录定位、主检出与 linked worktree 独立，非仓库和空入口不回退', async t => {
  const base = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-lens-context-')));
  t.after(async () => {
    assert.equal(path.dirname(base), await realpath(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('git-lens-context-'));
    await rm(base, { recursive: true, force: true });
  });
  const root = path.join(base, '主仓库 # & 空格');
  const tree = path.join(base, '聊天 worktree');
  const outside = path.join(base, '非仓库');
  await mkdir(root); await mkdir(outside);
  run(root, 'init', '-b', 'main');
  run(root, 'config', 'user.name', '上下文测试');
  run(root, 'config', 'user.email', 'context@example.invalid');
  await writeFile(path.join(root, 'readme.txt'), 'context\n');
  run(root, 'add', '.'); run(root, 'commit', '-m', '初始提交');
  run(root, 'worktree', 'add', '-b', 'chat-feature', tree);
  await mkdir(path.join(tree, '子目录'));

  assert.equal((await chatContext(root)).isWorktree, false);
  const treeContext = await chatContext(path.join(tree, '子目录'));
  assert.equal(treeContext.root, tree);
  assert.equal(treeContext.isWorktree, true);
  assert.equal((await chatContext(outside)).state, 'no-repository');
  assert.equal((await chatContext(path.join(base, 'deleted'))).state, 'missing');
  assert.equal((await chatContext('')).state, 'unbound');
  await assert.rejects(() => chatContext('relative/path'), /绝对路径/);
  await assert.rejects(() => openChat({}), /没有传入当前聊天目录/);

  const server = await createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const mainLaunch = await openChat({ cwd: root, port });
  const treeLaunch = await openChat({ cwd: path.join(tree, '子目录'), port });
  assert.equal(mainLaunch.serviceReused, true);
  assert.notEqual(mainLaunch.url, treeLaunch.url);
  assert.equal(new URL(mainLaunch.url).searchParams.get('cwd'), root);
  assert.equal(new URL(chatUrl(baseUrl, root)).searchParams.get('cwd'), root);

  const token = new URL(mainLaunch.url).searchParams.get('token');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(new URL(treeLaunch.url).searchParams.get('token'), token, '复用服务必须使用同一个令牌');
  const headers = { 'X-Git-Lens': '1', 'X-Git-Lens-Token': token };
  const getContext = async url => {
    const parsed = new URL(url);
    return (await fetch(`${baseUrl}/api/context?${parsed.searchParams}`, { headers })).json();
  };
  const [mainRead, treeRead, mainReadAgain] = await Promise.all([getContext(mainLaunch.url), getContext(treeLaunch.url), getContext(mainLaunch.url)]);
  assert.equal(mainRead.root, root);
  assert.equal(treeRead.root, tree);
  assert.equal(mainReadAgain.root, root);
  const noContext = await (await fetch(`${baseUrl}/api/context`, { headers })).json();
  assert.equal(noContext.state, 'unbound');
  const emptyLaunch = await openChat({ cwd: outside, port });
  assert.equal((await getContext(emptyLaunch.url)).state, 'no-repository');
  const fromTree = await (await fetch(`${baseUrl}/api/repository?${new URLSearchParams({ path: treeRead.root })}`, { headers })).json();
  assert.equal(fromTree.branch, 'chat-feature');

  const mainThread = '11111111-1111-4111-8111-111111111111';
  const treeThread = '22222222-2222-4222-8222-222222222222';
  const directories = { [mainThread]: root, [treeThread]: path.join(tree, '子目录') };
  const handle = createPanelHandler({ lookupCwd: async threadId => directories[threadId] });
  const panel = (threadId, endpoint, params = {}) => handle('tools/call', {
    name: 'git_panel_read', arguments: { endpoint, params }, _meta: { threadId },
  });
  const [mainPanel, treePanel] = await Promise.all([
    panel(mainThread, 'context', { cwd: tree }), panel(treeThread, 'context'),
  ]);
  assert.equal(mainPanel.structuredContent.root, root);
  assert.equal(treePanel.structuredContent.root, tree);
  assert.equal(treePanel.structuredContent.isWorktree, true);
  await assert.rejects(() => panel(undefined, 'context'), /聊天标识/);
  await assert.rejects(() => panel(mainThread, 'repository', { path: tree }), /仓库关联/);
  assert.equal((await panel(mainThread, 'repository', { path: root })).structuredContent.branch, 'main');
  assert.equal((await panel(treeThread, 'repository', { path: tree })).structuredContent.branch, 'chat-feature');
  directories[mainThread] = outside;
  assert.equal((await panel(mainThread, 'context')).structuredContent.state, 'no-repository');
  await assert.rejects(() => panel(mainThread, 'history', { path: root }), /仓库关联/);
});
