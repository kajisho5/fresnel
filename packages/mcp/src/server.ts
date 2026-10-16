#!/usr/bin/env node
/**
 * fresnel-mcp — MCP server (stdio) for creating and editing Liquid Glass app icons.
 *
 *   fresnel-mcp [--root <dir>]...
 *
 * File access is limited to the given roots (default: the current directory).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from './tools';
import { Workspace } from './workspace';

function parseArgs(argv: string[]) {
  const roots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--root' || a === '-r') {
      const v = argv[++i];
      if (!v) throw new Error('--root needs a directory');
      roots.push(v);
    } else if (a.startsWith('--root=')) roots.push(a.slice('--root='.length));
    else if (a === '--version' || a === '-v') {
      process.stdout.write(`${VERSION}\n`);
      process.exit(0);
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'fresnel-mcp — MCP server for Liquid Glass app icons\n\nUsage: fresnel-mcp [--root <dir>]...\n\n' +
          'Options:\n  --root, -r <dir>  Allow reading and writing inside <dir> (repeatable). Default: current directory\n' +
          '  --version         Print version\n',
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return { roots };
}

async function main() {
  const { roots } = parseArgs(process.argv.slice(2));
  const ws = new Workspace(roots);
  const server = createServer(ws);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`fresnel-mcp ${VERSION} ready (roots: ${ws.roots.join(', ')})\n`);
}

main().catch((e) => {
  process.stderr.write(`fresnel-mcp: ${(e as Error).message}\n`);
  process.exit(1);
});
