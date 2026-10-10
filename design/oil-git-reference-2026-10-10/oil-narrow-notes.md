# Oil Git 窄屏静态稿

目标视口为 760 × 1000 CSS px；2 倍导出为 1520 × 2000 px，同时保留 760 × 1000 px 的实际阅读尺寸。沿用主稿的 Oil Git 参考风格，这是对参考的窄屏合理延展，不称为像素级还原。

## 方向与减法

用户的主要任务是浏览提交与文件差异。窄屏保留 230px 历史列与 530px 详情列，移除左侧常驻源代码管理文件栏，让代码仍有可阅读的宽度。改动、历史、工作树采用 40px 矩形 tabs 并横贯全宽；“全部提交”移至 tabs 右端，移除历史列额外的整行计数。44px 工具栏只保留项目名、master、只读与刷新，完整仓库路径放在项目名 title 中；相对开源参考的 60px 工具栏，44px 是为窄幅保留正文空间的合理延展。

按开源源码校准后保留主区 #fafafa、文件选中 #e4e7eb、提交选中与 hunk #f0f1f3、绿色 #407338 与主稿字体。提交行固定 56px，提交标题 14px 单行省略，5 条标题均以 title 属性保留完整内容；详情标题仍为 16px，允许完整换行。master 使用淡绿徽标，← HEAD 使用灰字，230px 历史列省略远端徽标，以避免 refs 换成两行，这是窄幅合理延展。代码与行号为 13px，长 URL 和中文描述软换行。diff 使用独立滚动，并可聚焦后用 End 到达末尾。文件选择器只有一行 codex/plugin.json、4 / 14 与修改状态；展开菜单保留 14 个真实文件。未加入头像、分支概览、比例统计、图标导轨、第二顶栏、重复文件标题或额外翻页按钮。

## 真实内容与范围

从 oil-history.html 复制 5 条真实提交、HEAD 6b7e91f、14 个修改文件与 codex/plugin.json 差异。只读核对 git show 6b7e91f -- codex/plugin.json，显示的 @@ -1,14 +1,18 @@ hunk 至 category 行为 Git 实际输出，没有截断或补造闭合括号。

这是静态高清布局稿。原生 details 展开与区域滚动用于排版检查；刷新、搜索、提交选择与文件选择没有接入 API，未修改业务代码。按静态交付范围没有新增动效，因此不提供动画验收。当前为作者自检，整体交付的独立评审由主代理统一组织。

## 实际图像检查

共享 CSS 稳定后重新使用 Oil UI shoot 工具拍摄并通过 view_image 看过 1 倍、2 倍首屏、展开菜单与 diff 末尾，共 6 组。完整详情标题、历史单行标题、master / HEAD 一行排列、菜单中的最长路径、代码软换行与最后 category 行可读；提交图连线在最后节点处结束。首屏中末尾需要滚动，独立滚动后能够完整看到最后一行。

最终 6 组 report.json 的 issues 与 lint 均为空：无控制台错误、横向溢出、图片加载失败或可读性提示。

证据：

- narrow-shots/page-@2x.png：2 倍首屏。
- narrow-shots/file-menu/page-@2x.png：2 倍文件菜单。
- narrow-shots/patch-end/page-@2x.png：2 倍 diff 末尾。
- narrow-shots-1x/page.png：1 倍首屏。
- narrow-shots-1x/file-menu/page.png：1 倍文件菜单。
- narrow-shots-1x/patch-end/page.png：1 倍 diff 末尾。
