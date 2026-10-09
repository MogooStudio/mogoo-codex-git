# Git Lens · Codex 插件

自动打开当前 Codex 聊天仓库或 worktree 的本地只读 Git 面板。包含提交关系图、分支与标签、工作区改动、文件差异及工作树信息。

## 安装

需要本机 Codex、Node.js 22.12+、Git 和 pnpm 11.9.0。发布包内置已构建网页和服务，不需要安装前端依赖。当前支持在 Windows 本机使用；其他平台未完成运行验证。

解压发布包，在包含 `.agents/plugins/marketplace.json` 的目录执行：

```powershell
codex plugin marketplace add . --json
codex plugin add git-lens@mogoo-git-lens --json
codex plugin list --marketplace mogoo-git-lens --json
```

这是本地插件市场安装，不会发布到公共插件目录。Codex 使用安装缓存中的完整副本运行插件。保留解压目录作为后续更新来源；移动或移除开发源码不影响已安装副本运行。

## 使用

在对应项目聊天中选择 Git Lens 插件，或说“用 Git Lens 打开当前聊天的 Git 面板”。插件入口 `git-lens:git-lens` 会自动定位当前目录并打开右侧浏览器，无需填写仓库地址。

若当前聊天尚未加载新插件，开启新聊天；插件列表仍未更新时重新启动 Codex。聊天切换工作目录或 handoff 后，再从对应聊天调用入口，面板会使用新的路径。插件不会在后台追踪任意聊天切换。

无 Git 仓库时显示明确提示，不回退到其他仓库、不执行 Git init。

本插件没有联网账号、MCP 云服务、生命周期 Hook 或 Git 写操作。默认在本机 4317–4326 端口中复用同一安装版本的服务或选择空闲端口，可通过 `GIT_LENS_PORT` 指定端口。只监听 `127.0.0.1`。后台服务会保留以供其他聊天复用；禁用或卸载插件不会自动停止已启动的服务。

## 卸载

```powershell
codex plugin remove git-lens@mogoo-git-lens --json
codex plugin marketplace remove mogoo-git-lens --json
```

## 更新

如果新版包解压在不同路径，先执行 `codex plugin marketplace remove mogoo-git-lens --json` 移除旧市场注册，然后从新目录重新注册市场并安装插件。该步骤不移除其他插件市场。启动器只复用相同安装路径及版本的服务；旧服务不匹配时选择空闲端口，不终止无关进程。
