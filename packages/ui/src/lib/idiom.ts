import { baseValue, squarePlatforms, type Idiom } from '@fresnel/core';
import { useDoc } from '../store/doc';
import { useUI, type UIState } from '../store/ui';

/** True when iOS and macOS share one icon (supported-platforms.squares = "shared"). */
export function squaresShared(): boolean {
  const sp = baseValue(useDoc.getState().doc.props['supported-platforms']) as { squares?: unknown } | undefined;
  return squarePlatforms(sp?.squares ?? 'shared') === 'shared';
}

/**
 * The idiom a platform variant is written for. With shared squares, Icon Composer shows one
 * "iOS, macOS" platform and its variants use the "square" idiom, which covers both. [推測]
 */
export function editIdiom(s: Pick<UIState, 'platform'> = useUI.getState()): Idiom {
  if (s.platform !== 'watchOS' && squaresShared()) return 'square';
  return s.platform as Idiom;
}

export const idiomLabel = (i: Idiom) => (i === 'square' ? 'iOS, macOS' : i);
