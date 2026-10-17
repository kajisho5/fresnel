import type { RenderOptions } from '@fresnel/render';
import { currentAppearance, tintHex, useUI, type UIState } from '../store/ui';

export function renderOptsFrom(s: UIState): RenderOptions {
  return {
    appearance: currentAppearance(s),
    idiom: s.platform,
    mask: s.platform === 'watchOS' ? 'circle' : 'squircle',
    tint: tintHex(s),
    lightAngle: s.lightAngle,
    effects: s.effects,
  };
}

/** Render options for the current canvas selection (platform, appearance, mono options, effects). */
export function useRenderOpts(): RenderOptions {
  const s = useUI();
  return renderOptsFrom(s);
}
