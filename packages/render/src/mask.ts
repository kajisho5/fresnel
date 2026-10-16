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

export function maskPath(shape: MaskShape): string {
  if (shape === 'circle') return `M${C / 2},0 A${C / 2},${C / 2} 0 1 1 ${C / 2},${C} A${C / 2},${C / 2} 0 1 1 ${C / 2},0Z`;
  if (shape === 'none') return `M0,0 H${C} V${C} H0Z`;
  return SQUIRCLE;
}
