# GitHub Pages

展示页、源码和预构建插件使用同一个仓库：`MogooStudio/mogoo-codex-git`。
计划地址：`https://mogoostudio.github.io/mogoo-codex-git/`。
此文件和工作流本身不代表网站已经上线。
工作流仅允许手动触发；提交或推送代码不会自动发布网站。

## 发布前提

- GitHub Free 的私有仓库不能使用 Pages。保持仓库私有时，需要支持私有仓库 Pages 的套餐。
- Pages 网站本身将公开可访问；私有源码的安装仍要求仓库访问权限。
- 仓库可见性调整、付费升级和网站上线由维护者单独决定。
- 若以后公开仓库，发布前更新首页的私有安装提示。

## 本地准备

```powershell
node scripts/build-pages.mjs
```

脚本把指定的 HTML、样式、脚本、演示素材和许可文件复制到 `release/pages/`，不安装依赖，
不打包插件源码、开发文档或本机运行数据。目标必须是空目录；重复构建可指定新的目录：

```powershell
node scripts/build-pages.mjs release/pages-review-2
```

用静态 HTTP 服务预览输出目录；同时检查 `/mogoo-codex-git/` 项目子路径下的资源、
窄屏布局、安装方式切换、复制按钮、图片放大和两段视频。
`?capture=1` 仅供截图时跳过入场动画；正常访问仍保留动画，并尊重减少动态效果设置。

## 启用与验证

1. 确认账户和仓库满足上述前提。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 确认已获准发布后，在 Actions 手动运行 **Deploy GitHub Pages**，分支选择 `main`。
4. 等待部署成功，用工作流返回的网站地址验证首页、资源和视频。工作流成功与实际访问需分别确认。

工作流只上传构建脚本准备的目录，权限限定为读取源码和发布 Pages，不使用个人访问令牌。
后续修改推送到 `main` 后，仍需手动运行工作流才会更新网站。
页面更新不需要提高插件版本，也不应移动已有插件版本标签。

参考：[创建 Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、
[使用自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
