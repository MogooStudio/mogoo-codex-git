import { AppError } from './git.mjs';
import { openChat } from '../scripts/open-chat.mjs';

export async function prepareBrowserPanel({ cwd, root }, { open = openChat } = {}) {
  const context = await open({ cwd });
  if (context.state !== 'ready' || context.root !== root) throw new AppError('当前聊天的仓库关联已变化，请刷新面板。');
  return { url: context.url, root: context.root };
}
