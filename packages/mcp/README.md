# fresnel-mcp

MCP server for [fresnel](https://github.com/kajisho5/fresnel). It lets AI agents create, edit, preview and export **Liquid Glass app icons**, stored as `.icon` bundles in Apple's Icon Composer format.

```json
{
  "mcpServers": {
    "fresnel": { "command": "npx", "args": ["-y", "fresnel-mcp", "--root", "/path/to/icons"] }
  }
}
```

- **Transport:** stdio.
- **File access:** limited to `--root` (repeatable). The default is the current directory.
- **Network:** none.

**Tools**

<!-- spec:tools -->
12 tools, 3 resources and 1 prompt — generated from the [SPEC contract](https://github.com/kajisho5/fresnel/blob/main/docs/contract.json); every tool also runs from the CLI.

| Tool (MCP) | CLI | Role | What it does |
|---|---|---|---|
| `icon_create` | `fresnel create` | create | Creates a new `.icon` with a background (color, gradient or system) and an optional dark background |
| `icon_inspect` | `fresnel call icon_inspect` | inspect | Lists groups, layers, attributes and every variant |
| `icon_add_group` | `fresnel add-group` | edit | Adds a group (the unit that carries the glass settings) |
| `icon_add_layer` | `fresnel add-layer` | edit | Adds a layer from inline SVG, an image file or PNG data |
| `icon_set` | `fresnel set` | edit | Sets attributes for all appearances, or a dark / tinted / platform variant |
| `icon_move` | `fresnel move` | edit | Reorders groups and layers, or moves a layer to another group |
| `icon_align` | `fresnel align` | edit | Aligns or distributes groups or layers (to each other or to the canvas) |
| `icon_remove` | `fresnel remove` | edit | Deletes a group or layer (unused assets go too) |
| `icon_validate` | `fresnel call icon_validate` | check | Runs the icon checks (schema and Apple HIG) |
| `icon_render` | `fresnel call icon_render` | render | Returns a PNG of one appearance as an image the model can see |
| `icon_render_sheet` | `fresnel render-sheet` | render | Returns all six appearances side by side as one PNG |
| `icon_export` | `fresnel call icon_export` | export | Writes `.icon`, `.icns`, `AppIcon.appiconset` and PNG sets |
<!-- /spec:tools -->

**Resources**
- `fresnel://guide/icon-design`
- `fresnel://schema/icon-json`
- `fresnel://contract` — the SPEC contract: every tool with its input/output JSON Schema, role, verification steps and examples (also `npx fresnel-icon contract --json`)

**Prompt**
- `design_app_icon`

Previews approximate Apple's renderer. MIT licensed. Not affiliated with Apple Inc.
