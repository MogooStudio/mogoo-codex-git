# mogoo-codex-git · Codex 插件

作者：**mogoo** · 网站：[mogoo-codex-git](https://mogoostudio.github.io/mogoo-codex-git/)

自动打开当前 Codex 聊天仓库或 worktree 的本地只读 Git 面板。包含提交关系图、分支与标签、工作区改动、文件差异及工作树信息。

## 安装

需要支持 `codex plugin` 命令的 Codex、Node.js 22.12+ 和 Git。插件内置已构建网页和服务，不需要 pnpm 或安装前端依赖。当前支持在 Windows 本机使用；其他平台未完成运行验证。

从统一的 Mogoo Codex Plugin 市场安装：

```powershell
codex plugin marketplace add https://gitee.com/mogoo/mogoo-codex-next-release.git --ref main --json
codex plugin add mogoo-codex-git@mogoo-codex-plugin --json
codex plugin list --marketplace mogoo-codex-plugin --json
```

Agent 收到安装请求时，先核对 `codex plugin --help`、`node --version` 和 `git --version`。市场标识为 `mogoo-codex-plugin`，市场来源为 `https://gitee.com/mogoo/mogoo-codex-next-release.git`；其中 Git 条目通过 `git-subdir` 指向 `https://github.com/MogooStudio/mogoo-codex-git.git` 的 `plugins/mogoo-codex-git`。执行上述命令后检查安装结果；不要把开发目录里的 `codex/skills/` 单独当成完整插件安装。

独立 ZIP 发布包继续保留旧市场，供离线分发和已有安装兼容使用。解压后，在包含 `.agents/plugins/marketplace.json` 的目录执行：

```powershell
codex plugin marketplace add . --json
codex plugin add mogoo-codex-git@mogoo-codex-git --json
codex plugin list --marketplace mogoo-codex-git --json
```

这是自定义插件市场安装。统一市场列出 Next 和 Git，安装 Git 不会同时安装 Next。Codex 使用安装缓存中的完整副本运行插件，Git 的源码、运行包和版本标签仍由 GitHub 项目仓库提供。使用本地发布包安装时，保留解压目录作为后续更新来源。移动或移除开发源码不影响已安装副本运行。

## 从旧独立市场迁移

先刷新统一市场并安装 Git，再核对其版本不低于原安装，最后移除旧条目：

```powershell
codex plugin marketplace add https://gitee.com/mogoo/mogoo-codex-next-release.git --ref main --json
codex plugin marketplace upgrade mogoo-codex-plugin --json
codex plugin add mogoo-codex-git@mogoo-codex-plugin --json
codex plugin list --marketplace mogoo-codex-plugin --json
codex plugin remove mogoo-codex-git@mogoo-codex-git --json
codex plugin marketplace remove mogoo-codex-git --json
```

迁移后新开聊天或重启 Codex。不要移除 `mogoo-codex-plugin` 市场，它可能还在提供 Next 等其他插件。更新检查设置保存在 `~/.codex/mogoo-codex-git/`，迁移不会清除这些设置。

## 使用

在对应项目的聊天右侧点击「Git 面板」，或在聊天里说“打开 Git 面板”。面板根据当前聊天自动识别仓库或 worktree，无需填写路径。缺少原生入口时，聊天指令仍可通过内置浏览器打开面板。

点击右上角工具栏的「浏览器打开」图标，可在 Codex 右侧内置浏览器打开当前聊天仓库的 Git 网页面板。插件在点击时核对仓库或 worktree，再通过 Codex 的浏览器专用入口打开完整绑定链接，无需修改「本地 URL 打开目标」设置。网页打开时继承原生面板的主题模式和当前颜色，避免网页旧偏好导致颜色不一致；选择「跟随」后继续响应浏览器的系统主题变化。网页固定绑定打开时的仓库，支持浏览、自动刷新和复制常用语；「填入聊天」使用原生 Git 面板。

原生面板默认跟随 Codex 主题。可以在工具栏手动选择浅色或深色，点击「跟随」恢复自动切换。

「源码」按文件查看工作区差异，可打开文件历史并查看已提交行的归属。「分支」用于筛选本地分支、远程跟踪分支和标签。「工作树」列出同一仓库的检出目录，「Stash」用于预览暂存快照。面板可见时默认每 15 秒更新本地状态。

点击右上角对话气泡形的「Git 常用语」图标，可以选择六条平时发给 Codex 的 Git 操作描述。新建分支需要填任务名，合并分支需要填分支名。在「发给 Codex 的内容」中核对正文后，可点击「填入聊天」将文本放入当前聊天草稿，按需修改后发送。原生面板和浏览器视图都支持复制文本。当前不支持自定义编辑或保存常用语。

若当前聊天尚未加载新插件，开启新聊天；插件列表仍未更新时重新启动 Codex。聊天切换工作目录或 handoff 后，再从对应聊天调用入口，面板会使用新的路径。插件不会在后台追踪任意聊天切换。

无 Git 仓库时显示明确提示，不回退到其他仓库、不执行 Git init。

原生入口通过本机 MCP 读取 Git 数据。浏览器入口在本机 4317–4326 端口中复用同一安装版本的服务或选择空闲端口，可通过 `GIT_LENS_PORT` 指定端口。服务只监听 `127.0.0.1`，可由其他聊天复用；启动链接携带当前安装的随机令牌，本地 HTTP 接口只接受令牌匹配的面板请求。

## 卸载

```powershell
codex plugin remove mogoo-codex-git@mogoo-codex-plugin --json
```

## 更新

在 Git 面板底栏点击版本号打开「插件更新」，查看运行中、已安装、市场快照和远端版本。自动检查默认开启，打开面板时最多每 6 小时读取一次 GitHub 仓库的版本标签。检查失败后保留一小时冷却，也可在弹窗中关闭自动检查或手动检查。版本检查只读取标签；HTTP 连接失败或仓库需要认证时，复用 Git 的代理和凭据配置，后台检查不弹出登录提示，也不在插件中存储凭据。

从统一市场安装的 Codex 面板支持「立即更新」。确认命令后，插件会重新核对 Git 的发行来源和版本，再通过 `plugin add` 拉取 Git 新版。更新 Git 不刷新整个统一市场，避免正在运行的 Next 等插件缓存被 Windows 锁定而阻断更新；其他未安装的插件不会随之安装。Git 的远端版本仍读取 GitHub 项目标签；`git-subdir` 条目不在市场快照内保存插件清单，市场快照版本可能显示为空。底栏显示「等待生效」时，新开聊天或重启 Codex 加载新版。已有 GitHub 独立市场安装继续沿用旧更新路径，迁移后使用统一市场。

浏览器或开发安装可在面板中查看版本和复制命令。统一市场安装也可以在终端执行：

```powershell
codex plugin add mogoo-codex-git@mogoo-codex-plugin --json
```

更新后新开聊天或重启 Codex，加载新版插件。

## Git 浏览、消息与网络

Git 浏览在本机完成，浏览接口不修改仓库、不上传仓库内容。「Git 常用语」是交给 Codex 的消息，后续 AI 操作可能修改仓库。安装、更新和版本检查需要联网，自动版本检查可在设置中关闭。此说明不扩大为对整个 Codex / AI 平台的数据承诺。

项目原创代码采用 MIT 许可；第三方组件保留各自许可和版权，完整说明随包包含在 `THIRD-PARTY-NOTICES.md`。
