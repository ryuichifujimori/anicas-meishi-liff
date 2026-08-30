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
 * The pet lines come back as ONE STRING PER PET rather than as a joined line:
 * what goes between them is a measured gap (`petGap`), not a character, which
 * is what lets the talent open the names up. Each string is trimmed here, so
 * nothing but the pet's own letters reaches either renderer.
 */
export function cardText(input: CardTextInput) {
  const visible = input.pets.slice(0, input.petCount);
  const list = (field: (pet: Pet) => string) =>
    visible.map((pet) => field(pet).trim()).filter(Boolean);

  const owner = input.ownerName.trim();
  const handle = input.igHandle.trim();

  return {
    breeds: list((pet) => pet.breed),
    names: list((pet) => pet.name),
    owner: owner && `【owner：${owner}】`,
    igName: input.igName.trim(),
    igHandle: handle && `@${handle}`,
  };
}

/* ------------------------------------------------------------------ *
 * How far apart the pets sit
 * ------------------------------------------------------------------ *
 *
 * The bar in step 4 sets ONE number: how much to add to the gap between two
 * pets, as a fraction of the card width. It is added to the name line and the
 * breed line alike, which is what keeps a pet's name and its breed moving
 * together — widening by d slides each outer pet d/2 (two pets) or d (three)
 * away from the card's centre line, on both lines equally.
 *
 * How far it may travel is NOT a fixed number: it depends on what the talent
 * typed. Both ends are worked out from the measured width of the actual words
 * (`spreadLimits`), so a card with short names can open up much further than
 * one with long ones. The renderers supply the measurements — the preview from
 * a canvas in the browser's own font, the print file from the font it embeds —
 * so neither has to guess at the other's metrics.
 */

/** One line the bar moves: its type, and the width of each pet's text on it
 *  in ems of that line's own size. */
export type SpreadLine = {
  spec: TypeSpec;
  /** One entry per pet, in ems. */
  widths: number[];
  /** Whether the line may shrink to stay on one line (`fittedSize`). A line
   *  that can shrink does not cap how far the bar opens. */
  shrinks?: boolean;
};

const movable = (lines: SpreadLine[]) => lines.filter((l) => l.widths.length >= 2);

const lineWidth = (line: SpreadLine) =>
  line.widths.reduce((total, w) => total + w, 0) * line.spec.size;

/**
 * The bar's travel, as a fraction of the card width.
 *
 * `min` is where the first pair of words on any line meets: one line's gap
 * closes to nothing, and pushing past it would run two words into each other.
 * With a breed line present that is the breed line, whose gap (one breed em)
 * is the smaller of the two — so the names stop a little short of touching.
 * Letting them touch would need the breed line to move a different amount from
 * the name line, and it moves the same amount by design.
 *
 * `max` is where the outermost word of a line that cannot shrink — the names —
 * reaches the edge of the text block, i.e. the card's own margin. The breed
 * line does not cap it: it shrinks to fit instead.
 */
export function spreadLimits(lines: SpreadLine[]): { min: number; max: number } {
  const moving = movable(lines);
  if (!moving.length) return { min: 0, max: 0 };

  const min = -Math.min(...moving.map((l) => l.spec.size));
  const rigid = moving.filter((l) => !l.shrinks);
  const max = Math.min(
    ...(rigid.length ? rigid : moving).map(
      (l) =>
        (LAYOUT.textBlock.width - lineWidth(l)) / (l.widths.length - 1) - l.spec.size,
    ),
  );
  return { min, max: Math.max(min, max) };
}

export type SpreadLimits = { min: number; max: number };

/** Keeps a stored bar value inside what the words currently typed allow. */
export const clampSpread = (spread: number, limits: SpreadLimits) =>
  Math.min(limits.max, Math.max(limits.min, spread || 0));

/**
 * The bar's own position, −1 … +1, and the gap it stands for.
 *
 * The travel is not symmetric — a card can usually be opened up much further
 * than it can be closed — but the bar still has to rest in the middle when it
 * is untouched, so each half of it is mapped onto its own end of the travel.
 */
export const spreadFromBar = (bar: number, limits: SpreadLimits) =>
  bar < 0 ? -bar * limits.min : bar * limits.max;

export const barFromSpread = (spread: number, limits: SpreadLimits) => {
  if (spread < 0) return limits.min ? -spread / limits.min : 0;
  return limits.max ? spread / limits.max : 0;
};

/**
 * Gap between two pets on one line, as a fraction of the card width: one em —
 * the full-width space the line used to be joined with, so the bar at rest
 * reproduces the card exactly as it was — plus whatever the bar adds.
 */
export const petGap = (spec: TypeSpec, spread: number) => spec.size + spread;

/**
 * Floor for a line that shrinks to fit: 4 pt, about the smallest Japanese type
 * worth putting on a printed card.
 */
export const MIN_TYPE_SIZE = (4 * MM_PER_INCH) / 72 / CARD_TRIM_MM.width;

/**
 * The size a line has to come down to for its words to hold on ONE line, as a
 * fraction of the card width.
 *
 * A long breed — オーストラリアンラブラドゥードゥル and the like — used to wrap
 * onto a second line, which pushed the name line down and broke the spacing
 * between the two. The line is set smaller instead, and never wraps.
 *
 * The gaps are left exactly as the bar set them and only the glyphs shrink, so
 * the breed line keeps tracking the name line. Returns the floor when even
 * that is not enough, in which case the line runs into the card's margins
 * rather than wrapping.
 */
export function fittedSize(
  spec: TypeSpec,
  widths: number[],
  gap: number,
  blockWidth: number = LAYOUT.textBlock.width,
): number {
  const glyphs = widths.reduce((total, w) => total + w, 0) * spec.size;
  const room = blockWidth - (widths.length - 1) * gap;
  if (glyphs <= room) return spec.size;
  return Math.max(MIN_TYPE_SIZE, (room / glyphs) * spec.size);
}

/* ------------------------------------------------------------------ *
 * Unit helpers (so neither renderer restates a number)
 * ------------------------------------------------------------------ */

/** Fraction → CSS percentage, for the DOM preview. */
export const pct = (v: number) => `${v * 100}%`;

/** Fraction of the card width → CSS `cqw`, for the DOM preview. */
export const cqw = (v: number) => `${v * 100}cqw`;
