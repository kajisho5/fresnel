# Changelog

All notable changes to fresnel are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-17

### Added
- **SPEC contract** (the system from ffmpeg-skill). Every tool is defined once (zod schema, role, capabilities, verification, examples); the MCP tool list, CLI commands and help, README tables and `docs/contract.json` are generated from it. `fresnel contract --json` and the MCP resource `fresnel://contract`. CI fails on drift and on breaking changes to the frozen tool surface, and runs every example.
- Every MCP tool runs from the CLI with the same arguments: `fresnel create`, `add-group`, `add-layer`, `set`, `move`, `align`, `remove`, `render-sheet`, and `fresnel call <tool_id>` for all of them. `--args '<json>'`, generated `--help` per command.
- `dry_run` for the editing tools (`icon_create`, `icon_add_group`, `icon_add_layer`, `icon_set`, `icon_move`, `icon_align`, `icon_remove`).
- MCP tools declare an output schema and return `structuredContent`.
- Multiple selection: ⌘-click, ⇧-click ranges in the sidebar, ⌘A, and a marquee on the canvas. Edit, move, hide, group, delete and paste styles on several items at once; differing values show as Mixed.
- Align (six edges and centers) and Distribute (horizontal, vertical), to the selection or the canvas, from the inspector, the menu and context menus. MCP tool `icon_align`.
- Menus support submenus (mouse and keyboard).

### Changed
- `icon_move` returns `{ "groups": [...] }` instead of a bare list (tool results must be objects for `structuredContent`).
- Layer gradients are measured against the drawn shape's bounds (transparent margins ignored), with y pointing down, matching real Icon Composer files and their renders.
- Specular "Automatic" picks Inside or Outside from the brightness of the glass layers and the background, following Apple's description.
- The preview's light comes from straight above, like Icon Composer's current generation.

## [0.1.1] - 2026-10-17

### Added
- First desktop releases: macOS (universal, Developer ID signed and notarized), Windows and Linux.

### Fixed
- macOS release build: `Info.plist` was malformed.
- SVG files are saved and exported exactly as imported. Only previews and image exports use the cleaned copy, so Illustrator SVGs with entities and SVGs with links no longer turn blank.
- `.icns` and the macOS images in `AppIcon.appiconset` use macOS variants (they used iOS values).
- The Dark image in `AppIcon.appiconset` has a transparent background, as Apple asks.
- Exports always use the full Liquid Glass effects, whatever the preview's Effects switch says.
- Image exports stop if a visible layer can't be rendered, instead of leaving it out silently (CLI: `--force` to override).
- Hidden files (such as `.git`, `.env`) and unsafe paths in an opened bundle are no longer carried into saves and exports.
- Exporting an `.icon` again removes images left over from the previous export.
- More SVG sanitizer edge cases (CSS and entity escapes, `xml:base`).

### Changed
- New layers get Liquid Glass, as in Icon Composer.
- `"appearance": "light"` variants apply to the Default appearance, as Icon Composer writes them.
- With a shared iOS / macOS icon, the platform bar shows one "iOS, macOS" platform, and platform variants use the `square` idiom.
- Layers can use Automatic Gradient fills.
- More than 4 groups is a warning (V-09) instead of being refused, because Icon Composer can write such files.
- Translucency fades toward the bottom of the shape; watchOS previews the 1088 pt canvas and ignores appearances.
- macOS images in `.icns` and `AppIcon.appiconset` follow the classic macOS template (inset body with a shadow), and `.icns` includes 16 and 32 px.
- `AppIcon.appiconset` includes a watchOS image when the icon targets watchOS.
- Exported PNGs carry an sRGB chunk; a partly transparent background is flagged (V-05).

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
- npm packages `fresnel-icon` and `fresnel-mcp`, published with provenance.
- User guide in English and Japanese (`docs/USER_GUIDE.md`, `docs/USER_GUIDE.ja.md`), plus contributing, security and issue templates.
- `fresnel <command> --help` works for every command.

### Fixed
- Fill and Layout settings use the full inspector width, so color values and the scale field are no longer cut off.
- Work restored from autosave stays marked as unsaved, even after you undo.

### Security
- Saves never follow symbolic links inside a bundle (core, MCP and desktop).
- Imported SVG is cleaned with a tokenizer and an allowlist (no scripts, event handlers, external references or animation).
- The MCP server only reads and writes inside its `--root` folders.

[Unreleased]: https://github.com/kajisho5/fresnel/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kajisho5/fresnel/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kajisho5/fresnel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kajisho5/fresnel/releases/tag/v0.1.0
