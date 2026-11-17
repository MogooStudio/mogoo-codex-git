# 官网统计

Clarity 项目：`mogoo-codex-git`，ID `zf1cn09awi`。
[项目后台](https://clarity.microsoft.com/projects/view/zf1cn09awi/dashboard)。

配置在 `docs/index.html` 的 analytics script 属性中；逻辑在 `docs/site/analytics.js`。
仅用于 `https://mogoostudio.github.io/mogoo-codex-git/` 下的官网页面，不接入插件或本机 Git 面板。
Pages 发布沿用手动工作流；提交代码不会自动部署。插件版本无需变更。

## 记录哪些行为

- `install_click`：顶部导航、首屏或使用方式区域的安装入口实际被点击。
- `install_copy_success`：成功复制给 Codex 的安装提示或终端命令。仅复制成功上报；Clipboard API 失败后尝试兼容复制，后者返回 true 才算成功。快速连点不发起并发复制。
- `channel`：优先使用 UTM，区分 x / bilibili / github；无 UTM 时补充识别相关 Referrer。来源不可用时记为 direct_or_unknown，其他来源为 other。
- `campaign_medium`、`campaign_name`、`campaign_content`：短小的 UTM 分类，用于区分渠道及简介、主帖和置顶评论。
- `product`、`install_entry`、`install_method`：产品名、安装入口和复制方式。

Clarity 标签作用于会话，多个值可能并存，不能用它精确配对一次入口点击和一次复制。自定义事件不发送复制正文、代码或聊天。Clarity 自身仍会采集页面及交互数据，见 [网站说明](privacy.html)。

## 可使用的宣传链接

正式发布统计代码后，可使用以下渠道入口。既有 X 简介、推文和 B站内容不会随代码部署自动替换。UTM 只加在官网入口，安装与更新仓库地址保持原样。

X 简介已有内容接近字数上限，长 UTM 链接不一定能直接放入。使用时可选网站字段或自己的短链跳转，先核对原有内容和平台限制，不为放链接擅自删除简介。短链最终需保留完整参数；短链服务并未在本次接入中创建。

| 位置 | 官网链接 |
| --- | --- |
| X 简介 | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=x&utm_medium=social&utm_campaign=plugin-launch&utm_content=profile) |
| X 主帖 | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=x&utm_medium=social&utm_campaign=plugin-launch&utm_content=post) |
| X 回复 | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=x&utm_medium=social&utm_campaign=plugin-launch&utm_content=reply) |
| B站简介 | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=bilibili&utm_medium=video&utm_campaign=plugin-launch&utm_content=video_description) |
| B站置顶评论 | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=bilibili&utm_medium=video&utm_campaign=plugin-launch&utm_content=pinned_comment) |
| GitHub README | [入口](https://mogoostudio.github.io/mogoo-codex-git/?utm_source=github&utm_medium=referral&utm_campaign=plugin-launch&utm_content=readme) |

在 Clarity 按 Traffic → Source 筛选 x / bilibili；也可按 Custom tags → channel 筛选。按 campaign_content 区分 profile、post、video_description、pinned_comment，再查看 Smart events 中的两个事件。不要把事件次数称为人数或安装成功数。

## 数据边界

脚本在加载 Clarity 前发送 Consent V2：分析与广告 Cookie 均为 denied，不设置自定义用户身份。此模式不会用 Cookie 关联跨页/跨日访问；会话、复访、漏斗及回放能力受限。适合观察官网访问和安装意向，不是插件安装率或留存统计。

Clarity 项目设置中的 Cookie 已关闭，机器人检测保持开启。模板用于其他产品时，应同时核对对应项目设置，不只修改前端文件。

普通本地预览、非正式域名/路径、`?capture=1`、`?analytics=off` 和 Global Privacy Control 都不加载 Clarity。`analytics=off` 不是持久设置，需保留在当前页面 URL。统计脚本被拦截、未加载或抛错时，安装链接和复制仍可用。

## 本地检查

```sh
node --test tests/website-analytics.test.mjs
node scripts/build-pages.mjs release/pages-analytics-review
```

通过 HTTP 服务预览构建目录，保留 `/mogoo-codex-git/` 子路径。普通本地页面无统计请求；在 localhost 加 `?analytics=debug&utm_source=x&utm_medium=social&utm_campaign=plugin-launch&utm_content=post` 可检查 `window.mogooAnalyticsDebug`，只在内存保留最近 100 条调用，不发送到 Clarity。

本地检查覆盖来源、点击、成功/失败复制、连点、切换安装方式及统计不可用。后台真实收数必须等获准发布后验证，不能用模拟数据代替。届时检查手机/电脑、X/B站实际落地参数、事件请求和后台事件，排除自己的测试访问。

官方文档：[事件与标签](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api)、[UTM 筛选](https://learn.microsoft.com/en-us/clarity/filters/clarity-filters)、[Consent V2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2)。
