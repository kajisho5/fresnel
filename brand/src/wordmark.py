#!/usr/bin/env python3
"""Outlines the "fresnel" wordmark from Inter Display SemiBold (SIL OFL 1.1) into an SVG path.

    python3 brand/src/wordmark.py [font.otf]
"""
import json, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

FONT = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/inter/InterDisplay-SemiBold.otf'
TEXT = 'fresnel'
TRACK = -0.02  # em, slight negative tracking like Apple display type

font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font['head'].unitsPerEm
hmtx = font['hmtx']
pen = SVGPathPen(gs)
bounds = BoundsPen(gs)
x = 0
for ch in TEXT:
    name = cmap[ord(ch)]
    # flip y (font units are y-up)
    tp = TransformPen(pen, (1, 0, 0, -1, x, 0))
    gs[name].draw(tp)
    gs[name].draw(TransformPen(bounds, (1, 0, 0, -1, x, 0)))
    x += hmtx[name][0] + TRACK * upm
xmin, ymin, xmax, ymax = bounds.bounds
out = Path(__file__).resolve().parent / 'wordmark.json'
out.write_text(json.dumps({'d': pen.getCommands(), 'bbox': [xmin, ymin, xmax, ymax], 'upm': upm, 'font': Path(FONT).name}))
print('wrote', out, 'bbox', [round(v) for v in (xmin, ymin, xmax, ymax)])
