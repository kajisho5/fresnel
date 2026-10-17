/**
 * SPEC — the single source of truth for fresnel's tools.
 *
 * Every tool is defined once here: its zod input schema, output shape, metadata and handler.
 * The MCP server (tools.ts), the CLI (`fresnel call` / `fresnel <cli>`), the contract
 * (`fresnel contract --json`, docs/contract.json) and the README tool tables are all generated
 * from this list, and packages/mcp/test/contract.test.ts fails when any of them drift.
 * See docs/design/spec.md.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import {
  APPEARANCES,
  addGroup,
  addLayer,
  alignNodes,
  boxOf,
  buildAppIconSet,
  buildIcns,
  buildPngSet,
  createDocument,
  distributeNodes,
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
  targetsWatch,
  unrenderableLayers,
  validate,
  type AlignHow,
  type Appearance,
  type AppearanceKey,
  type IconDocument,
  type NodeRef,
  type PropMap,
} from '@fresnel/core';
import { saveIcon, writeFiles } from '@fresnel/core/node';
import { nodeRasterizer, renderPng, renderSheetPng } from '@fresnel/render/node';
import type { Workspace } from './workspace';

/** Version of the contract format and of the tool surface (see docs/design/spec.md §7). Independent of the npm version. */
export const CONTRACT_VERSION = '1.0';

export type Role = 'create' | 'inspect' | 'edit' | 'check' | 'render' | 'export';

export interface ToolResult {
  data: Record<string, unknown>;
  image?: Uint8Array;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  /** MCP tool name. Never renamed within a contract major version. */
  id: string;
  /** CLI subcommand (`fresnel <cli>`); `fresnel call <id>` always works too. */
  cli: string;
  /** Arguments taken positionally on the CLI, in order. */
  positional?: (keyof S & string)[];
  title: string;
  /** One line for tables (README, --help). */
  summary: string;
  description: string;
  role: Role;
  capabilities: string[];
  input: S;
  /** Output shape. Loose objects: adding keys is compatible. */
  output: z.ZodType;
  mutates_input: boolean;
  idempotency_hint: 'idempotent' | 'not-idempotent';
  destructive?: boolean;
  supports_dry_run: boolean;
  /** How to check the result. */
  verification: string[];
  requires_visual_verification: boolean;
  /** Runnable examples. The contract test runs all of them in order in a scratch folder. */
  examples: { args: Record<string, unknown>; note: string }[];
  run(ws: Workspace, args: z.infer<z.ZodObject<S>>): Promise<ToolResult>;
}

const tool = <S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef => def as unknown as ToolDef;

// ------------------------------------------------------------ shared schemas & helpers

const appearanceEnum = z.enum(APPEARANCES as [Appearance, ...Appearance[]]);
const overrideEnum = z.enum(['dark', 'tinted']);
const platformEnum = z.enum(['iOS', 'macOS', 'watchOS', 'square']);
const maskEnum = z.enum(['squircle', 'circle', 'none']);
const pathArg = z.string().describe('Path to the .icon bundle (".icon" is added if missing)');
const dryRunArg = z.boolean().optional().describe('Validate and report the result without writing anything');
const loose = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape);
const groupsOutline = z.array(z.looseObject({ group: z.string(), layers: z.array(z.string()) }));

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

const outline = (doc: IconDocument) => inspect(doc).groups.map((g) => ({ group: g.target, layers: g.layers.map((l) => l.target) }));

function targetLabel(doc: IconDocument, ref: NodeRef): string {
  if (ref.kind === 'document') return 'document';
  if (ref.kind === 'group') return nameOf(findGroup(doc, ref.id)!);
  for (const g of doc.groups) {
    const l = g.layers.find((x) => x.id === ref.id);
    if (l) return `${nameOf(g)}/${nameOf(l)}`;
  }
  return '?';
}

async function saveFile(ws: Workspace, out: string, bytes: Uint8Array): Promise<string> {
  const p = await ws.resolve(out);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
  return p;
}

const inspectOutput = loose({ order: z.string(), document: z.record(z.string(), z.unknown()), groups: z.array(z.looseObject({ target: z.string(), index: z.number() })), assets: z.array(z.looseObject({ name: z.string() })) });

// Small artwork used by the examples (1024×1024, transparent background).
const EX_STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M512 212 L594 420 L812 430 L640 566 L700 780 L512 660 L324 780 L384 566 L212 430 L430 420 Z" fill="#ffffff"/></svg>';
const EX_DOT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="512" cy="512" r="300" fill="#7FB2FF"/></svg>';

// ------------------------------------------------------------ tools (order = workflow order; the examples run in this order)

export const TOOLS: ToolDef[] = [
  tool({
    id: 'icon_create',
    cli: 'create',
    positional: ['path'],
    title: 'Create icon',
    summary: 'Creates a new `.icon` with a background (color, gradient or system) and an optional dark background',
    description:
      'Creates a new .icon bundle (Icon Composer format). background accepts "#RRGGBB", "gradient:#top,#bottom", "auto-gradient:#color", "automatic", "system-light", "system-dark" or a color string like "display-p3:1,0.5,0,1".',
    role: 'create',
    capabilities: ['bundle', 'background', 'appearance-overrides', 'platforms'],
    input: {
      path: z.string().describe('Bundle path, e.g. "MyApp.icon" (".icon" is added if missing). Relative paths are inside the first allowed root.'),
      background: z.string().optional().describe('Background fill for all appearances'),
      dark_background: z.string().optional().describe('Background override for the dark appearance'),
      watch: z.boolean().optional().describe('Also target watchOS (circular). Default true'),
      overwrite: z.boolean().optional().describe('Replace an existing bundle. Default false'),
      dry_run: dryRunArg,
    },
    output: loose({ created: z.string(), dry_run: z.boolean().optional(), groups: z.array(z.unknown()) }),
    mutates_input: true,
    idempotency_hint: 'not-idempotent',
    supports_dry_run: true,
    verification: ['icon_inspect shows the document fill', 'icon_render_sheet shows the background in all appearances'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon', background: 'gradient:#3D7BFF,#0E2A8A', dark_background: '#101828' }, note: 'New icon with a blue gradient and a dark-mode background' }],
    async run(ws, { path, background, dark_background, watch, overwrite, dry_run }) {
      if (/\.zip$/i.test(path.trim())) throw new Error('icon_create writes an .icon folder; pass a path without .zip (use icon_export to make a zip)');
      const full = await ws.iconPath(path);
      const exists = await stat(full).then(() => true, () => false);
      if (exists && !overwrite) throw new Error(`${path} already exists. Pass overwrite: true to replace it.`);
      const doc = createDocument({
        ...(background ? { background } : {}),
        platforms: watch === false ? { squares: 'shared' } : { circles: ['watchOS'], squares: 'shared' },
      });
      if (dark_background) setProp(doc, { kind: 'document' }, 'fill', dark_background, 'dark');
      if (!dry_run) await ws.withLock(full, () => saveIcon(full, doc));
      return { data: { created: full, ...(dry_run ? { dry_run: true } : {}), ...inspect(doc) } };
    },
  }),

  tool({
    id: 'icon_inspect',
    cli: 'inspect',
    positional: ['path'],
    title: 'Inspect icon',
    summary: 'Lists groups, layers, attributes and every variant',
    description: 'Shows the groups, layers, attributes and per-appearance overrides of an .icon bundle.',
    role: 'inspect',
    capabilities: ['read'],
    input: { path: pathArg },
    output: inspectOutput,
    mutates_input: false,
    idempotency_hint: 'idempotent',
    supports_dry_run: false,
    verification: [],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon' }, note: 'List everything in the bundle' }],
    async run(ws, { path }) {
      const full = await ws.iconPath(path, { mustExist: true });
      return { data: inspect(await ws.read(full)) };
    },
  }),

  tool({
    id: 'icon_add_group',
    cli: 'add-group',
    positional: ['path'],
    title: 'Add group',
    summary: 'Adds a group (the unit that carries the glass settings)',
    description: 'Adds a group. Groups carry the Liquid Glass settings (translucency, blur-material, specular, shadow, lighting).',
    role: 'edit',
    capabilities: ['groups', 'glass'],
    input: {
      path: pathArg,
      name: z.string(),
      index: z.number().int().min(0).optional().describe('0 = frontmost (default)'),
      props: z.record(z.string(), z.any()).optional().describe('Group attributes, e.g. {"translucency": {"enabled": true, "value": 0.5}, "blur-material": 0.3}'),
      dry_run: dryRunArg,
    },
    output: loose({ added: z.string(), groups: z.array(z.string()) }),
    mutates_input: true,
    idempotency_hint: 'not-idempotent',
    supports_dry_run: true,
    verification: ['icon_inspect lists the new group'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon', name: 'Back', props: { 'blur-material': 0.3 } }, note: 'A back group with some blur' }],
    async run(ws, { path, name, index, props, dry_run }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const data = await ws.edit(
        full,
        (doc) => {
          const g = addGroup(doc, { name, ...(index !== undefined ? { index } : {}) });
          for (const [k, v] of Object.entries(props ?? {})) setProp(doc, { kind: 'group', id: g.id }, k, v);
          return { added: nameOf(g), groups: doc.groups.map(nameOf) };
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_add_layer',
    cli: 'add-layer',
    positional: ['path'],
    title: 'Add layer',
    summary: 'Adds a layer from inline SVG, an image file or PNG data',
    description:
      'Adds an image layer to a group (the group is created if it does not exist). Provide either `svg` (inline SVG markup), ' +
      '`source` (path to an .svg/.png/.jpg file inside the allowed roots) or `png_base64`. Artwork should be a square, unmasked ' +
      '1024×1024 canvas with a transparent background; it is placed at its natural size, centered.',
    role: 'edit',
    capabilities: ['layers', 'images', 'glass'],
    input: {
      path: pathArg,
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
      dry_run: dryRunArg,
    },
    output: loose({ added: z.string(), size: z.string(), warnings: z.array(z.string()) }),
    mutates_input: true,
    idempotency_hint: 'not-idempotent',
    supports_dry_run: true,
    verification: ['Check `warnings` (V-01…V-10)', 'icon_render_sheet to see the layer in every appearance'],
    requires_visual_verification: true,
    examples: [
      { args: { path: 'Demo.icon', group: 'Front', svg: EX_STAR, name: 'Star' }, note: 'Inline SVG; the "Front" group is created in front' },
      { args: { path: 'Demo.icon', group: 'Back', svg: EX_DOT, name: 'Dot', props: { opacity: 0.8 } }, note: 'A second layer behind it' },
    ],
    async run(ws, { path, group, svg, source, png_base64, file_name, name, index, props, dry_run }) {
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
      const data = await ws.edit(
        full,
        (doc) => {
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
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_set',
    cli: 'set',
    positional: ['path'],
    title: 'Set attributes',
    summary: 'Sets attributes for all appearances, or a dark / tinted / platform variant',
    description:
      'Sets attributes on the document, a group or a layer. Pass `appearance` ("dark", or "tinted" = Mono in Icon Composer) and/or `platform` ("iOS", "macOS", "watchOS", "square" = iOS+macOS) to write a variant for only that case. ' +
      'Set a value to null to remove it (or to remove the override when `appearance` is given). See fresnel://schema/icon-json for keys and formats.',
    role: 'edit',
    capabilities: ['attributes', 'appearance-overrides', 'platform-variants', 'glass'],
    input: {
      path: pathArg,
      target: z.string().describe('"document", "<Group>" or "<Group>/<Layer>" (names or #index)'),
      props: z.record(z.string(), z.any()).describe('kebab-case keys, e.g. {"translucency": {"enabled": true, "value": 0.6}, "specular": true}'),
      appearance: overrideEnum.optional(),
      platform: platformEnum.optional(),
      dry_run: dryRunArg,
    },
    output: loose({ target: z.string(), now: z.record(z.string(), z.unknown()) }),
    mutates_input: true,
    idempotency_hint: 'idempotent',
    supports_dry_run: true,
    verification: ['`now` shows the stored values', 'icon_render_sheet for the appearances you changed'],
    requires_visual_verification: true,
    examples: [
      { args: { path: 'Demo.icon', target: 'Front', props: { translucency: { enabled: true, value: 0.4 }, specular: true } }, note: 'Glass settings on a group' },
      { args: { path: 'Demo.icon', target: 'Front/Star', props: { fill: '#FFD60A' }, appearance: 'dark' }, note: 'A dark-mode color for one layer' },
    ],
    async run(ws, { path, target, props, appearance, platform, dry_run }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const data = await ws.edit(
        full,
        (doc) => {
          const ref = resolvePath(doc, target);
          const variant = appearance || platform ? { ...(appearance ? { appearance } : {}), ...(platform ? { idiom: platform } : {}) } : undefined;
          for (const [k, v] of Object.entries(props)) setProp(doc, ref, k, v, variant);
          return { target: targetLabel(doc, ref), now: describeProps(nodeOf(doc, ref).props) };
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_move',
    cli: 'move',
    positional: ['path'],
    title: 'Reorder',
    summary: 'Reorders groups and layers, or moves a layer to another group',
    description: 'Moves a group or layer to a new index (0 = frontmost). Layers can move to another group with to_group.',
    role: 'edit',
    capabilities: ['groups', 'layers', 'order'],
    input: { path: pathArg, target: z.string(), index: z.number().int().min(0), to_group: z.string().optional(), dry_run: dryRunArg },
    output: loose({ groups: groupsOutline }),
    mutates_input: true,
    idempotency_hint: 'idempotent',
    supports_dry_run: true,
    verification: ['`groups` lists the new order (front to back)'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon', target: 'Back', index: 1 }, note: 'Keep the Back group behind Front' }],
    async run(ws, { path, target, index, to_group, dry_run }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const data = await ws.edit(
        full,
        (doc) => {
          const ref = resolvePath(doc, target);
          let gid: string | undefined;
          if (to_group) {
            const g = resolvePath(doc, to_group);
            if (g.kind !== 'group') throw new Error('to_group must be a group');
            gid = g.id;
          }
          moveNode(doc, ref, index, gid);
          return { groups: outline(doc) };
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_align',
    cli: 'align',
    positional: ['path'],
    title: 'Align or distribute',
    summary: 'Aligns or distributes groups or layers (to each other or to the canvas)',
    description:
      'Aligns groups or layers by their bounding boxes (left, hcenter, right, top, vcenter, bottom), or spaces 3+ items evenly ' +
      '(distribute-horizontal, distribute-vertical). With one target, or basis "canvas", items align to the 1024 pt canvas. Only positions change.',
    role: 'edit',
    capabilities: ['layout', 'align', 'distribute', 'platform-variants'],
    input: {
      path: pathArg,
      targets: z.array(z.string()).min(1).describe('"<Group>" or "<Group>/<Layer>" (names or #index); all of the same kind'),
      how: z.enum(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom', 'distribute-horizontal', 'distribute-vertical']),
      basis: z.enum(['selection', 'canvas']).optional().describe('Default: selection (canvas when there is one target)'),
      platform: platformEnum.optional().describe('Write the positions as a platform variant'),
      dry_run: dryRunArg,
    },
    output: loose({ moved: z.number(), positions: z.array(z.looseObject({ target: z.string() })) }),
    mutates_input: true,
    idempotency_hint: 'idempotent',
    supports_dry_run: true,
    verification: ['`positions` gives each bounding box in canvas points', 'icon_render to look at the result'],
    requires_visual_verification: true,
    examples: [{ args: { path: 'Demo.icon', targets: ['Front/Star'], how: 'vcenter' }, note: 'Center one layer vertically on the canvas' }],
    async run(ws, { path, targets, how, basis, platform, dry_run }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const data = await ws.edit(
        full,
        (doc) => {
          const refs = targets.map((t) => resolvePath(doc, t));
          if (refs.some((r) => r.kind === 'document')) throw new Error('targets must be groups or layers');
          if (new Set(refs.map((r) => r.kind)).size > 1) throw new Error('targets must all be groups or all be layers');
          const ctx = { appearance: 'default' as const, idiom: platform === 'square' || !platform ? ('iOS' as const) : platform };
          const variant = platform ? { idiom: platform } : undefined;
          const moved = how.startsWith('distribute-')
            ? distributeNodes(doc, refs, how === 'distribute-horizontal' ? 'horizontal' : 'vertical', ctx, { variant })
            : alignNodes(doc, refs, how as AlignHow, ctx, { ...(basis ? { basis } : {}), variant });
          return { moved, positions: refs.map((r, i) => ({ target: targets[i]!, box: boxOf(doc, r, ctx) })) };
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_remove',
    cli: 'remove',
    positional: ['path'],
    title: 'Remove group or layer',
    summary: 'Deletes a group or layer (unused assets go too)',
    description: 'Removes a group or a layer. Unused assets are deleted from Assets/.',
    role: 'edit',
    capabilities: ['groups', 'layers'],
    input: { path: pathArg, target: z.string(), dry_run: dryRunArg },
    output: loose({ removed: z.string(), groups: groupsOutline }),
    mutates_input: true,
    idempotency_hint: 'not-idempotent',
    destructive: true,
    supports_dry_run: true,
    verification: ['`groups` no longer lists the target'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon', target: 'Back/Dot', dry_run: true }, note: 'Preview a removal without writing' }],
    async run(ws, { path, target, dry_run }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const data = await ws.edit(
        full,
        (doc) => {
          const ref = resolvePath(doc, target);
          const label = targetLabel(doc, ref);
          removeNode(doc, ref);
          return { removed: label, groups: outline(doc) };
        },
        { dryRun: !!dry_run },
      );
      return { data };
    },
  }),

  tool({
    id: 'icon_validate',
    cli: 'validate',
    positional: ['path'],
    title: 'Validate',
    summary: 'Runs the icon checks (schema and Apple HIG)',
    description: 'Checks the icon against the schema and Apple HIG recommendations (square unmasked layers, opaque background, no text, variants, …).',
    role: 'check',
    capabilities: ['validate', 'hig'],
    input: { path: pathArg },
    output: loose({
      summary: z.looseObject({ errors: z.number(), warnings: z.number(), infos: z.number() }),
      issues: z.array(z.looseObject({ id: z.string(), severity: z.enum(['error', 'warning', 'info']), message: z.string() })),
    }),
    mutates_input: false,
    idempotency_hint: 'idempotent',
    supports_dry_run: false,
    verification: ['No issue with severity "error"'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon' }, note: 'Run the V-01…V-10 checks' }],
    async run(ws, { path }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const issues = validate(await ws.read(full)).map(({ ref: _ref, ...i }) => i);
      return { data: { summary: summarizeIssues(issues), issues } };
    },
  }),

  tool({
    id: 'icon_render',
    cli: 'render',
    positional: ['path'],
    title: 'Render preview',
    summary: 'Returns a PNG of one appearance as an image the model can see',
    description: 'Renders an approximate preview PNG of one appearance and returns it as an image. Optionally saves it with `out`.',
    role: 'render',
    capabilities: ['preview', 'appearances', 'platforms'],
    input: {
      path: pathArg,
      appearance: appearanceEnum.optional().describe('Default: "default". Mono in Icon Composer = clear-light / clear-dark / tinted-light / tinted-dark'),
      platform: z.enum(['iOS', 'macOS', 'watchOS']).optional().describe('Default: iOS. watchOS renders a circle'),
      size: z.number().int().min(16).max(2048).optional().describe('Pixels, default 512'),
      mask: maskEnum.optional(),
      tint: z.string().optional().describe('Tint color for tinted appearances, "#RRGGBB"'),
      light_angle: z.number().min(-180).max(180).optional().describe('Light direction in degrees, 0 = top (default), -45 = top-left'),
      out: z.string().optional().describe('Save the PNG to this path'),
    },
    output: loose({ appearance: z.string(), saved: z.string().optional() }),
    mutates_input: false,
    idempotency_hint: 'idempotent',
    supports_dry_run: false,
    verification: ['Look at the returned image'],
    requires_visual_verification: true,
    examples: [{ args: { path: 'Demo.icon', appearance: 'dark', size: 128, out: 'Demo-dark.png' }, note: 'Dark preview saved as a file' }],
    async run(ws, { path, appearance, platform, size, mask, tint, light_angle, out }) {
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
      return { data: { appearance: appearance ?? 'default', ...(saved ? { saved } : {}) }, image: png };
    },
  }),

  tool({
    id: 'icon_render_sheet',
    cli: 'render-sheet',
    positional: ['path'],
    title: 'Render all appearances',
    summary: 'Returns all six appearances side by side as one PNG',
    description: 'Renders the six appearances (Default, Clear light, Tinted light / Dark, Clear dark, Tinted dark) side by side and returns the PNG.',
    role: 'render',
    capabilities: ['preview', 'appearances'],
    input: {
      path: pathArg,
      cell: z.number().int().min(96).max(600).optional().describe('Cell size in pixels, default 240'),
      tint: z.string().optional(),
      out: z.string().optional(),
    },
    output: loose({ appearances: z.array(z.string()), saved: z.string().optional() }),
    mutates_input: false,
    idempotency_hint: 'idempotent',
    supports_dry_run: false,
    verification: ['Look at the returned image: every appearance should stay legible'],
    requires_visual_verification: true,
    examples: [{ args: { path: 'Demo.icon', cell: 120 }, note: 'Compare all six appearances' }],
    async run(ws, { path, cell, tint, out }) {
      const full = await ws.iconPath(path, { mustExist: true });
      const png = await renderSheetPng(await ws.read(full), { cell: cell ?? 240, ...(tint ? { tint } : {}) });
      const saved = out ? await saveFile(ws, out, png) : undefined;
      return { data: { appearances: [...APPEARANCES], ...(saved ? { saved } : {}) }, image: png };
    },
  }),

  tool({
    id: 'icon_export',
    cli: 'export',
    positional: ['path'],
    title: 'Export',
    summary: 'Writes `.icon`, `.icns`, `AppIcon.appiconset` and PNG sets',
    description:
      'Exports the icon. Formats: "icon" (copy of the .icon bundle for Xcode 26+ / Icon Composer), "icns" (macOS), ' +
      '"appiconset" (Xcode asset catalog with Dark and Tinted variants), "png" (PNG set per appearance and size). ' +
      'Raster formats use fresnel’s approximate renderer. Assets.car requires Apple’s actool on macOS and is not produced here.',
    role: 'export',
    capabilities: ['export', 'icns', 'appiconset', 'png'],
    input: {
      path: pathArg,
      out_dir: z.string(),
      formats: z.array(z.enum(['icon', 'icns', 'appiconset', 'png'])).min(1),
      sizes: z.array(z.number().int().min(16).max(2048)).optional().describe('PNG sizes, default [1024, 512, 256, 128, 64, 32, 16]'),
      appearances: z.array(appearanceEnum).optional().describe('PNG appearances, default all six'),
    },
    output: loose({ out_dir: z.string(), files: z.number(), written: z.array(z.string()) }),
    mutates_input: false,
    idempotency_hint: 'idempotent',
    supports_dry_run: false,
    verification: ['`written` lists every file', 'Open the .icon in Icon Composer / Xcode 26 on a Mac for the final check'],
    requires_visual_verification: false,
    examples: [{ args: { path: 'Demo.icon', out_dir: 'build', formats: ['icon', 'icns', 'appiconset'] }, note: 'Everything Xcode needs' }],
    async run(ws, { path, out_dir, formats, sizes, appearances }) {
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
          ...(await writeFiles(join(outDir, `${name}-png`), await buildPngSet(raster, appearances ?? [...APPEARANCES], sizes ?? [1024, 512, 256, 128, 64, 32, 16]))),
        );
      return { data: { out_dir: outDir, files: written.length, written } };
    },
  }),
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);
export const toolByCli = (name: string) => TOOLS.find((t) => t.cli === name);

/** Parses args with the tool's zod schema (same errors for MCP and CLI) and runs it. */
export async function runTool(ws: Workspace, t: ToolDef, args: unknown): Promise<ToolResult> {
  const parsed = z.object(t.input).strict().safeParse(args ?? {});
  if (!parsed.success) throw new Error(`Invalid arguments for ${t.id}: ${z.prettifyError(parsed.error)}`);
  return t.run(ws, parsed.data);
}
