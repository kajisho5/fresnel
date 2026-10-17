import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  APPEARANCES,
  addGroup,
  addLayer,
  buildAppIconSet,
  buildIcns,
  buildPngSet,
  targetsWatch,
  unrenderableLayers,
  createDocument,
  findGroup,
  makeAsset,
  moveNode,
  nameOf,
  nodeOf,
  overriddenAppearances,
  removeNode,
  resolvePath,
  setProp,
  summarizeIssues,
  validate,
  writeBundle,
  type Appearance,
  type AppearanceKey,
  type IconDocument,
  type NodeRef,
  type PropMap,
} from '@fresnel/core';
import { saveIcon, writeFiles } from '@fresnel/core/node';
import { nodeRasterizer, renderPng, renderSheetPng } from '@fresnel/render/node';
import { ICON_GUIDE, SCHEMA_GUIDE } from './guide';
import type { Workspace } from './workspace';

export const VERSION = '0.1.1';

const appearanceEnum = z.enum(APPEARANCES as [Appearance, ...Appearance[]]);
const overrideEnum = z.enum(['dark', 'tinted']);
const maskEnum = z.enum(['squircle', 'circle', 'none']);

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
const text = (v: unknown): Content => ({ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) });
const ok = (...content: Content[]) => ({ content });
const fail = (e: unknown) => ({ content: [text(`Error: ${(e as Error).message}`)], isError: true });

/** Wraps a handler so thrown errors become tool errors the model can read and fix. */
function safe<A>(fn: (args: A) => Promise<{ content: Content[] }>) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return fail(e);
    }
  };
}

function describeProps(props: PropMap) {
  const base: Record<string, unknown> = {};
  const overrides: Partial<Record<AppearanceKey, Record<string, unknown>>> = {};
  for (const [k, p] of Object.entries(props)) {
    const b = p.specs?.find((s) => s.appearance === undefined && s.idiom === undefined);
    if (b) base[k] = b.value;
    else if (p.plain) base[k] = p.plain.value;
    for (const a of overriddenAppearances(p)) {
      const s = p.specs!.find((e) => e.appearance === a && e.idiom === undefined)!;
      (overrides[a] ??= {})[k] = s.value;
    }
  }
  return Object.keys(overrides).length ? { ...base, overrides } : base;
}

export function inspect(doc: IconDocument) {
  return {
    order: 'groups and layers are listed front to back (index 0 = frontmost)',
    document: describeProps(doc.props),
    groups: doc.groups.map((g, gi) => ({
      target: nameOf(g) || `#${gi}`,
      index: gi,
      ...describeProps(g.props),
      layers: g.layers.map((l, li) => ({
        target: `${nameOf(g) || `#${gi}`}/${nameOf(l) || `#${li}`}`,
        index: li,
        ...describeProps(l.props),
      })),
    })),
    assets: Object.values(doc.assets).map((a) => ({ name: a.name, kind: a.kind, width: a.width, height: a.height })),
  };
}

function targetLabel(doc: IconDocument, ref: NodeRef): string {
  if (ref.kind === 'document') return 'document';
  if (ref.kind === 'group') return nameOf(findGroup(doc, ref.id)!);
  for (const g of doc.groups) {
    const l = g.layers.find((x) => x.id === ref.id);
    if (l) return `${nameOf(g)}/${nameOf(l)}`;
  }
  return '?';
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

export function createServer(ws: Workspace): McpServer {
  const server = new McpServer(
    { name: 'fresnel', version: VERSION },
    {
      instructions:
        'fresnel edits Apple Liquid Glass app icons stored as .icon bundles (the Icon Composer format). ' +
        'Typical flow: icon_create → icon_add_layer (one 1024×1024 SVG per element) → icon_set (glass, translucency, dark/tinted overrides) → ' +
        'icon_render_sheet to look at all appearances → icon_validate → icon_export. Read fresnel://guide/icon-design for Apple design rules. ' +
        'Targets are "document", "<Group>" or "<Group>/<Layer>" (names or #index; index 0 is frontmost). Previews are approximations of the system renderer.',
    },
  );

  // ------------------------------------------------------------ create / inspect
  server.registerTool(
    'icon_create',
    {
      title: 'Create icon',
      description:
        'Creates a new .icon bundle (Icon Composer format). background accepts "#RRGGBB", "gradient:#top,#bottom", "auto-gradient:#color", "automatic", "system-light", "system-dark" or a color string like "display-p3:1,0.5,0,1".',
      inputSchema: {
        path: z.string().describe('Bundle path, e.g. "MyApp.icon" (".icon" is added if missing). Relative paths are inside the first allowed root.'),
        background: z.string().optional().describe('Background fill for all appearances'),
        dark_background: z.string().optional().describe('Background override for the dark appearance'),
        watch: z.boolean().optional().describe('Also target watchOS (circular). Default true'),
        overwrite: z.boolean().optional().describe('Replace an existing bundle. Default false'),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    safe(async ({ path, background, dark_background, watch, overwrite }) => {
      if (/\.zip$/i.test(path.trim())) throw new Error('icon_create writes an .icon folder; pass a path without .zip (use icon_export to make a zip)');
      const full = await ws.iconPath(path);
      const exists = await stat(full).then(() => true, () => false);
      if (exists && !overwrite) throw new Error(`${path} already exists. Pass overwrite: true to replace it.`);
      const doc = createDocument({
        ...(background ? { background } : {}),
        platforms: watch === false ? { squares: 'shared' } : { circles: ['watchOS'], squares: 'shared' },
      });
      if (dark_background) setProp(doc, { kind: 'document' }, 'fill', dark_background, 'dark');
      await ws.withLock(full, () => saveIcon(full, doc));
      return ok(text({ created: full, ...inspect(doc) }));
    }),
  );

  server.registerTool(
    'icon_inspect',
    {
      title: 'Inspect icon',
      description: 'Shows the groups, layers, attributes and per-appearance overrides of an .icon bundle.',
      inputSchema: { path: z.string() },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ path }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      return ok(text(inspect(await ws.read(full))));
    }),
  );

  // ------------------------------------------------------------ structure
  server.registerTool(
    'icon_add_group',
    {
      title: 'Add group',
      description: 'Adds a group. Groups carry the Liquid Glass settings (translucency, blur-material, specular, shadow, lighting).',
      inputSchema: {
        path: z.string(),
        name: z.string(),
        index: z.number().int().min(0).optional().describe('0 = frontmost (default)'),
        props: z.record(z.string(), z.any()).optional().describe('Group attributes, e.g. {"translucency": {"enabled": true, "value": 0.5}, "blur-material": 0.3}'),
      },
    },
    safe(async ({ path, name, index, props }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const res = await ws.edit(full, (doc) => {
        const g = addGroup(doc, { name, ...(index !== undefined ? { index } : {}) });
        for (const [k, v] of Object.entries(props ?? {})) setProp(doc, { kind: 'group', id: g.id }, k, v);
        return { added: nameOf(g), groups: doc.groups.map(nameOf) };
      });
      return ok(text(res));
    }),
  );

  server.registerTool(
    'icon_add_layer',
    {
      title: 'Add layer',
      description:
        'Adds an image layer to a group (the group is created if it does not exist). Provide either `svg` (inline SVG markup), ' +
        '`source` (path to an .svg/.png/.jpg file inside the allowed roots) or `png_base64`. Artwork should be a square, unmasked ' +
        '1024×1024 canvas with a transparent background; it is placed at its natural size, centered.',
      inputSchema: {
        path: z.string(),
        group: z.string().describe('Group name or #index. A missing group is created in front (index 0); use icon_move to reorder.'),
        svg: z.string().optional().describe('Inline SVG markup'),
        source: z.string().optional().describe('Image file path'),
        png_base64: z.string().optional(),
        file_name: z.string().optional().describe('Name to store in Assets/, e.g. "star.svg"'),
        name: z.string().optional().describe('Layer name'),
        index: z.number().int().min(0).optional().describe('Position inside the group, 0 = frontmost (default)'),
        props: z
          .record(z.string(), z.any())
          .optional()
          .describe('Layer attributes, e.g. {"glass": true, "opacity": 0.8, "fill": "#FFFFFF", "position": {"scale": 0.8, "translation-in-points": [0, -40]}}'),
      },
    },
    safe(async ({ path, group, svg, source, png_base64, file_name, name, index, props }) => {
      const given = [svg, source, png_base64].filter((x) => x !== undefined).length;
      if (given !== 1) throw new Error('Provide exactly one of svg, source or png_base64');
      let bytes: Uint8Array;
      let fname: string;
      if (svg !== undefined) {
        bytes = new TextEncoder().encode(svg);
        fname = file_name ?? `${(name ?? 'layer').replace(/[^\w.-]+/g, '-')}.svg`;
      } else if (source !== undefined) {
        const src = await ws.resolve(source, { mustExist: true });
        bytes = new Uint8Array(await readFile(src));
        fname = file_name ?? basename(src);
      } else {
        bytes = new Uint8Array(Buffer.from(png_base64!, 'base64'));
        fname = file_name ?? `${(name ?? 'layer').replace(/[^\w.-]+/g, '-')}.png`;
      }
      const asset = makeAsset(fname, bytes);
      if (asset.kind === 'other') throw new Error('Unsupported image. Use SVG, PNG or JPEG.');
      const full = await ws.iconPath(path, { mustExist: true });
      const res = await ws.edit(full, (doc) => {
        let gid: string;
        try {
          const ref = resolvePath(doc, group);
          if (ref.kind !== 'group') throw new Error('`group` must name a group');
          gid = ref.id;
        } catch (e) {
          // only a plain name that matched nothing creates a group (not #index, paths or ambiguous names)
          const g = group.trim();
          if (/^#\d+$/.test(g) || g.includes('/') || !/not found/i.test((e as Error).message)) throw e;
          gid = addGroup(doc, { name: g }).id;
        }
        const l = addLayer(doc, gid, asset, {
          ...(name ? { name } : {}),
          ...(index !== undefined ? { index } : {}),
          ...(props ? { props } : {}),
        });
        return {
          added: targetLabel(doc, { kind: 'layer', id: l.id }),
          size: `${asset.width}×${asset.height}`,
          warnings: validate(doc)
            .filter((i) => i.ref?.kind === 'layer' && i.ref.id === l.id)
            .map((i) => `${i.id}: ${i.message}`),
        };
      });
      return ok(text(res));
    }),
  );

  server.registerTool(
    'icon_set',
    {
      title: 'Set attributes',
      description:
        'Sets attributes on the document, a group or a layer. Pass `appearance` ("dark", or "tinted" = Mono in Icon Composer) and/or `platform` ("iOS", "macOS", "watchOS", "square" = iOS+macOS) to write a variant for only that case. ' +
        'Set a value to null to remove it (or to remove the override when `appearance` is given). See fresnel://schema/icon-json for keys and formats.',
      inputSchema: {
        path: z.string(),
        target: z.string().describe('"document", "<Group>" or "<Group>/<Layer>" (names or #index)'),
        props: z.record(z.string(), z.any()).describe('kebab-case keys, e.g. {"translucency": {"enabled": true, "value": 0.6}, "specular": true}'),
        appearance: overrideEnum.optional(),
        platform: z.enum(['iOS', 'macOS', 'watchOS', 'square']).optional(),
      },
    },
    safe(async ({ path, target, props, appearance, platform }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const res = await ws.edit(full, (doc) => {
        const ref = resolvePath(doc, target);
        const variant = appearance || platform ? { ...(appearance ? { appearance } : {}), ...(platform ? { idiom: platform } : {}) } : undefined;
        for (const [k, v] of Object.entries(props)) setProp(doc, ref, k, v, variant);
        return { target: targetLabel(doc, ref), now: describeProps(nodeOf(doc, ref).props) };
      });
      return ok(text(res));
    }),
  );

  server.registerTool(
    'icon_remove',
    {
      title: 'Remove group or layer',
      description: 'Removes a group or a layer. Unused assets are deleted from Assets/.',
      inputSchema: { path: z.string(), target: z.string() },
      annotations: { destructiveHint: true },
    },
    safe(async ({ path, target }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const res = await ws.edit(full, (doc) => {
        const ref = resolvePath(doc, target);
        const label = targetLabel(doc, ref);
        removeNode(doc, ref);
        return { removed: label, groups: inspect(doc).groups.map((g) => ({ group: g.target, layers: g.layers.map((l) => l.target) })) };
      });
      return ok(text(res));
    }),
  );

  server.registerTool(
    'icon_move',
    {
      title: 'Reorder',
      description: 'Moves a group or layer to a new index (0 = frontmost). Layers can move to another group with to_group.',
      inputSchema: { path: z.string(), target: z.string(), index: z.number().int().min(0), to_group: z.string().optional() },
    },
    safe(async ({ path, target, index, to_group }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const res = await ws.edit(full, (doc) => {
        const ref = resolvePath(doc, target);
        let gid: string | undefined;
        if (to_group) {
          const g = resolvePath(doc, to_group);
          if (g.kind !== 'group') throw new Error('to_group must be a group');
          gid = g.id;
        }
        moveNode(doc, ref, index, gid);
        return inspect(doc).groups.map((g) => ({ group: g.target, layers: g.layers.map((l) => l.target) }));
      });
      return ok(text(res));
    }),
  );

  // ------------------------------------------------------------ check / render / export
  server.registerTool(
    'icon_validate',
    {
      title: 'Validate',
      description: 'Checks the icon against the schema and Apple HIG recommendations (square unmasked layers, opaque background, no text, variants, …).',
      inputSchema: { path: z.string() },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ path }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const issues = validate(await ws.read(full)).map(({ ref: _ref, ...i }) => i);
      return ok(text({ summary: summarizeIssues(issues), issues }));
    }),
  );

  server.registerTool(
    'icon_render',
    {
      title: 'Render preview',
      description: 'Renders an approximate preview PNG of one appearance and returns it as an image. Optionally saves it with `out`.',
      inputSchema: {
        path: z.string(),
        appearance: appearanceEnum.optional().describe('Default: "default". Mono in Icon Composer = clear-light / clear-dark / tinted-light / tinted-dark'),
        platform: z.enum(['iOS', 'macOS', 'watchOS']).optional().describe('Default: iOS. watchOS renders a circle'),
        size: z.number().int().min(16).max(2048).optional().describe('Pixels, default 512'),
        mask: maskEnum.optional(),
        tint: z.string().optional().describe('Tint color for tinted appearances, "#RRGGBB"'),
        light_angle: z.number().min(-180).max(180).optional().describe('Light direction in degrees, 0 = top, -45 = top-left (default)'),
        out: z.string().optional().describe('Save the PNG to this path'),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ path, appearance, platform, size, mask, tint, light_angle, out }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const doc = await ws.read(full);
      const png = await renderPng(doc, {
        appearance: appearance ?? 'default',
        idiom: platform ?? 'iOS',
        mask: mask ?? (platform === 'watchOS' ? 'circle' : 'squircle'),
        size: size ?? 512,
        ...(tint ? { tint } : {}),
        ...(light_angle !== undefined ? { lightAngle: light_angle } : {}),
      });
      const saved = out ? await saveFile(ws, out, png) : undefined;
      return ok({ type: 'image', data: b64(png), mimeType: 'image/png' }, text({ appearance: appearance ?? 'default', ...(saved ? { saved } : {}) }));
    }),
  );

  server.registerTool(
    'icon_render_sheet',
    {
      title: 'Render all appearances',
      description: 'Renders the six appearances (Default, Clear light, Tinted light / Dark, Clear dark, Tinted dark) side by side and returns the PNG.',
      inputSchema: {
        path: z.string(),
        cell: z.number().int().min(96).max(600).optional().describe('Cell size in pixels, default 240'),
        tint: z.string().optional(),
        out: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async ({ path, cell, tint, out }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const png = await renderSheetPng(await ws.read(full), { cell: cell ?? 240, ...(tint ? { tint } : {}) });
      const saved = out ? await saveFile(ws, out, png) : undefined;
      return ok({ type: 'image', data: b64(png), mimeType: 'image/png' }, ...(saved ? [text({ saved })] : []));
    }),
  );

  server.registerTool(
    'icon_export',
    {
      title: 'Export',
      description:
        'Exports the icon. Formats: "icon" (copy of the .icon bundle for Xcode 26+ / Icon Composer), "icns" (macOS), ' +
        '"appiconset" (Xcode asset catalog with Dark and Tinted variants), "png" (PNG set per appearance and size). ' +
        'Raster formats use fresnel’s approximate renderer. Assets.car requires Apple’s actool on macOS and is not produced here.',
      inputSchema: {
        path: z.string(),
        out_dir: z.string(),
        formats: z.array(z.enum(['icon', 'icns', 'appiconset', 'png'])).min(1),
        sizes: z.array(z.number().int().min(16).max(2048)).optional().describe('PNG sizes, default [1024, 512, 256, 128, 64, 32, 16]'),
        appearances: z.array(appearanceEnum).optional().describe('PNG appearances, default all six'),
      },
    },
    safe(async ({ path, out_dir, formats, sizes, appearances }) => {
      const full = await ws.iconPath(path, { mustExist: true });
      const outDir = await ws.resolve(out_dir);
      const doc = await ws.read(full);
      const name = basename(full).replace(/\.icon(\.zip)?$/, '');
      const raster = nodeRasterizer(doc);
      const missing = unrenderableLayers(doc);
      if (missing.length && formats.some((f) => f !== 'icon'))
        throw new Error(`These visible layers can't be rendered and would be missing from the images: ${missing.join(', ')}. Fix them first (icon_validate).`);
      const written: string[] = [];
      if (formats.includes('icon')) {
        const dest = join(outDir, `${name}.icon`);
        await saveIcon(dest, doc);
        written.push(join(dest, 'icon.json'), ...Object.keys(doc.assets).map((a) => join(dest, 'Assets', a)));
      }
      if (formats.includes('icns')) {
        const p = join(outDir, `${name}.icns`);
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, await buildIcns(raster));
        written.push(p);
      }
      if (formats.includes('appiconset')) written.push(...(await writeFiles(join(outDir, 'AppIcon.appiconset'), await buildAppIconSet(raster, { watch: targetsWatch(doc) }))));
      if (formats.includes('png'))
        written.push(
          ...(await writeFiles(
            join(outDir, `${name}-png`),
            await buildPngSet(raster, appearances ?? [...APPEARANCES], sizes ?? [1024, 512, 256, 128, 64, 32, 16]),
          )),
        );
      return ok(text({ out_dir: outDir, files: written.length, written }));
    }),
  );

  // ------------------------------------------------------------ resources & prompts
  server.registerResource(
    'icon-design-guide',
    'fresnel://guide/icon-design',
    { title: 'Liquid Glass icon design guide', description: 'Apple HIG rules for layered app icons, condensed', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: ICON_GUIDE }] }),
  );
  server.registerResource(
    'icon-json-schema',
    'fresnel://schema/icon-json',
    { title: 'icon.json attribute reference', description: 'Keys, value formats and defaults fresnel understands', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SCHEMA_GUIDE }] }),
  );

  server.registerPrompt(
    'design_app_icon',
    {
      title: 'Design an app icon',
      description: 'Step-by-step workflow to design a Liquid Glass app icon from an app description',
      argsSchema: {
        app: z.string().describe('What the app does'),
        path: z.string().optional().describe('Where to save the .icon bundle'),
        style: z.string().optional().describe('Colors / mood / constraints'),
      },
    },
    ({ app, path, style }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Design an app icon for: ${app}\n${style ? `Style: ${style}\n` : ''}Save it as ${path ?? 'AppIcon.icon'}.\n\n` +
              `Use the fresnel tools:\n` +
              `1. Read fresnel://guide/icon-design.\n` +
              `2. Pick one simple core idea (1–3 filled, overlapping shapes) and a background color or gradient.\n` +
              `3. icon_create with that background, and a darker dark_background.\n` +
              `4. For each shape, write a 1024×1024 SVG with a transparent background (no text, no shadows, no rounded-corner mask) and add it with icon_add_layer. Put shapes that should share glass in the same group; index 0 is frontmost.\n` +
              `5. Turn on glass for the foreground layers and tune the groups (translucency, blur-material, shadow).\n` +
              `6. Add dark and tinted overrides with icon_set where colors need to change.\n` +
              `7. Look at icon_render_sheet and fix anything that is hard to read at small sizes; run icon_validate.\n` +
              `8. Export with icon_export (formats: icon, icns, appiconset).`,
          },
        },
      ],
    }),
  );

  return server;
}

async function saveFile(ws: Workspace, out: string, bytes: Uint8Array): Promise<string> {
  const p = await ws.resolve(out);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
  return p;
}

