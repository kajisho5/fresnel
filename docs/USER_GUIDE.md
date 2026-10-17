# fresnel User Guide

This guide covers every part of fresnel, from your first icon to exporting it for the App Store. [日本語版はこちら](USER_GUIDE.ja.md).

- [1. Concepts](#1-concepts)
- [2. The window](#2-the-window)
- [3. Making an icon, step by step](#3-making-an-icon-step-by-step)
- [4. The sidebar](#4-the-sidebar)
- [5. The canvas](#5-the-canvas)
- [6. The inspector](#6-the-inspector)
- [7. Appearances and platforms](#7-appearances-and-platforms)
- [8. Variants ("Vary for…")](#8-variants-vary-for)
- [9. Compare](#9-compare)
- [10. Checks](#10-checks)
- [11. Opening, saving and autosave](#11-opening-saving-and-autosave)
- [12. Exporting](#12-exporting)
- [13. Preferences](#13-preferences)
- [14. Keyboard shortcuts](#14-keyboard-shortcuts)
- [15. Artwork guidelines](#15-artwork-guidelines)
- [16. Working with AI agents (MCP)](#16-working-with-ai-agents-mcp)
- [17. Command line](#17-command-line)
- [Troubleshooting](#troubleshooting)
- [Glossary](#glossary)

---

## 1. Concepts

An app icon made for Liquid Glass is a stack, not a flat picture.

| Part | What it is |
|---|---|
| **Background** | The fill behind everything: a color, a gradient, or a system fill. |
| **Group** | A set of layers that share Liquid Glass settings (translucency, blur, specular highlights, shadow, refraction). Apple recommends at most 4 groups. Groups at the top of the list are in front. |
| **Layer** | One image (SVG, PNG or JPEG) with its own fill, blend mode, opacity and position. |
| **Appearance** | How the icon looks in the system's Default, Dark, Clear and Tinted modes. |
| **Platform** | iOS / iPadOS and macOS use a rounded square. watchOS uses a circle. |
| **Variant** | A value that applies only to one appearance or platform, for example a darker background in Dark. |

The system applies the glass effects and masks the shape when it shows your icon. fresnel previews a close approximation of that.

## 2. The window

![The fresnel window](images/editor.png)

| Area | Contents |
|---|---|
| **Toolbar** (top) | Menu, sidebar toggle, document name ("— Edited" when there are unsaved changes), Undo / Redo, **Export…**, and the Style / Document inspector buttons. |
| **Sidebar** (left) | The document, then groups and layers, frontmost first. **＋** at the bottom adds images and groups. The count of groups and layers is shown next to it. |
| **Canvas toolbar** (above the canvas) | Background color, wallpaper or image, grid, preview size, zoom, **Effects** and **Compare**. |
| **Canvas** (center) | The live preview. Click to select, drag to move. |
| **Canvas bar** (below the canvas) | Platform (**iOS, macOS** when both share one icon, or each separately, plus watchOS) and appearance (Default / Dark / Mono), plus Mono **Options**. |
| **Inspector** (right) | **Style**: settings for the selection. **Document**: platforms and color space. |
| **Status bar** (bottom) | Canvas size, color space, platforms, the number of issues, and whether `actool` is available. |

## 3. Making an icon, step by step

1. **New icon.** Choose **Menu → New icon** (⌘N). To start from the example, choose **Menu → Try the sample**.
2. **Set the background.** Select the document row at the top of the sidebar. In **Color → Fill** choose **Solid**, **Gradient**, **Auto gradient**, **System light**, **System dark** or **Automatic**.
3. **Add layers.** Drop files on the window, or click **＋ → New Image…** (⇧⌘I). When you add several files at once, they're sorted by name, and the highest name ends up in front. So `1-back.svg`, `2-middle.svg`, `3-front.svg` stack the way you'd expect.
4. **Group.** Drop a folder to create a group named after it. Or select a layer and press ⌘G to wrap it in a new group, or choose **＋ → New Group**.
5. **Style the groups.** Select a group and set **Liquid Glass**. Start with translucency and blur, then specular and shadow.
6. **Style the layers.** Select a layer. Set **Color** (fill, blend mode, opacity), and in **Liquid Glass** turn **Effects** on if the layer should catch highlights.
7. **Position.** Drag on the canvas, use the arrow keys, or type X, Y and scale in **Composition → Layout**.
8. **Dark and Mono.** Press ⌥2 for Dark and ⌥3 for Mono, and fix anything that doesn't read well using [variants](#8-variants-vary-for).
9. **Check.** Press ⌘2 to compare every appearance and size. Click the issue count in the status bar to see the checks.
10. **Save and export.** ⌘S saves the `.icon`. ⇧⌘E exports for Xcode, the App Store, macOS or the web.

## 4. The sidebar

- **Selecting.** Click a row. ↑ and ↓ move through the list, and ← and → collapse and expand groups.
- **Reordering.** Drag a row. A line shows where it will go: drop on the upper half of a row to place the item before it, or on the lower half to place it after. Dropping a layer on a group row moves it to the top of that group. You can also use ⌘] (forward) and ⌘[ (backward).
- **Renaming.** Double-click a name, type, and press Return. Esc cancels.
- **Show and hide.** Hover a row and click the eye, or press ⇧⌘H. Hidden items are dimmed. Visibility can be a [variant](#8-variants-vary-for), for example hidden only on watchOS.
- **Several items.** ⌘-click adds a row to the selection or removes it; ⇧-click selects a range of rows of the same kind; ⌘A selects every layer. You can select layers or groups, not both at once. Layers from different groups can be selected together.
- **Context menu.** Right-click a row for Duplicate (⌘D), Bring Forward / Send Backward, Group / Ungroup, Show / Hide, Align ▸, Distribute ▸, Copy Style / Paste Style and Remove. With several items selected, every command applies to all of them, and ⌘G puts the selected layers into one new group.
- **Badges.** **Glass** marks a group with translucency on, or with at least one glass layer.
- **Copy Style / Paste Style** (⌥⌘C / ⌥⌘V) copy all style settings (not the image or name) from one group or layer to another of the same kind.

## 5. The canvas

### Selecting and moving

- Click the artwork to select the layer under the pointer. Click empty space to select nothing. Esc deselects.
- Drag a selected layer or group to move it. Its center snaps to the canvas center lines. Hold ⇧ to move only horizontally or vertically.
- The arrow keys move the selection 1 pt, and ⇧ + arrow keys move it 10 pt.
- ⌘-click adds a layer to the selection or removes it. Dragging on empty canvas draws a marquee that selects every layer it touches (hold ⇧ or ⌘ to add to the current selection). With several items, a dashed box shows their combined bounds, and dragging any of them moves them all.

### Align and Distribute

Use **Composition → Align** in the inspector, or **Align ▸ / Distribute ▸** in the menu and context menus.

| Command | What it does |
|---|---|
| Left / Horizontal Centers / Right Edges | Lines up the items' bounding boxes horizontally |
| Top / Vertical Centers / Bottom Edges | Lines them up vertically |
| Distribute Horizontally / Vertically | Spaces the centers of 3 or more items evenly; the two outermost items stay put |

With several items, Align uses the selection's bounds (switch to **To Canvas** next to Align to use the canvas). With one item it always aligns to the 1024 pt canvas. Only positions change, and each command is one undo step.
- A whole drag is a single undo step.

### Canvas toolbar

| Control | What it does |
|---|---|
| Color swatch | The canvas backdrop color |
| Wallpaper menu | None, Gradient, Sunset, Ocean, Night, or **Add Background…** to use your own image. The icon button next to it shows or hides the image. |
| Grid | Show Apple-style guide lines, in a light or dark color |
| Preview size | **Fit**, or 1024 / 512 / 256 / 128 / 64 / 32 / 16 px. Small sizes are drawn pixel-for-pixel so you see what the system will show. |
| Zoom | 25% – 200% (⌘＋ / ⌘− / ⌘0) |
| **Effects** | Turn off to see the icon without Liquid Glass effects (no shadow, translucency, highlights or rim) |
| **Compare** | Opens [Compare](#9-compare) (⌘2) |

"Approximate preview" is a reminder that Apple's renderer is private. fresnel's preview is close, but the system does the final rendering.

## 6. The inspector

### Style

The Style tab shows the settings for the current selection, in three sections. With several items selected, the header shows how many, a setting shows **Mixed** (or **—** in number fields) when their values differ, and a change applies to all of them. Fields that hold several values, like X / Y / scale, change only the part you edit for each item. Each section header has an **Applies to** popup. **All** edits the base value. The other choice, such as **Dark**, **Mono** or **watchOS**, edits only the current appearance or platform. See [Variants](#8-variants-vary-for).

**Color**

| Setting | Applies to | Notes |
|---|---|---|
| Fill | Document, layer | Automatic, None, Solid, Gradient (From / To, ⇅ to swap). The document also offers Auto gradient, System light and System dark. Each color has a hex value and an opacity. Colors keep their color space (Display P3 stays P3). |
| Blend mode | Group, layer | Normal, Multiply, Screen, Overlay and the other standard modes, plus Plus Darker and Plus Lighter |
| Opacity | Group, layer | 0–100% |

**Liquid Glass**

| Setting | Applies to | Notes |
|---|---|---|
| Mode | Group | **Combined** lights the group as one piece of glass. **Individual** lights each layer separately. |
| Specular | Group | Off, Automatic, Inside or Outside: where the highlight sits on the edge |
| Blur | Group | How frosted the glass is |
| Refraction | Group | Turn it on and drag on the pad: left–right is strength, bottom–top is depth |
| Translucency | Group | How much of the background shows through |
| Shadow | Group | None, Neutral or Chromatic, with an opacity |
| Effects | Layer | Whether the layer catches glass highlights |

**Composition**

| Setting | Applies to | Notes |
|---|---|---|
| Visible | Group, layer | Same as the eye in the sidebar |
| Image | Layer | Swap the layer's image for another asset in the icon, or **Replace…** with a new file |
| Layout | Group, layer | X and Y offset in points from the center (y points down) and scale. 0, 0, 100% means centered at natural size. |

### Document

| Setting | Notes |
|---|---|
| iOS, macOS | iOS & macOS (shared), iOS Only, macOS Only, or Off. This sets which platforms appear at the bottom of the canvas. |
| watchOS | Include the circular watchOS icon |
| SVG color space | How colors in SVG files without a color profile are read: Display P3 (Icon Composer's default) or sRGB |

### Number fields

- Type a value and press Return or Tab. Esc cancels, and leaving the field empty keeps the old value.
- ↑ and ↓ change by one step (⇧ ×10, ⌥ ×0.1).
- Arithmetic works: `*2` doubles the value, `+10` adds 10, and `35*3` sets 105.
- Percent fields accept `45` or `45%`.
- Double-click a slider to reset it to its default.

## 7. Appearances and platforms

### Appearances

| Button | What you see | Shortcut |
|---|---|---|
| **Default** | The normal, light icon | ⌥1 |
| **Dark** | The dark-mode icon | ⌥2 |
| **Mono** | Clear or tinted. Choose under **Options**: Light / Dark, Tinted on or off, and the tint's hue and intensity. | ⌥3 |

If you don't customize Dark or Mono, the system generates them from the Default icon. fresnel shows its approximation of the result and flags it with check V-08.

### Platforms

**iOS** and **macOS** share the rounded-square shape. **watchOS** shows the circle mask and has no appearances. Use platform variants to adjust the layout for the circle, for example a smaller scale so nothing gets cut off.

## 8. Variants ("Vary for…")

A variant overrides one setting for one appearance or platform. It's stored in `icon.json` as a specialization, exactly as Icon Composer does it.

**Two ways to create one:**

1. **For a whole section.** Switch the canvas to the case you want to edit (for example Dark). Then set the section's **Applies to** popup from **All** to **Dark**. A note under the header reads "Edits apply to Dark only", and every change in that section now goes into the Dark variant.
2. **For one setting.** With **All** selected, hover a setting and click **＋** next to its label, then choose **Vary for Dark** (or Mono, or the current platform). This copies the current value into a new variant.

**Reading variants.** With **All** selected, variants are listed under the base value with their name (Dark, Mono, iOS, macOS, watchOS, or combinations). The variant that applies to what's on the canvas right now is highlighted. Click **×** to remove a variant, and the base value applies again.

**Which value wins.** fresnel resolves the most specific match: appearance + platform first, then appearance, then platform, then the base value. "Mono" edits are stored under the tinted key, which covers both clear and tinted, as in Icon Composer.

**Setting a variant back to the default.** In a variant you can choose the default value explicitly, such as Normal, Visible or a 0, 0, 100% layout. fresnel stores it in the variant, so the base value doesn't show through.

## 9. Compare

![Compare](images/compare.png)

Compare (⌘2, or **Compare** in the canvas toolbar) shows Default, Dark, Mono · Clear light, Mono · Clear dark, Mono · Tinted light and Mono · Tinted dark side by side. Choose which sizes to show (1024, 128, 64, 32, 16). A **Not customized (V-08)** badge marks appearances the system will generate. Press ⌘1 to return to editing.

## 10. Checks

The status bar shows the number of issues. Click it to see them. The export sheet lists them too. Errors don't stop you from editing or saving, but Xcode or the App Store may reject the icon. Image exports are blocked while a visible layer can't be rendered, so nothing goes missing silently.

| ID | Level | What to do |
|---|---|---|
| V-01 | Error | An `icon.json` value is invalid. Usually from a hand-edited or corrupted file: reset the setting. |
| V-02 | Error | A layer's image is missing from `Assets/`. Use **Composition → Image → Replace…**. |
| V-03 | Warning | The layer isn't square or is smaller than 1024 px. Re-export the artwork at 1024×1024. |
| V-04 | Warning | The corners look pre-masked. Remove the rounded corners from the artwork. |
| V-05 | Warning | The background isn't opaque. Use an opaque fill, because App Store icons can't be transparent. |
| V-06 | Info | Very thin strokes. Make lines at least a few points wide so they survive at 16–32 px. |
| V-07 | Info | The SVG has text or filters. Convert text to outlines and remove effects, since the system adds its own. |
| V-08 | Warning | Dark or Tinted isn't customized. Fine if the generated version looks good in Compare. |
| V-09 | Warning | More than 4 visible groups. Apple recommends at most 4, and some versions of `actool` reject more. Merge groups. |
| V-10 | Error | Unsupported image format. Use SVG, PNG or JPEG. |

## 11. Opening, saving and autosave

### Opening

| Where | How |
|---|---|
| Web, Chrome / Edge | **Menu → Open…** (⌘O) and choose the `.icon` folder. Saving writes back into it. |
| Web, Safari / Firefox | Open or drop an `.icon.zip`. Saving downloads a new zip. |
| Any | Drop an `.icon` folder or `.icon.zip` on the window |
| Desktop | **Open…** and choose the `.icon`. On macOS, `.icon` bundles appear as single files. If yours appears as a folder, fresnel offers to open it as a folder. |

### Saving

- **Save** (⌘S) writes to the place you opened from. In Safari and Firefox, or for a new icon on the web, it downloads `Name.icon.zip`.
- **Save As…** (⇧⌘S) chooses a new place. On the web, an icon opened from a folder is saved into a new `Name.icon` folder that you pick.
- Anything you're still typing into a field is committed before saving.
- "— Edited" next to the name means there are unsaved changes. It disappears when you undo back to the saved state.
- When you save, fresnel removes images that no layer uses any more from `Assets/`. It doesn't touch other files in the bundle.

### Autosave and recovery

While there are unsaved changes, fresnel keeps a recovery copy in your browser (IndexedDB) or app storage, about 1.5 seconds after you stop editing and at least every 30 seconds while you keep going. If the tab or app closes before you save, the next launch asks **Restore unsaved changes?**. **Restore** brings the work back, still marked as unsaved. **Discard** deletes the copy. The copy never leaves your device.

### When the file changes on disk (desktop)

If another program, such as an AI agent through MCP, changes the `.icon` you have open, the desktop app reloads it. If you have unsaved changes, it tells you instead, so you can save your version or reopen the file.

## 12. Exporting

![Export](images/export.png)

Press ⇧⌘E or click **Export…**. Choose one or more formats:

| Format | Contents | Use |
|---|---|---|
| **.icon bundle** | `Name.icon/` | Xcode 26 or later. Drag it into your project and choose it as the app icon. |
| **macOS .icns** | `Name.icns` (16–1024 px, @1x and @2x, classic macOS template with your macOS variants) | Mac apps that don't use asset catalogs, installers, DMGs |
| **AppIcon.appiconset** | `Contents.json` and PNGs | Any Xcode asset catalog. The iOS 1024 px image is opaque RGB with no alpha, as the App Store requires. The Dark image has a transparent background and the Tinted image is grayscale, as Apple asks. The macOS sizes use the classic macOS template (inset body with a shadow) and your macOS variants. A watchOS image is added when the icon targets watchOS. |
| **PNG set** | `Name-png/<appearance>/icon-<size>.png` | Websites, store pages, documentation. All appearances, or Default only. |
| **Assets.car** | Compiled with Apple's `actool` | Desktop app on macOS with Xcode 26 or later only |

The sheet also shows the check results. On the web, everything downloads as `Name-export.zip`. The desktop app asks for a folder. Return runs the export, and Esc closes the sheet.

The preview, `.icns`, PNG set and appiconset all use fresnel's approximation of the glass. The `.icon` bundle stays layered, and the system renders it on the device.

## 13. Preferences

From the **Menu**:

- **Theme**: Dark, Light or System. Each click cycles to the next.
- **Language**: English or 日本語.

fresnel remembers these settings between sessions, in this browser:
- the platform
- the Mono options
- the canvas background
- the grid
- the Effects switch
- the sizes shown in Compare

## 14. Keyboard shortcuts

On Windows and Linux, use Ctrl instead of ⌘.

| | |
|---|---|
| **File** | New ⌘N · Open ⌘O · Save ⌘S · Save As ⇧⌘S · Export ⇧⌘E |
| **Edit** | Undo ⌘Z · Redo ⇧⌘Z · Duplicate ⌘D · Delete ⌫ · Copy Style ⌥⌘C · Paste Style ⌥⌘V |
| **Layers** | Add images ⇧⌘I · Group ⌘G · Ungroup ⇧⌘G · Forward ⌘] · Backward ⌘[ · Show / Hide ⇧⌘H |
| **View** | Edit ⌘1 · Compare ⌘2 · Default ⌥1 · Dark ⌥2 · Mono ⌥3 · Zoom ⌘＋ / ⌘− / ⌘0 |
| **Selection** | Add or remove: ⌘-click · Range (sidebar): ⇧-click · All layers: ⌘A · Marquee: drag on empty canvas |
| **Canvas** | Move 1 pt: arrow keys · Move 10 pt: ⇧ + arrow keys · Constrain a drag: ⇧ · Deselect: Esc |
| **Fields** | Step ↑ / ↓ · ×10 with ⇧ · ×0.1 with ⌥ · Commit: Return · Cancel: Esc |

Shortcuts that would interfere with typing (such as ⌘Z, ⌥1 – ⌥3 and Delete) are left to the text field while you type in one.

## 15. Artwork guidelines

These come from Apple's [Human Interface Guidelines for app icons](https://developer.apple.com/design/human-interface-guidelines/app-icons).

- **Square, unmasked, 1024×1024.** Never draw the rounded corners yourself, because the system masks the icon. Pre-masked art gets jagged edges and breaks the highlights.
- **Transparent background per layer.** Put the background in the document's fill, not in a layer.
- **One idea, few shapes.** Use simple, filled, overlapping shapes, and avoid thin lines and fine detail.
- **Fully opaque artwork.** Set transparency in fresnel (opacity, translucency) rather than in the file. Varying opacity across layers adds depth.
- **No baked effects.** No drop shadows, bevels, glows or highlights, because the system draws them.
- **Vector first.** SVG with text converted to outlines. Use PNG for raster art and mesh gradients.
- **Keep content centered,** so the watchOS circle doesn't cut it off.
- **Same icon in every appearance.** Dark and Mono should keep the same elements, with adjusted colors.

## 16. Working with AI agents (MCP)

fresnel's MCP server lets an agent such as Claude build icons for you and show you the result. Setup is in the [README](../README.md#mcp-server). Things to ask for:

- "Create `Habit.icon` in ~/Icons with a teal gradient background and a check-mark as glass, then show me all appearances."
- "Make the dark background darker and turn translucency down to 30% only in dark mode."
- "Validate `Habit.icon` and fix what you can."
- "Export Habit.icon as an appiconset and PNGs into ~/Icons/out."

The agent can only touch folders you allowed with `--root`. If you have the icon open in the desktop app, the app reloads the agent's changes.

## 17. Command line

See the [README](../README.md#command-line) for every command. Typical uses:

```bash
# CI: fail the build if the icon has errors (or warnings)
fresnel validate App/AppIcon.icon --strict

# Generate store and website images
fresnel export App/AppIcon.icon -o build/icons --formats png --sizes 1024,512,180 --appearances default,dark

# Preview sheet for a pull request
fresnel render App/AppIcon.icon --sheet -o icon-sheet.png
```

---

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| **Open…** only accepts zip files | Safari and Firefox can't open folders. Zip the `.icon` folder, or use Chrome, Edge or the desktop app. |
| Saving downloads a zip every time | Without folder access, saving downloads. In Chrome or Edge, open the `.icon` folder with **Open…**, and later saves will write back into it. |
| The layer is tiny or huge | Layers are placed at their natural pixel size on the 1024 pt canvas. Make the artboard 1024×1024, or change the scale in **Layout**. |
| The layer is off-center | The artwork isn't centered on its artboard. Center it in your drawing app, or adjust X / Y. |
| Corners look doubled or jagged | Rounded corners are baked into the artwork (V-04). |
| Colors look different from my design app | Check **Document → SVG color space**. Icon Composer reads untagged SVG colors as Display P3. |
| V-09 "More than 4 groups" | Apple recommends at most 4, and some versions of Xcode's `actool` reject more. Merge groups. |
| A change applies only in Dark (or doesn't apply in Dark) | Check the section's **Applies to** popup and the variant rows under the setting. |
| The eye toggle doesn't seem to work | Visibility may have a variant for this appearance or platform. With **All** selected, look under **Composition → Visible**. |
| The undo button is greyed out | Nothing to undo since the icon was opened. |
| The export is blank in Safari | Try again, or use another browser, and please report it. |
| **Assets.car** is unavailable | It needs the desktop app on macOS with Xcode 26 or later (`xcrun --find actool` must succeed). |
| macOS says the app can't be checked | Release builds are signed and notarized. A build you made yourself isn't: open it once, then click **Open Anyway** in System Settings → Privacy & Security. |
| A recovery dialog appears at every start | Choose **Restore** and save, or **Discard**. |

Still stuck? [Open an issue](https://github.com/kajisho5/fresnel/issues/new/choose) with your browser or OS version, the steps, and the `.icon` if you can share it.

## Glossary

| Term | Meaning |
|---|---|
| `.icon` | Icon Composer's file format: a folder (`icon.json` plus `Assets/`), shown as a single file on macOS |
| `icon.json` | The settings file inside an `.icon` |
| Specialization | A per-appearance or per-platform value in `icon.json`. fresnel calls it a variant. |
| Clear / Tinted | The system's monochrome appearances: Clear is glassy white or black, and Tinted uses the user's tint color |
| Squircle | The rounded-square mask used on iOS and macOS |
| Full-bleed | Artwork that fills the whole square, with no transparent margin or rounded corners |
| `actool` | Apple's asset catalog compiler, part of Xcode |
