# Documentation website

Entry point: `../index.html`. This is a static site using the existing white layout, local vendor scripts, and demo screenshots. It does not connect to visitors' local Git services.

For local preview, serve the `docs` directory with a static HTTP server. Keep the entry page, `site/styles.css`, `site/site.js`, `site/assets`, `site/vendor`, and `media` together. Assets use relative paths so a project-site subpath works.

The source, installation commands, and product links all use `MogooStudio/mogoo-codex-git`. GitHub Pages is an optional deployment of this same repository: configure `main` and `/docs` after publication is authorized. `../.nojekyll` keeps the site as static files. The presence of these files does not mean a site is deployed, and no live Pages URL is advertised before deployment.

Media provenance is documented in [media/README.md](../media/README.md). Fixed vendor versions are GSAP / ScrollTrigger 3.13.0 and Alpine.js 3.17.4; see [vendor/LICENSES.md](vendor/LICENSES.md). Preserve their headers and license texts when updating them.
