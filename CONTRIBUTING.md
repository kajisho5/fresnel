# Contributing to fresnel

Thanks for helping! Bug reports, ideas, docs fixes and code are all welcome.

## Reporting a bug

[Open an issue](https://github.com/kajisho5/fresnel/issues/new/choose) and include:

- where you use fresnel (web, desktop, CLI or MCP) and your browser or OS version
- the steps to reproduce, what you expected, and what happened
- the `.icon` file, if you can share it (zip it first)

For security problems, follow [SECURITY.md](SECURITY.md) instead.

## Setting up

You need Node.js 20 or later and pnpm 10. Rust is needed only for the desktop app.

```bash
git clone https://github.com/kajisho5/fresnel && cd fresnel
pnpm install
pnpm dev            # web app at http://localhost:5173
```

## Before you open a pull request

```bash
pnpm typecheck      # TypeScript in every package
pnpm test           # unit, MCP and CLI tests (vitest)
pnpm test:e2e       # Playwright UI tests
```

For desktop changes, also run `cargo test` in `apps/desktop/src-tauri`.

- Keep pull requests focused: one fix or feature per PR.
- Add a test for every bug fix and new behavior (`packages/*/test`, `apps/web/e2e`).
- Follow the app's design rules in [docs/HIG.md](docs/HIG.md): tokens, component conventions and UI copy.
- Put UI text in `packages/ui/src/i18n.ts`, in both English and Japanese.
- Don't change how `icon.json` is written unless a real Icon Composer file shows it's needed. Round trips must stay byte-for-byte (see `packages/core/test`).
- Add a line to the `[Unreleased]` section of [CHANGELOG.md](CHANGELOG.md).
- Use clearly fictional names in sample files and tests.

## Updating generated files

| Command | Regenerates |
|---|---|
| `pnpm fixtures` | `fixtures/Sample.icon` from `fixtures/sample.spec.json` |
| `pnpm brand` | Logos, favicons and social images (see [brand/README.md](brand/README.md)) |
| `pnpm --filter @fresnel/web shots` | README screenshots in `docs/images/` |

## Project layout

| Path | |
|---|---|
| `packages/core` | `.icon` model, parser and serializer, operations, checks, export |
| `packages/render` | SVG compositor for the preview (browser and resvg) |
| `packages/ui` | React UI |
| `packages/mcp`, `packages/cli` | MCP server and CLI |
| `apps/web`, `apps/desktop` | Web app (Vite) and desktop app (Tauri v2) |
| `docs/` | Spec (`DESIGN.md`), app HIG (`HIG.md`), user guides |

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
