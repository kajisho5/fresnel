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
- `icon_create`, `icon_inspect`, `icon_add_group`, `icon_add_layer`, `icon_set` (with `dark` / `tinted` overrides), `icon_move`, `icon_remove`
- `icon_validate` checks against the schema and Apple's HIG.
- `icon_render` and `icon_render_sheet` return PNG previews as images.
- `icon_export` writes `.icon`, `.icns`, `AppIcon.appiconset` and PNG sets.

**Resources**
- `fresnel://guide/icon-design`
- `fresnel://schema/icon-json`

**Prompt**
- `design_app_icon`

Previews approximate Apple's renderer. MIT licensed. Not affiliated with Apple Inc.
