/**
 * CLI argument handling derived from the SPEC registry (docs/design/spec.md §4.1).
 * Names are the MCP argument names with "_" → "-". Types come from the zod schema.
 */
import type { z } from 'zod';
import type { ToolDef } from './spec';

export type ArgKind =
  | { type: 'string' }
  | { type: 'number'; integer: boolean }
  | { type: 'boolean' }
  | { type: 'enum'; values: string[] }
  | { type: 'array'; of: ArgKind }
  | { type: 'json' };

export interface ArgInfo {
  name: string;
  flag: string;
  kind: ArgKind;
  required: boolean;
  description?: string;
}

/** Legacy commands that keep their v0.1 behaviour; registry tools with the same short name are reached via `fresnel call <id>`. */
export const LEGACY_COMMANDS = ['build', 'inspect', 'validate', 'render', 'export', 'mcp'] as const;
/** Commands of the CLI itself. */
export const CLI_COMMANDS = ['contract', 'call', 'help'] as const;

// zod 4 internals: every schema carries its definition in `_zod.def`
type Def = { type: string; innerType?: z.ZodType; element?: z.ZodType; entries?: Record<string, string>; checks?: { _zod: { def: { check: string; format?: string } } }[] };
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

function unwrap(s: z.ZodType): { schema: z.ZodType; optional: boolean } {
  let optional = false;
  let cur = s;
  for (;;) {
    const d = defOf(cur);
    if (d.type === 'optional' || d.type === 'default' || d.type === 'nullable') {
      optional = optional || d.type !== 'nullable';
      cur = d.innerType!;
    } else return { schema: cur, optional };
  }
}

export function argKind(s: z.ZodType): ArgKind {
  const { schema } = unwrap(s);
  const d = defOf(schema);
  switch (d.type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number', integer: !!d.checks?.some((c) => c._zod.def.format === 'safeint' || c._zod.def.format === 'int32') || !!(schema as unknown as { isInt?: boolean }).isInt };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return { type: 'enum', values: Object.values(d.entries ?? {}) };
    case 'array':
      return { type: 'array', of: argKind(d.element!) };
    default:
      return { type: 'json' };
  }
}

export function argsOf(t: ToolDef): ArgInfo[] {
  return Object.entries(t.input).map(([name, s]) => {
    const schema = s as z.ZodType;
    const description = (schema as unknown as { description?: string }).description;
    return {
      name,
      flag: `--${name.replace(/_/g, '-')}`,
      kind: argKind(schema),
      required: !unwrap(schema).optional,
      ...(description ? { description } : {}),
    };
  });
}

/** The CLI command that runs a tool: its short name, or `call <id>` when the short name is taken by a legacy command. */
export const cliCommand = (t: ToolDef) => ((LEGACY_COMMANDS as readonly string[]).includes(t.cli) ? `call ${t.id}` : t.cli);

const kindHint = (k: ArgKind): string =>
  k.type === 'enum' ? k.values.join('|') : k.type === 'array' ? `${kindHint(k.of)},…` : k.type === 'json' ? "'<json>'" : k.type === 'number' ? '<n>' : k.type === 'boolean' ? '(flag)' : `<${k.type}>`;

/** One-line usage, e.g. `fresnel set <path> --target <string> --props '<json>' [--appearance dark|tinted]`. */
export function usage(t: ToolDef): string {
  const pos = new Set(t.positional ?? []);
  const parts = [`fresnel ${cliCommand(t)}`];
  for (const a of argsOf(t)) {
    if (pos.has(a.name)) parts.push(a.required ? `<${a.name}>` : `[<${a.name}>]`);
  }
  for (const a of argsOf(t)) {
    if (pos.has(a.name)) continue;
    const s = a.kind.type === 'boolean' ? a.flag : `${a.flag} ${kindHint(a.kind)}`;
    parts.push(a.required ? s : `[${s}]`);
  }
  return parts.join(' ');
}

/** Detailed help for `fresnel <cmd> --help`. */
export function toolHelp(t: ToolDef): string {
  const lines = [`${t.title} (${t.id})`, '', t.description, '', `Usage: ${usage(t)}`, '', 'Arguments:'];
  const pos = new Set(t.positional ?? []);
  for (const a of argsOf(t)) {
    const name = pos.has(a.name) ? `<${a.name}>` : a.flag;
    lines.push(`  ${name.padEnd(22)} ${kindHint(a.kind).padEnd(14)} ${a.required ? 'required' : 'optional'}${a.description ? `  ${a.description}` : ''}`);
  }
  lines.push(`  ${'--args'.padEnd(22)} ${"'<json>'".padEnd(14)} all arguments as one JSON object (flags win)`);
  if (t.examples.length) {
    lines.push('', 'Examples:');
    for (const ex of t.examples) lines.push(`  # ${ex.note}`, `  ${exampleCommand(t, ex.args)}`);
  }
  lines.push('', `Output: JSON on stdout. Verify: ${t.verification.join('; ') || '—'}`);
  return `${lines.join('\n')}\n`;
}

const shellQuote = (s: string) => (/^[\w@%+=:,./#-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The CLI form of an example call. */
export function exampleCommand(t: ToolDef, args: Record<string, unknown>): string {
  const pos = t.positional ?? [];
  const parts = [`fresnel ${cliCommand(t)}`];
  for (const p of pos) if (args[p] !== undefined) parts.push(shellQuote(String(args[p])));
  for (const a of argsOf(t)) {
    const v = args[a.name];
    if (v === undefined || pos.includes(a.name)) continue;
    if (a.kind.type === 'boolean') parts.push(v ? a.flag : `--no-${a.flag.slice(2)}`);
    else if (a.kind.type === 'array') parts.push(a.flag, shellQuote((v as unknown[]).join(',')));
    else if (a.kind.type === 'json') parts.push(a.flag, shellQuote(JSON.stringify(v)));
    else parts.push(a.flag, shellQuote(String(v)));
  }
  return parts.join(' ');
}

function convert(k: ArgKind, raw: string, flag: string): unknown {
  switch (k.type) {
    case 'number': {
      const n = Number(raw);
      if (raw.trim() === '' || Number.isNaN(n)) throw new Error(`${flag} expects a number, got "${raw}"`);
      return n;
    }
    case 'array':
      return raw === '' ? [] : raw.split(',').map((x) => convert(k.of, x.trim(), flag));
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`${flag} expects JSON, got ${raw}`);
      }
    default:
      return raw;
  }
}

/**
 * Turns argv into the tool's argument object. Validation itself is left to zod (runTool),
 * so the CLI and MCP report the same errors.
 */
export function parseToolArgv(t: ToolDef, argv: string[]): Record<string, unknown> {
  const infos = argsOf(t);
  const byFlag = new Map(infos.map((a) => [a.flag, a]));
  const out: Record<string, unknown> = {};
  let base: Record<string, unknown> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith('--') || tok === '--') {
      positionals.push(tok);
      continue;
    }
    const eq = tok.indexOf('=');
    const flag = eq > 0 ? tok.slice(0, eq) : tok;
    const inline = eq > 0 ? tok.slice(eq + 1) : undefined;
    if (flag === '--args') {
      const raw = inline ?? argv[++i];
      if (raw === undefined) throw new Error('--args needs a JSON object');
      const v = convert({ type: 'json' }, raw, '--args');
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('--args must be a JSON object');
      base = v as Record<string, unknown>;
      continue;
    }
    const neg = flag.startsWith('--no-') ? byFlag.get(`--${flag.slice(5)}`) : undefined;
    if (neg && neg.kind.type === 'boolean') {
      out[neg.name] = false;
      continue;
    }
    const info = byFlag.get(flag);
    if (!info) throw new Error(`Unknown option ${flag} for ${t.id}. Run "fresnel ${cliCommand(t)} --help".`);
    if (info.kind.type === 'boolean') {
      out[info.name] = inline === undefined ? true : !/^(false|0|no)$/i.test(inline);
      continue;
    }
    const raw = inline ?? argv[++i];
    if (raw === undefined) throw new Error(`${flag} needs a value`);
    out[info.name] = convert(info.kind, raw, flag);
  }
  const pos = t.positional ?? [];
  if (positionals.length > pos.length) throw new Error(`Unexpected argument "${positionals[pos.length]}". Run "fresnel ${cliCommand(t)} --help".`);
  positionals.forEach((v, i) => {
    const info = infos.find((a) => a.name === pos[i])!;
    if (out[info.name] === undefined) out[info.name] = convert(info.kind, v, `<${info.name}>`);
  });
  return { ...base, ...out };
}
