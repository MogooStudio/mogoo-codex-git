# Contributing

Small fixes, reproducible bug reports, and documentation improvements are welcome. Discuss substantial features before implementation so the maintenance scope is clear.

## Development check

Use Node.js 22.12+, Git, and pnpm 11.9.0:

```powershell
pnpm install --frozen-lockfile
pnpm marketplace:sync
pnpm check
```

The bundled files in `plugins/mogoo-codex-git/` and `.agents/plugins/marketplace.json` are generated from source. Include regenerated files when a source or notice change affects the package. Do not edit the generated copies by hand.

Use a synthetic repository for UI screenshots and demonstrations. Describe the concrete problem, resulting behavior, and validation in a pull request. Do not include private repository contents, credentials, token-bearing URLs, or local chat records.

## Reporting a bug

Include the plugin and Codex versions, operating system, installation source, expected behavior, actual behavior, and minimal reproduction steps. Redact paths and logs before attaching them. Do not post exploitable security details or credentials in a public issue.

## Scope

The panel browses Git state locally. Git request templates are separate messages sent to Codex. Changes should preserve that distinction, repository/worktree binding, and explicit confirmation before sending.

Optional UI scripts have additional requirements; see [development notes](docs/DEVELOPMENT.md). Maintainers prioritize compatibility and the core inspection workflow; opening an issue does not promise a delivery date.

Contributions must preserve third-party attribution and be compatible with the project's license. Do not add copied code or media without its required license and attribution.
