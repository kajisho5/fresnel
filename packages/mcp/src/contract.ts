/**
 * Everything generated from the SPEC registry: the contract JSON, the frozen public surface
 * and the README sections. See docs/design/spec.md.
 */
import { z } from 'zod';
import { DOCUMENT_ATTRS, GROUP_ATTRS, LAYER_ATTRS, type AttrDef } from '@fresnel/core';
import { cliCommand, exampleCommand, LEGACY_COMMANDS, usage } from './cliargs';
import { CONTRACT_VERSION, TOOLS, type ToolDef } from './spec';
import { VERSION } from './version';

export const RESOURCES = [
  { uri: 'fresnel://guide/icon-design', title: 'Liquid Glass icon design guide' },
  { uri: 'fresnel://schema/icon-json', title: 'icon.json attribute reference' },
  { uri: 'fresnel://contract', title: 'SPEC contract (this document)' },
] as const;
export const PROMPTS = [{ name: 'design_app_icon', title: 'Design an app icon' }] as const;

const LEGACY_HELP: Record<(typeof LEGACY_COMMANDS)[number], string> = {
  build: 'fresnel build <spec.json> -o <Name.icon> — build a bundle from a JSON spec (fixtures/sample.spec.json)',
  inspect: 'fresnel inspect <Name.icon> — same output as icon_inspect',
  validate: 'fresnel validate <Name.icon> [--json] [--strict] — exit 1 on errors (--strict: also warnings)',
  render: 'fresnel render <Name.icon> [-a <appearance>] [-s <px>] [--mask …] [--tint …] [--sheet] [-o out.png] — writes a PNG file',
  export: 'fresnel export <Name.icon> -o <dir> [--formats …] [--sizes …] [--appearances …] [--tint …] [--force]',
  mcp: 'fresnel mcp [--root <dir>]… — start the MCP server on stdio',
};

const jsonSchema = (s: z.ZodType, io: 'input' | 'output') => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(s, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

function attrTable(attrs: Record<string, AttrDef>) {
  return Object.fromEntries(
    Object.entries(attrs).map(([k, a]) => [k, { schema: jsonSchema(a.schema, 'input'), default: a.default ?? null, description: a.description }]),
  );
}

export function toolSpec(t: ToolDef) {
  return {
    id: t.id,
    title: t.title,
    summary: t.summary,
    description: t.description,
    role: t.role,
    capabilities: t.capabilities,
    input_schema: jsonSchema(z.object(t.input).strict(), 'input'),
    output_schema: jsonSchema(t.output, 'output'),
    mutates_input: t.mutates_input,
    writes_files: t.writes_files,
    idempotency_hint: t.idempotency_hint,
    destructive: !!t.destructive,
    supports_dry_run: t.supports_dry_run,
    supports_json: true,
    returns_image: t.role === 'render',
    verification: t.verification,
    requires_visual_verification: t.requires_visual_verification,
    cli: usage(t),
    examples: t.examples.map((e) => ({ ...e, cli: exampleCommand(t, e.args) })),
  };
}

export function buildContract() {
  const capability_map: Record<string, string[]> = {};
  for (const t of TOOLS) for (const c of t.capabilities) (capability_map[c] ??= []).push(t.id);
  return {
    contract_version: CONTRACT_VERSION,
    name: 'fresnel',
    version: VERSION,
    description: 'Create, edit, preview and export Apple Liquid Glass app icons (.icon bundles, the Icon Composer format).',
    conventions: {
      targets: '"document", "<Group>" or "<Group>/<Layer>" (names or #index; index 0 is frontmost)',
      order: 'groups and layers are listed front to back',
      errors: 'MCP: isError with a readable message. CLI: message on stderr, exit code 1',
      cli: 'argument names are the input names with "_" → "-"; arrays are comma separated; objects are JSON; --args \'<json>\' passes everything at once',
      previews: "approximations of Apple's renderer; the final check is Icon Composer / Xcode 26 on a Mac",
    },
    stability: {
      compatible: ['new tools', 'new optional arguments', 'new output keys', 'new enum values', 'wording of descriptions, examples and verification'],
      breaking: ['removing or renaming a tool or argument', 'optional → required', 'changing an argument type', 'removing an enum value', 'removing an output key'],
      rule: 'Breaking changes bump contract_version to the next major. The frozen surface (packages/mcp/spec/surface.json) makes CI fail otherwise.',
    },
    tools: TOOLS.map(toolSpec),
    capability_map: Object.fromEntries(Object.entries(capability_map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    resources: RESOURCES,
    prompts: PROMPTS,
    icon_json: { document: attrTable(DOCUMENT_ATTRS), group: attrTable(GROUP_ATTRS), layer: attrTable(LAYER_ATTRS) },
    cli_legacy_commands: LEGACY_HELP,
  };
}

// ------------------------------------------------------------ frozen surface

type Json = Record<string, unknown>;
export interface Surface {
  contract_version: string;
  tools: Record<string, { cli: string; positional: string[]; args: Record<string, { required: boolean; schema: Json }>; output_keys: string[] }>;
}

/** JSON Schema without prose (descriptions may change freely). */
function bare(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(bare);
  if (v && typeof v === 'object') {
    const o: Json = {};
    for (const [k, x] of Object.entries(v as Json)) if (k !== 'description' && k !== '$schema') o[k] = bare(x);
    return o;
  }
  return v;
}

export function buildSurface(): Surface {
  return {
    contract_version: CONTRACT_VERSION,
    tools: Object.fromEntries(
      TOOLS.map((t) => {
        const input = jsonSchema(z.object(t.input).strict(), 'input') as { properties: Record<string, Json>; required?: string[] };
        const output = jsonSchema(t.output, 'output') as { properties?: Record<string, unknown>; required?: string[] };
        return [
          t.id,
          {
            cli: t.cli,
            positional: [...(t.positional ?? [])],
            args: Object.fromEntries(Object.entries(input.properties).map(([k, v]) => [k, { required: (input.required ?? []).includes(k), schema: bare(v) as Json }])),
            // keys every result is promised to have
            output_keys: [...(output.required ?? [])].sort(),
          },
        ];
      }),
    ),
  };
}

const types = (s: Json): string[] => (Array.isArray(s.type) ? (s.type as string[]) : s.type ? [s.type as string] : []);

/** Ways `now` accepts less than `was` (a caller that worked before would now fail). */
function schemaBreaks(path: string, was: Json, now: Json, out: string[]) {
  // anyOf / unknown shapes: compare as a whole
  if (was.anyOf || now.anyOf || was.oneOf || now.oneOf) {
    if (JSON.stringify(was) !== JSON.stringify(now)) out.push(`${path}: schema changed`);
    return;
  }
  const wt = types(was);
  const nt = types(now);
  for (const t of wt) {
    const ok = nt.length === 0 || nt.includes(t) || (t === 'integer' && nt.includes('number'));
    if (!ok) out.push(`${path}: type ${t} → ${nt.join('|') || 'any'}`);
  }
  if (Array.isArray(was.enum) && Array.isArray(now.enum))
    for (const v of was.enum as unknown[]) if (!(now.enum as unknown[]).includes(v)) out.push(`${path}: enum value ${JSON.stringify(v)} removed`);
  if (!was.enum && Array.isArray(now.enum)) out.push(`${path}: now limited to ${JSON.stringify(now.enum)}`);
  for (const k of ['minimum', 'exclusiveMinimum', 'minItems', 'minLength'] as const)
    if (typeof now[k] === 'number' && (typeof was[k] !== 'number' || (now[k] as number) > (was[k] as number))) out.push(`${path}: ${k} ${was[k] ?? '—'} → ${now[k]}`);
  for (const k of ['maximum', 'exclusiveMaximum', 'maxItems', 'maxLength'] as const)
    if (typeof now[k] === 'number' && (typeof was[k] !== 'number' || (now[k] as number) < (was[k] as number))) out.push(`${path}: ${k} ${was[k] ?? '—'} → ${now[k]}`);
  if (now.pattern !== undefined && now.pattern !== was.pattern) out.push(`${path}: pattern changed`);
  if (was.items && now.items) schemaBreaks(`${path}[]`, was.items as Json, now.items as Json, out);
  if (was.properties && now.properties) {
    const wp = was.properties as Record<string, Json>;
    const np = now.properties as Record<string, Json>;
    for (const [k, v] of Object.entries(wp)) if (np[k]) schemaBreaks(`${path}.${k}`, v, np[k]!, out);
    const wr = new Set((was.required as string[]) ?? []);
    for (const r of (now.required as string[]) ?? []) if (!wr.has(r)) out.push(`${path}.${r}: now required`);
  }
}

/** Changes from `frozen` to `now` that break callers. Additions are fine. */
export function breakingChanges(frozen: Surface, now: Surface): string[] {
  const out: string[] = [];
  for (const [id, t] of Object.entries(frozen.tools)) {
    const n = now.tools[id];
    if (!n) {
      out.push(`${id}: tool removed or renamed`);
      continue;
    }
    if (n.cli !== t.cli) out.push(`${id}: CLI name ${t.cli} → ${n.cli}`);
    t.positional.forEach((p, i) => {
      if (n.positional[i] !== p) out.push(`${id}: CLI positional argument ${i + 1} ${p} → ${n.positional[i] ?? '(none)'}`);
    });
    for (const [arg, a] of Object.entries(t.args)) {
      const b = n.args[arg];
      if (!b) out.push(`${id}.${arg}: argument removed or renamed`);
      else {
        if (!a.required && b.required) out.push(`${id}.${arg}: optional → required`);
        schemaBreaks(`${id}.${arg}`, a.schema, b.schema, out);
      }
    }
    for (const [arg, b] of Object.entries(n.args)) if (!t.args[arg] && b.required) out.push(`${id}.${arg}: new required argument`);
    for (const k of t.output_keys) if (!n.output_keys.includes(k)) out.push(`${id}: output key "${k}" removed`);
  }
  return out;
}

// ------------------------------------------------------------ README sections

const cell = (s: string) => s.replace(/\|/g, '\\|');

/** Tool table for README.md / packages/mcp/README.md. */
export function readmeToolTable(): string {
  const rows = TOOLS.map((t) => `| \`${t.id}\` | \`fresnel ${cliCommand(t)}\` | ${t.role} | ${cell(t.summary)} |`);
  return [
    `${TOOLS.length} tools, ${RESOURCES.length} resources and ${PROMPTS.length} prompt — generated from the [SPEC contract](https://github.com/kajisho5/fresnel/blob/main/docs/contract.json); every tool also runs from the CLI.`,
    '',
    '| Tool (MCP) | CLI | Role | What it does |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Usage list for packages/cli/README.md. */
export function readmeCliBlock(): string {
  return ['```bash', ...TOOLS.map((t) => usage(t).replace(/^fresnel /, 'npx fresnel-icon ')), 'npx fresnel-icon contract --json', '```'].join('\n');
}

/** Replaces the text between `<!-- spec:<name> -->` and `<!-- /spec:<name> -->`. */
export function replaceSection(doc: string, name: string, body: string): string {
  const open = `<!-- spec:${name} -->`;
  const close = `<!-- /spec:${name} -->`;
  const a = doc.indexOf(open);
  const b = doc.indexOf(close);
  if (a < 0 || b < a) throw new Error(`Missing ${open} … ${close}`);
  return `${doc.slice(0, a + open.length)}\n${body}\n${doc.slice(b)}`;
}
