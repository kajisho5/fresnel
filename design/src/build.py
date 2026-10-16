#!/usr/bin/env python3
"""fresnel design SVG generator (Step 2 deliverables).

Generates the static design comps in ../ from one source of truth so that
tokens stay consistent across screens. Python 3 stdlib only.

    python3 design/src/build.py
"""
from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- tokens (HIG.md A2)
D = dict(
    window="#1C1C1E", sidebar="#232326", canvas="#141415", elevated="#2C2C2F",
    control="#3A3A3D", hover="rgba(255,255,255,0.06)", selected="rgba(91,140,255,0.22)",
    sep="#2E2E31", t1="#F2F2F5", t2="#A0A0A7", t3="#6C6C73",
    accent="#5B8CFF", accent_h="#7AA2FF", override="#C792FF",
    ok="#34C759", warn="#FFB020", err="#FF5A5F",
)
L = dict(
    window="#F5F5F7", sidebar="#ECECEF", canvas="#E4E4E8", elevated="#FFFFFF",
    control="#E2E2E6", sep="#D6D6DB", t1="#1C1C1E", t2="#5C5C63", t3="#8E8E95",
    accent="#2F6BFF", override="#8E4FE0",
)
FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Segoe UI', 'Noto Sans JP', sans-serif"
MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', 'DejaVu Sans Mono', monospace"

W, H = 1440, 900
TB, SB = 52, 24            # toolbar / statusbar height
SIDEBAR, INSPECTOR = 260, 300


# ---------------------------------------------------------------- helpers
def squircle_path(size: float = 1024, n: float = 4.4, steps: int = 160) -> str:
    r = size / 2
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        x = r + r * math.copysign(abs(c) ** (2 / n), c)
        y = r + r * math.copysign(abs(s) ** (2 / n), s)
        pts.append(f"{x:.1f},{y:.1f}")
    return "M" + " L".join(pts) + "Z"


SQ = squircle_path()
SHADOW_SIZES = [420, 176, 150, 128, 64]


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text(x, y, s, size=13, fill=None, weight=400, anchor="start", family=FONT, extra=""):
    fill = fill or D["t1"]
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{esc(s)}</text>')


def rect(x, y, w, h, fill, rx=0, stroke=None, sw=1, extra=""):
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st} {extra}/>'


def line(x1, y1, x2, y2, stroke, sw=1, extra=""):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{w}" height="{h}" viewBox="0 0 {w} {h}">\n<title>{esc(title)}</title>\n{body}\n</svg>\n')


# ---------------------------------------------------------------- sample icon (fictional "Sample")
APPEARANCES = {
    # key: (label, bgTop, bgBottom, sunA, sunB, waveBackA, waveFrontA, waveTint, wallpaper)
    "default":      ("Default",      "#3D7BFF", "#0E2A8A", "#FFD76E", "#FF8A3D", 0.34, 0.56, "#FFFFFF", "light"),
    "dark":         ("Dark",         "#1A2140", "#070A14", "#FFC75A", "#F2702A", 0.16, 0.28, "#B9C8FF", "dark"),
    "clear-light":  ("Clear light",  "#E9EDF2", "#C9D1DB", "#FFFFFF", "#E8ECF1", 0.40, 0.62, "#FFFFFF", "light"),
    "clear-dark":   ("Clear dark",   "#3A3D44", "#1C1E22", "#F2F3F5", "#C9CCD2", 0.14, 0.24, "#FFFFFF", "dark"),
    "tinted-light": ("Tinted light", "#E6F3F2", "#C7E3E1", "#3FA7A0", "#2B7F79", 0.30, 0.50, "#3FA7A0", "light"),
    "tinted-dark":  ("Tinted dark",  "#13201F", "#0A1211", "#5CC9C1", "#3FA7A0", 0.18, 0.30, "#5CC9C1", "dark"),
}


def icon_defs() -> str:
    """Symbols #icon-<appearance> drawn in a 1024 box, plus shared gradients."""
    out = [f'<clipPath id="sq"><path d="{SQ}"/></clipPath>',
           '<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>',
           *[f'<filter id="sh{n}" x="-40%" y="-40%" width="180%" height="190%">'
             f'<feDropShadow dx="0" dy="{n * 0.035:.1f}" stdDeviation="{n * 0.045:.1f}" flood-color="#000" flood-opacity="0.32"/></filter>'
             for n in SHADOW_SIZES],
           '<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">'
           '<stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.12"/>'
           '<stop offset="0.7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.35"/></linearGradient>',
           '<linearGradient id="waveHi" x1="0" y1="0" x2="0" y2="1">'
           '<stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>']
    wave_back = "M0,600 C170,520 340,520 512,600 S854,680 1024,600 L1024,1024 L0,1024 Z"
    wave_front = "M0,736 C170,664 340,676 512,746 S854,816 1024,736 L1024,1024 L0,1024 Z"
    crest_back = "M0,600 C170,520 340,520 512,600 S854,680 1024,600"
    crest_front = "M0,736 C170,664 340,676 512,746 S854,816 1024,736"
    for k, (_, top, bot, sa, sb, wb, wf, tint, _) in APPEARANCES.items():
        out.append(f'<linearGradient id="bg-{k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{top}"/>'
                   f'<stop offset="1" stop-color="{bot}"/></linearGradient>')
        out.append(f'<radialGradient id="sun-{k}" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="{sa}"/>'
                   f'<stop offset="1" stop-color="{sb}"/></radialGradient>')
        out.append(f'''<symbol id="icon-{k}" viewBox="0 0 1024 1024" overflow="visible">
  <g clip-path="url(#sq)">
    <rect width="1024" height="1024" fill="url(#bg-{k})"/>
    <circle cx="512" cy="430" r="200" fill="{sb}" opacity="0.45" filter="url(#soft)"/>
    <circle cx="512" cy="410" r="190" fill="url(#sun-{k})"/>
    <path d="M400,290 A150,150 0 0 1 600,262" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="10" stroke-linecap="round"/>
    <path d="{wave_back}" fill="{tint}" fill-opacity="{wb}"/>
    <path d="{crest_back}" fill="none" stroke="url(#waveHi)" stroke-opacity="0.8" stroke-width="7"/>
    <path d="{wave_front}" fill="{tint}" fill-opacity="{wf}"/>
    <path d="{crest_front}" fill="none" stroke="url(#waveHi)" stroke-width="8"/>
    <path d="{SQ}" fill="none" stroke="url(#rim)" stroke-width="10"/>
  </g>
</symbol>''')
    return "\n".join(out)


def icon_use(k, x, y, size, shadow=True):
    f = ""
    if shadow and size >= 64:
        n = min(SHADOW_SIZES, key=lambda v: abs(v - size))
        f = f' filter="url(#sh{n})"'
    return f'<use href="#icon-{k}" xlink:href="#icon-{k}" x="{x}" y="{y}" width="{size}" height="{size}"{f}/>'


# ---------------------------------------------------------------- chrome pieces
def traffic_lights(x=20, y=26):
    return "".join(f'<circle cx="{x + i * 20}" cy="{y}" r="6" fill="{c}" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>'
                   for i, c in enumerate(["#FF5F57", "#FEBC2E", "#28C840"]))


def icon_sidebar(x, y, c):
    return (f'<g fill="none" stroke="{c}" stroke-width="1.4" stroke-linejoin="round">'
            f'<rect x="{x}" y="{y}" width="18" height="14" rx="3"/><line x1="{x + 6}" y1="{y}" x2="{x + 6}" y2="{y + 14}"/></g>')


def icon_inspector(x, y, c):
    return (f'<g fill="none" stroke="{c}" stroke-width="1.4" stroke-linejoin="round">'
            f'<rect x="{x}" y="{y}" width="18" height="14" rx="3"/><line x1="{x + 12}" y1="{y}" x2="{x + 12}" y2="{y + 14}"/></g>')


def chevron_down(x, y, c, s=1):
    return f'<path d="M{x},{y} l{4*s},{4*s} l{4*s},{-4*s}" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'


def chevron_right(x, y, c):
    return f'<path d="M{x},{y} l4,4 l-4,4" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'


def segmented(x, y, labels, active, w_each, h=24, t=D, size=12):
    w = w_each * len(labels)
    out = [rect(x, y, w, h, t["control"], rx=6)]
    for i, lab in enumerate(labels):
        cx = x + i * w_each
        if i == active:
            out.append(rect(cx + 2, y + 2, w_each - 4, h - 4, t["elevated"] if t is D else "#FFFFFF", rx=5,
                            extra='style="filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3))"'))
        out.append(text(cx + w_each / 2, y + h / 2 + 4, lab, size, t["t1"] if i == active else t["t2"],
                        500 if i == active else 400, "middle"))
    return "".join(out)


def toolbar(title, mode, appearance_label, t=D, edited=True):
    o = [rect(0, 0, W, TB, t["window"]), traffic_lights(),
         icon_sidebar(92, 19, t["t2"]),
         text(128, 31, title, 13, t["t1"], 600)]
    if edited:
        o.append(text(128 + 8 * len(title) + 8, 31, "— Edited", 13, t["t3"]))
    o.append(segmented(W / 2 - 80, 14, ["Edit", "Compare"], mode, 80, t=t))
    # appearance picker
    ax = W - 330
    o.append(rect(ax, 14, 150, 24, t["control"], rx=6))
    o.append(f'<circle cx="{ax + 16}" cy="26" r="6" fill="none" stroke="{t["t1"]}" stroke-width="1.4"/>'
             f'<path d="M{ax + 16},20 A6,6 0 0 1 {ax + 16},32 Z" fill="{t["t1"]}"/>')
    o.append(text(ax + 30, 30, appearance_label, 12, t["t1"]))
    o.append(chevron_down(ax + 132, 24, t["t2"]))
    # export
    o.append(rect(W - 166, 14, 96, 24, t["accent"], rx=6))
    o.append(text(W - 118, 30, "Export…", 12, "#FFFFFF", 600, "middle"))
    o.append(icon_inspector(W - 44, 19, t["t2"]))
    o.append(line(0, TB - 0.5, W, TB - 0.5, t["sep"]))
    return "".join(o)


def statusbar(left, right_items, t=D):
    y = H - SB
    o = [rect(0, y, W, SB, t["window"]), line(0, y + 0.5, W, y + 0.5, t["sep"]),
         text(16, y + 16, left, 11, t["t2"], family=FONT)]
    x = W - 16
    for s, c, ic in reversed(right_items):
        o.append(text(x, y + 16, s, 11, t["t2"], anchor="end"))
        x -= len(s) * 6.0 + 6
        if ic == "ok":
            o.append(f'<circle cx="{x - 4}" cy="{y + 12}" r="5" fill="{c}"/>'
                     f'<path d="M{x - 6.5},{y + 12} l2,2 l3.5,-4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>')
            x -= 14
        x -= 18
    return "".join(o)


def eye(x, y, c, off=False):
    o = (f'<g fill="none" stroke="{c}" stroke-width="1.3"><path d="M{x},{y} q7,-7 14,0 q-7,7 -14,0 Z"/>'
         f'<circle cx="{x + 7}" cy="{y}" r="2"/></g>')
    if off:
        o += line(x, y - 6, x + 14, y + 6, c, 1.3)
    return o


def thumb(x, y, k, kind):
    """28px thumbnail of a layer / background."""
    o = [rect(x, y, 28, 28, "#0F0F10", rx=6, stroke="rgba(255,255,255,0.08)")]
    if kind == "bg":
        o.append(f'<rect x="{x + 3}" y="{y + 3}" width="22" height="22" rx="4" fill="url(#bg-{k})"/>')
    elif kind == "sun":
        o.append(f'<circle cx="{x + 14}" cy="{y + 14}" r="8" fill="url(#sun-{k})"/>')
    elif kind == "wave":
        o.append(f'<path d="M{x + 4},{y + 15} q5,-4 10,0 t10,0 v8 h-20 Z" fill="#fff" fill-opacity="0.7"/>')
    elif kind == "group":
        o.append(f'<path d="M{x + 5},{y + 10} h7 l2,2 h9 v10 h-18 Z" fill="none" stroke="{D["t2"]}" stroke-width="1.3"/>')
    return "".join(o)


def badge(x, y, s, c=None):
    c = c or D["accent"]
    w = len(s) * 6 + 10
    return rect(x, y, w, 16, "rgba(91,140,255,0.18)", rx=4) + text(x + w / 2, y + 12, s, 10, c, 600, "middle")


def sidebar(selected="waves"):
    x0, y0 = 0, TB
    o = [rect(x0, y0, SIDEBAR, H - TB - SB, D["sidebar"]), line(SIDEBAR - 0.5, y0, SIDEBAR - 0.5, H - SB, D["sep"])]
    o.append(text(16, y0 + 26, "LAYERS", 11, D["t3"], 600, extra='letter-spacing="0.6"'))
    rows = [
        # (indent, kind, name, chevron, badge, eye_off, sel_key)
        (0, "bg", "Background", None, "Fill", False, "bg"),
        (0, "group", "Waves", "down", "Glass", False, "waves"),
        (1, "wave", "Wave Front", None, None, False, "wf"),
        (1, "wave", "Wave Back", None, None, False, "wb"),
        (0, "group", "Sun", "down", "Glass", False, "sungrp"),
        (1, "sun", "Sun", None, None, False, "sun"),
        (1, "sun", "Sun Glow", None, None, True, "glow"),
    ]
    y = y0 + 40
    for ind, kind, name, chev, bdg, off, key in rows:
        if key == selected:
            o.append(rect(8, y, SIDEBAR - 16, 32, D["selected"], rx=6))
        elif key == "wf":
            o.append(rect(8, y, SIDEBAR - 16, 32, D["hover"], rx=6))
        x = 16 + ind * 16
        if chev == "down":
            o.append(chevron_down(x, y + 14, D["t2"]))
        x += 14
        o.append(thumb(x, y + 2, "default", kind))
        nc = D["t3"] if off else D["t1"]
        o.append(text(x + 38, y + 21, name, 12, nc, 600 if kind == "group" else 400))
        if bdg:
            o.append(badge(SIDEBAR - 20 - (len(bdg) * 6 + 10), y + 8, bdg, D["accent"] if bdg == "Glass" else D["t2"]))
        if key == "wf" or off:
            o.append(eye(SIDEBAR - 36, y + 16, D["t2"], off))
        y += 34
        if key == "bg":
            o.append(line(16, y + 2, SIDEBAR - 16, y + 2, D["sep"]))
            y += 6
    # bottom actions
    by = H - SB - 40
    o.append(line(0, by - 0.5, SIDEBAR, by - 0.5, D["sep"]))
    for i, g in enumerate(["+", "−"]):
        o.append(text(24 + i * 28, by + 25, g, 18, D["t2"], 400, "middle"))
    o.append(f'<path d="M84,{by + 13} h7 l2,2 h9 v10 h-18 Z" fill="none" stroke="{D["t2"]}" stroke-width="1.3"/>')
    o.append(text(SIDEBAR - 16, by + 24, "2 groups · 4 layers", 11, D["t3"], anchor="end"))
    return "".join(o)


def slider(x, y, w, v, t=D):
    o = [rect(x, y - 2, w, 4, t["control"], rx=2), rect(x, y - 2, w * v, 4, t["accent"], rx=2),
         f'<circle cx="{x + w * v}" cy="{y}" r="7" fill="#F4F4F6" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5))"/>']
    return "".join(o)


def numfield(x, y, s, w=56, t=D):
    return rect(x, y, w, 22, t["control"], rx=5) + text(x + w - 8, y + 15, s, 12, t["t1"], anchor="end", family=MONO)


def toggle(x, y, on, t=D):
    o = rect(x, y, 26, 16, t["accent"] if on else t["control"], rx=8)
    cx = x + 18 if on else x + 8
    return o + f'<circle cx="{cx}" cy="{y + 8}" r="6" fill="#fff"/>'


def select(x, y, w, s, t=D):
    return (rect(x, y, w, 22, t["control"], rx=5) + text(x + 10, y + 15, s, 12, t["t1"])
            + chevron_down(x + w - 18, y + 9, t["t2"]))


def inspector():
    x0 = W - INSPECTOR
    o = [rect(x0, TB, INSPECTOR, H - TB - SB, D["sidebar"]), line(x0 + 0.5, TB, x0 + 0.5, H - SB, D["sep"])]
    o.append(segmented(x0 + 16, TB + 14, ["Document", "Group", "Layer"], 1, 89.3))
    # scope
    sy = TB + 52
    o.append(text(x0 + 16, sy + 15, "Applies to", 12, D["t2"]))
    o.append(segmented(x0 + 112, sy, ["All", "Current"], 0, 86, h=22, size=11))
    o.append(line(x0, sy + 36, W, sy + 36, D["sep"]))
    lx, cx = x0 + 16, x0 + 112
    y = sy + 62

    def section(title, y):
        return (text(lx, y, title, 13, D["t1"], 600) + chevron_down(W - 30, y - 8, D["t2"]))

    def label(s, y, ov=False):
        r = text(lx + (12 if ov else 0), y + 15, s, 12, D["t2"])
        if ov:
            r += f'<circle cx="{lx + 3}" cy="{y + 11}" r="3" fill="{D["override"]}"/>'
        return r

    o.append(section("Liquid Glass", y)); y += 16
    o.append(label("Glass", y) + toggle(W - 42, y + 3, True)); y += 32
    o.append(label("Specular", y) + toggle(W - 42, y + 3, True)); y += 32
    o.append(label("Translucency", y, ov=True) + slider(cx, y + 11, 112, 0.5) + numfield(W - 72, y, "0.50")); y += 32
    o.append(label("Blur", y) + slider(cx, y + 11, 112, 0.3) + numfield(W - 72, y, "0.30")); y += 32
    o.append(label("Lighting", y) + segmented(cx, y, ["Combined", "Individual"], 0, 86, h=22, size=11)); y += 40
    o.append(line(x0 + 16, y - 8, W - 16, y - 8, D["sep"])); y += 18

    o.append(section("Shadow", y)); y += 16
    o.append(label("Kind", y) + select(cx, y, 172, "Neutral")); y += 32
    o.append(label("Opacity", y) + slider(cx, y + 11, 112, 0.6) + numfield(W - 72, y, "0.60")); y += 40
    o.append(line(x0 + 16, y - 8, W - 16, y - 8, D["sep"])); y += 18

    o.append(section("Compositing", y)); y += 16
    o.append(label("Opacity", y) + slider(cx, y + 11, 112, 1.0) + numfield(W - 72, y, "100%")); y += 32
    o.append(label("Blend mode", y) + select(cx, y, 172, "Normal")); y += 40
    o.append(line(x0 + 16, y - 8, W - 16, y - 8, D["sep"])); y += 18

    o.append(section("Position", y)); y += 16
    o.append(label("Scale", y) + numfield(cx, y, "100%", 172)); y += 32
    o.append(label("Offset", y) + rect(cx, y, 82, 22, D["control"], rx=5) + text(cx + 8, y + 15, "X", 11, D["t3"])
             + text(cx + 74, y + 15, "0", 12, D["t1"], anchor="end", family=MONO)
             + rect(cx + 90, y, 82, 22, D["control"], rx=5) + text(cx + 98, y + 15, "Y", 11, D["t3"])
             + text(cx + 164, y + 15, "−12", 12, D["t1"], anchor="end", family=MONO))
    return "".join(o)


def canvas_edit():
    x0, x1 = SIDEBAR, W - INSPECTOR
    y0, y1 = TB, H - SB
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 - 18
    size = 420
    ix, iy = cx - size / 2, cy - size / 2
    o = [rect(x0, y0, x1 - x0, y1 - y0, D["canvas"])]
    # grid guides (template-like): outer square, inner square, concentric circles, diagonals
    g = 'stroke="rgba(255,255,255,0.07)" stroke-width="1" fill="none"'
    o.append(f'<g {g}><rect x="{ix}" y="{iy}" width="{size}" height="{size}"/>'
             f'<circle cx="{cx}" cy="{cy}" r="{size * 0.5}"/><circle cx="{cx}" cy="{cy}" r="{size * 0.31}"/>'
             f'<circle cx="{cx}" cy="{cy}" r="{size * 0.18}"/>'
             f'<line x1="{ix}" y1="{iy}" x2="{ix + size}" y2="{iy + size}"/><line x1="{ix + size}" y1="{iy}" x2="{ix}" y2="{iy + size}"/>'
             f'<line x1="{cx}" y1="{iy - 30}" x2="{cx}" y2="{iy + size + 30}"/><line x1="{ix - 30}" y1="{cy}" x2="{ix + size + 30}" y2="{cy}"/></g>')
    o.append(icon_use("default", ix, iy, size))
    # light handle ring
    R = size / 2 * 1.414 + 24
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-dasharray="2 6"/>')
    a = math.radians(-135)
    hx, hy = cx + R * math.cos(a), cy + R * math.sin(a)
    o.append(f'<line x1="{cx}" y1="{cy}" x2="{hx}" y2="{hy}" stroke="rgba(255,214,110,0.25)" stroke-dasharray="3 5"/>')
    o.append(f'<circle cx="{hx}" cy="{hy}" r="12" fill="{D["elevated"]}" stroke="rgba(255,255,255,0.18)"/>')
    sun = "".join(f'<line x1="{hx + 6 * math.cos(t)}" y1="{hy + 6 * math.sin(t)}" x2="{hx + 9 * math.cos(t)}" y2="{hy + 9 * math.sin(t)}" '
                  f'stroke="#FFD76E" stroke-width="1.4" stroke-linecap="round"/>'
                  for t in [i * math.pi / 4 for i in range(8)])
    o.append(f'<circle cx="{hx}" cy="{hy}" r="3.5" fill="#FFD76E"/>' + sun)
    o.append(text(hx - 18, hy + 4, "Light −45°", 11, D["t3"], anchor="end", family=MONO))
    # HUD appearance pill
    labels = [v[0] for v in APPEARANCES.values()]
    widths = [64, 46, 82, 76, 88, 82]
    pw = sum(widths) + 8
    px, py = cx - pw / 2, y1 - 92
    o.append(rect(px, py, pw, 36, "rgba(44,44,47,0.86)", rx=18, stroke="rgba(255,255,255,0.08)",
                  extra='style="filter:drop-shadow(0 8px 20px rgba(0,0,0,0.45))"'))
    xx = px + 4
    for i, (lab, w) in enumerate(zip(labels, widths)):
        if i == 0:
            o.append(rect(xx, py + 4, w, 28, "rgba(255,255,255,0.14)", rx=14))
        o.append(text(xx + w / 2, py + 22, lab, 12, D["t1"] if i == 0 else D["t2"], 500 if i == 0 else 400, "middle"))
        xx += w
    # bottom-left: mask + approx label
    o.append(segmented(x0 + 16, y1 - 40, ["Squircle", "Circle"], 0, 70, h=22, size=11))
    o.append(text(x0 + 182, y1 - 25, "Approximate preview", 11, D["t3"]))
    o.append(f'<circle cx="{x0 + 172}" cy="{y1 - 29}" r="3" fill="{D["t3"]}"/>')
    # bottom-right zoom
    zx = x1 - 128
    o.append(rect(zx, y1 - 40, 112, 22, D["control"], rx=5))
    o.append(text(zx + 14, y1 - 24, "−", 13, D["t2"], anchor="middle") + text(zx + 56, y1 - 25, "Fit · 41%", 11, D["t1"], anchor="middle", family=MONO)
             + text(zx + 98, y1 - 24, "+", 13, D["t2"], anchor="middle"))
    # top-left of canvas: canvas meta
    o.append(text(x0 + 16, y0 + 26, "iOS · iPadOS · macOS", 11, D["t3"]))
    o.append(text(x1 - 16, y0 + 26, "Grid", 11, D["t2"], anchor="end"))
    o.append(toggle(x1 - 76, y0 + 15, True))
    return "".join(o)


# ---------------------------------------------------------------- screens
def screen_editor():
    body = ["<defs>", icon_defs(), "</defs>",
            rect(0, 0, W, H, D["window"], rx=12),
            f'<g clip-path="url(#win)">',
            canvas_edit(), sidebar(), inspector(),
            toolbar("Sample", 0, "Default"),
            statusbar("1024 × 1024 · Display P3 · Squares: shared",
                      [("No issues", D["ok"], "ok"), ("actool: not available", None, None)]),
            "</g>"]
    body.insert(3, f'<defs><clipPath id="win"><rect width="{W}" height="{H}" rx="12"/></clipPath></defs>')
    return svg(W, H, "\n".join(body), "fresnel — Editor (dark)")


def screen_compare():
    o = ["<defs>", icon_defs(),
         f'<clipPath id="win"><rect width="{W}" height="{H}" rx="12"/></clipPath>',
         '<linearGradient id="wpL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#DCE6F5"/><stop offset="1" stop-color="#F3E9E1"/></linearGradient>',
         '<linearGradient id="wpD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B2033"/><stop offset="1" stop-color="#0B0C10"/></linearGradient>',
         "</defs>",
         rect(0, 0, W, H, D["window"], rx=12), '<g clip-path="url(#win)">',
         rect(0, TB, W, H - TB - SB, D["canvas"])]
    # options bar
    oy = TB + 16
    o.append(text(24, oy + 15, "Wallpaper", 12, D["t2"]))
    o.append(segmented(96, oy, ["Auto", "Light", "Dark", "Photo"], 0, 60, h=22, size=11))
    o.append(text(372, oy + 15, "Tint", 12, D["t2"]))
    o.append(f'<circle cx="{412}" cy="{oy + 11}" r="8" fill="#3FA7A0" stroke="rgba(255,255,255,0.3)"/>')
    o.append(text(424, oy + 15, "#3FA7A0", 11, D["t2"], family=MONO))
    o.append(text(524, oy + 15, "Sizes", 12, D["t2"]))
    sx = 566
    for s, on in [("1024", True), ("128", True), ("64", True), ("32", True), ("16", True)]:
        w = len(s) * 7 + 16
        o.append(rect(sx, oy, w, 22, "rgba(91,140,255,0.22)" if on else D["control"], rx=11)
                 + text(sx + w / 2, oy + 15, s, 11, D["accent_h"] if on else D["t2"], 500, "middle", family=MONO))
        sx += w + 6
    o.append(text(W - 24, oy + 15, "Approximate preview — final rendering is done by the system", 11, D["t3"], anchor="end"))
    # grid 2 cols (light | dark) x 3 rows (default / clear / tinted)
    gx, gy = 24, TB + 56
    cols, rows = 2, 3
    gap = 16
    tw = (W - 2 * gx - gap * (cols - 1)) / cols
    th = (H - SB - gy - 20 - gap * (rows - 1)) / rows
    keys = list(APPEARANCES.keys())
    order = ["default", "dark", "clear-light", "clear-dark", "tinted-light", "tinted-dark"]
    for i, k in enumerate(order):
        c, r = i % cols, i // cols
        x, y = gx + c * (tw + gap), gy + r * (th + gap)
        lab, *_, wp = APPEARANCES[k]
        dark = wp == "dark"
        o.append(f'<rect x="{x}" y="{y}" width="{tw}" height="{th}" rx="12" fill="url(#{"wpD" if dark else "wpL"})" stroke="rgba(255,255,255,0.06)"/>')
        tc = "#F2F2F5" if dark else "#1C1C1E"
        t2 = "rgba(242,242,245,0.6)" if dark else "rgba(28,28,30,0.55)"
        o.append(text(x + 16, y + 26, lab, 13, tc, 600))
        o.append(text(x + tw - 16, y + 26, "⌥" + str(keys.index(k) + 1), 11, t2, anchor="end", family=MONO))
        big = 150
        base = y + 40 + big
        sx = x + 32
        for s, lab_s in [(big, "1024"), (128, "128"), (64, "64"), (32, "32"), (16, "16")]:
            o.append(icon_use(k, sx, base - s, s, shadow=s >= 64))
            o.append(text(sx + s / 2, base + 18, lab_s + (" (fit)" if s == big else ""), 10, t2, anchor="middle", family=MONO))
            sx += s + 40
        if k == "tinted-light":
            o.append(rect(x + tw - 196, y + 12, 152, 22, "rgba(255,176,32,0.18)", rx=11)
                     + f'<path d="M{x + tw - 184},{y + 29} l6,-11 l6,11 Z" fill="{D["warn"]}"/>'
                     + text(x + tw - 168, y + 27, "Not customized (V-08)", 10, "#8A5A00", 600))
    o.append(toolbar("Sample", 1, "All appearances"))
    o.append(statusbar("Compare · 6 appearances × 5 sizes",
                       [("1 warning", D["warn"], None), ("actool: not available", None, None)]))
    o.append("</g>")
    return svg(W, H, "\n".join(o), "fresnel — Compare (dark)")


def check(x, y, on, disabled=False):
    if disabled:
        return rect(x, y, 16, 16, "none", rx=4, stroke=D["t3"], sw=1.2, extra='stroke-opacity="0.5"')
    if on:
        return rect(x, y, 16, 16, D["accent"], rx=4) + \
            f'<path d="M{x + 4},{y + 8.5} l3,3 l5,-6.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    return rect(x, y, 16, 16, "none", rx=4, stroke=D["t2"], sw=1.2)


def screen_export():
    # base: editor, dimmed
    base = screen_editor()
    inner = base.split("\n", 2)[2].rsplit("</svg>", 1)[0]
    sw_, sx = 600, (W - 600) / 2
    sy = TB
    o = [inner, rect(0, 0, W, H, "rgba(0,0,0,0.42)", rx=12)]
    sh = 664
    o.append(rect(sx, sy, sw_, sh, D["elevated"], rx=14, stroke="rgba(255,255,255,0.08)",
                  extra='style="filter:drop-shadow(0 18px 40px rgba(0,0,0,0.55))"'))
    x = sx + 28
    y = sy + 44
    o.append(icon_use("default", x, y - 28, 40, shadow=False))
    o.append(text(x + 54, y - 6, "Export “Sample”", 20, D["t1"], 600))
    o.append(text(x + 54, y + 14, "4 layers · 2 groups · 6 appearances", 12, D["t2"]))
    y += 48
    o.append(text(x, y, "FORMATS", 11, D["t3"], 600, extra='letter-spacing="0.6"'))
    y += 14
    fmts = [
        (True, False, ".icon bundle", "Editable source for Icon Composer and Xcode 26+"),
        (True, False, "macOS .icns", "16–1024 px, approximate glass baked in"),
        (False, False, "AppIcon.appiconset", "1024 px with Dark and Tinted variants"),
        (True, False, "PNG set", "1024, 512, 256, 128, 64, 32, 16 × selected appearances"),
        (False, True, "Assets.car", "Requires macOS with Xcode 26 or later"),
    ]
    for on, dis, name, desc in fmts:
        o.append(rect(x, y, sw_ - 56, 48, "rgba(255,255,255,0.03)" if not dis else "none", rx=8,
                      stroke="rgba(255,255,255,0.06)"))
        o.append(check(x + 14, y + 16, on, dis))
        nc = D["t3"] if dis else D["t1"]
        o.append(text(x + 42, y + 21, name, 13, nc, 600))
        o.append(text(x + 42, y + 38, desc, 11, D["t3"] if dis else D["t2"]))
        if name == "PNG set":
            o.append(select(x + sw_ - 56 - 150, y + 13, 136, "All appearances"))
        if dis:
            o.append(text(x + sw_ - 70, y + 29, "Unavailable", 11, D["t3"], anchor="end"))
        y += 56
    y += 10
    o.append(text(x, y, "PLATFORMS", 11, D["t3"], 600, extra='letter-spacing="0.6"'))
    y += 12
    px = x
    for on, lab in [(True, "iOS / iPadOS"), (True, "macOS"), (False, "watchOS")]:
        o.append(check(px, y, on) + text(px + 24, y + 13, lab, 12, D["t1"]))
        px += 140
    y += 40
    o.append(text(x, y, "VALIDATION", 11, D["t3"], 600, extra='letter-spacing="0.6"'))
    y += 12
    o.append(rect(x, y, sw_ - 56, 92, "rgba(255,255,255,0.03)", rx=8, stroke="rgba(255,255,255,0.06)"))
    o.append(f'<circle cx="{x + 22}" cy="{y + 22}" r="7" fill="{D["ok"]}"/>'
             f'<path d="M{x + 18.5},{y + 22} l2.5,2.5 l4.5,-5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>')
    o.append(text(x + 38, y + 26, "7 checks passed", 12, D["t1"]))
    o.append(text(x + sw_ - 70, y + 26, "Show all", 12, D["accent_h"], anchor="end"))
    o.append(line(x + 14, y + 44, x + sw_ - 70, y + 44, D["sep"]))
    o.append(f'<path d="M{x + 15},{y + 75} l7,-13 l7,13 Z" fill="{D["warn"]}"/>'
             + text(x + 22, y + 73, "!", 9, "#000", 700, "middle"))
    o.append(text(x + 38, y + 66, "Tinted appearance isn’t customized", 12, D["t1"], 500))
    o.append(text(x + 38, y + 82, "The system will generate it. Review it in Compare (⌘2).", 11, D["t2"]))
    y += 112
    o.append(text(x, y, "SAVE TO", 11, D["t3"], 600, extra='letter-spacing="0.6"'))
    y += 12
    o.append(rect(x, y, sw_ - 56 - 104, 26, D["control"], rx=6)
             + text(x + 10, y + 17, "~/Desktop/Sample Export", 12, D["t1"], family=MONO))
    o.append(rect(x + sw_ - 56 - 94, y, 94, 26, D["control"], rx=6) + text(x + sw_ - 56 - 47, y + 17, "Choose…", 12, D["t1"], anchor="middle"))
    # footer
    fy = sy + sh - 52
    o.append(line(sx, fy - 0.5, sx + sw_, fy - 0.5, D["sep"]))
    o.append(text(x, fy + 30, "Reveal in Finder after export", 12, D["t2"]) )
    o.append(check(x + 186, fy + 18, True))
    o.append(rect(sx + sw_ - 216, fy + 13, 88, 28, D["control"], rx=6) + text(sx + sw_ - 172, fy + 31, "Cancel", 13, D["t1"], anchor="middle"))
    o.append(rect(sx + sw_ - 120, fy + 13, 92, 28, D["accent"], rx=6) + text(sx + sw_ - 74, fy + 31, "Export", 13, "#fff", 600, "middle"))
    return svg(W, H, "\n".join(o), "fresnel — Export sheet (dark)")


def screen_tokens():
    w, h = 1440, 1120
    o = ["<defs>", icon_defs(),
         '<linearGradient id="spectrum" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5B8CFF"/>'
         '<stop offset="0.5" stop-color="#9B6BFF"/><stop offset="1" stop-color="#FF7AB6"/></linearGradient>',
         "</defs>", rect(0, 0, w, h, "#111113")]
    o.append(text(48, 72, "fresnel — Design tokens", 28, D["t1"], 700))
    o.append(text(48, 100, "Source of truth: docs/HIG.md §A2 · packages/ui/tokens.css", 13, D["t2"]))

    def swatches(title, t, keys, x, y):
        r = [text(x, y, title, 13, D["t1"], 600)]
        y += 16
        for i, k in enumerate(keys):
            cx = x + (i % 6) * 104
            cy = y + (i // 6) * 92
            r.append(rect(cx, cy, 92, 52, t[k], rx=8, stroke="rgba(255,255,255,0.12)"))
            r.append(text(cx, cy + 68, k, 11, D["t1"], 500))
            r.append(text(cx, cy + 82, t[k], 10, D["t3"], family=MONO))
        return "".join(r)

    dk = ["window", "sidebar", "canvas", "elevated", "control", "sep", "t1", "t2", "t3", "accent", "override", "ok"]
    o.append(swatches("Color · Dark (default)", D, dk, 48, 150))
    lk = ["window", "sidebar", "canvas", "elevated", "control", "sep", "t1", "t2", "t3", "accent", "override"]
    o.append(swatches("Color · Light", L, lk, 48, 380))
    o.append(text(48, 610, "Brand spectrum (app icon / welcome only)", 13, D["t1"], 600))
    o.append(rect(48, 626, 600, 24, "url(#spectrum)", rx=12))
    # type
    tx = 760
    o.append(text(tx, 150, "Typography", 13, D["t1"], 600))
    ty = 190
    for role, sz, wt, sample in [("title", 20, 600, "Export “Sample”"), ("headline", 13, 600, "Liquid Glass"),
                                 ("body", 13, 400, "Drop SVG or PNG layers here"), ("callout", 12, 400, "Translucency"),
                                 ("caption", 11, 400, "Approximate preview")]:
        o.append(text(tx, ty, role, 11, D["t3"], family=MONO))
        o.append(text(tx + 100, ty, sample, sz, D["t1"], wt))
        o.append(text(w - 48, ty, f"{sz}/{round(sz * 1.35)} · {wt}", 11, D["t3"], anchor="end", family=MONO))
        ty += 40
    o.append(text(tx, ty, "mono", 11, D["t3"], family=MONO) + text(tx + 100, ty, "display-p3:0.24,0.48,1.00,1.00", 12, D["t1"], family=MONO)
             + text(w - 48, ty, "12/16 · tabular", 11, D["t3"], anchor="end", family=MONO))
    # spacing
    sy = 470
    o.append(text(tx, sy, "Spacing (4pt grid) · Radius", 13, D["t1"], 600))
    sx = tx
    for s in [4, 8, 12, 16, 20, 24, 32]:
        o.append(rect(sx, sy + 20, s, s, D["accent"], rx=1) + text(sx + s / 2, sy + 72, str(s), 10, D["t3"], anchor="middle", family=MONO))
        sx += s + 30
    rx_ = tx + 360
    for r_, lab in [(6, "control"), (10, "popover"), (14, "sheet")]:
        o.append(rect(rx_, sy + 14, 48, 40, D["elevated"], rx=r_, stroke="rgba(255,255,255,0.12)")
                 + text(rx_ + 24, sy + 72, f"{lab} {r_}", 10, D["t3"], anchor="middle", family=MONO))
        rx_ += 76
    # controls
    cy = 620
    o.append(text(tx, cy - 6, "Controls", 13, D["t1"], 600))
    o.append(slider(tx, cy + 26, 160, 0.5) + numfield(tx + 176, cy + 15, "0.50"))
    o.append(toggle(tx + 260, cy + 18, True) + toggle(tx + 296, cy + 18, False))
    o.append(segmented(tx + 340, cy + 14, ["Combined", "Individual"], 0, 86, h=22, size=11))
    o.append(select(tx, cy + 56, 172, "Neutral"))
    o.append(rect(tx + 188, cy + 54, 96, 26, D["accent"], rx=6) + text(tx + 236, cy + 71, "Export…", 12, "#fff", 600, "middle"))
    o.append(rect(tx + 296, cy + 54, 80, 26, D["control"], rx=6) + text(tx + 336, cy + 71, "Cancel", 12, D["t1"], anchor="middle"))
    o.append(f'<circle cx="{tx + 396}" cy="{cy + 67}" r="3" fill="{D["override"]}"/>' + text(tx + 406, cy + 71, "Overridden for this appearance", 11, D["t2"]))
    o.append(rect(tx - 4, cy + 96, 180, 30, "none", rx=8, stroke=D["accent"], sw=2) + rect(tx, cy + 100, 172, 22, D["control"], rx=5)
             + text(tx + 196, cy + 116, "Focus ring 2px + 2px offset", 11, D["t2"]))
    # layout sample icons
    o.append(text(48, 790, "Sample icon (fictional) × 6 appearances", 13, D["t1"], 600))
    x = 48
    for k, v in APPEARANCES.items():
        o.append(rect(x, 806, 200, 250, "#1E2030" if v[-1] == "dark" else "#DDE4EE", rx=12))
        o.append(icon_use(k, x + 36, 834, 128))
        o.append(text(x + 100, 1006, v[0], 12, "#F2F2F5" if v[-1] == "dark" else "#1C1C1E", 600, "middle"))
        o.append(text(x + 100, 1024, k, 10, "#8E8E95", anchor="middle", family=MONO))
        x += 216
    o.append(text(48, 1092, "Sizes: toolbar 52 · statusbar 24 · sidebar 260 (220–360) · inspector 300 · row 28 · control 24/20 · window 1440×900 (min 1024×680)",
                  12, D["t2"], family=MONO))
    return svg(w, h, "\n".join(o), "fresnel — Design tokens")


def app_icon():
    """fresnel's own app icon: Fresnel-lens concentric facets in spectrum glass."""
    s = 1024
    c = 512
    rings = []
    for i, r in enumerate([360, 300, 244, 192, 144, 100, 60]):
        op = 0.22 + i * 0.07
        rings.append(f'<circle cx="{c}" cy="{c}" r="{r}" fill="url(#facet)" fill-opacity="{op:.2f}"/>')
        rings.append(f'<circle cx="{c}" cy="{c}" r="{r}" fill="none" stroke="url(#edge)" stroke-width="5" stroke-opacity="{0.55 + i * 0.05:.2f}"/>')
    body = f'''<defs>
  <clipPath id="sqA"><path d="{SQ}"/></clipPath>
  <linearGradient id="bgA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B1F3A"/><stop offset="1" stop-color="#07080F"/></linearGradient>
  <linearGradient id="facet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B8CFF"/><stop offset="0.55" stop-color="#9B6BFF"/><stop offset="1" stop-color="#FF7AB6"/></linearGradient>
  <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#fff" stop-opacity="0.6"/></linearGradient>
  <radialGradient id="core" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#C9D8FF"/></radialGradient>
  <linearGradient id="rimA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0.3"/></linearGradient>
  <filter id="glowA" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
</defs>
<g clip-path="url(#sqA)">
  <rect width="{s}" height="{s}" fill="url(#bgA)"/>
  <circle cx="{c}" cy="{c}" r="380" fill="#7A6BFF" opacity="0.35" filter="url(#glowA)"/>
  {''.join(rings)}
  <circle cx="{c}" cy="{c}" r="34" fill="url(#core)"/>
  <path d="M300,330 A260,260 0 0 1 560,256" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="12" stroke-linecap="round"/>
  <path d="{SQ}" fill="none" stroke="url(#rimA)" stroke-width="12"/>
</g>'''
    return svg(s, s, body, "fresnel app icon")


def main():
    files = {
        "00-tokens.svg": screen_tokens(),
        "01-editor.svg": screen_editor(),
        "02-compare.svg": screen_compare(),
        "03-export.svg": screen_export(),
        "app-icon.svg": app_icon(),
    }
    for name, content in files.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print("wrote", OUT / name)


if __name__ == "__main__":
    main()
