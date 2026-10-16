import { useEffect, useMemo, useState } from 'react';
import type { IconDocument } from '@fresnel/core';
import { renderSvg, type RenderOptions } from '@fresnel/render';
import { svgUrl } from './raster';

/**
 * Renders the document to an object URL for an <img>. Rendering is deferred to the
 * next animation frame so rapid edits (slider drags) coalesce into one render.
 */
export function useIconUrl(doc: IconDocument, opts: RenderOptions): string | null {
  const key = JSON.stringify(opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableOpts = useMemo(() => opts, [key]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let created: string | null = null;
    const raf = requestAnimationFrame(() => {
      created = svgUrl(renderSvg(doc, stableOpts));
      setUrl(created);
    });
    return () => {
      cancelAnimationFrame(raf);
      // keep the previous image visible until the next one is ready
      if (created) setTimeout(() => URL.revokeObjectURL(created!), 1000);
    };
  }, [doc, stableOpts]);
  return url;
}
