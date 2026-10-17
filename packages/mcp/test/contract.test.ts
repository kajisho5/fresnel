/**
 * SPEC drift tests (docs/design/spec.md §6). Everything the contract promises is checked
 * against the real MCP server and the real CLI, and every example in the registry is run.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { argsOf, cliCommand, parseToolArgv } from '../src/cliargs';
import { breakingChanges, buildContract, buildSurface, PROMPTS, RESOURCES, type Surface } from '../src/contract';
import { CONTRACT_VERSION, TOOLS, toolById } from '../src/spec';

const run = promisify(execFile);
const ROOT = join(__dirname, '../../..');
const SERVER = join(__dirname, '../src/server.ts');
const CLI = join(ROOT, 'packages/cli/src/cli.ts');
const node = (args: string[], cwd = ROOT) => run(process.execPath, ['--import', 'tsx', ...args], { cwd, maxBuffer: 64 * 1024 * 1024 });

type Result = { content: { type: string; text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fresnel-contract-'));
  client = new Client({ name: 'contract-test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', SERVER, '--root', dir], stderr: 'pipe' }));
}, 30_000);

afterAll(async () => {
  await client?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SPEC contract', () => {
  it('generated files are up to date and the frozen surface is not broken (pnpm spec --check)', async () => {
    await expect(node([join(ROOT, 'scripts/spec.ts'), '--check'])).resolves.toBeTruthy();
  }, 60_000);

  it('detects breaking changes against the frozen surface', () => {
    const frozen = buildSurface();
    const mod = (f: (s: Surface) => void) => {
      const now = structuredClone(frozen);
      f(now);
      return breakingChanges(frozen, now).join('\n');
    };
    expect(breakingChanges(frozen, structuredClone(frozen))).toEqual([]);
    expect(mod((s) => delete s.tools.icon_set!.args.appearance)).toContain('icon_set.appearance: argument removed');
    expect(mod((s) => (s.tools.icon_move!.args.to_group!.required = true))).toContain('icon_move.to_group: optional → required');
    expect(mod((s) => ((s.tools.icon_render!.args.mask!.schema as { enum: string[] }).enum = ['squircle']))).toContain('enum value "circle" removed');
    expect(mod((s) => (s.tools.icon_create!.args.extra = { required: true, schema: { type: 'string' } }))).toContain('icon_create.extra: new required argument');
    expect(mod((s) => delete s.tools.icon_remove)).toContain('icon_remove: tool removed');
    expect(mod((s) => (s.tools.icon_render!.args.light_angle!.schema.type = 'integer'))).toContain('icon_render.light_angle: type number → integer');
    expect(mod((s) => (s.tools.icon_render!.args.size!.schema.maximum = 512))).toContain('icon_render.size: maximum 2048 → 512');
    expect(mod((s) => (s.tools.icon_export!.output_keys = ['files']))).toContain('icon_export: output key "written" removed');
    expect(mod((s) => (s.tools.icon_set!.positional = []))).toContain('icon_set: CLI positional argument 1 path');
    // additions and widening are compatible
    expect(mod((s) => (s.tools.icon_set!.args.note = { required: false, schema: { type: 'string' } }))).toBe('');
    expect(mod((s) => delete (s.tools.icon_render!.args.mask!.schema as { enum?: string[] }).enum)).toBe('');
    expect(mod((s) => (s.tools.icon_render!.args.size!.schema.maximum = 4096))).toBe('');
  });

  it('has a consistent registry', () => {
    const c = buildContract();
    expect(c.contract_version).toBe(CONTRACT_VERSION);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length);
    expect(new Set(TOOLS.map((t) => t.cli)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.id).toMatch(/^icon_[a-z_]+$/);
      expect(t.summary.length, t.id).toBeLessThan(110);
      expect(t.examples.length, `${t.id} needs an example`).toBeGreaterThan(0);
      expect(t.supports_dry_run, `${t.id}: dry_run argument`).toBe('dry_run' in t.input);
      if (!t.mutates_input && !t.writes_files) expect(t.destructive, t.id).toBeFalsy();
      if (t.id === 'icon_export' || t.id === 'icon_create') expect(t.destructive, t.id).toBe(true);
      // positional args exist and every example parses
      for (const p of t.positional ?? []) expect(Object.keys(t.input)).toContain(p);
      for (const ex of t.examples) expect(z.object(t.input).strict().safeParse(ex.args).success, `${t.id}: ${ex.note}`).toBe(true);
    }
    for (const [cap, ids] of Object.entries(c.capability_map)) for (const id of ids) expect(toolById(id)!.capabilities).toContain(cap);
    expect(Object.keys(c.icon_json.layer)).toContain('glass');
  });

  it('MCP tools/list, resources and prompts match the contract', async () => {
    const c = buildContract();
    const listed = (await client.listTools()).tools;
    expect(listed.map((t) => t.name)).toEqual(c.tools.map((t) => t.id));
    for (const t of listed) {
      const spec = c.tools.find((x) => x.id === t.name)!;
      const want = spec.input_schema as { properties: Record<string, unknown>; required?: string[] };
      expect(Object.keys(t.inputSchema.properties ?? {}).sort(), t.name).toEqual(Object.keys(want.properties).sort());
      expect([...(t.inputSchema.required ?? [])].sort(), t.name).toEqual([...(want.required ?? [])].sort());
      expect(t.annotations?.readOnlyHint, t.name).toBe(!spec.mutates_input && !spec.writes_files);
      expect((t.inputSchema as { additionalProperties?: unknown }).additionalProperties, t.name).toBe(false);
      expect(t.annotations?.destructiveHint, t.name).toBe(spec.destructive);
      expect(t.outputSchema, t.name).toBeTruthy();
    }
    expect((await client.listResources()).resources.map((r) => r.uri).sort()).toEqual(RESOURCES.map((r) => r.uri).sort());
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual(PROMPTS.map((p) => p.name));
    const res = await client.readResource({ uri: 'fresnel://contract' });
    const served = JSON.parse((res.contents[0] as { text: string }).text);
    expect(served).toEqual(JSON.parse(JSON.stringify(c)));
  }, 30_000);

  it('runs every example in order and each result matches its output schema', async () => {
    for (const t of TOOLS) {
      for (const ex of t.examples) {
        const r = (await client.callTool({ name: t.id, arguments: ex.args })) as Result;
        expect(r.isError, `${t.id} (${ex.note}): ${r.content[0]?.text}`).toBeFalsy();
        const data = r.structuredContent!;
        expect(t.output.safeParse(data).success, `${t.id} output`).toBe(true);
        expect(JSON.parse(r.content.find((x) => x.type === 'text')!.text!)).toEqual(data);
        if (t.role === 'render') expect(r.content.some((x) => x.type === 'image')).toBe(true);
      }
    }
    // dry_run did not write: the removed layer is still there
    const r = (await client.callTool({ name: 'icon_inspect', arguments: { path: 'Demo.icon' } })) as Result;
    expect(JSON.stringify(r.structuredContent)).toContain('Back/Dot');
    await expect(stat(join(dir, 'build', 'AppIcon.appiconset', 'Contents.json'))).resolves.toBeTruthy();
  }, 120_000);

  it('the CLI exposes every tool with the same arguments and results', async () => {
    const { stdout: help } = await node([CLI, '--help']);
    for (const t of TOOLS) expect(help).toContain(`fresnel ${cliCommand(t)}`);
    // same input, same output (paths are absolute in both)
    const icon = join(dir, 'Demo.icon');
    const viaMcp = ((await client.callTool({ name: 'icon_inspect', arguments: { path: 'Demo.icon' } })) as Result).structuredContent;
    const { stdout } = await node([CLI, 'call', 'icon_inspect', icon]);
    expect(JSON.parse(stdout)).toEqual(viaMcp);
    // a short command, flags and --args
    const { stdout: set } = await node([CLI, 'set', icon, '--target', 'Front', '--args', '{"props":{"specular":false}}']);
    expect(JSON.parse(set).now.specular).toBe(false);
    // per-tool help is generated
    const { stdout: th } = await node([CLI, 'align', '--help']);
    for (const a of argsOf(toolById('icon_align')!)) if (a.name !== 'path') expect(th).toContain(a.flag);
    // the contract command prints the same contract
    const { stdout: cj } = await node([CLI, 'contract', '--json']);
    expect(JSON.parse(cj)).toEqual(JSON.parse(JSON.stringify(buildContract())));
    expect(JSON.parse(cj)).toEqual(JSON.parse(await readFile(join(ROOT, 'docs/contract.json'), 'utf8')));
  }, 120_000);

  it('parses CLI arguments by schema type', () => {
    const align = toolById('icon_align')!;
    const args = (t: string, argv: string[]) => parseToolArgv(toolById(t)!, argv).args;
    expect(args('icon_align', ['A.icon', '--targets', 'G/a,G/b', '--how', 'left', '--dry-run'])).toEqual({ path: 'A.icon', targets: ['G/a', 'G/b'], how: 'left', dry_run: true });
    expect(args('icon_export', ['A.icon', '--out-dir=d', '--formats', 'png', '--sizes', '32,16'])).toEqual({ path: 'A.icon', out_dir: 'd', formats: ['png'], sizes: [32, 16] });
    expect(args('icon_create', ['A.icon', '--no-watch'])).toEqual({ path: 'A.icon', watch: false });
    expect(() => args('icon_export', ['A.icon', '--sizes', 'big'])).toThrow(/expects a number/);
    expect(() => args('icon_export', ['A.icon', '--sizes', '0x20'])).toThrow(/expects a number/);
    expect(() => args('icon_export', ['A.icon', 'B.icon'])).toThrow(/Unexpected argument/);
    // repeated array flags append, --args objects merge, -- ends the options
    expect(args('icon_align', ['A.icon', '--targets', 'G/a', '--targets', 'G/b', '--how', 'left'])).toMatchObject({ targets: ['G/a', 'G/b'] });
    expect(args('icon_set', ['A.icon', '--args', '{"target":"G"}', '--args', '{"props":{}}'])).toEqual({ path: 'A.icon', target: 'G', props: {} });
    expect(args('icon_inspect', ['--', '--odd.icon'])).toEqual({ path: '--odd.icon' });
    // booleans are strict; a positional and its flag together are an error
    expect(args('icon_create', ['A.icon', '--dry-run=off'])).toMatchObject({ dry_run: false });
    expect(() => args('icon_create', ['A.icon', '--dry-run=maybe'])).toThrow(/true or false/);
    expect(() => args('icon_inspect', ['A.icon', '--path', 'B.icon'])).toThrow(/given twice/);
    // --help / --root are only options where an option can be, never a flag's value
    expect(args('icon_add_group', ['A.icon', '--name', '--help'])).toMatchObject({ name: '--help' });
    expect(parseToolArgv(toolById('icon_inspect')!, ['A.icon', '--root', 'r', '-h'])).toMatchObject({ roots: ['r'], help: true });
  });
});
