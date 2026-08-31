/**
 * What the TALENT does to the card's layout, and where every piece of the card
 * ends up once they have done it.
 *
 * `lib/meishi-layout.ts` says where the design puts things. This module is the
 * layer on top: parts of the card can be dragged and resized on the preview,
 * and the numbers that come out of here are what BOTH renderers draw from —
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
  EMPTY_MEASURE,
  inkCentred,
  inkOffset,
  inkWidth,
  layoutPets,
  wToH,
  wrapText,
} from "./meishi-layout";

/* ------------------------------------------------------------------ *
 * What the talent can change
 * ------------------------------------------------------------------ */

/**
 * The parts of the card that are always there, whatever the talent typed.
 * Alongside them stands ONE PART PER PET — see `petPart` — so a card carries
 * three grabbable parts plus as many pets as it names. Nothing else on the
 * card is touchable: the ribbon, the owner line and the design itself stay
 * where they were drawn.
 */
export const FIXED_PARTS = ["photo", "ig", "qr"] as const;

export type FixedKey = (typeof FIXED_PARTS)[number];

/** How a part is named: one of the three fixed parts, or a pet's column. */
export type PartKey = FixedKey | `pet${number}`;

export const petPart = (index: number) => `pet${index}` as PartKey;

/** The pet a key stands for, or null when it names one of the fixed parts. */
export const petIndex = (key: PartKey): number | null => {
  const found = /^pet(\d+)$/.exec(key);
  return found ? Number(found[1]) : null;
};

/**
 * One part's change: how far it was dragged, and how much bigger or smaller it
 * was made. `scale` multiplies the part about its own centre — one number, so
 * nothing can be stretched out of shape.
 */
export type Adjust = { dx: number; dy: number; scale: number };

export const NO_ADJUST: Adjust = { dx: 0, dy: 0, scale: 1 };

/**
 * A pet's column carries no `dy` AT ALL.
 *
 * The breeds sit on one baseline and the names on another, and both are shared
 * by every pet on the card — that is what keeps three pets reading as one line
 * rather than three. Letting a column drift up or down would break it, so the
 * column simply has nowhere to store such a move: it slides sideways and
 * changes size, and nothing else.
 */
export type ColumnAdjust = { dx: number; scale: number };

export const NO_COLUMN: ColumnAdjust = { dx: 0, scale: 1 };

/**
 * One face of the card.
 *
 * `pets` is a list rather than named keys, so a fourth pet needs no new field
 * and no branch anywhere: a column that has never been touched simply has no
 * entry yet.
 */
export type FaceAdjust = {
  photo: Adjust;
  ig: Adjust;
  qr: Adjust;
  pets: ColumnAdjust[];
};

/**
 * The whole card, one entry per face.
 *
 * Only the front can be edited today, but the values travel as one object with
 * the face named — so a back face is a key alongside `front` rather than a
 * second shape to thread through the form and the payload.
 */
export type CardAdjust = { front: FaceAdjust };

export const untouchedFace = (): FaceAdjust => ({
  photo: { ...NO_ADJUST },
  ig: { ...NO_ADJUST },
  qr: { ...NO_ADJUST },
  pets: [],
});

export const untouchedCard = (): CardAdjust => ({ front: untouchedFace() });

/**
 * One part's change, whichever kind it is — so the preview's drag handling
 * does not have to know that a pet's column is stored more narrowly than the
 * photo is. A column always reads back `dy: 0`.
 */
export function readPart(face: FaceAdjust, key: PartKey): Adjust {
  const pet = petIndex(key);
  if (pet === null) return face[key as FixedKey];
  const column = face.pets[pet] ?? NO_COLUMN;
  return { dx: column.dx, dy: 0, scale: column.scale };
}

/** The same, going the other way. A column keeps only what it can hold. */
export function writePart(face: FaceAdjust, key: PartKey, value: Adjust): FaceAdjust {
  const pet = petIndex(key);
  if (pet === null) return { ...face, [key]: value };
  const pets = face.pets.slice();
  while (pets.length <= pet) pets.push({ ...NO_COLUMN });
  pets[pet] = { dx: value.dx, scale: value.scale };
  return { ...face, pets };
}

/* ------------------------------------------------------------------ *
 * Rectangles
 * ------------------------------------------------------------------ */

/** A box on the card. See the units note at the top of this file. */
export type CardRect = { x: number; y: number; width: number; height: number };

const EMPTY_RECT: CardRect = { x: 0, y: 0, width: 0, height: 0 };

/** How far a scaled box may travel before it leaves its limits, on one axis. */
const slack = (start: number, size: number, from: number, to: number) => ({
  min: from - start,
  max: to - size - start,
});

/** How far a part may go, in each direction. Left and right narrow for a pet's
 *  column, which has to stop before it reaches its neighbour. */
type Bounds = { left: number; right: number; top: number; bottom: number };

const CARD_BOUNDS: Bounds = { left: 0, right: 1, top: 0, bottom: 1 };

/**
 * Brings one part's change inside what the card allows: the box may not leave
 * its bounds, and the scale is held between `floor` and the largest size that
 * still fits inside those bounds. Clamping happens HERE rather than in the
 * drag handler, so a value that arrives from a stored payload is held to the
 * same rules as one being dragged right now.
 */
function clampAdjust(
  base: CardRect,
  adjust: Adjust,
  floor: number,
  bounds: Bounds,
): Adjust {
  const fit = Math.min(
    (bounds.right - bounds.left) / base.width,
    (bounds.bottom - bounds.top) / base.height,
  );
  const scale = Math.min(Math.max(adjust.scale, floor), fit);

  const scaled = resize(base, scale);
  const x = slack(scaled.x, scaled.width, bounds.left, bounds.right);
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

/**
 * The card's own edges, except for the photo: its lower edge is meant to be
 * hidden by the ribbon's white band, so it is stopped at the band's bottom
 * rather than at the bottom of the card.
 */
const boundsFor = (key: FixedKey): Bounds =>
  key === "photo" ? { ...CARD_BOUNDS, bottom: RIBBON_BAND.bottom } : CARD_BOUNDS;

/**
 * How far each part may be SHRUNK, as a multiple of the size the design gives
 * it. There is no ceiling to state: how far a part can be grown is decided by
 * the card's own edges — and, for a pet's column, by its neighbours.
 */

/** Nothing of its own to hold it up — only the card's edges. */
const NO_FLOOR = 0;

/**
 * How far a run of type may be shrunk before it stops being printable.
 *
 * `size` is what the fitting rules in `lib/meishi-layout.ts` have already
 * settled on for this card's words. A run that is still above the floor may
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
 * from, the top of its line box, and the size THIS line is set at.
 *
 * The size sits on the line rather than on the run because a pet row carries
 * one line per pet and the talent sizes each pet separately. What they all
 * share is the run's own line box, and so the baseline inside it.
 */
export type PlacedLine = { text: string; x: number; top: number; size: number };

/** A run of type: its design spec, the line box every line in it sits in, and
 *  the lines it put down. */
export type PlacedRun = {
  spec: TypeSpec;
  /**
   * The size the run's line box is struck at — what fixes the baseline every
   * line in the run sits on, however big each line itself is set. It is the
   * size the fitting rules settled on for the card's words, untouched by
   * anything the talent did.
   */
  size: number;
  /** Height of that line box, as a fraction of the card width. */
  lineBox: number;
  lines: PlacedLine[];
};

/** A part of the card the talent can grab, and the box its frame is drawn on. */
export type Part = { key: PartKey; rect: CardRect };

export type ResolvedCard = {
  photo: CardRect;
  breed: PlacedRun;
  name: PlacedRun;
  owner: PlacedRun;
  ig: { runs: PlacedRun[]; mark: CardRect | null };
  qr: CardRect;
  /**
   * Everything the talent can pick up, TOPMOST FIRST — the order a touch has
   * to be tested in. A part with nothing on the card yet (no photo chosen, no
   * handle typed, no pet named) is simply not in the list.
   */
  parts: Part[];
  /**
   * What the card will accept for a part, for whoever is doing the dragging:
   * the same limits the placement above was held to, so a value can be brought
   * inside them BEFORE it is stored rather than only on its way to the page.
   */
  clamp: (key: PartKey, adjust: Adjust) => Adjust;
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
  const design = layoutPets(names, breeds);

  /* ---- the text block, flowed exactly as the design flows it ---- */

  // Runs stack down the block: each takes its own margin, then one line box of
  // LINE_HEIGHT × its DESIGN size per line, and an empty run is skipped
  // entirely so its gap closes. The line box is always the design size, so a
  // run the fitting rules shrank — or the talent did — never shifts what is
  // below it. That is what lets the owner stay put while the pets above it are
  // moved and resized.
  let flow = 0;
  const stack = (spec: TypeSpec, lines: number) => {
    if (!lines) return 0;
    flow += spec.marginTop;
    const top = flow;
    flow += lines * LINE_HEIGHT * spec.size;
    return top;
  };
  const blockTop = (offset: number) => LAYOUT.textBlock.top + wToH(offset);

  const shown = text.pets.some((pet) => pet.breed);
  const breedTop = blockTop(stack(TYPE.breed, shown ? 1 : 0));
  const nameTop = blockTop(stack(TYPE.name, text.pets.some((pet) => pet.name) ? 1 : 0));
  const owner = flowed(TYPE.owner, text.owner, LAYOUT.textBlock, "center", measure, (lines) =>
    blockTop(stack(TYPE.owner, lines)),
  );

  /* ---- one column per pet ---- */

  // A pet's breed and name hang on the same axis, both centred on their own
  // ink, so the axis IS the middle of the column: sliding it moves both lines
  // together, and scaling about it grows them in place.
  const rows = [
    { spec: TYPE.breed, size: design.breedSize, top: breedTop, measures: breeds },
    { spec: TYPE.name, size: design.nameSize, top: nameTop, measures: names },
  ];

  /**
   * The box a pet's column occupies as the design draws it: the wider of its
   * two lines' ink, centred on the column's axis, from the top of the breed's
   * line box to the foot of the name's.
   */
  const columnBox = (pet: number): CardRect => {
    let half = 0;
    let top = Infinity;
    let bottom = -Infinity;
    for (const row of rows) {
      const ink = inkWidth(row.measures[pet] ?? EMPTY_MEASURE);
      if (!ink) continue;
      half = Math.max(half, (ink * row.size) / 2);
      top = Math.min(top, row.top);
      bottom = Math.max(bottom, row.top + wToH(LINE_HEIGHT * row.spec.size));
    }
    if (!Number.isFinite(top)) return EMPTY_RECT;
    return { x: design.axes[pet] - half, y: top, width: half * 2, height: bottom - top };
  };

  // One floor for the column, set by whichever of its two lines would reach the
  // printable minimum first.
  const columnFloor = typeFloor(Math.min(design.breedSize, design.nameSize));
  const petCount = text.pets.length;

  // Two passes. The first holds every column inside the card alone; the second
  // holds it clear of where its neighbours came to rest in the first. Because a
  // dragged value is clamped BEFORE it is stored, the two agree in ordinary
  // use — the second pass only has work to do when a stored payload arrives
  // with columns already overlapping.
  const cardOnly = Array.from({ length: petCount }, (_, pet) => {
    const box = columnBox(pet);
    if (!box.width) return box;
    return moved(box, clampAdjust(box, readPart(adjust, petPart(pet)), columnFloor, CARD_BOUNDS));
  });

  const columnBounds = (pet: number): Bounds => ({
    ...CARD_BOUNDS,
    left: pet > 0 ? cardOnly[pet - 1].x + cardOnly[pet - 1].width : 0,
    right: pet < petCount - 1 ? cardOnly[pet + 1].x : 1,
  });

  /* ---- the boxes the design leaves for everything else ---- */

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

  const fixed: Record<FixedKey, { rect: CardRect; floor: number; usable: boolean }> = {
    photo: { rect: photoRect, floor: PHOTO_FLOOR, usable: input.hasPhoto },
    ig: {
      rect: union([markRect(), ...igRuns.map((run) => runRect(run, measure))]) ?? EMPTY_RECT,
      // The Instagram block is one part, so it is held up by whichever of its
      // two lines would hit the floor first.
      floor: typeFloor(Math.min(TYPE.igName.size, TYPE.igHandle.size)),
      usable: igRuns.some((run) => run.lines.length > 0),
    },
    qr: {
      rect: qrRect,
      floor: input.qrPitch === null ? NO_FLOOR : qrFloor(input.qrPitch),
      usable: input.qrPitch !== null,
    },
  };

  /* ---- and where everything actually ends up ---- */

  const clamp = (key: PartKey, value: Adjust): Adjust => {
    const pet = petIndex(key);
    if (pet !== null) {
      const box = columnBox(pet);
      if (!box.width) return { ...NO_ADJUST };
      return clampAdjust(box, value, columnFloor, columnBounds(pet));
    }
    const part = fixed[key as FixedKey];
    if (!part.usable || !part.rect.width || !part.rect.height) return { ...NO_ADJUST };
    return clampAdjust(part.rect, value, part.floor, boundsFor(key as FixedKey));
  };

  const held = {} as Record<FixedKey, Adjust>;
  for (const key of FIXED_PARTS) held[key] = clamp(key, readPart(adjust, key));

  const columns = Array.from({ length: petCount }, (_, pet) =>
    clamp(petPart(pet), readPart(adjust, petPart(pet))),
  );

  const row = (spec: TypeSpec, size: number, top: number, measures: Measured[],
               word: (pet: number) => string): PlacedRun => ({
    spec,
    size,
    lineBox: LINE_HEIGHT * spec.size,
    lines: text.pets
      .map((_, pet) => ({
        text: word(pet),
        x: inkCentred(measures[pet], design.axes[pet] + columns[pet].dx, size * columns[pet].scale),
        top,
        size: size * columns[pet].scale,
      }))
      .filter((line) => line.text),
  });

  const parts: Part[] = [];
  const offer = (key: PartKey, rect: CardRect) => {
    if (rect.width > 0 && rect.height > 0) parts.push({ key, rect });
  };
  // Topmost first, which is reverse paint order: the QR, the Instagram line,
  // the pet columns (which never overlap each other), then the photo.
  if (fixed.qr.usable) offer("qr", moved(qrRect, held.qr));
  if (fixed.ig.usable) offer("ig", moved(fixed.ig.rect, held.ig));

  for (let pet = 0; pet < petCount; pet++) {
    offer(petPart(pet), moved(columnBox(pet), columns[pet]));
  }
  if (fixed.photo.usable) offer("photo", moved(photoRect, held.photo));

  const igMove = move(fixed.ig.rect, held.ig);

  return {
    photo: moved(photoRect, held.photo),
    breed: row(TYPE.breed, design.breedSize, breedTop, breeds, (pet) => text.pets[pet].breed),
    name: row(TYPE.name, design.nameSize, nameTop, names, (pet) => text.pets[pet].name),
    owner,
    ig: {
      runs: igRuns.map((run) => igMove.run(run)),
      // Until the Instagram line has been touched, the glyph the template
      // already carries is left showing; from the first nudge onwards the
      // renderers paint it out and place `ASSETS.igMark` here instead.
      mark: isMoved(held.ig) ? igMove.rect(markRect()) : null,
    },
    qr: moved(qrRect, held.qr),
    parts,
    clamp,
  };
}

/** Has this part been touched at all? Until it has, the design's own Instagram
 *  glyph is left alone — see `ASSETS.igMark`. */
export const isMoved = (a: Adjust) => Boolean(a.dx || a.dy || a.scale !== 1);

/* ------------------------------------------------------------------ *
 * Applying one part's change
 * ------------------------------------------------------------------ */

/** The box `adjust` leaves: grown about its own centre, then slid. */
const moved = (base: CardRect, adjust: Adjust): CardRect => {
  const scaled = resize(base, adjust.scale);
  return { ...scaled, x: scaled.x + adjust.dx, y: scaled.y + adjust.dy };
};

/**
 * One part's change as something that can be applied to any box or run
 * belonging to it: grow about the part's centre, then slide. Sizes and line
 * boxes ride along, so a scaled run's type comes up with it.
 */
type Move = {
  rect: (r: CardRect) => CardRect;
  run: (r: PlacedRun) => PlacedRun;
};

function move(base: CardRect, adjust: Adjust): Move {
  const cx = base.x + base.width / 2;
  const cy = base.y + base.height / 2;
  const s = adjust.scale;
  const x = (v: number) => cx + (v - cx) * s + adjust.dx;
  const y = (v: number) => cy + (v - cy) * s + adjust.dy;

  return {
    rect: (r) => ({ x: x(r.x), y: y(r.y), width: r.width * s, height: r.height * s }),
    run: (r) => ({
      ...r,
      size: r.size * s,
      lineBox: r.lineBox * s,
      lines: r.lines.map((line) => ({
        text: line.text,
        x: x(line.x),
        top: y(line.top),
        size: line.size * s,
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
    return { text: line, x, top: top + wToH(i * run.lineBox), size: spec.size };
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
    left = Math.min(left, line.x + m.inkLeft * line.size);
    right = Math.max(right, line.x + m.inkRight * line.size);
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
