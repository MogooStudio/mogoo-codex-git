---
name: git-lens
description: 在 Codex 内置浏览器打开本机只读 Git 可视化面板，自动关联当前聊天正在工作的仓库或 worktree。用于“打开 Git 面板”“查看分支图”或明确要求使用 Git Lens；普通 Git 命令不触发此入口。
---

# 打开当前聊天的 Git 面板

插件内置已构建的界面和服务。需要本机 Node.js 22.12+、Git 和 pnpm。

先根据本技能实际加载路径定位插件根目录：`skills/git-lens/SKILL.md` 向上三级即为根目录，应包含 `plugin.json`、`package.json`、`scripts/open-chat.mjs` 和 `dist/index.html`。将实际路径保存为 `$taskPluginRoot`。使用安装副本的位置，不查找或调用原始开发项目；相对路径以技能文件的位置为基准，不以聊天目录为基准。

1. 确定当前聊天的实际执行目录。通常直接使用本回合 `environment_context.cwd`；若本任务明确在已关联 worktree 中工作，使用该 worktree 的实际路径。需要核实时，在默认聊天目录执行 `Get-Location`，或查看本聊天的 `list_artifacts`。多个附件不能任取第一个。不要使用 Git Lens 安装目录、浏览器旧地址或其他聊天的目录替代。
2. 将这个路径传给启动入口。PowerShell 示例中，先在默认聊天目录捕获路径，再运行 pnpm：

   ```powershell
   $taskChatCwd = (Get-Location).Path
   pnpm --silent --dir $taskPluginRoot open:chat --cwd $taskChatCwd
   ```

   如果实际工作位置是明确的 worktree，令 `$taskChatCwd` 为已核实的 worktree 路径。启动器会自动启动或复用本机服务并输出 JSON，其中 `url` 是此聊天专用的绑定链接。默认从 4317–4326 选择端口，不终止无关服务。缺少内置文件时报告插件安装不完整并重新安装插件，不回退调用开发目录，也不在安装缓存中下载前端依赖。
3. 使用 `mcp__codex_app__open_in_codex`，以 `target.type = "browser"`、`target.url = 输出的 url`、`placement = "right"` 打开当前聊天的面板。保留链接参数；不要只打开无参数首页。若使用浏览器工具打开，应把该标签标记为交付成果。
4. 核对启动结果与页面。`ready` 时应展示该目录对应的分支及提交；`no-repository` 时应展示“当前聊天没有 Git 仓库”，`missing` 时展示目录不可用。后两种状态也打开面板，不要求用户填写路径，不初始化仓库，不选择邻近仓库作为替代。

每次用户要求打开时重新捕获当前工作目录，以覆盖聊天切换到 worktree 或从 worktree 交回本地的情况。绑定链接之间相互独立；普通网页不能监测 Codex 侧栏正在选中哪个聊天，因此不要承诺一个共享页面会自动追踪任意聊天的切换。

本入口只启动本机服务和读取 Git，不执行 fetch、checkout、暂存或提交。
