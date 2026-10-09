import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm, realpath, rename } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { repository, resolveRepo, history, commit, patch } from '../server/git.mjs';
import { createServer } from '../server/index.mjs';
import { layoutGraph } from '../src/graph.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'git-lens-test-')));
  run(root, 'init', '-b', 'main');
  run(root, 'config', 'user.name', '只读测试');
  run(root, 'config', 'user.email', 'test@example.invalid');
  run(root, 'config', 'core.autocrlf', 'false');
  return root;
}
async function cleanup(root) {
  const parent = await realpath(os.tmpdir());
  assert.equal(path.dirname(root), parent);
  assert.ok(path.basename(root).startsWith('git-lens-test-'));
  await rm(root, { recursive: true, force: true });
}
async function snapshot(root, relative = '') {
  const result = {};
  for (const item of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, item.name);
    if (item.isDirectory()) Object.assign(result, await snapshot(root, child));
    else result[child] = createHash('sha256').update(await readFile(path.join(root, child))).digest('hex');
  }
  return result;
}

test('真实仓库：分支、合并、中文路径、暂存区、工作区与未跟踪内容；读取不改动任何文件', async t => {
  const root = await fixture();
  t.after(() => cleanup(root));
  await writeFile(path.join(root, '你好 空格.txt'), 'first\n');
  run(root, 'add', '.'); run(root, 'commit', '-m', '初始提交');
  const initial = run(root, 'rev-parse', 'HEAD');
  run(root, 'checkout', '-b', 'feature/ui');
  await writeFile(path.join(root, '界面.txt'), '界面\n');
  run(root, 'add', '.'); run(root, 'commit', '-m', '增加界面');
  run(root, 'checkout', 'main');
  await writeFile(path.join(root, 'server.txt'), 'server\n');
  run(root, 'add', '.'); run(root, 'commit', '-m', '增加服务');
  run(root, 'merge', '--no-ff', 'feature/ui', '-m', '合并界面');
  const merge = run(root, 'rev-parse', 'HEAD');
  run(root, 'tag', '-a', 'v1.0.0', '-m', '版本');
  await rename(path.join(root, 'server.txt'), path.join(root, 'renamed.txt'));
  run(root, 'add', '.');
  await writeFile(path.join(root, '你好 空格.txt'), 'first\nstaged\n'); run(root, 'add', '.');
  await writeFile(path.join(root, '你好 空格.txt'), 'first\nstaged\nworking\n');
  await writeFile(path.join(root, 'new file.txt'), '未跟踪内容\n');
  await writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 1, 2]));
  const before = await snapshot(root);
  const repo = await repository(root);
  assert.equal(repo.branch, 'main');
  assert.equal(repo.refs.find(ref => ref.label === 'v1.0.0').oid, merge);
  assert.equal(repo.files.find(file => file.path === '你好 空格.txt').index, 'M');
  assert.equal(repo.files.find(file => file.path === '你好 空格.txt').worktree, 'M');
  assert.equal(repo.files.find(file => file.path === 'renamed.txt').originalPath, 'server.txt');
  assert.ok(repo.worktrees.some(tree => tree.worktree.replaceAll('\\', '/') === root.replaceAll('\\', '/')));
  const all = await history(root);
  assert.equal(all.commits.length, 4);
  assert.equal(all.commits[0].parents.length, 2);
  assert.equal((await history(root, 'refs/heads/feature/ui')).commits.length, 2);
  assert.equal((await history(root, '', 2)).hasMore, true);
  assert.equal((await commit(root, initial)).files[0].path, '你好 空格.txt');
  assert.equal((await commit(root, merge)).files[0].path, '界面.txt');
  assert.match((await patch(root, { mode: 'commit', oid: initial, file: '你好 空格.txt' })).patch, /\+first/);
  assert.match((await patch(root, { mode: 'staged', file: '你好 空格.txt' })).patch, /\+staged/);
  assert.doesNotMatch((await patch(root, { mode: 'staged', file: '你好 空格.txt' })).patch, /\+working/);
  assert.match((await patch(root, { mode: 'unstaged', file: '你好 空格.txt' })).patch, /\+working/);
  assert.match((await patch(root, { mode: 'untracked', file: 'new file.txt' })).patch, /\+未跟踪内容/);
  assert.match((await patch(root, { mode: 'untracked', file: 'binary.bin' })).notice, /二进制/);
  assert.deepEqual(await snapshot(root), before, '读取前后包括 .git/index 在内的全部文件内容一致');
  const graph = layoutGraph(all.commits);
  assert.equal(graph.rows.length, 4);
  assert.equal(graph.rows[0].edges.filter(edge => edge.start === 23).length, 2);
  assert.ok(graph.rows.every(row => row.edges.every(edge => edge.from >= 0 && edge.to >= 0)));
});

test('空仓库、分离 HEAD、特殊文件名、工作树与无提交暂存区', async t => {
  const root = await fixture();
  const tree = root + '-tree';
  t.after(async () => { await cleanup(root); await cleanup(tree); });
  assert.equal((await repository(root)).head, '');
  assert.deepEqual((await history(root)).commits, []);
  await writeFile(path.join(root, '[test].txt'), 'literal\n');
  await writeFile(path.join(root, '-option.txt'), 'option\n');
  run(root, 'add', '.');
  assert.match((await patch(root, { mode: 'staged', file: '[test].txt' })).patch, /\+literal/);
  assert.match((await patch(root, { mode: 'staged', file: '-option.txt' })).patch, /\+option/);
  run(root, 'commit', '-m', '特殊文件');
  run(root, 'checkout', '--detach');
  assert.equal((await repository(root)).branch, '');
  assert.equal((await history(root)).commits.length, 1);
  run(root, 'worktree', 'add', '-b', 'parallel', tree);
  assert.equal((await repository(root)).worktrees.length, 2);
  assert.equal((await repository(tree)).branch, 'parallel');
  assert.equal(await resolveRepo(tree), tree);
});

test('边界：拒绝路径穿越、元数据读取、选项注入与 Git 写接口', async t => {
  const root = await fixture();
  t.after(() => cleanup(root));
  await assert.rejects(() => patch(root, { mode: 'untracked', file: '../outside' }), /无效/);
  await assert.rejects(() => patch(root, { mode: 'untracked', file: '.git/config' }), /无效/);
  await assert.rejects(() => commit(root, '--output=oops'), /无效/);
  await assert.rejects(() => history(root, '--output=oops'), /不存在/);
  const server = await createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/repository?${new URLSearchParams({ path: root })}`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(url, { headers: { 'X-Git-Lens': '1', Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'X-Git-Lens': '1' } })).status, 405);
  assert.equal((await fetch(`${base}/api/commit-write`, { headers: { 'X-Git-Lens': '1' } })).status, 404);
  const badHost = await new Promise((resolve, reject) => {
    http.get(url, { headers: { 'X-Git-Lens': '1', Host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await fetch(url, { headers: { 'X-Git-Lens': '1' } })).status, 200);
});

test('冲突状态与外部 diff：保留真实冲突，禁止执行仓库定义的外部工具', async t => {
  const root = await fixture();
  t.after(() => cleanup(root));
  await writeFile(path.join(root, 'file.txt'), 'base\n'); run(root, 'add', '.'); run(root, 'commit', '-m', 'base');
  run(root, 'checkout', '-b', 'other');
  await writeFile(path.join(root, 'file.txt'), 'other\n'); run(root, 'commit', '-am', 'other');
  run(root, 'checkout', 'main');
  await writeFile(path.join(root, 'file.txt'), 'main\n'); run(root, 'commit', '-am', 'main');
  try { run(root, 'merge', 'other'); } catch { /* 预期得到冲突。 */ }
  assert.equal((await repository(root)).files[0].conflict, true);
  run(root, 'config', 'diff.external', 'git-lens-must-not-execute');
  assert.match((await patch(root, { mode: 'unstaged', file: 'file.txt' })).patch, /<<<<<<< HEAD/);
});
