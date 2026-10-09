import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, lstat, open } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// 所有调用必须经过此入口：禁止 shell、可选索引写入、外部 diff 和懒加载对象。
export async function git(cwd, args, allowedCodes = []) {
  try {
    const { stdout } = await exec('git', [
      '--no-pager', '--no-optional-locks', '--literal-pathspecs',
      '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false',
      '-c', 'color.ui=false', ...args,
    ], {
      cwd, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' },
    });
    return stdout;
  } catch (error) {
    if (allowedCodes.includes(error.code)) return '';
    if (error.code === 'ENOENT') throw new AppError('未找到 Git，请安装 Git 并加入 PATH。', 503);
    if (error.killed) throw new AppError('读取超过 15 秒，请缩小提交范围后重试。', 408);
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new AppError('数据超过 8 MB，请选择更小的范围或文件。', 413);
    const detail = String(error.stderr || error.message).trim().slice(0, 1600);
    throw new AppError(`Git 读取失败：${detail}`);
  }
}

export async function resolveRepo(input) {
  if (!input || !path.isAbsolute(input) || input.includes('\0')) throw new AppError('请输入本机仓库的绝对路径。');
  let resolved;
  try { resolved = await realpath(input); } catch { throw new AppError('路径不存在，或当前用户没有读取权限。'); }
  if (!(await lstat(resolved)).isDirectory()) throw new AppError('请选择仓库目录，而不是文件。');
  const root = (await git(resolved, ['rev-parse', '--show-toplevel'])).trim();
  if (!root) throw new AppError('此目录不是具有工作区的 Git 仓库。');
  return realpath(root);
}

export function parseStatus(raw) {
  const tokens = raw.split('\0');
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    const record = tokens[i];
    if (!record) continue;
    const index = record[0], worktree = record[1], filePath = record.slice(3);
    const originalPath = /[RC]/.test(index + worktree) ? tokens[++i] : null;
    files.push({ path: filePath, originalPath, index, worktree,
      untracked: index === '?', conflict: index === 'U' || worktree === 'U' || ['AA', 'DD'].includes(index + worktree) });
  }
  return files;
}

export function parseNames(raw) {
  const tokens = raw.split('\0');
  const files = [];
  for (let i = 0; tokens[i];) {
    const status = tokens[i++];
    const first = tokens[i++];
    const renamed = /^[RC]/.test(status);
    files.push({ status: status[0], path: renamed ? tokens[i++] : first, originalPath: renamed ? first : null });
  }
  return files;
}

async function refsFor(root) {
  const raw = await git(root, ['for-each-ref', '--sort=refname', '--format=%(refname)%00%(objectname)%00%(*objectname)%00%(upstream)%00%(upstream:track)', 'refs/heads', 'refs/remotes', 'refs/tags']);
  return raw.trimEnd().split('\n').filter(Boolean).map(line => {
    const [name, oid, peeled, upstream, track] = line.split('\0');
    return { name, oid: peeled || oid, upstream, track, kind: name.startsWith('refs/heads/') ? 'local' : name.startsWith('refs/remotes/') ? 'remote' : 'tag', label: name.replace(/^refs\/(heads|remotes|tags)\//, '') };
  });
}

export async function repository(root) {
  const [status, refs, branch, head, treesRaw] = await Promise.all([
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']),
    refsFor(root), git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], [1]),
    git(root, ['rev-parse', '--verify', 'HEAD'], [128]),
    git(root, ['worktree', 'list', '--porcelain', '-z']),
  ]);
  const worktrees = treesRaw.split('\0\0').filter(Boolean).map(block => {
    const entry = {};
    for (const line of block.split('\0')) {
      const split = line.indexOf(' ');
      entry[split < 0 ? line : line.slice(0, split)] = split < 0 ? true : line.slice(split + 1);
    }
    return entry;
  });
  const current = refs.find(r => r.name === `refs/heads/${branch.trim()}`);
  const files = parseStatus(status);
  return { root, name: path.basename(root), branch: branch.trim(), head: head.trim(), refs, files, worktrees,
    upstream: current?.upstream?.replace(/^refs\/remotes\//, '') || '', track: current?.track || '',
    refreshedAt: new Date().toISOString() };
}

const logFormat = '%H%x00%P%x00%an%x00%aI%x00%s%x00';
export async function history(root, ref = '', requestedLimit = 100) {
  const limit = Math.max(1, Math.min(2000, Number(requestedLimit) || 100));
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD'], [128])).trim();
  if (ref && !(await refsFor(root)).some(r => r.name === ref)) throw new AppError('分支或标签已不存在，请刷新仓库。');
  const refs = ref ? [ref] : ['--all', ...(head ? ['HEAD'] : [])];
  const raw = await git(root, ['log', '--topo-order', '--no-show-signature', '--no-notes', `--max-count=${limit + 1}`, `--format=${logFormat}`, ...refs, '--']);
  const parts = raw.split('\0'), commits = [];
  for (let i = 0; i + 4 < parts.length; i += 5) {
    const oid = parts[i].trim();
    if (!oid) continue;
    commits.push({ oid, parents: parts[i + 1].split(' ').filter(Boolean), author: parts[i + 2], date: parts[i + 3], subject: parts[i + 4] });
  }
  return { commits: commits.slice(0, limit), hasMore: commits.length > limit, limit };
}

function validateOid(oid) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid || '')) throw new AppError('无效的提交哈希。');
}
async function commitMeta(root, oid) {
  validateOid(oid);
  const raw = await git(root, ['show', '--no-patch', '--no-show-signature', '--no-notes', '--format=%H%x00%P%x00%an%x00%aI%x00%B', oid, '--']);
  const [hash, parents, author, date, ...body] = raw.split('\0');
  return { oid: hash, parents: parents.split(' ').filter(Boolean), author, date, body: body.join('\0').trimEnd() };
}

const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-renames', '--ignore-submodules=none'];
function diffArgs(meta) {
  return meta.parents.length ? ['diff', ...diffFlags, meta.parents[0], meta.oid] : ['diff-tree', ...diffFlags, '--root', '--no-commit-id', '-r', meta.oid];
}
export async function commit(root, oid) {
  const meta = await commitMeta(root, oid);
  const files = parseNames(await git(root, [...diffArgs(meta), '--name-status', '-z', '--']));
  return { ...meta, files };
}

function validateFile(file) {
  if (!file || file.includes('\0') || path.isAbsolute(file) || file.split(/[\\/]/).some(p => p === '..' || p.toLowerCase() === '.git')) throw new AppError('无效的文件路径。');
}

async function untrackedContent(root, file) {
  const listed = await git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', file]);
  if (!listed.split('\0').includes(file)) throw new AppError('该文件已不再是未跟踪文件，请刷新。');
  const target = path.resolve(root, file);
  const info = await lstat(target);
  if (info.isSymbolicLink()) return { patch: '', notice: '符号链接：只读面板不跟随链接读取内容。' };
  const real = await realpath(target);
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new AppError('文件指向仓库外部，无法预览。');
  if (!info.isFile()) return { patch: '', notice: '此项不是普通文件，无法预览。' };
  if (info.size > 256 * 1024) return { patch: '', notice: '文件超过 256 KB，未加载内容。' };
  const handle = await open(real, 'r');
  let data;
  try {
    const buffer = Buffer.alloc(256 * 1024 + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 256 * 1024) return { patch: '', notice: '文件超过 256 KB，未加载内容。' };
    data = buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
  if (data.includes(0)) return { patch: '', notice: '二进制文件，仅显示文件状态。' };
  const text = data.toString('utf8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return { patch: `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map(line => '+' + line).join('\n')}`, notice: '未跟踪文件 · 当前本机内容' };
}

export async function patch(root, { mode, oid, file }) {
  validateFile(file);
  let result;
  if (mode === 'untracked') result = await untrackedContent(root, file);
  else {
    let args;
    if (mode === 'commit') args = diffArgs(await commitMeta(root, oid));
    else if (mode === 'staged') args = ['diff', ...diffFlags, '--cached'];
    else if (mode === 'unstaged') args = ['diff', ...diffFlags];
    else throw new AppError('不支持的差异模式。');
    result = { patch: await git(root, [...args, '--patch', '--unified=3', '--', file]), notice: '' };
  }
  const lines = result.patch.split('\n');
  const truncated = lines.length > 5000 || result.patch.length > 400000;
  return { ...result, patch: lines.slice(0, 5000).join('\n').slice(0, 400000), truncated };
}
