# Oil Git 精简版高清设计稿

按用户提供的 [Oil Git](https://oil-oil.github.io/oil-git/) 与[开源仓库](https://github.com/oil-oil/oil-git)重做，沿用已选定的浅色方向。使用参考应用的结构、密度与配色，适配 mogoo-codex-git 的只读审阅任务。

打开 `oil-history.html`、`oil-changes.html`、`oil-worktrees.html` 或 `oil-narrow.html`，用右上角“浅色 / 深色”实际切换主题。首次默认浅色，选择保存在当前浏览器；存储不可用时仍可切换。主题应用发生在首次绘制前，避免先显示错误主题。

打开 `oil-designs.html` 查看两套主题的八张高清原图，图片已嵌入页面，可离线浏览。四个 HTML、`oil-simple.css`、`oil-theme.css`、`oil-theme.js` 与 `vendor/alpine.min.js` 构成可编辑设计源文件。最新截图在 `themes/<页面>/light-@2x.png`、`dark-@2x.png`；下面的旧路径保留作为浅色初稿的历史证据。

| 画面 | 高清原图 | 设计视口 |
| --- | --- | --- |
| 提交历史 | history-shots/page-@2x.png，3200 × 2000 | 1600 × 1000 |
| 工作区改动 | changes-shots/page-@2x.png，3200 × 2000 | 1600 × 1000 |
| 工作树 | worktrees-shots/page-@2x.png，3200 × 2000 | 1600 × 1000 |
| 窄面板 | narrow-shots/page-@2x.png，1520 × 2000 | 760 × 1000 |

## 设计决定

桌面使用 60px 单条工具栏、250px 文件栏、40px 矩形标签与 56px 提交行。主区 #fafafa，侧栏 #f0f0f0，选中 #e4e7eb，绿色 #407338。正文与代码最小 13px。保留真实提交图、文件状态和代码差异，把历史页文件清单收进单行选择器；工作树直接用一行表格。

删除上一轮的图标导轨、双层工具栏、头像、统计卡、分支概览、独立第四列文件栏、编码注脚和重复的大标题。窄版隐藏常驻文件栏，以 230px / 530px 双列保留提交与差异；标题省略配合完整 title，当前提交在详情完整显示。

## 数据与范围

使用项目真实提交 6b7e91f、作者与时间、五条历史、14 个修改文件和 codex/plugin.json 的实际 Git diff。未跟踪 25、未暂存 0、已暂存 0 为此前设计任务的冻结快照，不代表交付时实时状态；工作树为当前仓库路径。代码内容不为排版改写。

本交付是高清静态设计稿。搜索、刷新、导航、提交选择没有接入 API；原生目录展开、文件菜单和滚动只用于检查布局。用户限定设计交付，因此本轮无三处基本动效及动效录像，没有修改产品代码。

后续按用户要求加入主题切换交互，其余范围不变。切换即时生效，不增加过渡动画，保留紧凑布局。深色使用 #282c34 / #21252b 背景、#abb2bf 主文字与 #98c379 绿色；差异增删、字符高亮、标签、输入框和菜单均有对应配色。

## 验证与证据

已查看四页 100% 与 200% 渲染图。各 `*-shots`、`*-shots-1x` 目录保留截图与 Oil UI shoot 的 `report.json`。窄版另有 `file-menu`、`patch-end` 状态；工作树另有 `expanded` 状态。

渲染检查没有控制台错误、横向溢出或图片加载失败。历史页仅有真实 JSON 字符串约 59 字的长行提示，保留原文且差异区域宽度足够；其余页面没有 lint 提示。独立视觉评审一轮 9/10，无必修问题，取舍见 `visual-review.md`。

`history-shots-1x/page-compare.png` 是与官方深色截图的工具对比证据。两图主题、仓库数据与画面尺寸不同，像素差异 100% 不作为还原程度评分；本轮以应用源码尺寸和视觉结构核对为依据，不宣称像素级复刻。

## 参考与许可

参考固定在 Oil Git 提交 `94c0a6978b7755aab3db34a716832b181d1b3029`：`src/styles.css`、`src/usePaneLayout.ts`、`src/graph.ts`、`scripts/theme-palettes.json`。`reference-app.jpg` 来自官方 README，`reference-light.jpg` 来自官方网站。

参考作品版权及 Atom 配色声明保留于 `OIL-GIT-LICENSE.txt`。本稿使用自绘通用 SVG 图标，未复制 Material Icon Theme 图标资产。

主题切换使用本地 Alpine.js 3.17.4，许可见 `vendor/ALPINE-LICENSE.md`。

## 主题切换补充验收

主 Agent 连续运行 `verify-theme.cjs` 三次，三次通过。覆盖鼠标切换、键盘 Enter 切换、刷新后读回、四页共享选择、760px 窄幅、localStorage 读写失败以及页面运行错误。此脚本仅验证设计小样，需要本机 Playwright 与 Chrome。

四页均导出浅色 / 深色 1 倍和 2 倍截图，证据及报告位于 `themes/`。本次配色与控件的局部扩展由主 Agent 自检，没有新增独立评分；上一轮 9/10 只对应原浅色布局。最终报告无对比度问题、横向溢出或控制台错误，历史页仍保留原文长行提示。
