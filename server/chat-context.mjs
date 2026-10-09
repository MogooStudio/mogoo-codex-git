import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { git, resolveRepo, AppError } from './git.mjs';

// 只解析入口明确传入的聊天目录；不使用服务进程目录或其他聊天的历史记录。
export async function chatContext(cwd) {
  if (!cwd) return { state: 'unbound', cwd: '', root: '', isWorktree: false };
  if (!path.isAbsolute(cwd) || cwd.includes('\0')) throw new AppError('聊天目录必须是有效的绝对路径。');
  let canonical;
  try {
    canonical = await realpath(cwd);
    if (!(await stat(canonical)).isDirectory()) throw new Error('not-directory');
  } catch {
    return { state: 'missing', cwd, root: '', isWorktree: false };
  }
  let inside;
  try { inside = (await git(canonical, ['rev-parse', '--is-inside-work-tree'])).trim(); }
  catch (error) {
    if (!/not a git repository/i.test(error.message)) throw error;
    return { state: 'no-repository', cwd: canonical, root: '', isWorktree: false };
  }
  if (inside !== 'true') return { state: 'no-repository', cwd: canonical, root: '', isWorktree: false };
  const root = await resolveRepo(canonical);
  const [gitDir, commonDir] = await Promise.all([
    git(root, ['rev-parse', '--path-format=absolute', '--git-dir']),
    git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
  ]);
  return { state: 'ready', cwd: canonical, root, isWorktree: path.resolve(gitDir.trim()) !== path.resolve(commonDir.trim()) };
}
