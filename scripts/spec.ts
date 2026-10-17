/**
 * pnpm spec — regenerates everything derived from the SPEC registry (docs/design/spec.md):
 *   docs/contract.json, the <!-- spec:… --> sections of the READMEs and packages/mcp/spec/surface.json.
 * The frozen surface is only rewritten when nothing breaks, or with --break after bumping
 * CONTRACT_VERSION to a new major.
 *
 *   pnpm spec           write
 *   pnpm spec --check   exit 1 if anything is out of date (CI runs the same checks as tests)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { breakingChanges, buildContract, buildSurface, readmeCliBlock, readmeToolTable, replaceSection, type Surface } from '../packages/mcp/src/contract';
import { CONTRACT_VERSION } from '../packages/mcp/src/spec';

const ROOT = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const allowBreak = process.argv.includes('--break');
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

const outputs: [string, string][] = [['docs/contract.json', json(buildContract())]];
for (const f of ['README.md', 'packages/mcp/README.md']) outputs.push([f, replaceSection(readFileSync(join(ROOT, f), 'utf8'), 'tools', readmeToolTable())]);
outputs.push(['packages/cli/README.md', replaceSection(readFileSync(join(ROOT, 'packages/cli/README.md'), 'utf8'), 'cli', readmeCliBlock())]);

const surfacePath = 'packages/mcp/spec/surface.json';
const now = buildSurface();
if (existsSync(join(ROOT, surfacePath))) {
  const frozen = JSON.parse(readFileSync(join(ROOT, surfacePath), 'utf8')) as Surface;
  const breaks = breakingChanges(frozen, now);
  const major = (v: string) => Number(v.split('.')[0]);
  if (breaks.length && !(allowBreak && major(CONTRACT_VERSION) > major(frozen.contract_version))) {
    console.error(`Breaking changes to the public surface:\n  ${breaks.join('\n  ')}\n` + 'Undo them, or bump CONTRACT_VERSION to a new major and run "pnpm spec --break".');
    process.exit(1);
  }
}
outputs.push([surfacePath, json(now)]);

let stale = 0;
for (const [f, text] of outputs) {
  const p = join(ROOT, f);
  const old = existsSync(p) ? readFileSync(p, 'utf8') : '';
  if (old === text) continue;
  stale++;
  if (check) console.error(`out of date: ${f}`);
  else {
    writeFileSync(p, text);
    console.log(`wrote ${f}`);
  }
}
if (check && stale) {
  console.error('Run "pnpm spec".');
  process.exit(1);
}
if (!stale) console.log('SPEC outputs are up to date');
