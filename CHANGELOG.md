# Changelog

All notable changes to fresnel are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- A layer with a fill near the edge of a scaled-down group was cut off in previews and exports (regression in 0.2.1).
- Replacing a layer's image removes the old image from Assets/ when nothing else uses it.
- A watchOS preview with a squircle or no-mask setting keeps its usual size; only the unmasked watch export uses the whole 1088 pt canvas.
- The macOS template shadow follows a larger inset; a path below a file reports "not a folder" instead of a symlink error.

## [0.2.1] - 2026-10-17

### Security
- MCP / CLI `--root`: a dangling symbolic link (or a symlinked output folder) could redirect previews and exports outside the allowed roots.
- SVG sanitizer: CSS escapes nested five or more times inside `<style>` could survive as markup; `image-set()` / `src()` URLs are removed; decoded style values are written back escaped.
- Entity expansion in SVGs is capped.

### Changed
- Clear light and Clear dark use the Mono ("tinted") values, like Tinted; Dark values no longer leak into Clear dark. Apple renders Clear and Tinted from Mono, and Assets.car keeps only light, dark and tintable renditions.
- Japanese UI follows Apple's terms: 色合い調整 (Tinted), 鏡面ハイライト (Specular), 透明度 (Translucency), 色付き (Chromatic), ブレンドモード with Apple's blend mode names.

### Fixed
- Rendering: a layer far outside the canvas (or a huge scale) crashed the whole process (resvg panic); a broken or huge PNG no longer stops rendering; group opacity 0 left a "ghost" shadow and glass; Clear appearances now use the Mono fill override; a dark override for one platform no longer turns off automatic darkening on the others; watchOS Clear / Tinted were clipped at the edge; SVGs without colors count as dark for Automatic specular; automatic gradients on SVG layers follow the drawn shape; `blur-material: null` means off; unknown blend modes and non-numeric values in icon.json can't break the preview; one-color gradients; tint accepts #RGB / #RRGGBBAA.
- macOS image template: the body is 824 px of 1024 as intended (was 856).
- The watchOS image in `AppIcon.appiconset` holds the whole 1088 pt watch canvas, as Icon Composer and the HIG define it (it held only the 1024 artwork, so the icon looked about 6% larger and lost the bleed).
- Saving no longer deletes files in `Assets/` that fresnel couldn't read (e.g. `a:b.svg`), and deleting a layer keeps other bundled images nothing points at. icon.json is written last.
- A nested `icon.json` (e.g. in a backup folder) is no longer read instead of the bundle's own; a truncated PNG no longer stops the bundle from opening; odd `*-specializations` keys round-trip.
- Moving / aligning an item that has a platform or appearance variant moves the base and every variant together (it wrote a variant's value into the base); grouping keeps layers in place when the old group was moved or scaled; duplicate ids in a group request no longer drop a layer.
- Names are unique regardless of case (matching how targets are resolved); "A/B" that matches both a group and a layer is reported as ambiguous; asset names are capped at 255 bytes and can't differ only in case.
- Checks: V-08 counts dark / tinted variants limited to a platform; V-06 measures strokes in points; V-03 warns when a bitmap is scaled up (it warned at 1:1).
- Editor: ⌘Z with a slider focused corrupted the undo history; a picked color could not be undone until the field lost focus; Escape in a number field now cancels; renaming the document then undoing cleared the unsaved mark; removing a variant (and blur in a variant) works; refraction can be turned off in a variant; "Vary for…" with several items starts each from its own value; watchOS selection outlines and dragging use the right values; dropping a group on a layer row lands where the line shows; Paste Style no longer copies position and visibility; shortcuts don't edit the document while the export sheet or a menu is open; arrow keys on a Mixed field step each item; ⇧-click on the canvas adds to the selection; `<html lang>` follows the UI language; a dropped folder is one undo step.
- MCP: misspelt arguments are errors (inputs are strict); `icon_export`, `icon_render`, `icon_create` are no longer marked read-only; platform variants appear in `icon_inspect` and `icon_set` results; two simultaneous `icon_create` calls can't both win; trailing slashes in paths; `to_group` on a group is an error; `out_dir` inside the bundle is refused; `written` lists every file; empty `sizes` / `appearances` and invalid `tint` are rejected.
- CLI: `--` ends options, booleans accept only true/false (1/0, yes/no, on/off), array flags can be repeated, `--args` objects merge, and `--help` / `--root` are no longer taken from another flag's value.
- SPEC: the frozen surface now also catches narrowed types and ranges, removed output keys and changed CLI positionals.

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

[Unreleased]: https://github.com/kajisho5/fresnel/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/kajisho5/fresnel/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/kajisho5/fresnel/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/kajisho5/fresnel/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/kajisho5/fresnel/releases/tag/v0.1.0
