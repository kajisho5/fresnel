import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  bundle: true,
  clean: true,
  sourcemap: false,
  // workspace packages are bundled; real dependencies stay external
  noExternal: [/^@fresnel\//],
  external: ['@resvg/resvg-js', '@modelcontextprotocol/sdk', 'zod', 'fflate'],
});
