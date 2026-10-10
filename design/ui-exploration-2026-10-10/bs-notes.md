# B · 浅色审阅台：改动与工作树状态

沿用 `b-porcelain.html` 的瓷白、冷灰、靛蓝、窄导航轨、细线、系统中文字体和完整 Git 分支品牌图标。两页采用相同的双层顶栏与 15 秒自动刷新入口；顶栏只保留刷新和明确的“当前聊天 / 已关联当前仓库”文案，不填入未核实的聊天标题。

## 排版取舍

- 从历史切到改动或工作树时收起提交历史列，让主区域获得 1524 CSS 像素宽度。
- 改动页：354 像素文件栏 + 1170 像素内容预览。保留未暂存、已暂存、未跟踪三个分组。7 个截图目录收成目录行，每行数量均为真实的 2 个文件；所有根级条目与所选 `manifest.json` 保持可见。
- 改动页的预览为真实未跟踪新文件内容。使用代码行号与 JSON 语法色，采用内容预览形式，不虚构增删统计或已有 `src` 文件修改。
- 工作树页：一条主工作树占据左上主要位置，当前聊天标签贴近该工作树；右侧提供真实分支、HEAD、仓库路径和提交信息。左下保留“其他工作树 0 个”的清楚空状态，不伪造工作树填满空间。
- 导航与文件的选中状态通过靛蓝浅底与字重表达，没有额外彩色侧边线。辅助文字使用 `#626d80`，各类正文、代码、行号和状态栏文字不小于 13px。代码字体在 Consolas 后加入 Microsoft YaHei UI / Microsoft YaHei 的中文回退，避免中文呈现宋体风格。
- 删除了顶栏重复搜索、未经核实的聊天标题、工作树标题旁重复的聊天绑定文字，以及两个空改动分组和工作树空状态的重复解释；空分组保留标题和 0 计数，工作树空状态保留“没有其他工作树”和 0。未做侧边比较、blame 或任何 Git 写操作入口。

## 真实数据冻结

冻结时刻：2026-10-10 11:47:07 +08:00。读取命令均为只读：`git status --short`、`git ls-files --others --exclude-standard`、`git worktree list --porcelain`；工作树概览的当前提交文案另由 `git log -1 --format=%H%n%s%n%an%n%aI` 验证。

- 未暂存：0。
- 已暂存：0。
- 未跟踪：25 个文件，均位于 `design/ui-exploration-2026-10-10/`。
- 工作树：1；当前路径 `E:/mogoo/workspace/codex/mogoo-codex-git`；分支 `refs/heads/master`；HEAD `6b7e91f8eee3ebc3aa859c9c9bda6884677cbdd7`。
- 当前提交：`chore: 统一 mogoo-codex-git 命名与插件元信息`；作者“超级大蘑菇头”；时间 `2026-10-10T11:23:24+08:00`。
- 文件预览：冻结时 `manifest.json` 的完整真实文本，共 50 行、2369 UTF-8 字节、LF。静态 HTML 内嵌该内容；页面右侧容器可滚动阅读全文。

冻结后的本轮 `bs-*`、其他并行设计文件或后续新文件没有计入图内“25”这个计数。后续仓库变化也不会自动更新这份设计稿。

### 冻结的未跟踪文件清单

```text
design/ui-exploration-2026-10-10/a-notes.md
design/ui-exploration-2026-10-10/a-obsidian.html
design/ui-exploration-2026-10-10/a-shots-1x/page.png
design/ui-exploration-2026-10-10/a-shots-1x/report.json
design/ui-exploration-2026-10-10/a-shots/page-@2x.png
design/ui-exploration-2026-10-10/a-shots/report.json
design/ui-exploration-2026-10-10/b-notes.md
design/ui-exploration-2026-10-10/b-porcelain.html
design/ui-exploration-2026-10-10/b-shots-1x/page.png
design/ui-exploration-2026-10-10/b-shots-1x/report.json
design/ui-exploration-2026-10-10/b-shots/page-@2x.png
design/ui-exploration-2026-10-10/b-shots/report.json
design/ui-exploration-2026-10-10/baseline-shots/page-@2x.png
design/ui-exploration-2026-10-10/baseline-shots/report.json
design/ui-exploration-2026-10-10/c-archive.html
design/ui-exploration-2026-10-10/c-notes.md
design/ui-exploration-2026-10-10/c-shots-1x/page.png
design/ui-exploration-2026-10-10/c-shots-1x/report.json
design/ui-exploration-2026-10-10/c-shots/page-@2x.png
design/ui-exploration-2026-10-10/c-shots/report.json
design/ui-exploration-2026-10-10/design-brief.md
design/ui-exploration-2026-10-10/manifest.json
design/ui-exploration-2026-10-10/mogoo-codex-git-designs.zip
design/ui-exploration-2026-10-10/style-explorer.html
design/ui-exploration-2026-10-10/visual-review.md
```

## 证据与限制

交付文件：`bs-changes.html`、`bs-worktrees.html`。

目标视口 1600 × 1000 CSS 像素，2 倍截图均为 3200 × 2000 像素：

- `bs-changes-shots/page-@2x.png`
- `bs-worktrees-shots/page-@2x.png`

同时补齐 1600 × 1000 像素的实际阅读尺寸截图：

- `bs-changes-shots-1x/page.png`
- `bs-worktrees-shots-1x/page.png`

截图使用 Oil UI 的 `shoot.mjs --size 1600x1000 --zoom 2`，实际阅读尺寸版省略 `--zoom`。两页经过最终 1× / 2× 实际截图自查，检查真实路径、行号、中文、计数、选中状态和空状态；工作树概览的真实长提交标题按语义拆成两行。最终截图报告位于各目录的 `report.json`，四份均为 `issues: []`、`lint: []`。额外读取 PNG 文件头确认 2× 为 3200 × 2000、1× 为 1600 × 1000；从静态 HTML 抽取预览内容后能成功解析为 50 行 JSON。`git diff --name-only` 为空，未改动任何已跟踪产品文件。

这两页是静态定稿：刷新、15 秒自动刷新、导航、目录展开等控件没有接入 API；没有实现动画，也没有提供动效证据。只读代码区域的浏览器原生滚动可用。没有修改任何产品源代码。主任务完成一轮综合独立视觉评审，无必须修改的问题；本轮按减法建议移除空状态重复说明，并统一代码中文字体回退。制作 Agent 另对实际截图自查。
