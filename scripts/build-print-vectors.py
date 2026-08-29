#!/usr/bin/env python3
"""
Rebuilds the vector print artwork from the PNG design assets.

    public/meishi-template.png  ->  public/meishi-template.pdf
    public/meishi-ribbon.png    ->  public/meishi-ribbon.pdf

`lib/print.ts` places these two PDFs as vector form XObjects instead of
baking the card into one raster, so the template line-art, the paw prints,
the ribbon and the Instagram mark print as shapes rather than as pixels.

The PNGs stay the source of truth for the design and keep driving the
on-screen preview; this script only re-expresses them as outlines. Ink is
separated by colour (brown paws / black line-art / the Instagram glyph's
gradient), the coverage map of each ink is upsampled 4x and traced with
potrace, and the resulting outlines are assembled into an SVG that cairosvg
turns into a single-page vector PDF.

Requirements: potrace, python3 -m pip install pillow numpy cairosvg
Run:          python3 scripts/build-print-vectors.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Intrinsic size of the design assets (TEMPLATE_PX in lib/meishi-layout.ts).
W, H = 1046, 1738

# Ink colours measured off the PNGs.
BROWN = (0x8B, 0x50, 0x22)  # paw prints + the small anicas mark
BLACK = (0x00, 0x00, 0x00)  # ribbon line-art and its baked caption

# Region of meishi-template.png holding the multi-coloured Instagram glyph,
# and the region holding the small anicas mark. Both are lifted out of the
# flat-ink layers and rebuilt separately.
IG_BOX = (69, 1464, 172, 1566)
MARK_BOX = (920, 1617, 951, 1653)

# Elliptical radial gradient fitted to the Instagram glyph's pixels
# (least squares over centre, aspect and rotation; mean error 6.7/255).
IG_GRADIENT = {"cx": 0.20, "cy": 1.12, "sy": 1.58, "rot": 2.468, "stops": 96}

# Trace resolution multiplier: the coverage map is enlarged this much before
# it is thresholded, so an outline lands within ~1/4 source pixel (~0.013 mm
# on the finished card) of the antialiased edge in the PNG.
UPSAMPLE = 4


# ------------------------------------------------------------------ #
# Ink separation
# ------------------------------------------------------------------ #

def coverage(rgb: np.ndarray, alpha: np.ndarray, ink) -> tuple[np.ndarray, np.ndarray]:
    """How much of `ink` each pixel carries, assuming ink-over-white.

    Returns (coverage 0..1, residual) — the residual says how far the pixel
    sits off the white->ink line, i.e. how badly that assumption fits, which
    is what tells a brown pixel apart from a black one.
    """
    white = np.array([255.0, 255.0, 255.0])
    d = np.array(ink, dtype=float) - white
    over = white + (rgb - white) * alpha[..., None]  # composite onto white
    t = ((over - white) @ d) / (d @ d)
    residual = np.linalg.norm(over - (white + t[..., None] * d), axis=-1)
    return t, residual


def load(name: str) -> tuple[np.ndarray, np.ndarray]:
    im = Image.open(PUBLIC / name).convert("RGBA")
    if im.size != (W, H):
        sys.exit(f"{name}: expected {W}x{H}, got {im.size}")
    a = np.array(im).astype(float)
    return a[..., :3], a[..., 3] / 255.0


# ------------------------------------------------------------------ #
# Tracing
# ------------------------------------------------------------------ #

def trace(mask: np.ndarray, name: str) -> tuple[str, list[str]]:
    """Bitmap mask -> (potrace's transform, its path data), in bitmap units."""
    big = Image.fromarray((mask * 255).astype(np.uint8), mode="L").resize(
        (W * UPSAMPLE, H * UPSAMPLE), Image.BICUBIC
    )
    # potrace treats BLACK as ink, so the mask is written inverted.
    bitmap = big.point(lambda v: 0 if v >= 128 else 255).convert("1")
    with tempfile.TemporaryDirectory() as tmp:
        pbm, svg = Path(tmp) / "in.pbm", Path(tmp) / "out.svg"
        bitmap.save(pbm)
        subprocess.run(
            ["potrace", "-b", "svg", "--flat", "--alphamax", "1",
             "--opttolerance", "0.2", "--turdsize", "2", "-o", str(svg), str(pbm)],
            check=True,
        )
        body = svg.read_text()
    group = re.search(r'<g transform="([^"]+)"', body)
    paths = re.findall(r'<path d="([^"]+)"', body)
    if not group or not paths:
        sys.exit(f"{name}: potrace produced no outlines")
    # potrace works in tenths of a bitmap pixel, y up; bring it back to the
    # design's own 1046 x 1738 pixel grid.
    return f"scale({1 / UPSAMPLE}) {group.group(1)}", paths


def layer(mask: np.ndarray, colour: str, name: str) -> str:
    if not mask.any():
        return ""
    transform, paths = trace(mask, name)
    return (
        f'<g transform="{transform}" fill="{colour}" stroke="none">'
        + "".join(f'<path d="{d}"/>' for d in paths)
        + "</g>"
    )


# ------------------------------------------------------------------ #
# The Instagram glyph
# ------------------------------------------------------------------ #

def instagram_layer(rgb: np.ndarray) -> str:
    """The Instagram glyph: traced outline, filled with its fitted gradient.

    The outline is used as a clip path and the gradient is painted through it,
    so the gradient can be described in the design's own pixel coordinates
    instead of potrace's flipped, tenth-of-a-pixel space.
    """
    x0, y0, x1, y1 = IG_BOX
    box = rgb[y0:y1, x0:x1]
    bw, bh = x1 - x0, y1 - y0

    shape = np.zeros((H, W), dtype=float)
    shape[y0:y1, x0:x1] = np.clip((255.0 - box.min(axis=2)) / 200.0, 0, 1)
    transform, paths = trace(shape >= 0.5, "instagram")
    clip = (
        '<clipPath id="igClip">'
        + "".join(f'<path transform="{transform}" d="{d}"/>' for d in paths)
        + "</clipPath>"
    )

    # Stops sampled straight off the PNG along the fitted gradient axis.
    solid = box.min(axis=2) < 140
    ys, xs = np.nonzero(solid)
    dx = xs / (bw - 1) - IG_GRADIENT["cx"]
    dy = ys / (bh - 1) - IG_GRADIENT["cy"]
    c, s_ = np.cos(IG_GRADIENT["rot"]), np.sin(IG_GRADIENT["rot"])
    u, v = dx * c + dy * s_, (-dx * s_ + dy * c) * IG_GRADIENT["sy"]
    radius = np.hypot(u, v)
    span = radius.max()
    n = IG_GRADIENT["stops"]
    bins = np.clip((radius / span * n).astype(int), 0, n - 1)
    colours = box[solid]
    stops, last = [], colours[bins == bins.min()].mean(axis=0)
    for b in range(n):
        m = bins == b
        last = colours[m].mean(axis=0) if m.any() else last
        stops.append(
            f'<stop offset="{b / (n - 1):.4f}" stop-color="'
            f"#{int(round(last[0])):02x}{int(round(last[1])):02x}{int(round(last[2])):02x}\"/>"
        )

    # Maps the fitted (u, v) gradient space back onto the design's pixels.
    tf = (
        f"translate({x0},{y0}) scale({bw - 1},{bh - 1}) "
        f"translate({IG_GRADIENT['cx']},{IG_GRADIENT['cy']}) "
        f"rotate({np.degrees(IG_GRADIENT['rot']):.4f}) scale(1,{1 / IG_GRADIENT['sy']:.6f})"
    )
    grad = (
        f'<radialGradient id="igGradient" gradientUnits="userSpaceOnUse" '
        f'cx="0" cy="0" r="{span:.6f}" gradientTransform="{tf}">'
        + "".join(stops)
        + "</radialGradient>"
    )
    return (
        f"<defs>{clip}{grad}</defs>"
        f'<g clip-path="url(#igClip)"><rect x="{x0 - 4}" y="{y0 - 4}" '
        f'width="{bw + 8}" height="{bh + 8}" fill="url(#igGradient)"/></g>'
    )


# ------------------------------------------------------------------ #
# The small anicas mark
# ------------------------------------------------------------------ #

def mark_layer() -> str:
    """The bottom-right anicas mark, traced from the 500x500 master.

    meishi-template.png only holds it at ~27 px, which traces into a lumpy
    outline. public/anicas_logo_br_square.png is the same mark as a clean
    single-colour master, so it is traced instead and fitted onto the exact
    rectangle the mark occupies in the template.
    """
    logo = np.array(Image.open(PUBLIC / "anicas_logo_br_square.png").convert("RGBA"))
    alpha = logo[..., 3] / 255.0
    ys, xs = np.nonzero(alpha >= 0.5)
    src = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

    canvas = np.zeros((H, W), dtype=float)
    fitted = Image.fromarray((alpha * 255).astype(np.uint8), "L").crop(src)
    canvas[: fitted.height, : fitted.width] = np.array(fitted) / 255.0
    transform, paths = trace(canvas >= 0.5, "anicas mark")

    mx0, my0, mx1, my1 = MARK_BOX
    sx = (mx1 - mx0) / (src[2] - src[0])
    sy = (my1 - my0) / (src[3] - src[1])
    return (
        f'<g transform="translate({mx0},{my0}) scale({sx:.6f},{sy:.6f}) {transform}" '
        f'fill="{hexc(BROWN)}" stroke="none">'
        + "".join(f'<path d="{d}"/>' for d in paths)
        + "</g>"
    )


def hexc(c) -> str:
    return "#%02x%02x%02x" % tuple(c)


# ------------------------------------------------------------------ #
# Assembly
# ------------------------------------------------------------------ #

def svg_document(body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}">{body}</svg>'
    )


def to_pdf(svg: str, out: Path) -> None:
    import cairosvg

    cairosvg.svg2pdf(bytestring=svg.encode(), write_to=str(out))
    print(f"  wrote {out.relative_to(ROOT)}  ({out.stat().st_size:,} bytes)")


def build_template() -> None:
    print("meishi-template.png")
    rgb, alpha = load("meishi-template.png")
    t_brown, r_brown = coverage(rgb, alpha, BROWN)
    t_black, r_black = coverage(rgb, alpha, BLACK)

    ignore = np.zeros((H, W), dtype=bool)
    for x0, y0, x1, y1 in (IG_BOX, MARK_BOX):
        ignore[y0:y1, x0:x1] = True

    brown = (t_brown >= 0.5) & (r_brown < r_black) & ~ignore
    black = (t_black >= 0.5) & (r_black <= r_brown) & ~ignore

    body = (
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/>'
        + layer(brown, hexc(BROWN), "paw prints")
        + mark_layer()
        + layer(black, hexc(BLACK), "line-art")
        + instagram_layer(rgb)
    )
    to_pdf(svg_document(body), PUBLIC / "meishi-template.pdf")


def build_ribbon() -> None:
    print("meishi-ribbon.png")
    rgb, alpha = load("meishi-ribbon.png")
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722])
    black = alpha * (1.0 - luma / 255.0) >= 0.5
    body = (
        layer(alpha >= 0.5, "#FFFFFF", "ribbon band")
        + layer(black, hexc(BLACK), "ribbon line-art")
    )
    to_pdf(svg_document(body), PUBLIC / "meishi-ribbon.pdf")


if __name__ == "__main__":
    build_template()
    build_ribbon()
    print(json.dumps({"upsample": UPSAMPLE, "ig_gradient": IG_GRADIENT}, indent=None))
