/**
 * SINGLE SOURCE OF TRUTH for the meishi (business card) layout.
 *
 * Consumed by BOTH renderers:
 *   - app/components/MeishiPreview.tsx … on-screen DOM/CSS preview
 *   - lib/print.ts                     … the print-ready PDF
 *
 * Every geometric value lives here exactly once, expressed as a FRACTION of
 * the card box (never px, never %, never cqw), so the same number can be
 * turned into a CSS percentage for the preview and into PDF points for the
 * print file. Do not restate any of these numbers in either renderer.
 */

import type { Pet } from "./types";

/* ------------------------------------------------------------------ *
 * Physical geometry (print)
 * ------------------------------------------------------------------ */

/** Finished (trimmed) card. Standard Japanese meishi, used portrait. */
export const CARD_TRIM_MM = { width: 55, height: 91 } as const;

/** Bleed added on every side, per the printer's spec. */
export const BLEED_MM = 3;

/** PDF page = trim + bleed all round → 61 × 97 mm. */
export const PAGE_MM = {
  width: CARD_TRIM_MM.width + BLEED_MM * 2,
  height: CARD_TRIM_MM.height + BLEED_MM * 2,
} as const;

/** Resolution the photo — the one raster element left on the card — is
 *  resampled to before it is embedded. */
export const PRINT_DPI = 350;

const MM_PER_INCH = 25.4;

/** Points (1/72 inch) — the unit PDF pages are measured in. */
export const mmToPt = (mm: number) => (mm * 72) / MM_PER_INCH;

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

/**
 * Intrinsic size of /meishi-template.png and /meishi-ribbon.png.
 *
 * These are also what goes into the print PDF. Across the 55 mm card that is
 * 1046 / (55 / 25.4) ≈ 483 dpi — comfortably above the 350 dpi the printer
 * asks for, so the design needs no vector stand-in to print cleanly.
 */
export const TEMPLATE_PX = { width: 1046, height: 1738 } as const;

/** CSS `aspect-ratio` value for the preview card box. */
export const TEMPLATE_ASPECT = `${TEMPLATE_PX.width} / ${TEMPLATE_PX.height}`;

/**
 * The card's height as a multiple of its width.
 *
 * The layout states horizontal measurements as fractions of the card WIDTH and
 * vertical ones as fractions of the card HEIGHT — exactly how CSS resolves an
 * absolutely positioned child — while the type's own flow (font sizes, margins,
 * line boxes) is measured in card widths throughout. These two turn one into
 * the other, so a distance can be carried from one axis to the other without
 * either renderer restating the ratio.
 */
export const CARD_ASPECT = TEMPLATE_PX.height / TEMPLATE_PX.width;

/** A card-WIDTH fraction as the card-HEIGHT fraction covering the same distance. */
export const wToH = (v: number) => v / CARD_ASPECT;

/** A card-HEIGHT fraction as the card-WIDTH fraction covering the same distance. */
export const hToW = (v: number) => v * CARD_ASPECT;

export const ASSETS = {
  /**
   * The design itself. Both renderers place these exact files: the preview as
   * `<img>`, the print PDF as an embedded PNG at its native pixel size.
   *
   * They are deliberately NOT traced into outlines on the way to the PDF. An
   * auto-trace of a bitmap follows the pixel grid, so the paw prints, the
   * Instagram glyph and the ribbon's baked caption came out of it with a
   * staircase along every curve — worse than the artwork it replaced. The
   * original pixels, placed at ≈483 dpi (see TEMPLATE_PX), carry the design's
   * own antialiasing instead.
   */
  template: "/meishi-template.png",
  ribbon: "/meishi-ribbon.png",
  /** The anicas mark placed in the QR's bottom-right corner (500 × 500). */
  logo: "/anicas_logo_br_square.png",
  /**
   * The Instagram glyph, lifted off the template onto a transparent ground.
   *
   * The talent can move the Instagram line, and the glyph belongs to that line
   * — but the glyph is DRAWN INTO /meishi-template.png, so it cannot simply be
   * repositioned. This file is the same pixels: the template's own 103 × 102
   * ink box (IG_MARK), un-composited from the white it was drawn on, so laying
   * it back over white reproduces the template's bytes exactly. A renderer
   * that moves the line paints over the baked glyph and places this one
   * instead; a renderer that has not been asked to move it leaves the
   * template's own glyph alone and never loads this file.
   */
  igMark: "/meishi-instagram.png",
} as const;

/** Paper white — also what the bleed area is flooded with. */
export const PAPER_COLOR = "#FFFFFF";

/* ------------------------------------------------------------------ *
 * Element geometry — fractions of the card box
 * ------------------------------------------------------------------ *
 *
 * Calibrated against the real reference card (public/sample-meishi.png,
 * 1070 × 1778). Measured landmarks (as a fraction of the card):
 *   photo slot              top .029, left .05, w .90, bottom .50 (overlaps ribbon)
 *   ribbon white band       top .45, box bottom .536 (tails reach ~.575)
 *   breed / name / owner    y ≈ .61 / .66 / .71
 *   Instagram icon          x ≈ .06–.16, y ≈ .84–.90 (drawn in the template)
 *   IG text (name + handle) x ≈ .18, y ≈ .85–.90
 *   QR code                 w .265, right margin .075, vertical centre .88
 *                           (square; top derived: .88 − .265·(1046/1738)/2 ≈ .80)
 *   anicas mark (bottom-R)  x ≈ .88–.91, y ≈ .93–.95
 *
 * Z-ORDER (critical): the photo extends DOWN past the ribbon band top so its
 * bottom sits at ~.50 (≈ middle of the white band), then the ribbon overlay
 * (/meishi-ribbon.png — the ribbon lifted off the template onto a transparent
 * background) is drawn ON TOP of the photo. This reproduces the real card,
 * where the ribbon's white band hides the photo's lower edge and the photo
 * peeks out around the band.
 *
 * `top`/`height` are fractions of the card HEIGHT; `left`/`right`/`width` are
 * fractions of the card WIDTH — exactly how CSS resolves them for an
 * absolutely positioned child, so the preview and the print file agree.
 */
export const LAYOUT = {
  photo: { top: 0.029, left: 0.05, width: 0.9, height: 0.471 },
  textBlock: { top: 0.6, left: 0.1, width: 0.8 },
  igBlock: { top: 0.845, left: 0.18, width: 0.46 },
  qr: { top: 0.8, right: 0.075, width: 0.265 },
} as const;

/**
 * The ribbon's white band, in card-height fractions — measured off
 * /meishi-ribbon.png as the rows where the band runs unbroken from side to
 * side (px 785 … 935 of 1738).
 *
 * It is the floor the photo is kept above. The photo's lower edge is meant to
 * be HIDDEN by this band — that is why the slot is allowed to reach down to
 * .50, past the band's top — so a photo the talent has dragged or grown is
 * stopped where the band would stop covering it.
 */
export const RIBBON_BAND = {
  top: 785 / TEMPLATE_PX.height,
  bottom: 936 / TEMPLATE_PX.height,
} as const;

/**
 * Where /meishi-template.png draws the Instagram glyph: its ink box, measured
 * off the file (px 69…171 × 1464…1565), with `left`/`width` as card-width
 * fractions and `top`/`height` as card-height fractions.
 *
 * The glyph travels with the Instagram line when the talent moves it, so both
 * renderers need to know the box twice over: to paint the baked glyph out, and
 * to place `ASSETS.igMark` at wherever the line has been put.
 */
export const IG_MARK = {
  left: 69 / TEMPLATE_PX.width,
  top: 1464 / TEMPLATE_PX.height,
  width: 103 / TEMPLATE_PX.width,
  height: 102 / TEMPLATE_PX.height,
} as const;

/**
 * The box that paints the baked glyph out — the ink box with a few of the
 * template's own white pixels taken with it.
 *
 * Painted flush to the ink, the patch's edges land mid-pixel on both the
 * screen and the printed page, and the outermost column of the glyph survives
 * as a hairline down the card. The template is pure white for 40 px in every
 * direction here, so the patch can simply reach past the ink and be done with
 * it.
 */
const COVER_BLEED_PX = 3;

export const IG_MARK_COVER = {
  left: (69 - COVER_BLEED_PX) / TEMPLATE_PX.width,
  top: (1464 - COVER_BLEED_PX) / TEMPLATE_PX.height,
  width: (103 + COVER_BLEED_PX * 2) / TEMPLATE_PX.width,
  height: (102 + COVER_BLEED_PX * 2) / TEMPLATE_PX.height,
} as const;

/**
 * Aspect ratio (w / h) of the card's photo slot. The framing editor composes
 * onto a canvas of exactly this shape, so what the talent frames there is what
 * `object-fit: cover` shows on the card — with no second crop.
 */
export const PHOTO_SLOT_ASPECT =
  (LAYOUT.photo.width * TEMPLATE_PX.width) /
  (LAYOUT.photo.height * TEMPLATE_PX.height);

/**
 * How much of the white backing disc the anicas mark fills.
 *
 * The disc's own diameter is the QR's business (`lib/qr.ts`: seven modules,
 * the size of a finder pattern) and is not adjustable from here — it has to
 * stay where it is to cover the mark that /meishi-template.png already carries
 * at that spot. What IS adjustable is how much of it the mark takes up.
 *
 * This is the largest the mark can be. `public/anicas_logo_br_square.png` is a
 * 500 × 500 file whose ink is a tall rounded block, not a circle: its furthest
 * inked pixel sits 1.18127 × (box / 2) from the box's centre, so a mark drawn
 * at the disc's full width would spill out of it at the corners. Dividing by
 * that reach is what makes the ink touch the rim and go no further.
 *
 * On a 37-module QR that is a 2.246 mm mark inside a 2.653 mm disc — 0.50 mm
 * bigger across than the 1.749 mm the card carried before. It is short of the
 * 1 mm asked for: 1 mm more would need a 3.25 mm disc, and the disc cannot
 * grow. See docs/print-quality-verification.md.
 */
const LOGO_INK_REACH = 1.18127; // measured from the logo file, in box halves

export const LOGO_IN_DISC = 1 / LOGO_INK_REACH;

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ */

/** Ink colours — the sRGB values of Tailwind's gray-800 / gray-900. */
const INK = {
  soft: "#1e2939",
  strong: "#101828",
} as const;

/** Tailwind `leading-tight`. */
export const LINE_HEIGHT = 1.25;

/**
 * Text runs, in flow order within their block.
 *   size / marginTop … fractions of the card WIDTH (1cqw = 0.01)
 *   weight           … CSS font-weight
 * `marginTop` is the CSS margin above the run; the run is omitted entirely
 * when its text is empty, in both renderers.
 */
export const TYPE = {
  breed: { size: 0.033, marginTop: 0, weight: 400, color: INK.soft },
  name: { size: 0.076, marginTop: 0.005, weight: 700, color: INK.strong },
  owner: { size: 0.045, marginTop: 0.02, weight: 400, color: INK.soft },
  igName: { size: 0.038, marginTop: 0, weight: 500, color: INK.strong },
  igHandle: { size: 0.034, marginTop: 0.003, weight: 400, color: INK.soft },
} as const;

export type TypeSpec = (typeof TYPE)[keyof typeof TYPE];

export type TypeWeight = (typeof TYPE)[keyof typeof TYPE]["weight"];

/**
 * The smallest the card sets type, as a fraction of the card width — the size
 * of `TYPE.breed`, which is the smallest run the design itself uses. Across a
 * 55 mm card that is 1.82 mm, a hair over 5 pt: the floor printers give for
 * Japanese text, which is exactly why the design stops there.
 *
 * It is arrived at the way every other size on the card is: stated once, as a
 * fraction of the card, and read off the design rather than invented. A row
 * the talent shrinks is stopped here. A row the fitting rules have ALREADY
 * pushed below it — a long breed squeezed to clear its neighbour — cannot be
 * shrunk any further; it can still be grown.
 */
export const MIN_TYPE_SIZE = TYPE.breed.size;

/**
 * The smallest a printed QR module may be, in millimetres.
 *
 * A QR is read off its module grid, so what has to stay big enough is one
 * module, not the code: a longer Instagram handle needs a denser QR, and the
 * same square then carries smaller modules. 0.30 mm is a little over four dots
 * at the PRINT_DPI the card is produced at, and comfortably above the 0.25 mm
 * offset printing can hold. On the 37-module QR a typical handle produces, it
 * stops the code at about 79 % of its designed size; see
 * docs/direct-edit-verification.md, where the smallest QR the form allows is
 * decoded off the rendered PDF.
 */
export const MIN_QR_MODULE_MM = 0.3;

/**
 * Fonts embedded in the print PDF, one file per weight `TYPE` asks for.
 *
 * The card text goes into the PDF as text, not as pixels, so it needs a real
 * font to travel with it — the browser's own UI font cannot be embedded. These
 * are Noto Sans JP subset to the cp932 (JIS + NEC/IBM) repertoire, which covers
 * the kana and kanji a pet, breed or owner name can be written with; see
 * `scripts/build-print-fonts.sh`. pdf-lib subsets them again on the way in, so
 * a finished PDF only carries the handful of glyphs that card actually uses.
 *
 * Plain TTF rather than WOFF: fontkit has to undo a WOFF's per-table deflate
 * in JavaScript before it can subset, which costs seconds on a phone, and the
 * server compresses the file on the wire either way.
 */
export const PRINT_FONTS: Record<TypeWeight, string> = {
  400: "/fonts/NotoSansJP-400.ttf",
  500: "/fonts/NotoSansJP-500.ttf",
  700: "/fonts/NotoSansJP-700.ttf",
};

/**
 * Picked up only when a character is missing from the fonts above — an emoji
 * in an Instagram display name, typically. Fetched lazily, so a card whose
 * text is entirely kana/kanji/latin never pays for it.
 */
export const PRINT_FALLBACK_FONT = "/fonts/NotoEmoji-400.ttf";

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

export type CardTextInput = {
  pets: Pet[];
  petCount: number;
  ownerName: string;
  igName: string;
  igHandle: string;
};

/**
 * Every string the card shows, composed once for both renderers — so the
 * 【owner：…】/@ decoration cannot drift between the preview and the print PDF
 * either. An empty run is skipped by both renderers, closing its gap in the
 * vertical flow.
 *
 * The pets come back as PAIRS, one per column, so a breed can never be
 * separated from the name it belongs to. Every string is trimmed here, so
 * nothing but the pet's own letters reaches either renderer.
 */
export type CardText = {
  pets: { name: string; breed: string }[];
  owner: string;
  igName: string;
  igHandle: string;
};

export function cardText(input: CardTextInput): CardText {
  const owner = input.ownerName.trim();
  const handle = input.igHandle.trim();

  return {
    pets: input.pets
      .slice(0, input.petCount)
      .map((pet) => ({ name: pet.name.trim(), breed: pet.breed.trim() }))
      .filter((pet) => pet.name || pet.breed),
    owner: owner && `【owner：${owner}】`,
    igName: input.igName.trim(),
    igHandle: handle && `@${handle}`,
  };
}

/** Every character the card will set, for the font loader to size its subset. */
export const cardGlyphs = (text: CardText) =>
  text.pets.map((p) => p.name + p.breed).join("") +
  text.owner + text.igName + text.igHandle;

/* ------------------------------------------------------------------ *
 * The pets' own words
 * ------------------------------------------------------------------ *
 *
 * A card carries one COLUMN PER PET: the pet's breed on top, its name below,
 * both hung on the same vertical axis, and the columns laid out across the
 * text block. Two, three, four pets — it is the same rule with a different
 * count; nothing here branches on how many there are.
 *
 * The columns sit one name em apart — the full-width space the line used to be
 * joined with. Where the two lines then go on the card is not this module's to
 * say: `lib/card-adjust.ts` moves and resizes each of them from what comes out
 * of here.
 *
 * Neither line is ever allowed onto a second line or past the block's edges.
 * The names come down in size until they fit; the breeds come down until they
 * clear their neighbours and the block. Sizes are worked out from the WORDS
 * THEMSELVES, measured by whichever renderer is asking — the preview from a
 * canvas in the browser's font, the print file from the font it embeds.
 */

/**
 * A string as its renderer measured it, in ems of its own size: how far it
 * advances, and where its ink actually starts and ends relative to the point
 * it is drawn from.
 */
export type Measured = { advance: number; inkLeft: number; inkRight: number };

export const EMPTY_MEASURE: Measured = { advance: 0, inkLeft: 0, inkRight: 0 };

const inkWidth = (m: Measured) => m.inkRight - m.inkLeft;
const inkMid = (m: Measured) => (m.inkLeft + m.inkRight) / 2;

/** Where the type block sits and how wide it is, in card fractions. */
type Block = { left: number; width: number };

/** Gap between two columns: one name em — the full-width space the line used
 *  to be joined with. */
const COLUMN_GAP = TYPE.name.size;

/** Where every pet's words go: one axis each, and the size the two lines end
 *  up at once they have been made to fit. */
export type PetLayout = {
  /** One per pet, in card fractions from the page's left edge. */
  axes: number[];
  nameSize: number;
  breedSize: number;
};

/**
 * Lays the columns out.
 *
 * The names are set as one line — measured widths, one name em between them,
 * the whole thing centred in the block on its INK rather than on its advance
 * box — and each pet's axis is then wherever its own name's ink centre landed.
 * That is exactly what a single centred line has always done, so a card with
 * one or two pets comes out where it always did; what is new is that the
 * breeds are hung on those same axes instead of being centred as a line of
 * their own.
 *
 * Each line is then only as big as it can be:
 *   names   the largest size at which they still fit the block, never more
 *           than the design size
 *   breeds  the largest size at which no breed reaches its neighbour or the
 *           block's edge, never more than the design size
 *
 * so nothing ever wraps and nothing ever runs off the card.
 */
export function layoutPets(
  names: Measured[],
  breeds: Measured[],
  block: Block = LAYOUT.textBlock,
): PetLayout {
  const n = names.length;
  if (!n) return { axes: [], nameSize: TYPE.name.size, breedSize: TYPE.breed.size };

  const gap = COLUMN_GAP;
  const advance = names.reduce((total, m) => total + m.advance, 0);
  const room = Math.max(0, block.width - (n - 1) * gap);
  const nameSize = advance
    ? Math.min(TYPE.name.size, room / advance)
    : TYPE.name.size;

  // Where each name starts, measured from the first one.
  const starts: number[] = [];
  let x = 0;
  for (const m of names) {
    starts.push(x);
    x += m.advance * nameSize + gap;
  }
  // Centre the run on the ink the outermost names actually put down.
  const first = starts[0] + names[0].inkLeft * nameSize;
  const last = starts[n - 1] + names[n - 1].inkRight * nameSize;
  const origin = block.left + (block.width - (last - first)) / 2 - first;
  const axes = names.map((m, i) => origin + starts[i] + inkMid(m) * nameSize);

  return { axes, nameSize, breedSize: breedSize(breeds, axes, block) };
}

/**
 * Clear space kept between two breeds, in ems of their own size — the same
 * one-em separation the card has always put between two pets. Without it a
 * pair of long breeds is merely shrunk until they touch, and the line reads as
 * one word again, which is the very thing the columns are for.
 */
const BREED_SEPARATION = 1;

/**
 * The largest the breeds can be set without one reaching the next, or the
 * outermost reaching the edge of the block. Every constraint is linear in the
 * size, so each is a straight division and the answer is the smallest of them.
 */
function breedSize(breeds: Measured[], axes: number[], block: Block): number {
  const caps: number[] = [TYPE.breed.size];
  const half = (i: number) => inkWidth(breeds[i] ?? EMPTY_MEASURE) / 2;
  const n = axes.length;

  if (half(0) > 0) caps.push((axes[0] - block.left) / half(0));
  if (half(n - 1) > 0) {
    caps.push((block.left + block.width - axes[n - 1]) / half(n - 1));
  }
  for (let i = 0; i < n - 1; i++) {
    const together = half(i) + half(i + 1);
    if (together > 0) {
      caps.push((axes[i + 1] - axes[i]) / (together + BREED_SEPARATION));
    }
  }
  return Math.max(0, Math.min(...caps));
}

/** Where to start drawing a string so its ink centre lands on `axis`. */
export const inkCentred = (m: Measured, axis: number, size: number) =>
  axis - inkMid(m) * size;

/**
 * How far a string has to slide, in ems, to be centred on its INK rather than
 * on its advance box — what a renderer that centres by advance (CSS, or the
 * arithmetic in `drawRuns`) has to add.
 *
 * A Japanese glyph is drawn inside a full-width em and carries whatever is
 * left over as side bearings, and those differ wildly from glyph to glyph —
 * the ト that opens トイプードル hangs 0.30 em of empty space off its left,
 * where the ペ that opens ペコ hangs 0.04. Centring the advance box therefore
 * leaves two lines on visibly different axes.
 */
export const inkOffset = (m: Measured) => m.advance / 2 - inkMid(m);

/* ------------------------------------------------------------------ *
 * Line breaking
 * ------------------------------------------------------------------ *
 *
 * The owner line and the two Instagram lines are flowed rather than placed,
 * so a long one has to be broken somewhere — and both renderers have to break
 * it in the same place. The rules live here and each renderer supplies its own
 * width function, measured in the font it is actually setting.
 */

const CJK =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/**
 * Splits text at the points a browser is allowed to break a line with the
 * default `word-break: normal`: after a space, and between two characters when
 * either of them is CJK.
 */
function segments(text: string): string[] {
  const chars = Array.from(text);
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (buf && (CJK.test(ch) || CJK.test(chars[i - 1]))) {
      out.push(buf);
      buf = "";
    }
    buf += ch;
    if (ch === " ") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Greedy line breaking. A single unbreakable chunk wider than the box
 *  overflows rather than being split, matching `overflow-wrap: normal`. */
export function wrapText(
  width: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const parts = segments(text);
  const lines: string[] = [];
  let line = "";
  for (const part of parts) {
    const candidate = line + part;
    if (line && width(candidate.trimEnd()) > maxWidth) {
      lines.push(line.trimEnd());
      line = part.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd());
  return lines.length ? lines : [text];
}

/* ------------------------------------------------------------------ *
 * Unit helpers (so neither renderer restates a number)
 * ------------------------------------------------------------------ */

/** Fraction → CSS percentage, for the DOM preview. */
export const pct = (v: number) => `${v * 100}%`;

/** Fraction of the card width → CSS `cqw`, for the DOM preview. */
export const cqw = (v: number) => `${v * 100}cqw`;
