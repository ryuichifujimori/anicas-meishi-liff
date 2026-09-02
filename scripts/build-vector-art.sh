#!/usr/bin/env bash
# Rebuilds lib/vector-art.ts — where each piece of LINE WORK goes on the card.
#
# Some of the design is drawn into the print file as paths rather than as
# pixels: the ribbon and its "anicas 所属タレント" caption today, more parts
# later. Each of them is an Illustrator export carrying nothing but paths, and
# each REPLACES a picture the card used to place — so the one thing that has to
# be got right is that the line work lands exactly where those pixels landed.
#
# It cannot simply be assumed. The exports come off the original artboard at
# the design's own size, but the pictures they replace were exported at a size
# of their own and the card stretches them to fit it; the ribbon's PNG turns
# out to be ~1% off. So the placement is MEASURED here rather than declared:
#
#   the picture       is read on the card's own pixel grid (the template's
#                     1046 × 1738), ink weighted by how black and how opaque
#                     each pixel is
#   the line work     is rendered far finer and area-averaged down onto that
#                     same grid, for a candidate placement
#   the placement     is whatever makes the two agree — four numbers (a scale
#                     and an offset per axis) fitted by least squares
#
# The answer is then CHECKED the other way round, by matching up the ink edges
# of the two along every few rows and columns and measuring how far apart they
# sit. That is what the fit figures in the generated file are, and the script
# refuses to write anything that does not meet them.
#
# Nothing reads the artwork at run time; re-run this whenever one of these
# files, or the picture it replaces, changes.
#
# Requires: python3 -m pip install pillow pymupdf numpy scipy
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import pathlib
import numpy as np
import pymupdf
from PIL import Image
from scipy.ndimage import binary_dilation
from scipy.optimize import minimize

OUT = pathlib.Path("lib/vector-art.ts")
PT = 72 / 25.4

# The card's trimmed size and the template's pixel grid — restated from
# lib/meishi-layout.ts, which is where they belong; this script only needs them
# to say the answer in the same fractions that file states everything else in.
CARD_MM = (55.0, 91.0)

# One entry per piece of line work: the file, the picture it replaces, and the
# picture the card lays down UNDERNEATH it — which carries this same part baked
# into it, and has to be cleared out of the way before the line work goes down.
PARTS = [
    dict(key="ribbon",
         vector="public/ribbon_only.pdf",
         raster="public/meishi-ribbon.png",
         beneath="public/meishi-template.png",
         note="the ribbon and its anicas 所属タレント caption"),
]

# How far past the picture's own ink the clearing goes, in card pixels. Enough
# that no edge of it can survive at the boundary; the script checks that the
# card has nothing else in there to lose.
CLEAR_PAD = 2

# How far the line work may land from the picture it replaces, in micrometres.
# The picture is only ~19 px/mm, so one of its pixels is already 53 um: a fit
# this side of the limits is inside the grain of the thing being matched.
LIMIT_P99, LIMIT_RMS = 60.0, 30.0

# Rendering the line work this many times finer than the card's pixel grid,
# then averaging down, is what lets a fit be judged on a fraction of a pixel.
SUPERSAMPLE = 8.0


def raster_ink(path):
    """The picture's ink on the card's own grid: 0 = paper, 1 = solid black."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    alpha = np.asarray(im.split()[3], dtype=np.float64) / 255.0
    rgb = np.asarray(im.convert("RGB"), dtype=np.float64) / 255.0
    return (1.0 - rgb.min(axis=2)) * alpha, w, h


def vector_page(path):
    doc = pymupdf.open(path)
    if doc.page_count != 1:
        raise SystemExit(f"{path}: expected one page, found {doc.page_count}")
    return doc, doc[0]


def assert_drawable(doc, page, path):
    """Nothing may be hiding in the file that the print PDF cannot carry."""
    if page.get_images(full=True):
        raise SystemExit(f"{path}: carries a bitmap — it is not line work")
    if page.get_text().strip():
        raise SystemExit(f"{path}: carries live text; the caption must be outlined")

    # The file is embedded into the print PDF as a form XObject, which takes the
    # page's marked content but NOT the document-level switchboard saying which
    # of its layers are turned off. Everything that is off therefore has to be
    # empty, or it would come back visible in the print file.
    props = page.parent.xref_get_key(page.xref, "Resources/Properties")
    oc = doc.xref_get_key(doc.pdf_catalog(), "OCProperties/D/OFF")
    if oc[0] == "null":
        return
    off = set(oc[1].strip("[]").split(" 0 R"))
    off = {x.strip() for x in off if x.strip()}
    if not off or props[0] != "dict":
        return
    body = page.read_contents().decode("latin-1")
    for entry in props[1].strip("<>").split("/")[1:]:
        name, _, ref = entry.strip().partition(" ")
        if ref.split()[0] not in off:
            continue
        for chunk in body.split(f"/OC /{name} BDC")[1:]:
            if chunk.split("EMC")[0].strip():
                raise SystemExit(
                    f"{path}: layer /{name} is switched off but has ink in it")


def clearing(part):
    """The box that has to be wiped to paper before the line work goes down.

    The card lays a picture down first that has this very part baked into it,
    and the line work lands within a pixel of those pixels — near enough that
    an edge of them shows alongside, which would put back the staircase the
    line work is here to take away. Clearing the box the part occupies leaves
    the line work as the only one of it on the page.

    It is only safe if the picture underneath has nothing ELSE inside that box,
    since the box goes down before the photo and takes everything with it. So
    that is checked rather than assumed."""
    ink = np.asarray(Image.open(part["raster"]).convert("RGBA").split()[3]) > 0
    h, w = ink.shape
    ys, xs = np.nonzero(ink)
    x0, x1 = max(0, xs.min() - CLEAR_PAD), min(w, xs.max() + 1 + CLEAR_PAD)
    y0, y1 = max(0, ys.min() - CLEAR_PAD), min(h, ys.max() + 1 + CLEAR_PAD)

    under = np.asarray(Image.open(part["beneath"]).convert("L")).astype(int)
    if under.shape != ink.shape:
        raise SystemExit(f"{part['beneath']}: not on the same grid as "
                         f"{part['raster']}")
    stray = (under[y0:y1, x0:x1] < 250) & ~binary_dilation(
        ink[y0:y1, x0:x1], iterations=CLEAR_PAD)
    if stray.any():
        sy, sx = np.nonzero(stray)
        raise SystemExit(
            f"{part['key']}: {part['beneath']} has {int(stray.sum())} ink "
            f"pixels inside the box that are not part of it — first at "
            f"({int(sx[0]) + x0}, {int(sy[0]) + y0}); clearing it would lose them")

    return dict(x=x0 / w, y=y0 / h, width=(x1 - x0) / w, height=(y1 - y0) / h)


def fit_placement(part):
    """The four numbers that lay the line work over the picture it replaces."""
    tgt_full, W, H = raster_ink(part["raster"])
    doc, page = vector_page(part["vector"])
    assert_drawable(doc, page, part["vector"])

    # Only the neighbourhood of the ink is worth fitting on, plus a margin so
    # a badly-placed candidate is still penalised for what it puts outside.
    ys, xs = np.nonzero(tgt_full > 0)
    pad = 32
    X0, X1 = max(0, xs.min() - pad), min(W, xs.max() + 1 + pad)
    Y0, Y1 = max(0, ys.min() - pad), min(H, ys.max() + 1 + pad)
    tgt = tgt_full[Y0:Y1, X0:X1]

    # The line work, rendered once, far finer than the grid it is judged on.
    box = pymupdf.Rect(page.rect)
    for drawing in page.get_drawings():
        box = drawing["rect"] if box == page.rect else (box | drawing["rect"])
    box = pymupdf.Rect(box.x0 - 6, box.y0 - 6, box.x1 + 6, box.y1 + 6)
    fine = SUPERSAMPLE * W / (CARD_MM[0] * PT)          # fine px per point
    pm = page.get_pixmap(matrix=pymupdf.Matrix(fine, fine), clip=box, alpha=False)
    hi = 1.0 - (np.frombuffer(pm.samples, dtype=np.uint8)
                .reshape(pm.height, pm.width, pm.n)
                .astype(np.float64).min(axis=2) / 255.0)
    # Summed-area table, so any box average is four lookups.
    sat = np.zeros((hi.shape[0] + 1, hi.shape[1] + 1))
    sat[1:, 1:] = hi.cumsum(0).cumsum(1)

    def render(p):
        """The line work on the card's grid: card px = scale * point + offset."""
        sx, tx, sy, ty = p
        hx = np.clip(((np.arange(X0, X1 + 1.0) - tx) / sx - box.x0) * fine,
                     0, hi.shape[1])
        hy = np.clip(((np.arange(Y0, Y1 + 1.0) - ty) / sy - box.y0) * fine,
                     0, hi.shape[0])
        iy = np.clip(np.floor(hy).astype(int), 0, sat.shape[0] - 2)
        ix = np.clip(np.floor(hx).astype(int), 0, sat.shape[1] - 2)
        fy, fx = (hy - iy)[:, None], (hx - ix)[None, :]
        s = (sat[np.ix_(iy, ix)] * (1 - fy) * (1 - fx)
             + sat[np.ix_(iy, ix + 1)] * (1 - fy) * fx
             + sat[np.ix_(iy + 1, ix)] * fy * (1 - fx)
             + sat[np.ix_(iy + 1, ix + 1)] * fy * fx)
        area = np.maximum(np.diff(hy)[:, None] * np.diff(hx)[None, :], 1e-9)
        return (s[1:, 1:] - s[:-1, 1:] - s[1:, :-1] + s[:-1, :-1]) / area

    cost = lambda p: float(((render(p) - tgt) ** 2).mean())

    # Start from the plainest reading of the export — the trimmed card, centred
    # on the artboard — and from a per-cent either side of it, since that is the
    # order of the error the pictures turn out to carry.
    best = None
    cw, ch = CARD_MM[0] * PT, CARD_MM[1] * PT
    for jx in (0.99, 1.0, 1.01):
        for jy in (0.99, 1.0, 1.01):
            sx, sy = W / cw * jx, H / ch * jy
            start = np.array([sx, -sx * (page.rect.width - cw) / 2,
                              sy, -sy * (page.rect.height - ch) / 2])
            r = minimize(cost, start, method="Nelder-Mead",
                         options=dict(xatol=1e-8, fatol=1e-14,
                                      maxiter=40000, maxfev=40000))
            r = minimize(cost, r.x, method="Powell",
                         options=dict(xtol=1e-10, ftol=1e-14,
                                      maxiter=40000, maxfev=40000))
            if best is None or r.fun < best.fun:
                best = r
    return best, render(best.x), tgt, (X0, Y0), (W, H), page


def edge_centres(profile, floor=0.5):
    """Where each stripe of ink sits along one row or column, sub-pixel."""
    lit = profile > floor
    out, i = [], 0
    while i < len(lit):
        if not lit[i]:
            i += 1
            continue
        j = i
        while j < len(lit) and lit[j]:
            j += 1
        lo, hi = max(0, i - 2), min(len(profile), j + 2)
        w = profile[lo:hi]
        out.append(float((w * (np.arange(lo, hi) + 0.5)).sum() / w.sum()))
        i = j
    return out


def residuals(got, want, um_per_px, axis):
    """How far apart the two sit, stripe by stripe, in micrometres.

    Stripes are paired by position rather than by order: where a pair of edges
    all but touch, the picture can merge them into one run and the line work
    not, and pairing those off in order would report a distance between two
    edges that are not the same edge."""
    out, dropped = [], 0
    n = want.shape[1] if axis == "y" else want.shape[0]
    for k in range(2, n - 2, 3):
        a = edge_centres(want[:, k] if axis == "y" else want[k, :])
        b = edge_centres(got[:, k] if axis == "y" else got[k, :])
        for u in a:
            near = [v for v in b if abs(v - u) < 3.0]
            if near:
                out.append(min(near, key=lambda v: abs(v - u)) - u)
            else:
                dropped += 1
    return np.abs(np.array(out)) * um_per_px, dropped


entries, report = [], []
for part in PARTS:
    best, got, tgt, (X0, Y0), (W, H), page = fit_placement(part)
    sx, tx, sy, ty = best.x

    # The card is scaled to COVER the trim, so it is a touch taller than 91 mm;
    # lib/print.ts does the same sum. Only the height is affected.
    card_h_mm = CARD_MM[0] * H / W
    um_x, um_y = CARD_MM[0] / W * 1000, card_h_mm / H * 1000
    dx, drop_x = residuals(got, tgt, um_x, "x")
    dy, drop_y = residuals(got, tgt, um_y, "y")
    d = np.concatenate([dx, dy])
    matched = len(d)
    rms = float(np.sqrt((d ** 2).mean()))
    p99 = float(np.percentile(d, 99))
    worst = float(d.max())
    if rms > LIMIT_RMS or p99 > LIMIT_P99:
        raise SystemExit(f"{part['key']}: the line work does not land on the "
                         f"picture it replaces (rms {rms:.1f} um, "
                         f"p99 {p99:.1f} um)")
    if drop_x + drop_y > 0.02 * (matched + drop_x + drop_y):
        raise SystemExit(f"{part['key']}: {drop_x + drop_y} edges of the "
                         f"picture have nothing near them in the line work")

    entries.append(dict(
        key=part["key"], url="/" + pathlib.Path(part["vector"]).name,
        raster="/" + pathlib.Path(part["raster"]).name, note=part["note"],
        clear=clearing(part),
        x=tx / W, y=ty / H,
        width=page.rect.width * sx / W, height=page.rect.height * sy / H,
        rms=rms, p99=p99, worst=worst))
    report.append(
        f"  {part['key']:<10} {matched} edges matched — "
        f"rms {rms:.1f} um, p99 {p99:.1f} um, worst {worst:.1f} um "
        f"(scale {sx / (W / (CARD_MM[0] * PT)):.5f} x "
        f"{sy / (H / (CARD_MM[1] * PT)):.5f} vs the artboard)")

body = "\n\n".join(f'''  /** {e["note"]}. */
  {e["key"]}: {{
    url: "{e["url"]}",
    raster: "{e["raster"]}",
    clear: {{
      x: {e["clear"]["x"]:.7f},
      y: {e["clear"]["y"]:.7f},
      width: {e["clear"]["width"]:.7f},
      height: {e["clear"]["height"]:.7f},
    }},
    page: {{
      x: {e["x"]:.7f},
      y: {e["y"]:.7f},
      width: {e["width"]:.7f},
      height: {e["height"]:.7f},
    }},
    fit: {{ rms: {e["rms"]:.1f}, p99: {e["p99"]:.1f}, worst: {e["worst"]:.1f} }},
  }},''' for e in entries)

OUT.write_text(f'''/**
 * GENERATED by scripts/build-vector-art.sh — do not edit by hand.
 * Re-run that script whenever one of these files, or the picture it replaces,
 * changes.
 *
 * THE PARTS OF THE DESIGN THE PRINT FILE DRAWS AS LINE WORK.
 *
 * Everything the card places as a picture is a grid of pixels, and a printer's
 * proof enlarges that grid until the steps in it show along every edge. These
 * are the pieces that go in as the lines and shapes they were drawn as
 * instead — Illustrator exports carrying nothing but paths, with the caption's
 * lettering turned to outlines — so their edges are edges at any size.
 *
 * The screen preview goes on showing the pictures: nothing enlarges there, and
 * a `<img>` is what the browser is quickest with.
 *
 * WHERE EACH ONE GOES is measured, not assumed. The exports come off the
 * original artboard at the design's own size, but the pictures they replace
 * were exported at a size of their own and the card stretches them to fit —
 * for the ribbon that turns out to be ~1% — so the placement here is whatever
 * makes the line work land on the very pixels it replaces. `page` says where
 * the FILE'S OWN PAGE goes, as fractions of the card box (`x`/`width` of its
 * width, `y`/`height` of its height, `y` down from the top — the convention
 * lib/meishi-layout.ts states the whole layout in), so lib/print.ts places it
 * with the same `place()` it places everything else with. The numbers are
 * mostly outside 0…1 because the artboard is an A4 sheet and the card is a
 * small part of it: what lands on the card is the part of that sheet the
 * artwork is on.
 *
 * `fit` is how far the line work ended up from the picture it replaces, in
 * micrometres, measured edge by edge across the whole shape. The picture's own
 * grid is ~53 um, so these are inside the grain of the thing being matched.
 *
{chr(10).join(' * ' + r.strip() for r in report)}
 */

export type VectorArt = {{
  /** The file: paths only, no pixels, no live text. */
  readonly url: string;
  /** The picture it replaces — still what the screen preview shows. */
  readonly raster: string;
  /**
   * The box to wipe to paper first, in card fractions: where the card's own
   * background picture carries this same part baked in. Nothing else of the
   * design is inside it.
   */
  readonly clear: {{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }};
  /** Where the file's own page lands on the card, in card fractions. */
  readonly page: {{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }};
  /** How far it lands from that picture: micrometres, over the whole shape. */
  readonly fit: {{
    readonly rms: number;
    readonly p99: number;
    readonly worst: number;
  }};
}};

export const VECTOR_ART = {{
{body}
}} as const satisfies Record<string, VectorArt>;
''')

print(f"lib/vector-art.ts  {len(entries)} part(s)")
for line in report:
    print(line)
PY
