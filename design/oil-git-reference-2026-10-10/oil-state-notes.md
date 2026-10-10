# Oil Git 精简稿：改动与工作树

沿用按开源桌面 App 校准后的提交主稿：60px 工具栏、250px 源代码管理栏、40px 满高矩形导航和 26px 页脚，文件行高 34px。背景为 `#fafafa` / `#f0f0f0`，选中为 `#e4e7eb`，引用与 JSON 字符串为 `#407338`；正文、代码、行号均为 13px。两页复用 `oil-simple.css`，只在各页内补充当前状态的布局样式。

改动页删除中间提交列，右侧直接显示 `design/ui-exploration-2026-10-10/manifest.json`。保留单行文件路径与“工作区 · 未跟踪”范围信息，50 行代码从原 `bs-changes.html` 提取，未改写文件内容。左栏选中 manifest，采用 `?` 表示未跟踪；缩略文件名均附完整路径 title。未暂存 0、已暂存 0、未跟踪 25 是此前设计任务的冻结快照。

工作树页只保留一行表格：当前路径 `E:\mogoo\workspace\codex\mogoo-codex-git`、分支 `master`、HEAD `6b7e91f`、当前聊天。行后为普通灰字“没有其他工作树”，左侧源代码管理栏仍保留。design 目录使用原生 details + summary 默认收起，可展开查看文件，未跟踪 25 的冻结计数仍可见。

减法包括大页标题、统计卡、重复仓库概览、多层导航、文件编码注脚与大空状态框。用户只要求高清静态稿，因此未加动效；导航与刷新是静态控件，没有 API。没有修改产品代码。

按最终共享 CSS 重拍的四次 shoot 检查均通过，`issues` 与 `lint` 均为空。制作 Agent 已通过 `view_image` 实际检查两页的最终 1x 和 2x 原图，文字可读、路径完整、没有横向溢出或裁切。另用 shoot 点击工作树页目录，检查原生展开状态，证据为 `worktrees-shots/expanded/page.png`。此记录为两轮制作自检；独立视觉评审由主任务汇总，不在此虚构评分。

| 状态 | 高清图 3200 × 2000 | 阅读尺寸 1600 × 1000 | 检查记录 |
| --- | --- | --- | --- |
| 改动 | `changes-shots/page-@2x.png` | `changes-shots-1x/page.png` | 两目录各自的 `report.json` |
| 工作树 | `worktrees-shots/page-@2x.png` | `worktrees-shots-1x/page.png` | 两目录各自的 `report.json` |
