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
import { breakingChanges, buildContract, buildSurface, PROMPTS, RESOURCES } from '../src/contract';
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
    const now = structuredClone(frozen);
    expect(breakingChanges(frozen, now)).toEqual([]);
    delete now.tools.icon_set!.args.appearance;
    now.tools.icon_move!.args.to_group!.required = true;
    now.tools.icon_render!.args.mask!.kind.values = ['squircle'];
    now.tools.icon_create!.args.extra = { kind: { type: 'string' }, required: true };
    delete now.tools.icon_remove;
    const breaks = breakingChanges(frozen, now).join('\n');
    expect(breaks).toContain('icon_set.appearance: argument removed');
    expect(breaks).toContain('icon_move.to_group: optional → required');
    expect(breaks).toContain('icon_render.mask: enum value "circle" removed');
    expect(breaks).toContain('icon_create.extra: new required argument');
    expect(breaks).toContain('icon_remove: tool removed');
    // additions are compatible
    const added = structuredClone(frozen);
    added.tools.icon_set!.args.note = { kind: { type: 'string' }, required: false };
    expect(breakingChanges(frozen, added)).toEqual([]);
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
      if (!t.mutates_input) expect(t.destructive, t.id).toBeFalsy();
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
      expect(t.annotations?.readOnlyHint, t.name).toBe(!spec.mutates_input);
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
    expect(parseToolArgv(align, ['A.icon', '--targets', 'G/a,G/b', '--how', 'left', '--dry-run'])).toEqual({ path: 'A.icon', targets: ['G/a', 'G/b'], how: 'left', dry_run: true });
    const exp = toolById('icon_export')!;
    expect(parseToolArgv(exp, ['A.icon', '--out-dir=d', '--formats', 'png', '--sizes', '32,16'])).toEqual({ path: 'A.icon', out_dir: 'd', formats: ['png'], sizes: [32, 16] });
    expect(parseToolArgv(toolById('icon_create')!, ['A.icon', '--no-watch'])).toEqual({ path: 'A.icon', watch: false });
    expect(() => parseToolArgv(exp, ['A.icon', '--sizes', 'big'])).toThrow(/expects a number/);
    expect(() => parseToolArgv(exp, ['A.icon', 'B.icon'])).toThrow(/Unexpected argument/);
  });
});
