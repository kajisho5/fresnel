# Security policy

## Supported versions

Only the latest version on `main` (the web app at https://kajisho5.github.io/fresnel/) and the latest release get security fixes.

## Reporting a vulnerability

Please **don't** open a public issue. Report it privately through [GitHub's private vulnerability reporting](https://github.com/kajisho5/fresnel/security/advisories/new).

Include the affected part (web, desktop, CLI or MCP), the steps to reproduce and, if you have one, a sample `.icon` or SVG. You'll get a reply within 7 days. Once a fix is out, we'll credit you in the release notes unless you'd rather not be named.

## Scope

These are the boundaries fresnel enforces, and reports about them are especially welcome:

- **MCP server**: tools must not read or write outside the `--root` folders, including through symbolic links.
- **Saving bundles** (core, MCP and desktop): saves must never follow symbolic links inside an `.icon`, and must only delete unused images in `Assets/`.
- **SVG import**: imported SVG must not keep scripts, event handlers, external references or animation.
- **Desktop app**: the webview must not be able to read arbitrary files.

The web app has no server and sends no data, so server-side issues don't apply.
