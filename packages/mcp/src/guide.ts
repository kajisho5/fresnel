import { DOCUMENT_ATTRS, GROUP_ATTRS, LAYER_ATTRS, type AttrDef } from '@fresnel/core';

/** Condensed from Apple's Human Interface Guidelines "App icons" (rev. 2026-06-08). See docs/HIG.md Part B. */
export const ICON_GUIDE = `# Designing Liquid Glass app icons (iOS, iPadOS, macOS, watchOS)

Source: Apple Human Interface Guidelines, "App icons"
https://developer.apple.com/design/human-interface-guidelines/app-icons

## Structure
- An icon is a background plus one or more foreground layers. The system adds Liquid Glass effects (specular highlights, refraction, translucency) and adapts them to size and system version.
- Canvas: 1024×1024 for iOS/iPadOS/macOS (masked to a rounded rectangle) and 1088×1088 for watchOS (masked to a circle).
- Appearances: Default, Dark, Clear light, Clear dark, Tinted light, Tinted dark. If you don't provide a variant, the system generates one.
- Groups: Liquid Glass effects (mode, specular Off/Automatic/Inside/Outside, blur, refraction, translucency, shadow) are configured per group. Use at most 4 groups — actool rejects icons with more.
- In Icon Composer the appearances are Default, Dark and Mono (Mono covers clear and tinted); icon.json stores Mono overrides under the "tinted" key.

## Layers
- Provide square, unmasked layers. Never bake in rounded corners; the system masks the icon, and pre-masked layers break the specular highlights and leave jagged edges.
- Prefer clearly defined edges. Avoid soft or feathered shapes.
- Import layers fully opaque and set transparency in the tool. Varying opacity across foreground layers adds depth.
- Prefer vector art (SVG/PDF). Convert text to outlines. Use PNG for raster art and mesh gradients.
- Don't bake in highlights, drop shadows, bevels, blurs or glows. The system draws dynamic effects.

## Design
- Keep it simple. Use one core idea expressed with a minimal number of filled, overlapping shapes.
- Prefer a simple background, such as a solid color or gradient. A background image must be full-bleed and opaque.
- Keep primary content centered so masking (especially circles on watchOS) doesn't truncate it.
- Avoid text unless it's essential. Avoid photos, UI screenshots and replicas of Apple hardware.
- Avoid very thin lines and sharp corners; they disappear at small sizes.

## Appearances
- Keep the same core features across all appearances. Don't swap elements in and out.
- Base the dark icon on the light one, using complementary, less bright colors. Colored backgrounds give the most contrast in dark mode.
- Dark, clear and tinted icons are more subdued. Check that the icon stays legible and recognizable in all of them.

## fresnel workflow
1. icon_create with a background (e.g. "gradient:#3D7BFF,#0E2A8A").
2. Draw each foreground element as its own 1024×1024 SVG (transparent background, centered artwork) and add it with icon_add_layer.
3. Use groups for depth: put elements that should share glass settings in one group. Index 0 is the frontmost.
4. Set glass on layers that should catch highlights, then tune the group: translucency, blur-material, specular, shadow.
5. Add Dark and Mono ("tinted") overrides with icon_set (appearance: "dark" or "tinted"), and platform variants (platform: "watchOS", …) where layout differs.
6. Check icon_render_sheet and icon_validate, then icon_export.
`;

function table(title: string, defs: Record<string, AttrDef>): string {
  const rows = Object.entries(defs).map(([k, d]) => `| \`${k}\` | ${d.description} | \`${JSON.stringify(d.default)}\` |`);
  return `### ${title}\n\n| key | meaning | default when absent |\n|---|---|---|\n${rows.join('\n')}\n`;
}

export const SCHEMA_GUIDE = `# icon.json attributes understood by fresnel

The format isn't documented by Apple. This reference is reverse-engineered (glassmith, icon-composer-template, real Icon Composer files).
Any attribute can be overridden per appearance with icon_set(..., appearance: "dark" | "tinted").
Unknown attributes are accepted and preserved.

${table('Document', DOCUMENT_ATTRS)}
${table('Group', GROUP_ATTRS)}
${table('Layer', LAYER_ATTRS)}

### Value formats
- Color: "#RRGGBB" (stored as srgb) or Icon Composer strings: "display-p3:r,g,b,a", "srgb:r,g,b,a", "extended-gray:l,a"
- Fill: "automatic" | "system-light" | "system-dark" | "none" | {"solid": color} | {"automatic-gradient": color} | {"linear-gradient": [color, color], "orientation": {"start": {"x","y"}, "stop": {"x","y"}}}
  Shorthands: "#336699" → solid, "gradient:#top,#bottom" → linear-gradient, "auto-gradient:#color" → automatic-gradient
- Position: {"scale": 1, "translation-in-points": [x, y]} (points on the 1024 canvas, y down, relative to center)
- Shadow: {"kind": "none" | "neutral" | "layer-color", "opacity": 0–1}
- Translucency: {"enabled": true, "value": 0–1}
- Blend modes: normal, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, soft-light, hard-light, difference, exclusion, hue, saturation, color, luminosity, plus-darker, plus-lighter
`;
