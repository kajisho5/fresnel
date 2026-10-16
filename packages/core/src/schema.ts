import { z } from 'zod';
import { isColorString } from './color';

/**
 * Known icon.json attributes, their value schemas and the defaults fresnel assumes
 * when a key is absent.
 *
 * Sources (reverse-engineered, no official spec):
 *  - digitalby/glassmith schema/icon-json.md
 *  - peterpoliwoda/icon-composer-template fixtures (real Icon Composer output)
 * Defaults marked [推測] are fresnel's best guess.
 */

export const ColorString = z.string().refine(isColorString, 'Expected a color like "display-p3:1,0,0,1" or "extended-gray:1,1"');

export const XY = z.object({ x: z.number(), y: z.number() });

export const FillSchema = z.union([
  z.enum(['automatic', 'system-light', 'system-dark', 'none']),
  z.object({ solid: ColorString }).loose(),
  z.object({ 'automatic-gradient': ColorString }).loose(),
  z
    .object({
      'linear-gradient': z.tuple([ColorString, ColorString]),
      orientation: z.object({ start: XY, stop: XY }).optional(),
    })
    .loose(),
]);
export type Fill = z.infer<typeof FillSchema>;

export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'soft-light', 'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
  'plus-darker', 'plus-lighter',
] as const;
export const BlendModeSchema = z.enum(BLEND_MODES);
export type BlendMode = z.infer<typeof BlendModeSchema>;

export const PositionSchema = z
  .object({ scale: z.number().positive(), 'translation-in-points': z.tuple([z.number(), z.number()]) })
  .loose();
export type Position = z.infer<typeof PositionSchema>;

export const ShadowSchema = z
  .object({ kind: z.enum(['none', 'neutral', 'layer-color']), opacity: z.number().min(0).max(1) })
  .loose();
export type Shadow = z.infer<typeof ShadowSchema>;

export const TranslucencySchema = z.object({ enabled: z.boolean(), value: z.number().min(0).max(1) }).loose();
export type Translucency = z.infer<typeof TranslucencySchema>;

export const SupportedPlatformsSchema = z
  .object({
    squares: z.union([z.literal('shared'), z.array(z.string())]).optional(),
    circles: z.array(z.string()).optional(),
  })
  .loose();

const unit = z.number().min(0).max(1);

export interface AttrDef {
  schema: z.ZodType;
  default: unknown;
  description: string;
}

export const DOCUMENT_ATTRS: Record<string, AttrDef> = {
  fill: { schema: FillSchema, default: 'automatic', description: 'Background fill' },
  'color-space-for-untagged-svg-colors': {
    schema: z.enum(['display-p3', 'srgb']),
    default: 'display-p3',
    description: 'Color space assumed for SVG colors without a profile',
  },
  'supported-platforms': {
    schema: SupportedPlatformsSchema,
    default: { squares: 'shared' },
    description: 'Target platforms: squares ("shared" or a list) and circles (e.g. ["watchOS"])',
  },
};

export const GROUP_ATTRS: Record<string, AttrDef> = {
  name: { schema: z.string(), default: 'Group', description: 'Display name' },
  hidden: { schema: z.boolean(), default: false, description: 'Hide the whole group' },
  opacity: { schema: unit, default: 1, description: 'Group opacity 0–1' },
  'blend-mode': { schema: BlendModeSchema, default: 'normal', description: 'Blend mode of the group' },
  lighting: { schema: z.enum(['combined', 'individual']), default: 'combined', description: 'Light layers as one shape or individually' },
  specular: { schema: z.boolean(), default: true, description: 'Specular highlight on glass edges [default 推測]' },
  translucency: { schema: TranslucencySchema, default: { enabled: true, value: 0.5 }, description: 'Glass translucency [default 推測]' },
  'blur-material': { schema: unit.nullable(), default: null, description: 'Frosted blur strength 0–1, null = off' },
  shadow: { schema: ShadowSchema, default: { kind: 'neutral', opacity: 0.5 }, description: 'Drop shadow under the group [default 推測]' },
  position: { schema: PositionSchema, default: { scale: 1, 'translation-in-points': [0, 0] }, description: 'Scale and offset (points, y down)' },
};

export const LAYER_ATTRS: Record<string, AttrDef> = {
  name: { schema: z.string(), default: 'Layer', description: 'Display name' },
  'image-name': { schema: z.string(), default: '', description: 'File name inside Assets/' },
  hidden: { schema: z.boolean(), default: false, description: 'Hide the layer' },
  opacity: { schema: unit, default: 1, description: 'Layer opacity 0–1' },
  'blend-mode': { schema: BlendModeSchema, default: 'normal', description: 'Blend mode of the layer' },
  glass: { schema: z.boolean(), default: false, description: 'Render this layer as Liquid Glass [default 推測]' },
  fill: { schema: FillSchema.nullable(), default: null, description: 'Recolor the layer (uses its alpha as a mask)' },
  position: { schema: PositionSchema, default: { scale: 1, 'translation-in-points': [0, 0] }, description: 'Scale and offset (points, y down)' },
};

export type NodeKind = 'document' | 'group' | 'layer';

export function attrsFor(kind: NodeKind): Record<string, AttrDef> {
  return kind === 'document' ? DOCUMENT_ATTRS : kind === 'group' ? GROUP_ATTRS : LAYER_ATTRS;
}

/** Validates a value for a known attribute. Unknown attributes are accepted as-is (forward compatibility). */
export function validateAttr(kind: NodeKind, key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const def = attrsFor(kind)[key];
  if (!def) return { ok: true, value };
  const r = def.schema.safeParse(value);
  if (r.success) return { ok: true, value };
  return { ok: false, error: `${kind}.${key}: ${r.error.issues.map((i) => i.message).join('; ')}` };
}

/** Shape check of a raw icon.json. Unknown keys pass (loose). */
export const IconJsonSchema = z
  .object({
    groups: z.array(
      z
        .object({
          layers: z.array(z.object({}).loose()),
        })
        .loose(),
    ),
  })
  .loose();
