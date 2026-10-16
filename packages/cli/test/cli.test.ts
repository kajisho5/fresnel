import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const CLI = join(__dirname, '../src/cli.ts');
const ROOT = join(__dirname, '../../..');
const fresnel = (...args: string[]) => run(process.execPath, ['--import', 'tsx', CLI, ...args], { cwd: ROOT });

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fresnel-cli-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('fresnel CLI', () => {
  it('builds a bundle from a spec that matches the checked-in fixture', async () => {
    const out = join(dir, 'Built.icon');
    const { stdout } = await fresnel('build', 'fixtures/sample.spec.json', '-o', out);
    expect(stdout).toContain('Built');
    const built = JSON.parse(await readFile(join(out, 'icon.json'), 'utf8'));
    const fixture = JSON.parse(await readFile(join(ROOT, 'fixtures/Sample.icon/icon.json'), 'utf8'));
    expect(built.groups.map((g: { name: string }) => g.name)).toEqual(fixture.groups.map((g: { name: string }) => g.name));
    expect(built.groups[0].layers.map((l: { name: string }) => l.name)).toEqual(['Wave Front', 'Wave Back']);
    expect(await readdir(join(out, 'Assets'))).toEqual(['sun.svg', 'wave-back.svg', 'wave-front.svg']);
  }, 30_000);

  it('validates with exit codes', async () => {
    const { stdout } = await fresnel('validate', 'fixtures/Sample.icon', '--json');
    const issues = JSON.parse(stdout);
    expect(issues.filter((i: { severity: string }) => i.severity === 'error')).toEqual([]);
    await expect(fresnel('validate', 'fixtures/Sample.icon', '--strict')).rejects.toMatchObject({ code: 1 });
  }, 30_000);

  it('renders and exports', async () => {
    await fresnel('render', 'fixtures/Sample.icon', '-a', 'dark', '-s', '128', '-o', join(dir, 'dark.png'));
    await fresnel('render', 'fixtures/Sample.icon', '--sheet', '-s', '120', '-o', join(dir, 'sheet.png'));
    const { stdout } = await fresnel('export', 'fixtures/Sample.icon', '-o', join(dir, 'out'), '--formats', 'icns,png', '--sizes', '32', '--appearances', 'default');
    expect(stdout).toMatch(/Exported 2 files/);
    expect((await readdir(dir)).sort()).toEqual(['Built.icon', 'dark.png', 'out', 'sheet.png']);
  }, 60_000);

  it('fails clearly on bad input', async () => {
    await expect(fresnel('render', 'fixtures/Sample.icon', '-a', 'neon')).rejects.toMatchObject({ stderr: expect.stringContaining('Unknown appearance') });
    await expect(fresnel('frobnicate')).rejects.toMatchObject({ stderr: expect.stringContaining('Unknown command') });
  }, 30_000);
});
