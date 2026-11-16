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
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' };
  // GIT_CONFIG changes only "git config", so it could hide drivers used by diff or status.
  delete env.GIT_CONFIG;
  try {
    const { stdout } = await exec('git', [
      '--no-pager', '--no-optional-locks', '--literal-pathspecs',
      '-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false',
      '-c', 'color.ui=false', '-c', 'diff.autoRefreshIndex=false', ...args,
    ], {
      cwd, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024,
      env,
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

async function filterConfig(root) {
  const raw = await git(root, ['config', '--null', '--get-regexp', '^filter\\..*\\.(clean|process|smudge|required)$'], [1]);
  return new Map(raw.split('\0').filter(Boolean).map(record => {
    const split = record.indexOf('\n');
    return split < 0 ? [record, ''] : [record.slice(0, split), record.slice(split + 1)];
  }));
}

// Git may clean files while refreshing stat information, even for status.
function disableFilters(config) {
  return [...config.keys()].flatMap(key => ['-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`]);
}

async function readStatus(root) {
  const config = await filterConfig(root);
  // A child worktree can have its own drivers. Report its gitlink change without scanning its files.
  return git(root, [...disableFilters(config), '-c', 'status.submoduleSummary=false',
    'status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=dirty']);
}

export async function repository(root) {
  const [status, refs, branch, head, treesRaw] = await Promise.all([
    readStatus(root),
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
  if (ref && ref !== 'HEAD' && !(await refsFor(root)).some(r => r.name === ref)) throw new AppError('分支或标签已不存在，请刷新仓库。');
  if (ref === 'HEAD' && !head) return { commits: [], hasMore: false, limit };
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
  if (typeof oid !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) throw new AppError('无效的提交哈希。');
}
async function commitMeta(root, oid) {
  validateOid(oid);
  const raw = await git(root, ['show', '--no-patch', '--no-show-signature', '--no-notes', '--format=%H%x00%P%x00%an%x00%aI%x00%B', oid, '--']);
  const [hash, parents, author, date, ...body] = raw.split('\0');
  return { oid: hash, parents: parents.split(' ').filter(Boolean), author, date, body: body.join('\0').trimEnd() };
}

const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-renames', '--submodule=short', '--ignore-submodules=dirty'];
function diffArgs(meta) {
  return meta.parents.length ? ['diff', ...diffFlags, meta.parents[0], meta.oid] : ['diff-tree', ...diffFlags, '--root', '--no-commit-id', '-r', meta.oid];
}
export async function commit(root, oid) {
  const meta = await commitMeta(root, oid);
  const files = parseNames(await git(root, [...diffArgs(meta), '--name-status', '-z', '--']));
  return { ...meta, files };
}

function validateFile(file) {
  if (typeof file !== 'string' || !file || file.includes('\0') || path.isAbsolute(file) || file.split(/[\\/]/).some(p => p === '..' || p.toLowerCase() === '.git')) throw new AppError('无效的文件路径。');
}

function compareArgs(base, oid) {
  validateOid(base);
  validateOid(oid);
  return ['diff', ...diffFlags, `${base}^{commit}`, `${oid}^{commit}`];
}

async function resolveBaseline(root, ref) {
  if (typeof ref !== 'string') throw new AppError('请选择比较基线。');
  if (/^[a-f0-9]{7,64}$/i.test(ref)) {
    const matches = (await git(root, ['rev-parse', `--disambiguate=${ref.toLowerCase()}`])).trim().split('\n').filter(Boolean);
    if (matches.length !== 1) throw new AppError(matches.length ? '提交哈希有歧义，请输入更长的哈希。' : '找不到该提交。');
    if ((await git(root, ['cat-file', '-t', matches[0]])).trim() !== 'commit') throw new AppError('该哈希不对应提交。');
    return matches[0];
  }
  if (!(await refsFor(root)).some(item => item.name === ref)) throw new AppError('比较分支或标签已不存在，请刷新仓库。');
  return (await git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim();
}

export async function compare(root, { ref, oid }) {
  validateOid(oid);
  const base = await resolveBaseline(root, ref);
  const files = parseNames(await git(root, [...compareArgs(base, oid), '--name-status', '-z', '--']));
  return { base, oid, files };
}

export async function stashes(root) {
  const limit = 100;
  const raw = await git(root, ['stash', 'list', '--no-show-signature', '--no-notes', '-z',
    `--max-count=${limit + 1}`, '--format=%H%x00%P%x00%gd%x00%aI%x00%gs']);
  const parts = raw.split('\0'), entries = [];
  for (let i = 0; i + 4 < parts.length; i += 5) {
    const [oid, parents, label, date, subject] = parts.slice(i, i + 5);
    entries.push({ oid, parents: parents.split(' ').filter(Boolean), label, date, subject });
  }
  return { entries: entries.slice(0, limit), hasMore: entries.length > limit };
}

export async function fileHistory(root, { file, oid, limit: requested }) {
  validateFile(file);
  validateOid(oid);
  const limit = Math.max(1, Math.min(500, Math.floor(Number(requested) || 50)));
  const raw = await git(root, ['log', '--follow', '--find-renames', '--no-ext-diff', '--no-textconv', '--no-show-signature',
    '--no-notes', '--name-status', '-z', `--max-count=${limit + 1}`, '--format=%H%x00%an%x00%aI%x00%s', `${oid}^{commit}`, '--', file]);
  const fields = raw.split('\0'), entries = [];
  for (let i = 0; fields[i];) {
    const [oid, author, date, subject] = fields.slice(i, i + 4);
    i += 4;
    // With --follow and a single literal path, Git emits at most one path change per commit.
    const status = fields[i]?.trim();
    let currentPath = file, originalPath = null;
    if (status && /^[ACDMRTUXB]\d*$/.test(status)) {
      currentPath = fields[i + 1];
      i += 2;
      if (/^[RC]/.test(status)) { originalPath = currentPath; currentPath = fields[i++]; }
    }
    entries.push({ oid, author, date, subject, path: currentPath, originalPath });
  }
  return { entries: entries.slice(0, limit), hasMore: entries.length > limit, limit };
}

export async function attribution(root, { file, oid, line }) {
  validateFile(file);
  validateOid(oid);
  if (!/^[1-9]\d{0,8}$/.test(String(line))) throw new AppError('无效的行号。');
  const raw = await git(root, ['blame', '--line-porcelain', '--no-textconv', '-L', `${line},${line}`, `${oid}^{commit}`, '--', file]);
  const [header, ...lines] = raw.split('\n');
  const [commit, originalLine] = header.split(' ');
  validateOid(commit);
  const fields = new Map(lines.filter(value => /^[a-z-]+ /.test(value)).map(value => {
    const space = value.indexOf(' ');
    return [value.slice(0, space), value.slice(space + 1)];
  }));
  return { oid: commit, originalLine: Number(originalLine), author: fields.get('author') || '', subject: fields.get('summary') || '',
    date: new Date(Number(fields.get('author-time')) * 1000).toISOString(), boundary: lines.includes('boundary') };
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

async function workingDiff(root, file) {
  const [tracked, attrs, config] = await Promise.all([
    git(root, ['ls-files', '-z', '--', file]),
    git(root, ['check-attr', '-z', 'filter', '--', file]),
    filterConfig(root),
  ]);
  if (!tracked.split('\0').includes(file)) return { patch: '', notice: '文件已离开暂存索引，请刷新仓库。' };
  const driver = attrs.split('\0')[2];
  if (driver && ['clean', 'process'].some(kind => config.get(`filter.${driver}.${kind}`))) {
    return { patch: '', notice: '此文件启用了外部 Git 过滤器，已跳过工作区差异预览。' };
  }
  return { patch: await git(root, [...disableFilters(config), 'diff', ...diffFlags, '--patch', '--unified=3', '--', file]), notice: '' };
}

export async function patch(root, { mode, oid, base, file }) {
  validateFile(file);
  let result;
  if (mode === 'untracked') result = await untrackedContent(root, file);
  else if (mode === 'unstaged') result = await workingDiff(root, file);
  else {
    let args;
    if (mode === 'commit') args = diffArgs(await commitMeta(root, oid));
    else if (mode === 'compare') args = compareArgs(base, oid);
    else if (mode === 'staged') args = ['diff', ...diffFlags, '--cached'];
    else throw new AppError('不支持的差异模式。');
    result = { patch: await git(root, [...args, '--patch', '--unified=3', '--', file]), notice: '' };
  }
  const lines = result.patch.split('\n');
  const truncated = lines.length > 5000 || result.patch.length > 400000;
  return { ...result, patch: lines.slice(0, 5000).join('\n').slice(0, 400000), truncated };
}

// Both entry points expose the same read operations.
export const repositoryReads = {
  repository,
  history: (root, params) => history(root, params.ref, params.limit),
  commit: (root, params) => commit(root, params.oid),
  patch,
  compare,
  stashes,
  'file-history': fileHistory,
  attribution,
};
