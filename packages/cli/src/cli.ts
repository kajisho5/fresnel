#!/usr/bin/env node
/**
 * fresnel CLI
 *
 *   fresnel build <spec.json> -o <Name.icon>
 *   fresnel inspect <Name.icon>
 *   fresnel validate <Name.icon> [--json] [--strict]
 *   fresnel render <Name.icon> [-a appearance] [-s size] [--sheet] [-o out.png]
 *   fresnel export <Name.icon> -o <dir> [--formats icon,icns,appiconset,png] [--sizes 1024,512] [--appearances default,dark]
 *   fresnel mcp [--root <dir>]...
 *   fresnel contract [--json]                      SPEC contract (docs/design/spec.md)
 *   fresnel call <tool_id> [args]                  run any MCP tool
 *   fresnel <tool> [args]                          create, add-group, add-layer, set, move, align, remove, render-sheet
 *
 * Everything except the legacy commands is generated from the SPEC registry (packages/mcp/src/spec.ts).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
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
  makeAsset,
  setProp,
  validate,
  writeBundle,
  type Appearance,
  type AppearanceKey,
} from '@fresnel/core';
import { loadIcon, saveIcon, writeFiles } from '@fresnel/core/node';
import { nodeRasterizer, renderPng, renderSheetPng } from '@fresnel/render/node';
import { cliCommand, parseToolArgv, toolHelp } from '../../mcp/src/cliargs';
import { buildContract } from '../../mcp/src/contract';
import { CONTRACT_VERSION, runTool, toolByCli, toolById, TOOLS, type ToolDef } from '../../mcp/src/spec';
import { createServer, inspect, VERSION } from '../../mcp/src/tools';
import { Workspace } from '../../mcp/src/workspace';

const pad = (s: string, n: number) => (s.length >= n ? `${s}  ` : s.padEnd(n));

const HELP = `fresnel ${VERSION} — Liquid Glass app icon tools (contract ${CONTRACT_VERSION})

Usage
  fresnel build <spec.json> -o <Name.icon>      Build an .icon bundle from a JSON spec
  fresnel inspect <Name.icon>                    Print groups, layers and attributes
  fresnel validate <Name.icon> [--json] [--strict]
                                                 Check against the schema and Apple HIG (exit 1 on errors; --strict: also warnings)
  fresnel render <Name.icon> [-a <appearance>] [-s <px>] [--sheet] [-o out.png]
                                                 Render an approximate preview PNG
  fresnel export <Name.icon> -o <dir> [--formats icon,icns,appiconset,png]
                 [--sizes 1024,512,...] [--appearances default,dark,...]
                 [--tint #RRGGBB] [--force]
  fresnel mcp [--root <dir>]...                  Start the MCP server on stdio

Render options: --mask squircle|circle|none, --tint #RRGGBB (tinted appearances)

Tools (same arguments as the MCP server; JSON on stdout; "fresnel <command> --help" for details)
${TOOLS.map((t) => `  ${pad(`fresnel ${cliCommand(t)}`, 31)}${t.summary.replace(/`/g, '')}`).join('\n')}

  fresnel contract [--json]                      Print the SPEC contract (every tool, its schemas, roles and examples)
  Options for tools: --args '<json>' (all arguments at once), --root <dir> (limit file access)

Appearances: ${APPEARANCES.join(', ')}
Docs: https://github.com/kajisho5/fresnel
`;

/** Runs one registry tool from argv and prints its JSON result. */
async function callTool(t: ToolDef, argv: string[]) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(toolHelp(t));
    return;
  }
  // --root / -r limits file access like the MCP server; without it the CLI may use any path
  const roots: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--root' || a === '-r') {
      const v = argv[++i];
      if (!v) throw new Error('--root needs a directory');
      roots.push(v);
    } else if (a.startsWith('--root=')) roots.push(a.slice(7));
    else rest.push(a);
  }
  const ws = new Workspace(roots, { unrestricted: roots.length === 0 });
  const { data, image } = await runTool(ws, t, parseToolArgv(t, rest));
  if (image && !data.saved) process.stderr.write('fresnel: the PNG was not saved; pass --out <file.png> to keep it\n');
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

interface SpecLayer {
  file?: string;
  svg?: string;
  name?: string;
  props?: Record<string, unknown>;
  dark?: Record<string, unknown>;
  tinted?: Record<string, unknown>;
}
interface SpecGroup {
  name: string;
  props?: Record<string, unknown>;
  dark?: Record<string, unknown>;
  tinted?: Record<string, unknown>;
  /** front to back */
  layers: SpecLayer[];
}
interface Spec {
  background?: string;
  darkBackground?: string;
  tintedBackground?: string;
  watch?: boolean;
  /** front to back */
  groups: SpecGroup[];
}

async function build(specPath: string, out: string) {
  const spec = JSON.parse(await readFile(specPath, 'utf8')) as Spec;
  const base = dirname(resolve(specPath));
  const doc = createDocument({
    ...(spec.background ? { background: spec.background } : {}),
    platforms: spec.watch === false ? { squares: 'shared' } : { circles: ['watchOS'], squares: 'shared' },
  });
  const docRef = { kind: 'document' as const };
  if (spec.darkBackground) setProp(doc, docRef, 'fill', spec.darkBackground, 'dark');
  if (spec.tintedBackground) setProp(doc, docRef, 'fill', spec.tintedBackground, 'tinted');
  const apply = (ref: Parameters<typeof setProp>[1], o: SpecGroup | SpecLayer) => {
    for (const [k, v] of Object.entries(o.props ?? {})) setProp(doc, ref, k, v);
    for (const a of ['dark', 'tinted'] as AppearanceKey[]) for (const [k, v] of Object.entries((o as SpecLayer)[a as 'dark'] ?? {})) setProp(doc, ref, k, v, a);
  };
  // groups are listed front to back; add back to front so each new one lands in front
  for (const g of [...spec.groups].reverse()) {
    const grp = addGroup(doc, { name: g.name });
    apply({ kind: 'group', id: grp.id }, g);
    for (const l of [...g.layers].reverse()) {
      let bytes: Uint8Array;
      let fname: string;
      if (l.svg) {
        bytes = new TextEncoder().encode(l.svg);
        fname = `${(l.name ?? 'layer').replace(/[^\w.-]+/g, '-')}.svg`;
      } else if (l.file) {
        bytes = new Uint8Array(await readFile(resolve(base, l.file)));
        fname = basename(l.file);
      } else throw new Error(`Layer in group "${g.name}" needs "file" or "svg"`);
      const layer = addLayer(doc, grp.id, makeAsset(fname, bytes), l.name ? { name: l.name } : {});
      apply({ kind: 'layer', id: layer.id }, l);
    }
  }
  const target = out.endsWith('.icon') ? out : `${out}.icon`;
  await saveIcon(resolve(target), doc);
  console.log(`Built ${target}`);
  report(validate(doc), false);
}

function report(issues: ReturnType<typeof validate>, json: boolean) {
  if (json) {
    console.log(JSON.stringify(issues.map(({ ref: _r, ...i }) => i), null, 2));
    return;
  }
  if (!issues.length) {
    console.log('✓ No issues');
    return;
  }
  const mark = { error: '✗', warning: '⚠', info: 'ℹ' } as const;
  for (const i of issues) console.log(`${mark[i.severity]} ${i.id} [${i.target}] ${i.message}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === '-v' || cmd === '--version') {
    console.log(VERSION);
    return;
  }
  if (cmd === 'contract') {
    // the contract is JSON either way; --json is accepted for parity with ffmpeg-skill
    if (rest.some((a) => a !== '--json')) throw new Error('Usage: fresnel contract [--json]');
    process.stdout.write(`${JSON.stringify(buildContract(), null, 2)}\n`);
    return;
  }
  if (cmd === 'call') {
    const [id, ...args] = rest;
    if (!id || id === '--help' || id === '-h') {
      process.stdout.write(`Usage: fresnel call <tool_id> [args]\nTools: ${TOOLS.map((t) => t.id).join(', ')}\n`);
      return;
    }
    const t = toolById(id) ?? toolById(`icon_${id.replace(/-/g, '_')}`);
    if (!t) throw new Error(`Unknown tool "${id}". Tools: ${TOOLS.map((x) => x.id).join(', ')}`);
    await callTool(t, args);
    return;
  }
  const short = toolByCli(cmd);
  if (short && cliCommand(short) === short.cli) {
    await callTool(short, rest);
    return;
  }
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      appearance: { type: 'string', short: 'a' },
      size: { type: 'string', short: 's' },
      sheet: { type: 'boolean' },
      json: { type: 'boolean' },
      strict: { type: 'boolean' },
      formats: { type: 'string' },
      sizes: { type: 'string' },
      appearances: { type: 'string' },
      tint: { type: 'string' },
      mask: { type: 'string' },
      root: { type: 'string', short: 'r', multiple: true },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const input = positionals[0];
  const need = () => {
    if (!input) throw new Error(`Missing input. Run "fresnel --help".`);
    return input;
  };
  const appearances = (s?: string): Appearance[] => {
    const list = (s ?? APPEARANCES.join(',')).split(',').map((x) => x.trim()) as Appearance[];
    for (const a of list) if (!APPEARANCES.includes(a)) throw new Error(`Unknown appearance "${a}"`);
    return list;
  };

  switch (cmd) {
    case 'build':
      if (!values.out) throw new Error('build needs -o <Name.icon>');
      await build(need(), values.out);
      return;
    case 'inspect':
      console.log(JSON.stringify(inspect(await loadIcon(need())), null, 2));
      return;
    case 'validate': {
      const issues = validate(await loadIcon(need()));
      report(issues, !!values.json);
      const bad = issues.some((i) => i.severity === 'error' || (values.strict && i.severity === 'warning'));
      process.exitCode = bad ? 1 : 0;
      return;
    }
    case 'render': {
      const doc = await loadIcon(need());
      const out = values.out ?? `${basename(need()).replace(/\.icon(\.zip)?$/, '')}${values.sheet ? '-sheet' : ''}.png`;
      const tint = values.tint ? { tint: values.tint } : {};
      const png = values.sheet
        ? await renderSheetPng(doc, { cell: Number(values.size ?? 320), ...tint })
        : await renderPng(doc, {
            appearance: appearances(values.appearance ?? 'default')[0]!,
            size: Number(values.size ?? 1024),
            ...(values.mask ? { mask: values.mask as 'squircle' } : {}),
            ...tint,
          });
      await mkdir(dirname(resolve(out)), { recursive: true });
      await writeFile(out, png);
      console.log(`Wrote ${out}`);
      return;
    }
    case 'export': {
      if (!values.out) throw new Error('export needs -o <dir>');
      const doc = await loadIcon(need());
      const name = basename(need()).replace(/\.icon(\.zip)?$/, '');
      const formats = (values.formats ?? 'icon,icns,appiconset,png').split(',').map((s) => s.trim());
      const raster = nodeRasterizer(doc, values.tint ? { tint: values.tint } : {});
      const outDir = resolve(values.out);
      const missing = unrenderableLayers(doc);
      if (missing.length && formats.some((f) => f !== 'icon') && !values.force)
        throw new Error(`These visible layers can't be rendered and would be missing from the images: ${missing.join(', ')}. Fix them, or pass --force.`);
      let n = 0;
      for (const f of formats) {
        if (f === 'icon') {
          // same writer as Save: unused assets from an earlier export are removed, links are never followed
          await saveIcon(join(outDir, `${name}.icon`), doc);
          n += 1 + Object.keys(doc.assets).length;
        }
        else if (f === 'icns') {
          await mkdir(outDir, { recursive: true });
          await writeFile(join(outDir, `${name}.icns`), await buildIcns(raster));
          n++;
        } else if (f === 'appiconset') n += (await writeFiles(join(outDir, 'AppIcon.appiconset'), await buildAppIconSet(raster, { watch: targetsWatch(doc) }))).length;
        else if (f === 'png') {
          const sizes = (values.sizes ?? '1024,512,256,128,64,32,16').split(',').map(Number);
          n += (await writeFiles(join(outDir, `${name}-png`), await buildPngSet(raster, appearances(values.appearances), sizes))).length;
        } else throw new Error(`Unknown format "${f}" (icon, icns, appiconset, png)`);
      }
      console.log(`Exported ${n} files to ${outDir}`);
      return;
    }
    case 'mcp': {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
      const ws = new Workspace(values.root ?? []);
      await createServer(ws).connect(new StdioServerTransport());
      process.stderr.write(`fresnel MCP server ${VERSION} ready (roots: ${ws.roots.join(', ')})\n`);
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run "fresnel --help".`);
  }
}

main().catch((e) => {
  process.stderr.write(`fresnel: ${(e as Error).message}\n`);
  process.exit(1);
});
