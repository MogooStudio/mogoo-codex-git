# mogoo-codex-git · Git Lens

[English](README.md) | **简体中文**

Codex 中的只读 Git 面板。自动打开当前聊天的仓库或 worktree，浏览提交、分支和文件差异。

![Git Lens 提交记录与文件差异](docs/images/git-lens-overview.jpg)

## 功能

- 提交关系图、分支与标签筛选、提交搜索。
- 提交详情与带行号的文件差异。
- 分组查看已暂存、未暂存和未跟踪改动。
- 工作树概览，可选每 15 秒自动刷新。
- 仅在本机读取，不上传仓库、不执行 Git 写操作。

## 安装

需要 Codex、Git、Node.js 22.12+ 和 pnpm 11.9.0。已在 Windows 验证。

```powershell
git clone https://github.com/MogooStudio/mogoo-codex-git.git
cd mogoo-codex-git
pnpm install
pnpm plugin:build
codex plugin marketplace add .\release\git-lens-0.2.1 --json
codex plugin add git-lens@mogoo-git-lens --json
```

插件内置构建好的界面和服务。更新与卸载见[插件说明](codex/PLUGIN-README.md)。

## 使用

在项目聊天中选择 **Git Lens**，或直接说：

> 用 Git Lens 打开当前聊天的 Git 面板。

面板会在 Codex 浏览器中打开，并关联该聊天的工作目录。切换聊天或 worktree 后再次调用即可。插件未显示时，新开聊天或重启 Codex。

## 开发

```powershell
pnpm dev     # 开发服务
pnpm test    # 集成测试
pnpm build   # 生产构建
pnpm start   # 启动生产构建
```

运行 `pnpm open:chat --cwd <仓库路径>` 可获取绑定仓库的链接。默认自动选择 4317–4326 端口，也可通过 `GIT_LENS_PORT` 指定。

## 说明

- 只读：不暂存、提交、切分支、fetch 或 push；远程状态来自本机跟踪引用。
- 搜索仅覆盖已加载的提交，最多 2,000 条；大文件差异和未跟踪文件预览有大小限制。
- 暂不支持裸仓库、blame、图片差异和任意提交比较；不递归展开子模块。

## License

[MIT](LICENSE) · Copyright (c) 2026 超级大蘑菇头。
