import { useEffect, useMemo, useRef, useState } from 'react';
import type { IconDocument } from '@fresnel/core';
import { renderSvg, type RenderOptions } from '@fresnel/render';
import { svgUrl } from './raster';

/**
 * Renders the document to an object URL for an <img>. Rendering is deferred to the
 * next animation frame so rapid edits (slider drags) coalesce into one render.
 * A URL is revoked only once a newer one has replaced it, or when the component unmounts.
 */
export function useIconUrl(doc: IconDocument, opts: RenderOptions): string | null {
  const key = JSON.stringify(opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableOpts = useMemo(() => opts, [key]);
  const [url, setUrl] = useState<string | null>(null);
  const current = useRef<string | null>(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const next = svgUrl(renderSvg(doc, stableOpts));
      const prev = current.current;
      current.current = next;
      setUrl(next);
      // give the <img> time to swap to the new URL before the old one goes away
      if (prev) setTimeout(() => URL.revokeObjectURL(prev), 1000);
    });
    return () => cancelAnimationFrame(raf);
  }, [doc, stableOpts]);
  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = null;
    },
    [],
  );
  return url;
}
