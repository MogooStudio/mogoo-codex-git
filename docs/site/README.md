# Documentation website

Entry point: `../index.html`. This is a static site using the existing white layout, local vendor scripts, and demo screenshots. It does not connect to visitors' local Git services.

For local preview, run `node scripts/build-pages.mjs` from the repository root, then serve its `release/pages` output with a static HTTP server. The build includes the page, assets, and license files. Assets use relative paths so a project-site subpath works.

The source, installation commands, and product links all use `MogooStudio/mogoo-codex-git`. GitHub Pages uses the manually triggered GitHub Actions workflow. Follow [Pages preparation and deployment](../PAGES.md) when publication is authorized. Pushing code does not deploy the site.

Media provenance is documented in [media/README.md](../media/README.md). Fixed vendor versions are GSAP / ScrollTrigger 3.13.0 and Alpine.js 3.17.4; see [vendor/LICENSES.md](vendor/LICENSES.md). Preserve their headers and license texts when updating them.
