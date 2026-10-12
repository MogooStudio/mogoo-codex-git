# mogoo-codex-git 官网

页面入口为 `../index.html`，使用「工程白」设计：白底通栏标题、深浅产品画面对照、交替功能图文和浅绿安装区。

这是无需构建的静态网站。GitHub Pages 发布来源为 `master` 分支的 `/docs` 目录。修改页面时，把入口、`site/styles.css`、`site/site.js` 和用到的资源一起提交；资源均使用相对路径，支持项目网站的子路径。

页面支持安装方式切换、复制安装请求或命令、产品图片放大、Escape 关闭和减少动态效果。真实产品截图及安装文案来自本项目，官网不连接访客本机的 Git 服务。

`assets/` 保存产品图片。`vendor/` 保存固定版本 GSAP 3.13.0、ScrollTrigger 和 Alpine.js，文件保留上游许可信息；更新依赖时核对其许可并保留说明。
