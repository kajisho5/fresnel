import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { decodePng } from '@fresnel/core';

const SERVER = join(__dirname, '../src/server.ts');
const STAR =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path d="M512 212 L594 420 L812 430 L640 566 L700 780 L512 660 L324 780 L384 566 L212 430 L430 420 Z" fill="#ffffff"/></svg>';

let dir: string;
let client: Client;

type ToolResult = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as ToolResult;
const json = (r: ToolResult) => JSON.parse(r.content.find((c) => c.type === 'text')!.text!);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fresnel-mcp-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', SERVER, '--root', dir],
    stderr: 'pipe',
  });
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
}, 30_000);

afterAll(async () => {
  await client?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('fresnel-mcp over stdio', () => {
  it('lists tools, resources and prompts', async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([
      'icon_add_group',
      'icon_add_layer',
      'icon_create',
      'icon_export',
      'icon_inspect',
      'icon_move',
      'icon_remove',
      'icon_render',
      'icon_render_sheet',
      'icon_set',
      'icon_validate',
    ]);
    const res = await client.listResources();
    expect(res.resources.map((r) => r.uri).sort()).toEqual(['fresnel://guide/icon-design', 'fresnel://schema/icon-json']);
    const guide = await client.readResource({ uri: 'fresnel://guide/icon-design' });
    expect((guide.contents[0] as { text: string }).text).toContain('unmasked');
    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((p) => p.name)).toEqual(['design_app_icon']);
  });

  it('creates, edits, renders, validates and exports an icon', async () => {
    let r = await call('icon_create', { path: 'Star', background: 'gradient:#FF9F43,#EE5A24', dark_background: 'gradient:#3B1F10,#140A05' });
    expect(r.isError).toBeFalsy();
    expect(json(r).created).toMatch(/Star\.icon$/);

    r = await call('icon_add_layer', { path: 'Star.icon', group: 'Shape', svg: STAR, name: 'Star', props: { glass: true, opacity: 0.9 } });
    expect(r.isError).toBeFalsy();
    expect(json(r).added).toBe('Shape/Star');

    r = await call('icon_set', { path: 'Star', target: 'Shape', props: { translucency: { enabled: true, value: 0.4 }, 'blur-material': 0.2 } });
    expect(json(r).now.translucency).toEqual({ enabled: true, value: 0.4 });
    r = await call('icon_set', { path: 'Star', target: 'Shape/Star', props: { fill: '#FFE8C2' }, appearance: 'dark' });
    expect(json(r).now.overrides.dark.fill).toEqual({ solid: 'srgb:1.00000,0.90980,0.76078,1.00000' });

    const iconJson = JSON.parse(await readFile(join(dir, 'Star.icon/icon.json'), 'utf8'));
    expect(iconJson.groups[0].layers[0]['fill-specializations']).toHaveLength(1);
    expect(await readdir(join(dir, 'Star.icon/Assets'))).toEqual(['Star.svg']);

    r = await call('icon_render', { path: 'Star', size: 128, appearance: 'dark', out: 'previews/dark.png' });
    const img = r.content.find((c) => c.type === 'image')!;
    expect(img.mimeType).toBe('image/png');
    const bmp = decodePng(new Uint8Array(Buffer.from(img.data!, 'base64')))!;
    expect(bmp.width).toBe(128);
    expect((await stat(join(dir, 'previews/dark.png'))).size).toBeGreaterThan(1000);

    r = await call('icon_render_sheet', { path: 'Star', cell: 120 });
    expect(r.content[0]!.type).toBe('image');

    r = await call('icon_validate', { path: 'Star' });
    expect(json(r).summary.errors).toBe(0);

    r = await call('icon_export', { path: 'Star', out_dir: 'out', formats: ['icon', 'icns', 'appiconset', 'png'], sizes: [64], appearances: ['default', 'dark'] });
    expect(r.isError).toBeFalsy();
    const out = await readdir(join(dir, 'out'));
    expect(out.sort()).toEqual(['AppIcon.appiconset', 'Star-png', 'Star.icns', 'Star.icon']);
    const icns = await readFile(join(dir, 'out/Star.icns'));
    expect(icns.subarray(0, 4).toString()).toBe('icns');
  }, 60_000);

  it('reorders and removes', async () => {
    await call('icon_add_layer', { path: 'Star', group: 'Back', svg: STAR.replace('#ffffff', '#000000'), name: 'Shadow' });
    let r = await call('icon_inspect', { path: 'Star' });
    // new groups go to the front, like Icon Composer
    expect(json(r).groups.map((g: { target: string }) => g.target)).toEqual(['Back', 'Shape']);
    r = await call('icon_move', { path: 'Star', target: 'Back', index: 1 });
    expect(r.isError).toBeFalsy();
    expect(json(r).map((g: { group: string }) => g.group)).toEqual(['Shape', 'Back']);
    r = await call('icon_remove', { path: 'Star', target: 'Back' });
    expect(json(r).removed).toBe('Back');
    expect(await readdir(join(dir, 'Star.icon/Assets'))).toEqual(['Star.svg']);
  });

  it('reports errors the model can act on', async () => {
    let r = await call('icon_set', { path: 'Star', target: 'Nope', props: { opacity: 1 } });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/not found\. Available: Shape/);
    r = await call('icon_set', { path: 'Star', target: 'Shape', props: { opacity: 3 } });
    expect(r.content[0]!.text).toMatch(/opacity/);
    r = await call('icon_create', { path: 'Star' });
    expect(r.content[0]!.text).toMatch(/already exists/);
  });

  it('refuses paths outside the allowed roots', async () => {
    let r = await call('icon_create', { path: '../escape.icon' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/Access denied/);
    r = await call('icon_add_layer', { path: 'Star', group: 'Shape', source: '/etc/hostname' });
    expect(r.content[0]!.text).toMatch(/Access denied/);
    r = await call('icon_render', { path: 'Star', out: '/tmp/x.png' });
    expect(r.content[0]!.text).toMatch(/Access denied/);
  });
});
