# mogoo-codex-git

[English](README.md) | **简体中文**

作者：**mogoo** · 网站：[mogoo-codex-git](https://github.com/MogooStudio/mogoo-codex-git)

Codex 中的只读 Git 面板。自动打开当前聊天的仓库或 worktree，浏览提交、分支和文件差异。

![mogoo-codex-git 提交记录与文件差异](docs/images/mogoo-codex-git-overview.png)

## 功能

- 提交关系图、分支与标签筛选、提交搜索。
- 提交详情与带行号的文件差异。
- 分组查看已暂存、未暂存和未跟踪改动。
- 工作树概览，可选每 15 秒自动刷新。
- 浅色 / 深色切换并记住选择，支持桌面与窄面板布局。
- 仅在本机读取，不上传仓库、不执行 Git 写操作。

## 安装

把这句话交给支持安装 Codex 插件的 Agent：

```text
请帮我安装这个 Codex 插件：https://github.com/MogooStudio/mogoo-codex-git
```

或者在终端运行：

```powershell
codex plugin marketplace add MogooStudio/mogoo-codex-git --json
codex plugin add mogoo-codex-git@mogoo-codex-git --json
```

需要支持 `codex plugin` 命令的 Codex、Git 和 Node.js 22.12+，已在 Windows 验证。插件内置构建好的界面和服务，安装时无需手动克隆、pnpm 或构建。更新、旧版迁移与卸载见[插件说明](codex/PLUGIN-README.md)。

## 使用

在项目聊天中选择 **mogoo-codex-git**，或直接说：

> 用 mogoo-codex-git 打开当前聊天的 Git 面板。

面板会在 Codex 浏览器中打开，并关联该聊天的工作目录。切换聊天或 worktree 后再次调用即可。插件未显示时，新开聊天或重启 Codex。

## 开发

开发需要 pnpm 11.9.0。克隆仓库后运行 `pnpm install`。

```powershell
pnpm dev     # 开发服务
pnpm test    # 集成测试
pnpm build   # 生产构建
pnpm start   # 启动生产构建
pnpm marketplace:sync  # 构建并更新仓库内供 GitHub 安装的插件包
pnpm marketplace:check # 检查分发文件是否与当前构建一致
```

运行 `pnpm open:chat --cwd <仓库路径>` 可获取绑定仓库的链接。默认自动选择 4317–4326 端口，也可通过 `GIT_LENS_PORT` 指定。

修改界面、服务或插件技能后，运行 `pnpm marketplace:sync`，将生成的 `plugins/mogoo-codex-git/` 与 `.agents/plugins/marketplace.json` 一起提交。分发文件由源码生成，不要直接编辑。`pnpm plugin:build` 仍可生成独立的本地发布包。

## 说明

- 只读：不暂存、提交、切分支、fetch 或 push；远程状态来自本机跟踪引用。
- 搜索仅覆盖已加载的提交，最多 2,000 条；大文件差异和未跟踪文件预览有大小限制。
- 暂不支持裸仓库、blame、图片差异和任意提交比较；不递归展开子模块。

## License

[MIT](LICENSE) · Copyright (c) 2026 超级大蘑菇头。
