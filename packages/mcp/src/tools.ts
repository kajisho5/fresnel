/**
 * MCP server. Tools come from the SPEC registry (spec.ts); this file only wires them to MCP
 * and adds the resources (guide, icon.json reference, contract) and the prompt.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildContract } from './contract';
import { ICON_GUIDE, SCHEMA_GUIDE } from './guide';
import { runTool, TOOLS } from './spec';
import { VERSION } from './version';
import type { Workspace } from './workspace';

export { inspect } from './spec';
export { VERSION } from './version';

type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
const text = (v: unknown): Content => ({ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) });
const fail = (e: unknown) => ({ content: [text(`Error: ${(e as Error).message}`)], isError: true });
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

export function createServer(ws: Workspace): McpServer {
  const server = new McpServer(
    { name: 'fresnel', version: VERSION },
    {
      instructions:
        'fresnel edits Apple Liquid Glass app icons stored as .icon bundles (the Icon Composer format). ' +
        'Typical flow: icon_create → icon_add_layer (one 1024×1024 SVG per element) → icon_set (glass, translucency, dark/tinted overrides) → ' +
        'icon_render_sheet to look at all appearances → icon_validate → icon_export. Read fresnel://guide/icon-design for Apple design rules. ' +
        'Targets are "document", "<Group>" or "<Group>/<Layer>" (names or #index; index 0 is frontmost). Previews are approximations of the system renderer.',
    },
  );

  // Every tool comes from the SPEC registry (spec.ts); nothing is defined here by hand.
  for (const t of TOOLS) {
    server.registerTool(
      t.id,
      {
        title: t.title,
        description: t.description,
        // strict: a misspelt argument (dryRun for dry_run) is an error, not silently dropped
        inputSchema: z.object(t.input).strict(),
        outputSchema: t.output as z.ZodObject,
        annotations: {
          readOnlyHint: !t.mutates_input && !t.writes_files,
          destructiveHint: !!t.destructive,
          idempotentHint: t.idempotency_hint === 'idempotent',
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>) => {
        try {
          const { data, image } = await runTool(ws, t, args);
          const content: Content[] = image ? [{ type: 'image', data: b64(image), mimeType: 'image/png' }, text(data)] : [text(data)];
          return { content, structuredContent: data };
        } catch (e) {
          return fail(e);
        }
      },
    );
  }

  // ------------------------------------------------------------ resources & prompts
  server.registerResource(
    'icon-design-guide',
    'fresnel://guide/icon-design',
    { title: 'Liquid Glass icon design guide', description: 'Apple HIG rules for layered app icons, condensed', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: ICON_GUIDE }] }),
  );
  server.registerResource(
    'icon-json-schema',
    'fresnel://schema/icon-json',
    { title: 'icon.json attribute reference', description: 'Keys, value formats and defaults fresnel understands', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SCHEMA_GUIDE }] }),
  );
  server.registerResource(
    'contract',
    'fresnel://contract',
    { title: 'SPEC contract', description: 'Machine-readable contract: every tool with input/output JSON Schema, roles, verification and examples, plus the icon.json attribute table', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(buildContract(), null, 2) }] }),
  );

  server.registerPrompt(
    'design_app_icon',
    {
      title: 'Design an app icon',
      description: 'Step-by-step workflow to design a Liquid Glass app icon from an app description',
      argsSchema: {
        app: z.string().describe('What the app does'),
        path: z.string().optional().describe('Where to save the .icon bundle'),
        style: z.string().optional().describe('Colors / mood / constraints'),
      },
    },
    ({ app, path, style }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Design an app icon for: ${app}\n${style ? `Style: ${style}\n` : ''}Save it as ${path ?? 'AppIcon.icon'}.\n\n` +
              `Use the fresnel tools:\n` +
              `1. Read fresnel://guide/icon-design.\n` +
              `2. Pick one simple core idea (1–3 filled, overlapping shapes) and a background color or gradient.\n` +
              `3. icon_create with that background, and a darker dark_background.\n` +
              `4. For each shape, write a 1024×1024 SVG with a transparent background (no text, no shadows, no rounded-corner mask) and add it with icon_add_layer. Put shapes that should share glass in the same group; index 0 is frontmost.\n` +
              `5. Turn on glass for the foreground layers and tune the groups (translucency, blur-material, shadow).\n` +
              `6. Add dark and tinted overrides with icon_set where colors need to change.\n` +
              `7. Look at icon_render_sheet and fix anything that is hard to read at small sizes; run icon_validate.\n` +
              `8. Export with icon_export (formats: icon, icns, appiconset).`,
          },
        },
      ],
    }),
  );

  return server;
}
