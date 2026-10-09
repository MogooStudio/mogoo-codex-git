# mogoo-codex-git · Git Lens

**English** | [简体中文](README.zh-CN.md)

A local, read-only Git visualization panel for the Codex in-app browser.

**Git Lens 0.2.1** is packaged as a local Codex plugin with the ID `git-lens@mogoo-git-lens`. It bundles the built frontend, Git read service, and skill entry point. The installed copy runs independently of the development checkout and its `node_modules`. No manual repository path entry or changes to the Codex installation are required.

## Use in Codex

Select **Git Lens** in a chat associated with your project or worktree, or ask:

> Use Git Lens to open the Git panel for this chat.

The plugin's `git-lens:git-lens` entry point detects the chat's actual working directory. In worktree mode, it opens that worktree rather than the main checkout.

The skill source is maintained at `codex/skills/git-lens/SKILL.md` and packaged at `skills/git-lens/SKILL.md`. It locates the bundled runtime relative to its own installed path, without machine-specific paths. When migrating from the standalone skill, the old copy is backed up under Codex's `skill-backups` directory to avoid duplicate entry points. Open a new chat if an existing chat has not loaded the plugin; restart Codex if the plugin list has not refreshed.

## Build and install the plugin

```powershell
pnpm plugin:build
codex plugin marketplace add .\release\git-lens-0.2.1 --json
codex plugin add git-lens@mogoo-git-lens --json
codex plugin list --marketplace mogoo-git-lens --json
```

The release directory contains both `.agents/plugins/marketplace.json` and `plugins/git-lens`. Archive the entire directory for distribution. The plugin includes a portable root manifest and a `.codex-plugin/plugin.json` compatibility manifest. Only runtime files are packaged; user repositories, caches, and development dependencies are excluded.

The packager refuses to overwrite an existing release directory. Bump the version before rebuilding, or run `pnpm build` followed by `node scripts/package-plugin.mjs --output <new-output-directory>`. If the marketplace is registered at an older path, remove the `mogoo-git-lens` marketplace registration before registering the new directory and reinstalling. See the [plugin installation, update, and removal guide (Chinese)](codex/PLUGIN-README.md).

The runtime package includes its own `pnpm-workspace.yaml` so it does not inherit an unrelated workspace from a parent directory. It has no runtime package dependencies, and launching it does not trigger dependency installation. The launcher reuses a service for the same installation and version, or selects an available local port between 4317 and 4326. It does not terminate an older or unrelated service.

Each launch creates a directory-bound URL. Refreshing the browser preserves that binding; the panel does not use a previous repository from localStorage or guess the directory from a globally active chat. After changing chats or handing work off to another worktree, invoke the entry point again from the relevant chat. A regular web page cannot subscribe to Codex sidebar selection changes.

If the chat's directory is not a Git repository, the panel shows an explicit empty state. It does not select a neighboring project or initialize a repository. Missing directories are reported as unavailable. Opening the home page without a chat directory shows a waiting-for-context state.

## Development

Requires Node.js 22.12 or later, Git, and pnpm. The project pins pnpm 11.9.0.

```powershell
git clone https://github.com/MogooStudio/mogoo-codex-git.git
cd mogoo-codex-git
pnpm install
pnpm build
pnpm start
```

These commands start the service only. For normal use, invoke the skill from your chat so it starts the service and passes the correct working directory. A foreground `pnpm start` process stops when its terminal closes or you press Ctrl+C. Services started by the skill run in the background and can be reused by multiple chats.

For development, run `pnpm dev` without building first. Refresh the page after frontend changes; restart the service after server changes.

To set a custom port:

```powershell
$env:GIT_LENS_PORT = '4318'
pnpm start
```

The development entry point is `pnpm open:chat --cwd <caller-working-directory>`. It returns JSON containing a URL. The caller must supply `--cwd`; omitting it never falls back to the tool's installation directory. URLs use `?cwd=<URL-encoded-chat-directory>`. The backend resolves the repository root and detects linked worktrees.

## Features

- Automatically locate the Git working tree from the current chat. The toolbar displays the bound directory without a manual input or open button.
- Render commit graphs from actual parent relationships. Browse all commits or filter by local branches, remote-tracking branches, and tags.
- Load 100 commits at a time, up to 2,000. Search matches loaded commits and dims other rows to preserve graph context.
- Inspect commit messages, authors, dates, full hashes, changed files, and unified diffs with line numbers.
- Compare merge commits against their first parent and root commits against an empty tree.
- Separate unstaged, staged, and untracked changes. A file can appear in both staged and unstaged groups.
- View paths and branches for other worktrees in the repository, with the current chat's working tree marked. Viewing this list does not change the panel's binding.
- Refresh manually or enable 15-second refreshes while the page is visible.
- Handle empty repositories, detached HEAD, paths with Chinese characters or spaces, conflict states, tags, and binary-file notices.

## Read-only behavior

The production service exposes GET endpoints only. It has no staging, commit, branch-switching, fetch, pull, push, reset, or cleanup operations. Remote information comes from local tracking references and may differ from the current remote server state.

The service listens only on `127.0.0.1` and validates the Host, Origin, and a dedicated request header. Git is invoked with argument arrays rather than a shell. Optional index writes, fsmonitor, external diff tools, textconv, and lazy object fetching are disabled. Partial clones report a read error when required objects are missing.

Diffs are rendered as text; repository scripts are not executed. Untracked-file previews do not follow symbolic links outside the repository, and the API does not allow reading files inside `.git`. The service is intended for your own trusted local environment, not as a shared or public service.

Editors or Codex may update files concurrently. Individual reads are not a transactional repository snapshot. The panel displays the last refresh time and lets you reload the data.

## Limitations

- Bare repositories, file history, blame, arbitrary commit comparisons, and image diffs are not supported yet.
- Untracked text previews are limited to 256 KB. Regular diffs display at most 5,000 lines or 400,000 characters. Each Git command has an 8 MB output limit and a 15-second timeout.
- Working-tree status retains rename source paths. Commit file lists show renames as deletions and additions to keep individual file diffs explicit.
- Submodules are shown using Git's directory status and pointer diffs, without recursively listing their files. Invoke the entry point from a chat in the submodule directory to inspect it as a separate repository.
- The layout supports desktop, narrow side panels, and phone widths. Narrow layouts hide author, date, and branch badges in the commit list; commit details remain available in the inspector.

## Validation

```powershell
pnpm test
pnpm build
```

Six integration test groups cover Git reads, chat bindings, and read-only boundaries using isolated temporary repositories. Packaging tests copy the plugin to an independent directory and invoke it through pnpm without runtime dependencies. A parent workspace with an invalid dependency verifies that launching the plugin does not install unrelated packages.

SHA-256 comparisons of all working-tree and `.git` files verify that reads do not modify repository contents. Tests clean up only their own temporary directories after checking the paths.

## License

Released under the [MIT License](LICENSE).

Copyright (c) 2026 超级大蘑菇头.
