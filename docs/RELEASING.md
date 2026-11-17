# Release preparation / 发布准备

Source preparation and publication are separate steps. This source snapshot does not create a remote, install a plugin, publish a site, or push a release.

## Local validation

1. Confirm the intended version. `package.json`, `codex/plugin.json`, and the changelog must agree. The source, installation, and update repository is `MogooStudio/mogoo-codex-git`.
2. Install with `pnpm install --frozen-lockfile`.
3. Regenerate the bundled plugin with `pnpm marketplace:sync`, then run `pnpm check`.
4. Scan the exact source files and package intended for publication. Exclude local runtime tokens, logs, design experiments, private history, and dependencies.
5. Review third-party notices and screenshot provenance. Use only the demo assets described in [media notes](media/README.md).
6. Build into a new, unused directory with `node scripts/package-plugin.mjs --output <new-directory>` after `pnpm build`.

Keep existing tags immutable and choose a new version for subsequent changes. At publication, verify that the repository visibility, installation instructions, generated plugin, and release tag match the intended release.

## One GitHub repository

The repository is https://github.com/MogooStudio/mogoo-codex-git. Keep all of the following together:

- Source, lockfile, tests, documentation, and third-party notices.
- `.agents/plugins/marketplace.json`, which points to `./plugins/mogoo-codex-git`.
- The generated, self-contained plugin in `plugins/mogoo-codex-git/`, including its built `dist/` assets. End users install this package without source dependencies.
- `docs/`, the optional GitHub Pages site; Releases and version tags belong to the same repository.

`package.json.repository.url` must be `https://github.com/MogooStudio/mogoo-codex-git.git`. The updater reads this value for tag checks and compares it with Codex's registered marketplace source. Use exactly this clone URL in installation commands. The manifest repository uses the corresponding GitHub web URL; homepage and website links use `https://mogoostudio.github.io/mogoo-codex-git/`.

The updater checks stable `vMAJOR.MINOR.PATCH` Git tags, while the documented marketplace installation follows `main`. Keep `main` installable, develop changes on feature branches, and commit source plus regenerated plugin files together. At release time the version on `main`, the generated plugin version, and the version tag must agree. Uploading a ZIP to Releases alone does not update the installed marketplace package.

GitHub Releases can hold the standalone package generated above. The GitHub Pages workflow stages only presentation files from `docs/` and the required licenses into `release/pages/`. See [Pages preparation and deployment](PAGES.md) for account requirements, preview, and activation. Neither feature requires a second repository.

This repository starts from the reviewed clean-source snapshot with a new history. Do not import an old `.git` directory or push local recovery/checkpoint references.

Publication, repository visibility changes, release tags, and GitHub Pages deployment require a separate explicit publishing step. This document does not prove any deployment has occurred.
