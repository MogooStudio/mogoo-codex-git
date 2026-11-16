# Development / 开发

Use Node.js 22.12+, Git, and pnpm 11.9.0. Run from the source root:

```powershell
pnpm install --frozen-lockfile
pnpm check
```

`check` builds the production UI, runs all tests, and checks that the bundled marketplace plugin matches the source. `pnpm test:core` is only the smaller diff/package subset.

## Browser development preview

In terminal one, choose an unused local port:

```powershell
$env:GIT_LENS_PORT = '4328'
pnpm dev
```

In terminal two, from the same source directory, replace the example path with a Git repository:

```powershell
pnpm open:chat --cwd 'C:/path/to/your-repository' --port 4328
```

Open the complete `url` from the JSON output, preserving `cwd` and `token`. The bare address printed by the server is not an authenticated repository link. Do not share the token URL in screenshots, public issues, or logs.

For production preview, run `pnpm build` and use `pnpm open:chat --cwd 'C:/path/to/your-repository'`; the launcher starts or reuses the matching local service. It does not install a plugin into Codex.

## Generated plugin

```powershell
pnpm marketplace:sync
pnpm check
```

Keep `plugins/mogoo-codex-git/` and `.agents/plugins/marketplace.json` together. The package includes built assets and service code; end users do not need the source dependencies.

## Optional UI checks

`scripts/verify-*.mjs` are maintenance tools, not part of `pnpm check`. They need Playwright and Chrome separately. Set `PLAYWRIGHT_MODULE` when `playwright` cannot be resolved. For scripts that connect to a running browser service, set `UI_BASE_URL` and `UI_AUTH_TOKEN` to the same service and token as the launcher URL.

Several scripts require specific repository states: `verify-ui.mjs` expects a `master` branch, an `Initial commit`, and particular files; `verify-ref-picker.mjs` also expects `master`. They are not a universal acceptance suite for a new source snapshot. `verify-snapshot-tools.mjs` creates its own temporary fixture, and `verify-mcp-theme.mjs` uses a simulated host. Read the selected script's setup before running it.

Windows is the currently validated platform. A successful build does not establish native Codex UI or macOS/Linux acceptance. The minimum declared Node.js version should be included in release validation when preparing an actual release.
