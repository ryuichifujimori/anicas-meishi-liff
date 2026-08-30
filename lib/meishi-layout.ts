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

/** The QR's side on the finished card, in mm — it is square. */
export const QR_MM = LAYOUT.qr.width * CARD_TRIM_MM.width;

/**
 * Diameter of the anicas mark on the card, white backing disc included.
 *
 * The mark sits inside the disc, and the disc is inscribed in the QR's
 * bottom-right corner — tangent to the matrix's right and bottom edges, the
 * same corner it has always hugged. Stated here in millimetres because that is
 * how it is specified and measured; `lib/qr.ts` turns it into its own
 * coordinates through QR_MM.
 *
 * THIS IS AS BIG AS THE MARK CAN GET. The disc hides every module it covers,
 * and error-correction level H has to reconstruct them, so the size is capped
 * by what still scans. Measured on cards the form actually produced, decoded
 * with zxing-cpp (docs/print-quality-verification.md):
 *
 *   7.4 mm  read at no resolution at all
 *   7.0 mm  read at 200/350/600/1200 dpi, failed at 150 and 300
 *   6.8 mm  read at every resolution for a 12-character handle, but lost
 *           150 dpi at 14 — worse than the card is now
 *   6.4 mm  identical to the card as it stands, at 150/200/300/350/600/1200
 *           dpi, for every handle length Instagram allows (30 characters,
 *           which is a 41-module QR)
 *
 * Raising it means proving the same table again.
 */
export const LOGO_DISC_MM = 6.4;

/** The mark's share of that diameter — the proportion the card has always had. */
export const LOGO_IN_DISC = 0.65934;

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
 * ------------------------------------------------------------------ */

/**
 * Travel of the spacing bar in step 4, as a fraction of the card width.
 *
 * It is one breed-line em, which is also exactly the gap the breed line has by
 * default — so the bar's left stop closes that gap and its right stop doubles
 * it, and the whole range is ±1.8 mm on a 55 mm card.
 */
export const PET_SPREAD_RANGE = TYPE.breed.size;

/**
 * The bar itself, as step 4 hands it to `<input type="range">`: its default is
 * its centre, so a talent who never touches it gets the card as designed.
 */
export const PET_SPREAD_BAR = {
  min: -1,
  max: 1,
  step: 0.05,
  default: 0,
} as const;

export const clampSpread = (spread: number) =>
  Math.min(PET_SPREAD_BAR.max, Math.max(PET_SPREAD_BAR.min, spread || 0));

/**
 * Gap between two pets on one line, as a fraction of the card width.
 *
 * One em by default — the width of the full-width space the line used to be
 * joined with, so the bar at rest reproduces the card exactly as it was. The
 * bar then adds the SAME amount to every line, which is what keeps a pet's
 * name and its breed moving together: widening the gap by d slides each
 * outer pet d/2 (two pets) or d (three) away from the card's centre line, on
 * the name line and the breed line alike.
 */
export const petGap = (spec: TypeSpec, spread: number) =>
  spec.size + clampSpread(spread) * PET_SPREAD_RANGE;

/* ------------------------------------------------------------------ *
 * Unit helpers (so neither renderer restates a number)
 * ------------------------------------------------------------------ */

/** Fraction → CSS percentage, for the DOM preview. */
export const pct = (v: number) => `${v * 100}%`;

/** Fraction of the card width → CSS `cqw`, for the DOM preview. */
export const cqw = (v: number) => `${v * 100}cqw`;
