# Changelog

All notable changes to fresnel are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- User guide in English and Japanese (`docs/USER_GUIDE.md`, `docs/USER_GUIDE.ja.md`), plus contributing, security and issue templates.
- `fresnel <command> --help` works for every command.

### Changed
- Fill and Layout settings use the full inspector width, so color values and the scale field are no longer cut off.
- Work restored from autosave stays marked as unsaved, even after you undo.

## [0.1.0] - 2026-10-17

First public version. The web app is live at https://kajisho5.github.io/fresnel/.

### Added
- **Editor** with an Icon Composer-style layout: sidebar (document, groups, layers), canvas with a platform and appearance bar, and Style / Document inspector.
- **Liquid Glass settings**: mode, specular (Off / Automatic / Inside / Outside), blur, translucency, shadow and refraction per group; glass, fill, blend mode and opacity per layer.
- **Appearances and variants**: Default / Dark / Mono with clear and tinted options, "Vary for…" per setting, and "Applies to" per section, for appearances and for iOS / macOS / watchOS.
- **Canvas**: drag with center snapping, arrow-key nudging, wallpapers and custom backgrounds, grids, preview sizes from 16 to 1024 px, zoom, and an Effects switch.
- **Compare** view with all six appearances at several sizes.
- **Export** to `.icon`, `.icns`, an App Store-ready `AppIcon.appiconset` (opaque 1024 px, Dark and Tinted) and PNG sets, plus `Assets.car` with Xcode 26 on macOS.
- **Checks** V-01 to V-10, based on Apple's HIG.
- **Autosave** to IndexedDB, with a restore prompt.
- **MCP server** (`fresnel-mcp`) with 11 tools, 2 resources and 1 prompt.
- **CLI** (`fresnel-icon`): build, inspect, validate, render, export, mcp.
- **Desktop app** (Tauri v2) that reloads the open file when it changes on disk.
- Lossless `icon.json` round trips, verified on files written by Icon Composer.
- English and Japanese UI, dark and light themes.
- Brand assets: logo, favicons, PWA icons, Open Graph and GitHub social images.

### Security
- Saves never follow symbolic links inside a bundle (core, MCP and desktop).
- Imported SVG is cleaned with a tokenizer and an allowlist (no scripts, event handlers, external references or animation).
- The MCP server only reads and writes inside its `--root` folders.

[Unreleased]: https://github.com/kajisho5/fresnel/compare/main...HEAD
[0.1.0]: https://github.com/kajisho5/fresnel/commits/main
