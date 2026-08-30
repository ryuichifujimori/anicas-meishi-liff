/**
 * What the TALENT does to the card's layout, and where every piece of the card
 * ends up once they have done it.
 *
 * `lib/meishi-layout.ts` says where the design puts things. This module is the
 * layer on top: five parts of the card can be dragged and resized on the
 * preview, and the numbers that come out of here are what BOTH renderers draw
 * from —
 *
 *   - app/components/MeishiPreview.tsx … the preview, and the frame + handles
 *   - lib/print.ts                     … the print-ready PDF
 *
 * so what the talent sees under their finger and what the printer receives are
 * the same placement, worked out once.
 *
 * UNITS, throughout: `x` and `width` (and every type size, margin and line box)
 * are fractions of the card WIDTH; `y` and `height` are fractions of the card
 * HEIGHT. That is how CSS resolves an absolutely positioned child, and how
 * `lib/meishi-layout.ts` already states the design.
 */

import {
  CARD_TRIM_MM,
  IG_MARK,
  LAYOUT,
  LINE_HEIGHT,
  MIN_QR_MODULE_MM,
  MIN_TYPE_SIZE,
  RIBBON_BAND,
  TYPE,
  type CardText,
  type Measured,
  type TypeSpec,
  inkCentred,
  inkOffset,
  layoutPets,
  wToH,
  wrapText,
} from "./meishi-layout";

/* ------------------------------------------------------------------ *
 * What the talent can change
 * ------------------------------------------------------------------ */

/**
 * The five parts of the card that can be moved and resized. Nothing else on
 * the card is touchable: the ribbon, the owner line and the design itself stay
 * where they were drawn.
 */
export const ADJUSTABLE = ["photo", "breed", "name", "ig", "qr"] as const;

export type AdjustKey = (typeof ADJUSTABLE)[number];

/**
 * One part's change: how far it was dragged, and how much bigger or smaller it
 * was made. `scale` multiplies the part about its own centre — one number, so
 * nothing can be stretched out of shape.
 */
export type Adjust = { dx: number; dy: number; scale: number };

export const NO_ADJUST: Adjust = { dx: 0, dy: 0, scale: 1 };

/** Every part of one face of the card. */
export type FaceAdjust = Record<AdjustKey, Adjust>;

/**
 * The whole card, one entry per face.
 *
 * Only the front can be edited today, but the values travel as one object with
 * the face named — so a back face is a key alongside `front` rather than a
 * second shape to thread through the form and the payload.
 */
export type CardAdjust = { front: FaceAdjust };

export const untouchedFace = (): FaceAdjust =>
  Object.fromEntries(ADJUSTABLE.map((key) => [key, { ...NO_ADJUST }])) as FaceAdjust;

export const untouchedCard = (): CardAdjust => ({ front: untouchedFace() });

/* ------------------------------------------------------------------ *
 * Rectangles
 * ------------------------------------------------------------------ */

/** A box on the card. See the units note at the top of this file. */
export type CardRect = { x: number; y: number; width: number; height: number };

const centre = (r: CardRect) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

/** How far a scaled box may travel before it leaves `limit`, on one axis. */
const slack = (start: number, size: number, from: number, to: number) => ({
  min: from - start,
  max: to - size - start,
});

/**
 * Brings one part's change inside what the card allows: the box may not leave
 * the trimmed card, the photo may not drop below the ribbon's band, and the
 * scale is held between `floor` and the largest size that still fits inside
 * those bounds. Clamping happens HERE rather than in the drag handler, so a
 * value that arrives from a stored payload is held to the same rules as one
 * being dragged right now.
 */
export function clampAdjust(
  base: CardRect,
  adjust: Adjust,
  floor: number,
  bounds: Bounds,
): Adjust {
  const fit = Math.min(1 / base.width, (bounds.bottom - bounds.top) / base.height);
  const scale = Math.min(Math.max(adjust.scale, floor), fit);

  const scaled = resize(base, scale);
  const x = slack(scaled.x, scaled.width, 0, 1);
  const y = slack(scaled.y, scaled.height, bounds.top, bounds.bottom);

  return {
    scale,
    dx: Math.min(Math.max(adjust.dx, x.min), x.max),
    dy: Math.min(Math.max(adjust.dy, y.min), y.max),
  };
}

/** The box `scale` leaves, grown or shrunk about its own centre. */
const resize = (r: CardRect, scale: number): CardRect => ({
  x: r.x + (r.width * (1 - scale)) / 2,
  y: r.y + (r.height * (1 - scale)) / 2,
  width: r.width * scale,
  height: r.height * scale,
});

/** How far up and down the card a part may go. */
export type Bounds = { top: number; bottom: number };

/**
 * The card's own edges, except for the photo: its lower edge is meant to be
 * hidden by the ribbon's white band, so it is stopped at the band's bottom
 * rather than at the bottom of the card.
 */
const boundsFor = (key: AdjustKey): Bounds =>
  key === "photo" ? { top: 0, bottom: RIBBON_BAND.bottom } : { top: 0, bottom: 1 };

/**
 * How far each part may be SHRUNK, as a multiple of the size the design gives
 * it. There is no ceiling to state: how far a part can be grown is decided by
 * the card's own edges, in `clampAdjust`.
 */

/** Nothing of its own to hold it up — only the card's edges. */
const NO_FLOOR = 0;

/**
 * How far a row of type may be shrunk before it stops being printable.
 *
 * `size` is what the fitting rules in `lib/meishi-layout.ts` have already
 * settled on for this card's words. A row that is still above the floor may
 * come down to it; one the fitting rules have already pushed below it may not
 * be shrunk at all.
 */
const typeFloor = (size: number) => Math.min(1, size ? MIN_TYPE_SIZE / size : 1);

/**
 * How far the QR may be shrunk before a phone stops reading it: the point
 * where one module reaches MIN_QR_MODULE_MM. `pitch` is the module's size as a
 * fraction of the QR box, which `lib/qr.ts` reports for the QR it actually
 * built — so a denser QR (a longer handle) is allowed less shrink than a
 * sparse one, automatically.
 */
const qrFloor = (pitch: number) => {
  const moduleMm = LAYOUT.qr.width * CARD_TRIM_MM.width * pitch;
  return moduleMm ? Math.min(1, MIN_QR_MODULE_MM / moduleMm) : 1;
};

/**
 * The photo has no legibility floor to hold it up, so it gets a plain one:
 * half the size the design gives it. Below that the slot has stopped being the
 * card's portrait, and a drag that overshoots would otherwise collapse it to
 * nothing.
 */
const PHOTO_FLOOR = 0.5;

/* ------------------------------------------------------------------ *
 * Where everything lands
 * ------------------------------------------------------------------ */

/**
 * One line of type as it will be drawn: the string, the left edge to draw it
 * from (card-width fraction) and the top of its line box (card-height
 * fraction). Everything on the card is placed this way — the pet columns, the
 * owner, both Instagram lines — so neither renderer has any flowing left to do.
 */
export type PlacedLine = { text: string; x: number; top: number };

/** A run of type: its design spec, the size it ended up at, its line box, and
 *  the lines it put down. */
export type PlacedRun = {
  spec: TypeSpec;
  /** Font size, as a fraction of the card width. */
  size: number;
  /** Height of one line box, as a fraction of the card width. */
  lineBox: number;
  lines: PlacedLine[];
};

/** A part of the card the talent can grab, with the box its frame is drawn on. */
export type Placed<T> = T & { rect: CardRect };

/**
 * One of the two pet rows: where it ended up, and where the design's own flow
 * had put it. The preview leaves the row's BOX in that flow — so the owner
 * line under it cannot be shifted by anything done to the rows above — and
 * moves only the words inside it.
 */
export type PlacedRow = Placed<PlacedRun> & { designTop: number };

export type ResolvedCard = {
  photo: CardRect;
  breed: PlacedRow;
  name: PlacedRow;
  owner: PlacedRun;
  ig: Placed<{ runs: PlacedRun[]; mark: CardRect | null }>;
  qr: CardRect;
  /** The frame each part's handles are drawn on, or null when it has nothing
   *  on the card to grab (no photo yet, no QR yet, no pets named). */
  frames: Record<AdjustKey, CardRect | null>;
  /**
   * What the card will accept for each part, for whoever is doing the
   * dragging: the same limits the rendering above was held to, so a value can
   * be brought inside them BEFORE it is stored rather than only on its way to
   * the page.
   */
  clamp: Record<AdjustKey, (adjust: Adjust) => Adjust>;
};

/** A string's width, in ems, as the renderer asking will actually set it. */
export type MeasureRun = (spec: TypeSpec, text: string) => Measured;

export type ResolveInput = {
  text: CardText;
  measure: MeasureRun;
  adjust: FaceAdjust;
  /** Whether a photo has been composed, and the QR's module pitch — both only
   *  decide whether that part is grabbable and how far the QR may shrink. */
  hasPhoto: boolean;
  qrPitch: number | null;
};

/**
 * Works out the whole front of the card: what the design asks for, then what
 * the talent did to it.
 *
 * Both renderers call this and draw exactly what comes back, which is what
 * keeps the preview and the print file on the same layout — including the
 * talent's own changes, which are applied here once rather than in each
 * renderer.
 */
export function resolveCard(input: ResolveInput): ResolvedCard {
  const { text, measure, adjust } = input;

  const names = text.pets.map((pet) => measure(TYPE.name, pet.name));
  const breeds = text.pets.map((pet) => measure(TYPE.breed, pet.breed));
  const columns = layoutPets(names, breeds);

  /* ---- the text block, flowed exactly as the design flows it ---- */

  // Runs stack down the block: each takes its own margin, then one line box of
  // LINE_HEIGHT × its DESIGN size per line, and an empty run is skipped
  // entirely so its gap closes. The line box is always the design size, so a
  // run the fitting rules shrank — or the talent did — never shifts what is
  // below it. That is what lets the owner stay put while the two rows above it
  // move.
  let flow = 0;
  const stack = (spec: TypeSpec, lines: number) => {
    if (!lines) return 0;
    flow += spec.marginTop;
    const top = flow;
    flow += lines * LINE_HEIGHT * spec.size;
    return top;
  };

  const blockTop = (offset: number) => LAYOUT.textBlock.top + wToH(offset);

  const column = (
    spec: TypeSpec,
    size: number,
    measures: Measured[],
    word: (i: number) => string,
  ): PlacedRun => {
    const shown = text.pets
      .map((_, i) => ({ text: word(i), measure: measures[i], axis: columns.axes[i] }))
      .filter((item) => item.text);
    const top = blockTop(stack(spec, shown.length ? 1 : 0));
    return {
      spec,
      size,
      lineBox: LINE_HEIGHT * spec.size,
      lines: shown.map((item) => ({
        text: item.text,
        x: inkCentred(item.measure, item.axis, size),
        top,
      })),
    };
  };

  const breed = column(TYPE.breed, columns.breedSize, breeds, (i) => text.pets[i].breed);
  const name = column(TYPE.name, columns.nameSize, names, (i) => text.pets[i].name);

  const owner = flowed(
    TYPE.owner,
    text.owner,
    LAYOUT.textBlock,
    "center",
    measure,
    (lines) => blockTop(stack(TYPE.owner, lines)),
  );

  /* ---- the Instagram lines, flowed in their own block ---- */

  let igFlow = 0;
  const igStack = (spec: TypeSpec, lines: number) => {
    if (!lines) return 0;
    igFlow += spec.marginTop;
    const top = igFlow;
    igFlow += lines * LINE_HEIGHT * spec.size;
    return top;
  };
  const igTop = (offset: number) => LAYOUT.igBlock.top + wToH(offset);
  const igRuns = [
    flowed(TYPE.igName, text.igName, LAYOUT.igBlock, "left", measure, (lines) =>
      igTop(igStack(TYPE.igName, lines)),
    ),
    flowed(TYPE.igHandle, text.igHandle, LAYOUT.igBlock, "left", measure, (lines) =>
      igTop(igStack(TYPE.igHandle, lines)),
    ),
  ];

  /* ---- the boxes the design leaves, before the talent's changes ---- */

  const photoRect: CardRect = {
    x: LAYOUT.photo.left,
    y: LAYOUT.photo.top,
    width: LAYOUT.photo.width,
    height: LAYOUT.photo.height,
  };
  const qrRect: CardRect = {
    x: 1 - LAYOUT.qr.right - LAYOUT.qr.width,
    y: LAYOUT.qr.top,
    width: LAYOUT.qr.width,
    height: wToH(LAYOUT.qr.width),
  };

  const base: Record<AdjustKey, CardRect> = {
    photo: photoRect,
    breed: runRect(breed, measure) ?? EMPTY_RECT,
    name: runRect(name, measure) ?? EMPTY_RECT,
    ig: union([markRect(), ...igRuns.map((run) => runRect(run, measure))]) ?? EMPTY_RECT,
    qr: qrRect,
  };

  // A part with nothing on the card yet — no photo chosen, no handle typed, no
  // pet named — is drawn from the design but cannot be grabbed, so no frame is
  // offered for it.
  const grabbable: Record<AdjustKey, boolean> = {
    photo: input.hasPhoto,
    breed: breed.lines.length > 0,
    name: name.lines.length > 0,
    ig: igRuns.some((run) => run.lines.length > 0),
    qr: input.qrPitch !== null,
  };

  const floors: Record<AdjustKey, number> = {
    photo: PHOTO_FLOOR,
    breed: typeFloor(breed.size),
    name: typeFloor(name.size),
    // The Instagram block is one part, so it is held up by whichever of its
    // two lines would hit the floor first.
    ig: typeFloor(Math.min(TYPE.igName.size, TYPE.igHandle.size)),
    qr: input.qrPitch === null ? NO_FLOOR : qrFloor(input.qrPitch),
  };

  /* ---- and where each of them actually ends up ---- */

  const moves = {} as Record<AdjustKey, Move>;
  const frames = {} as Record<AdjustKey, CardRect | null>;
  const clamp = {} as Record<AdjustKey, (a: Adjust) => Adjust>;
  for (const key of ADJUSTABLE) {
    const rect = base[key];
    const usable = grabbable[key] && rect.width > 0 && rect.height > 0;
    clamp[key] = usable
      ? (a: Adjust) => clampAdjust(rect, a, floors[key], boundsFor(key))
      : () => ({ ...NO_ADJUST });
    moves[key] = usable ? move(rect, clamp[key](adjust[key])) : IDENTITY_MOVE;
    frames[key] = usable ? moves[key].rect(rect) : null;
  }

  return {
    photo: moves.photo.rect(photoRect),
    breed: { ...moves.breed.run(breed), rect: base.breed, designTop: breed.lines[0]?.top ?? 0 },
    name: { ...moves.name.run(name), rect: base.name, designTop: name.lines[0]?.top ?? 0 },
    owner,
    ig: {
      runs: igRuns.map((run) => moves.ig.run(run)),
      // Until the Instagram line has been touched, the glyph the template
      // already carries is left showing; from the first nudge onwards the
      // renderers paint it out and place `ASSETS.igMark` here instead.
      mark: isMoved(adjust.ig) ? moves.ig.rect(markRect()) : null,
      rect: base.ig,
    },
    qr: moves.qr.rect(qrRect),
    frames,
    clamp,
  };
}

/** Has this part been touched at all? Until it has, the design's own Instagram
 *  glyph is left alone — see `ASSETS.igMark`. */
export const isMoved = (a: Adjust) => Boolean(a.dx || a.dy || a.scale !== 1);

const EMPTY_RECT: CardRect = { x: 0, y: 0, width: 0, height: 0 };

/* ------------------------------------------------------------------ *
 * Applying one part's change
 * ------------------------------------------------------------------ */

/**
 * One part's change as something that can be applied to any box or run
 * belonging to it: grow about the part's centre, then slide. Sizes and line
 * boxes ride along, so a scaled run's type comes up with it.
 */
type Move = {
  rect: (r: CardRect) => CardRect;
  run: (r: PlacedRun) => PlacedRun;
};

const IDENTITY_MOVE: Move = { rect: (r) => r, run: (r) => r };

function move(base: CardRect, adjust: Adjust): Move {
  const c = centre(base);
  const s = adjust.scale;
  const x = (v: number) => c.x + (v - c.x) * s + adjust.dx;
  const y = (v: number) => c.y + (v - c.y) * s + adjust.dy;

  return {
    rect: (r) => ({
      x: x(r.x),
      y: y(r.y),
      width: r.width * s,
      height: r.height * s,
    }),
    run: (r) => ({
      ...r,
      size: r.size * s,
      lineBox: r.lineBox * s,
      lines: r.lines.map((line) => ({
        text: line.text,
        x: x(line.x),
        top: y(line.top),
      })),
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Flowed runs and the boxes they occupy
 * ------------------------------------------------------------------ */

/**
 * One of the card's flowed lines — the owner, the Instagram name, the handle.
 * It is broken to the block's width by the shared rule in
 * `lib/meishi-layout.ts` (rather than by CSS in one renderer and by arithmetic
 * in the other), then each line is placed: left-aligned at the block's edge,
 * or centred on its INK the way a Japanese line has to be.
 */
function flowed(
  spec: TypeSpec,
  text: string,
  block: { left: number; width: number },
  align: "left" | "center",
  measure: MeasureRun,
  place: (lines: number) => number,
): PlacedRun {
  const run: PlacedRun = {
    spec,
    size: spec.size,
    lineBox: LINE_HEIGHT * spec.size,
    lines: [],
  };
  if (!text) {
    place(0);
    return run;
  }

  const width = (value: string) => measure(spec, value).advance * spec.size;
  const broken = wrapText(width, text, block.width);
  const top = place(broken.length);

  run.lines = broken.map((line, i) => {
    const m = measure(spec, line);
    const x =
      align === "center"
        ? block.left + (block.width - width(line)) / 2 + inkOffset(m) * spec.size
        : block.left;
    return { text: line, x, top: top + wToH(i * run.lineBox) };
  });
  return run;
}

/** The box a run's ink occupies: its ink left to right, its line boxes top to
 *  bottom. Null when the run put nothing down. */
function runRect(run: PlacedRun, measure: MeasureRun): CardRect | null {
  if (!run.lines.length) return null;
  let left = Infinity;
  let right = -Infinity;
  for (const line of run.lines) {
    const m = measure(run.spec, line.text);
    left = Math.min(left, line.x + m.inkLeft * run.size);
    right = Math.max(right, line.x + m.inkRight * run.size);
  }
  const top = run.lines[0].top;
  const bottom = run.lines[run.lines.length - 1].top + wToH(run.lineBox);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The Instagram glyph's box, as the design draws it. */
const markRect = (): CardRect => ({
  x: IG_MARK.left,
  y: IG_MARK.top,
  width: IG_MARK.width,
  height: IG_MARK.height,
});

function union(rects: (CardRect | null)[]): CardRect | null {
  const shown = rects.filter((r): r is CardRect => r !== null);
  if (!shown.length) return null;
  const x = Math.min(...shown.map((r) => r.x));
  const y = Math.min(...shown.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...shown.map((r) => r.x + r.width)) - x,
    height: Math.max(...shown.map((r) => r.y + r.height)) - y,
  };
}
