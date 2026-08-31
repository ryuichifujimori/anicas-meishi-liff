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
  PHOTO_TUCK,
  RIBBON_BAND,
  SAFE_MARGIN,
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
 * What the card allows anything but the photo: the trimmed card, kept clear of
 * its own left and right edges by `SAFE_MARGIN`, so a wandering cut cannot
 * shave the type or the QR.
 */
const SAFE_BOUNDS: Bounds = { ...CARD_BOUNDS, left: SAFE_MARGIN, right: 1 - SAFE_MARGIN };

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
 * Where each of the fixed parts may go. The photo is the one that reaches the
 * card's edges — it is artwork, and it is meant to; what it may NOT do is drop
 * below the ribbon's white band, which is what hides its lower edge.
 */
const boundsFor = (key: FixedKey): Bounds =>
  key === "photo" ? { ...CARD_BOUNDS, bottom: RIBBON_BAND.bottom } : SAFE_BOUNDS;

/**
 * How far each part may be SHRUNK, as a multiple of the size the design gives
 * it. There is no ceiling to state: how far a part can be grown is decided by
 * the card's own edges — and, for a pet's column, by its neighbours.
 */

/** Nothing of its own to hold it up — only the card's edges. */
const NO_FLOOR = 0;

/**
 * The size a run of type stops shrinking at.
 *
 * `size` is what the fitting rules in `lib/meishi-layout.ts` have already
 * settled on for this card's words, and `floor` is what its kind may not go
 * below. A run the fitting rules have ALREADY taken under the floor is left
 * where it is rather than pushed back up to it — it just has nowhere left to
 * shrink to.
 */
const heldAt = (size: number, floor: number) => Math.min(size, floor);

/** How far a run may be shrunk, as a multiple of the size it is set at. */
const typeFloor = (size: number, floor: number) =>
  size ? Math.min(1, heldAt(size, floor) / size) : 1;

/** The size a run ends up at once the talent's scale has been held to its
 *  floor. Growing is never held; only shrinking is. */
const heldSize = (size: number, floor: number, scale: number) =>
  Math.max(heldAt(size, floor), size * scale);

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

/**
 * The photo as it is drawn: the whole slot, and the part of it that reaches
 * the card.
 *
 * The photo's lower edge is meant to be hidden by the ribbon, and `PHOTO_TUCK`
 * is as far down as the ribbon's band actually covers it — so the picture is
 * cut off there however far the slot has been taken. The slot itself is left
 * whole: that is what a finger moves and a handle resizes, and it is the box
 * the frame is drawn on.
 */
export type PlacedPhoto = { box: CardRect; drawn: CardRect };

/** The photo, cut off at the line the ribbon tucks it behind. A slot that does
 *  not reach the line is handed back untouched, so a card nobody has moved the
 *  photo on is drawn exactly as it always was. */
const tucked = (box: CardRect): PlacedPhoto => {
  const over = box.y + box.height - PHOTO_TUCK;
  return over > 0
    ? { box, drawn: { ...box, height: Math.max(0, box.height - over) } }
    : { box, drawn: box };
};

/* ------------------------------------------------------------------ *
 * Lining a part up
 * ------------------------------------------------------------------ */

/** The card's own middle, which is where most of the design is hung from. */
const CARD_MIDDLE = 0.5;

/**
 * How near a part has to come before it lines itself up, in millimetres across
 * the card: wide enough for a finger to fall into, narrow enough that a
 * placement deliberately set a couple of millimetres off still stands.
 */
const SNAP_REACH_MM = 1.5;

const SNAP_REACH = SNAP_REACH_MM / CARD_TRIM_MM.width;

/** What a part being dragged sideways has around it, for the table to read. */
type SnapRoom = {
  /** The middle of the part, where the finger has it now. */
  middle: number;
  /** What stands on either side of it: a neighbouring column, or the margin. */
  left: number;
  right: number;
};

/**
 * THE TABLE: every place a part lines itself up to, in the order they are
 * tried. Each row says where the part's middle wants to sit, given the room
 * around it.
 *
 * Another place to line up to is another row here and nothing else — the drag,
 * the line drawn on the preview and the value that gets stored all come from
 * this list, so none of them has to learn about it separately.
 */
type SnapRule = {
  /** Where this row wants the part's middle, or null when it has nothing to
   *  say about the part in hand. */
  at: (room: SnapRoom) => number | null;
};

const SNAP_TABLE: SnapRule[] = [
  // The card's own middle.
  { at: () => CARD_MIDDLE },
  // Halfway between whatever stands on either side — with two or three pets,
  // where the gaps to the neighbouring columns come out equal.
  { at: (room) => (room.left + room.right) / 2 },
];

/** A part's change with the table applied, and the line to show for it — null
 *  when it did not land on anything. */
export type Snapped = { adjust: Adjust; guide: number | null };

/** Close enough to say a part came to rest exactly where it was aimed. */
const SETTLED = 1e-9;

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
  photo: PlacedPhoto;
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
  /**
   * The same, with the lining-up table applied: what to store for a part being
   * dragged sideways, and where to draw the line that says why it stopped.
   * Held to the card's limits either way, so a part that cannot reach a place
   * on the table simply does not line up to it.
   */
  snap: (key: PartKey, adjust: Adjust) => Snapped;
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
    {
      spec: TYPE.breed,
      size: design.breedSize,
      floor: MIN_TYPE_SIZE.breed,
      top: breedTop,
      measures: breeds,
    },
    {
      spec: TYPE.name,
      size: design.nameSize,
      floor: MIN_TYPE_SIZE.name,
      top: nameTop,
      measures: names,
    },
  ];

  /** The rows a given pet actually has words on. */
  const rowsOf = (pet: number) =>
    rows.filter((row) => inkWidth(row.measures[pet] ?? EMPTY_MEASURE) > 0);

  /**
   * The box a pet's column occupies at a given scale: the wider of its two
   * lines' ink, centred on the column's axis, over the two rows' line boxes.
   *
   * Each row is taken at the size it will really be SET at, which is not
   * simply the design size times the scale: a row that has reached its own
   * floor stops there while the other goes on shrinking. So the box has to be
   * built from the sizes rather than scaled as a whole.
   */
  const columnBox = (pet: number, scale = 1): CardRect => {
    let half = 0;
    let top = Infinity;
    let bottom = -Infinity;
    for (const row of rowsOf(pet)) {
      const size = heldSize(row.size, row.floor, scale);
      half = Math.max(half, (inkWidth(row.measures[pet]) * size) / 2);
      // The line box follows the size the row ended up at, about its middle.
      const box = wToH(LINE_HEIGHT * row.spec.size);
      const grown = (box * size) / row.size;
      const middle = row.top + box / 2;
      top = Math.min(top, middle - grown / 2);
      bottom = Math.max(bottom, middle + grown / 2);
    }
    if (!Number.isFinite(top)) return EMPTY_RECT;
    return { x: design.axes[pet] - half, y: top, width: half * 2, height: bottom - top };
  };

  /**
   * How far a column may be shrunk: until its LAST row reaches its own floor.
   * The breed parks first and the name goes on down, so it is the name that
   * decides — and on a pet with only one of the two, that one does.
   */
  const columnFloor = (pet: number) =>
    Math.min(1, ...rowsOf(pet).map((row) => typeFloor(row.size, row.floor)));

  const petCount = text.pets.length;

  /**
   * Holds one column's change to what the card allows, between `bounds`.
   *
   * It cannot go through `clampAdjust`, which grows a box evenly: a column's
   * width follows the sizes its two rows ended up at. Growing is even, though
   * — a row only stops at its floor on the way DOWN — so the largest scale
   * that still fits is the plain ratio of the room to the design's own box.
   */
  const clampColumn = (pet: number, value: Adjust, bounds: Bounds): Adjust => {
    const base = columnBox(pet);
    if (!base.width) return { ...NO_ADJUST };
    const middle = base.y + base.height / 2;
    const fit = Math.min(
      (bounds.right - bounds.left) / base.width,
      (Math.min(middle - bounds.top, bounds.bottom - middle) * 2) / base.height,
    );
    const scale = Math.min(Math.max(value.scale, columnFloor(pet)), fit);
    const box = columnBox(pet, scale);
    const x = slack(box.x, box.width, bounds.left, bounds.right);
    return { scale, dx: Math.min(Math.max(value.dx, x.min), x.max), dy: 0 };
  };

  // Two passes. The first holds every column inside the card alone; the second
  // holds it clear of where its neighbours came to rest in the first. Because a
  // dragged value is clamped BEFORE it is stored, the two agree in ordinary
  // use — the second pass only has work to do when a stored payload arrives
  // with columns already overlapping.
  const cardOnly = Array.from({ length: petCount }, (_, pet) => {
    const held = clampColumn(pet, readPart(adjust, petPart(pet)), SAFE_BOUNDS);
    return slid(columnBox(pet, held.scale), held.dx);
  });

  const columnBounds = (pet: number): Bounds => ({
    ...SAFE_BOUNDS,
    left: pet > 0 ? cardOnly[pet - 1].x + cardOnly[pet - 1].width : SAFE_BOUNDS.left,
    right: pet < petCount - 1 ? cardOnly[pet + 1].x : SAFE_BOUNDS.right,
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
      floor: typeFloor(Math.min(TYPE.igName.size, TYPE.igHandle.size), MIN_TYPE_SIZE.other),
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
      return clampColumn(pet, value, columnBounds(pet));
    }
    const part = fixed[key as FixedKey];
    if (!part.usable || !part.rect.width || !part.rect.height) return { ...NO_ADJUST };
    return clampAdjust(part.rect, value, part.floor, boundsFor(key as FixedKey));
  };

  /** Where a part comes to sit at a given change — the box its frame is drawn
   *  on, and the box the lining-up table measures. */
  const boxOf = (key: PartKey, value: Adjust): CardRect | null => {
    const pet = petIndex(key);
    if (pet !== null) {
      const box = columnBox(pet, value.scale);
      return box.width ? slid(box, value.dx) : null;
    }
    const part = fixed[key as FixedKey];
    return part.usable && part.rect.width ? moved(part.rect, value) : null;
  };

  const snap = (key: PartKey, value: Adjust): Snapped => {
    const held = clamp(key, value);
    // The photo is the one part not held inside the safe margin — it is
    // artwork, and it is meant to run to the card's edges — so it has nothing
    // to line up with and is left where the finger put it.
    const box = key === "photo" ? null : boxOf(key, held);
    if (!box) return { adjust: held, guide: null };

    const pet = petIndex(key);
    const bounds = pet !== null ? columnBounds(pet) : boundsFor(key as FixedKey);
    const room: SnapRoom = {
      middle: box.x + box.width / 2,
      left: bounds.left,
      right: bounds.right,
    };

    for (const rule of SNAP_TABLE) {
      const target = rule.at(room);
      if (target === null || Math.abs(target - room.middle) > SNAP_REACH) continue;
      const lined = clamp(key, { ...held, dx: held.dx + (target - room.middle) });
      const landed = boxOf(key, lined);
      // An edge or a neighbour may have stopped it short, and a part that did
      // not get there has not lined up with anything.
      if (!landed || Math.abs(landed.x + landed.width / 2 - target) > SETTLED) continue;
      return { adjust: lined, guide: target };
    }
    return { adjust: held, guide: null };
  };

  const held = {} as Record<FixedKey, Adjust>;
  for (const key of FIXED_PARTS) held[key] = clamp(key, readPart(adjust, key));

  const columns = Array.from({ length: petCount }, (_, pet) =>
    clamp(petPart(pet), readPart(adjust, petPart(pet))),
  );

  const row = (
    spec: TypeSpec,
    size: number,
    floor: number,
    top: number,
    measures: Measured[],
    word: (pet: number) => string,
  ): PlacedRun => ({
    spec,
    size,
    lineBox: LINE_HEIGHT * spec.size,
    lines: text.pets
      .map((_, pet) => {
        const set = heldSize(size, floor, columns[pet].scale);
        return {
          text: word(pet),
          x: inkCentred(measures[pet], design.axes[pet] + columns[pet].dx, set),
          top,
          size: set,
        };
      })
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
    offer(petPart(pet), slid(columnBox(pet, columns[pet].scale), columns[pet].dx));
  }
  if (fixed.photo.usable) offer("photo", moved(photoRect, held.photo));

  const igMove = move(fixed.ig.rect, held.ig);

  return {
    photo: tucked(moved(photoRect, held.photo)),
    breed: row(TYPE.breed, design.breedSize, MIN_TYPE_SIZE.breed, breedTop, breeds,
               (pet) => text.pets[pet].breed),
    name: row(TYPE.name, design.nameSize, MIN_TYPE_SIZE.name, nameTop, names,
              (pet) => text.pets[pet].name),
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
    snap,
  };
}

/** Has this part been touched at all? Until it has, the design's own Instagram
 *  glyph is left alone — see `ASSETS.igMark`. */
export const isMoved = (a: Adjust) => Boolean(a.dx || a.dy || a.scale !== 1);

/* ------------------------------------------------------------------ *
 * Applying one part's change
 * ------------------------------------------------------------------ */

/** The same box, moved sideways — all a pet's column ever does to one, since
 *  its size is already in the box `columnBox` hands back. */
const slid = (r: CardRect, dx: number): CardRect => ({ ...r, x: r.x + dx });

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
