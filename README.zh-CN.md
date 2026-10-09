# mogoo-codex-git · Git Lens

[English](README.md) | **简体中文**

在 Codex 内置浏览器中使用的本地只读 Git 可视化面板。

当前版本已打包为 **Git Lens 0.2.1 Codex 本地插件**，插件 ID 为 `git-lens@mogoo-git-lens`。插件内置构建后的面板、读取服务和 Skill 入口，安装缓存可独立运行，不依赖开发项目路径或开发用 `node_modules`。无需填写仓库路径，也不需要修改 Codex 安装文件。

## 在 Codex 中使用

在项目或 worktree 对应的聊天中选择 **Git Lens** 插件，或说 **“用 Git Lens 打开当前聊天的 Git 面板”**。插件中的 `git-lens:git-lens` 入口会自动定位该聊天的实际工作目录。工作树模式绑定该 worktree，不回到主检出目录。

源码中的技能维护副本为 `codex/skills/git-lens/SKILL.md`，打包后位于插件的 `skills/git-lens/SKILL.md`。它依据自身加载位置找到内置运行文件，不含本机绝对安装路径。旧版独立 Skill 迁移时备份到 Codex 的 `skill-backups` 目录，避免与插件入口重复。已有聊天若尚未加载新插件，可在新的聊天中使用；插件列表没有刷新时重新启动 Codex。

## 插件打包与安装

```powershell
pnpm plugin:build
codex plugin marketplace add .\release\git-lens-0.2.1 --json
codex plugin add git-lens@mogoo-git-lens --json
codex plugin list --marketplace mogoo-git-lens --json
```

发布目录同时包含 `.agents/plugins/marketplace.json` 与 `plugins/git-lens`，可完整压缩后分发。插件带有根目录便携清单和 `.codex-plugin/plugin.json` 兼容清单。打包器只复制运行所需文件，不包含用户仓库、缓存和开发依赖。

发布目录已存在时打包器会拒绝覆盖；更新版本后重新打包，或先 `pnpm build` 再运行 `node scripts/package-plugin.mjs --output <新的输出目录>`。本地市场已注册旧路径时，先移除 `mogoo-git-lens` 市场注册，再注册新目录和安装插件。详细安装、更新与卸载见 [插件说明](codex/PLUGIN-README.md)。

运行包有独立的 `pnpm-workspace.yaml`，防止从用户目录或安装路径的父级继承无关工作区；因为运行时零依赖，启动不会触发依赖自动安装。默认 4317–4326 自动复用本安装版本的服务或选择空闲端口，旧版服务不匹配时不会被终止。

每次打开生成独立的目录绑定链接。浏览器刷新时保持该绑定，不读取上次访问仓库的 localStorage，不根据全局“最后活跃聊天”猜测目录。聊天切换或 handoff 后，再说“打开 Git 面板”即可按新的执行目录重新打开；普通网页本身不能订阅 Codex 侧栏切换事件。

当前聊天没有 Git 仓库时显示明确的空状态，不自动选择邻近项目或创建仓库。目录被删除时显示不可用。直接打开无参数首页时显示“等待当前聊天关联”。

## 源码开发运行

需要 Node.js 22.12 及以上版本、Git 和 pnpm。项目锁定使用 pnpm 11.9.0。

```powershell
git clone https://github.com/MogooStudio/mogoo-codex-git.git
cd mogoo-codex-git
pnpm install
pnpm build
pnpm start
```

上述命令只启动服务。日常请使用聊天中的 Skill 入口，它会自动启动服务并传入正确的聊天目录。手动以前台方式运行 `pnpm start` 时，终端关闭或按 Ctrl+C 后服务停止；Skill 启动的服务在后台运行并被多个聊天复用。

开发时运行 `pnpm dev`，无需提前构建；修改前端后刷新页面。服务端修改需要重新启动。

自定义端口：

```powershell
$env:GIT_LENS_PORT = '4318'
pnpm start
```

开发入口是 `pnpm open:chat --cwd <调用方实际目录>`，输出 JSON 和可打开的 `url`；`--cwd` 必须由调用方自动提供，省略时拒绝使用工具安装目录代替。链接参数为 `?cwd=经过 URL 编码的聊天工作目录`。后端解析目录所属仓库并判断是否为 linked worktree。

## 功能

- 从当前聊天入口自动定位 Git 工作区，顶栏只展示绑定目录，没有手动输入和打开按钮。
- 提交关系图基于真实父提交关系绘制；查看全部提交，或筛选本地分支、远程跟踪分支和标签。
- 每次加载 100 条提交，可继续加载，最多 2000 条。搜索只在已经加载的提交中匹配，并淡化其他行以保留图的关系。
- 查看提交说明、作者、日期、完整哈希、变更文件及带行号的统一差异。
- 合并提交与第一个父提交对比；根提交与空树对比。
- 工作区分别展示未暂存、已暂存、未跟踪文件。一个文件可同时出现在前两组。
- 查看同仓库其他 worktree 的路径与分支，标记当前聊天目录；其他工作树仅展示信息，面板不切换绑定。
- 手动刷新；可选开启每 15 秒刷新，仅在页面可见时重新读取绑定的聊天目录。
- 支持空仓库、分离 HEAD、中文和空格路径、冲突状态、标签与二进制文件提示。

## 只读约定

生产服务只暴露 GET 读取接口，不包含暂存、提交、切分支、fetch、pull、push、reset、清理等操作。远程信息来自本机已有跟踪引用，不代表服务器的即时状态。

服务只监听 `127.0.0.1`，校验 Host、Origin 和专用请求头。Git 通过参数数组调用，不执行 shell；设置 `GIT_OPTIONAL_LOCKS=0`，禁用 fsmonitor、外部 diff、textconv 和按需联网获取对象。部分克隆若缺少对象，将提示读取失败。

差异采用文本渲染，不执行仓库内的脚本。未跟踪文件不跟随符号链接读取仓库外部内容，也不允许通过接口读取 `.git` 内部文件。此服务用于自己的本机可信环境，不作为多人共享或公网服务。

文件系统可能由编辑器或 Codex 同时更新。各次读取不构成仓库事务快照；页面标明最近刷新时间，可手动重新读取。

## 当前限制

- 暂不支持裸仓库、文件历史追踪、blame、跨提交任意比较和图片差异。
- 未跟踪文本预览限制为 256 KB；普通差异最多显示 5000 行 / 400000 字符；单条 Git 命令最多输出 8 MB，超时 15 秒。
- 重命名在工作区状态中保留来源路径；提交文件列表为了明确单文件差异，以删除和新增展示。
- 子模块按 Git 返回的目录状态和指针差异展示，不递归展开所有子模块文件。在子模块目录的聊天中使用入口可以查看其独立仓库。
- 适配桌面、窄侧面板和手机宽度；较窄时隐藏作者、日期和分支徽标，完整信息仍可在详情区查看。

## 验证

```powershell
pnpm test
pnpm build
```

6 组集成测试创建隔离临时仓库，覆盖 Git 读取、聊天绑定与只读边界；发布包测试将插件复制到独立目录，通过真实 pnpm 命令验证零依赖启动，并设置一个包含无效依赖的父工作区来确认启动不会向上安装无关包。通过对比读取前后工作区与 `.git` 内全部文件的 SHA-256，检查读取未修改仓库内容。测试只清理经过路径检查的自建临时目录。

## License

本项目采用 [MIT License](LICENSE)。

Copyright (c) 2026 超级大蘑菇头。
