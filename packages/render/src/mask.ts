import { CANVAS } from '@fresnel/core';

export type MaskShape = 'squircle' | 'circle' | 'none';

/** Superellipse approximation of Apple's continuous-corner icon shape. [推測] n = 4.4 */
export function squirclePath(size = CANVAS, exponent = 4.4, steps = 192): string {
  const r = size / 2;
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = r + r * Math.sign(c) * Math.abs(c) ** (2 / exponent);
    const y = r + r * Math.sign(s) * Math.abs(s) ** (2 / exponent);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')}Z`;
}

const SQUIRCLE = squirclePath();
const C = CANVAS;

/** `pad`: extra canvas around the 1024 artwork (32 pt on watchOS); "none" then covers the whole padded canvas. */
export function maskPath(shape: MaskShape, pad = 0): string {
  // watchOS: a 1088 pt circle centered on the 1024 artwork (32 pt outside it on every side)
  if (shape === 'circle') {
    const r = C / 2 + 32;
    return `M${C / 2},${C / 2 - r} A${r},${r} 0 1 1 ${C / 2},${C / 2 + r} A${r},${r} 0 1 1 ${C / 2},${C / 2 - r}Z`;
  }
  if (shape === 'none') return `M${-pad},${-pad} H${C + pad} V${C + pad} H${-pad}Z`;
  return SQUIRCLE;
}
