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

/** Intrinsic size of /meishi-template.png and /meishi-ribbon.png. */
export const TEMPLATE_PX = { width: 1046, height: 1738 } as const;

/** CSS `aspect-ratio` value for the preview card box. */
export const TEMPLATE_ASPECT = `${TEMPLATE_PX.width} / ${TEMPLATE_PX.height}`;

export const ASSETS = {
  /** Raster design — what the on-screen preview shows. */
  template: "/meishi-template.png",
  ribbon: "/meishi-ribbon.png",
  /**
   * The same two pieces of artwork as outlines, in single-page vector PDFs.
   * `lib/print.ts` places these instead of the PNGs, so the paw prints, the
   * ribbon line-art, the baked caption and the Instagram glyph print as
   * shapes rather than pixels. Regenerated from the PNGs above by
   * `scripts/build-print-vectors.py` — the PNGs stay the design source.
   */
  templateVector: "/meishi-template.pdf",
  ribbonVector: "/meishi-ribbon.pdf",
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

/**
 * What separates the pets on a card that carries more than one: a full-width
 * space, exactly as on the printed card. No "&" between names and no "/"
 * between breeds.
 */
export const PET_SEPARATOR = "\u3000";

export type CardTextInput = {
  pets: Pet[];
  petCount: number;
  ownerName: string;
  igName: string;
  igHandle: string;
};

/**
 * Every string the card shows, composed once for both renderers — so the
 * separators and the 【owner：…】/@ decoration cannot drift between the
 * preview and the print PDF either. An empty run is returned as "" and is
 * skipped by both renderers, closing its gap in the vertical flow.
 */
export function cardText(input: CardTextInput) {
  const visible = input.pets.slice(0, input.petCount);
  const list = (field: (pet: Pet) => string) =>
    visible
      .map((pet) => field(pet).trim())
      .filter(Boolean)
      .join(PET_SEPARATOR);

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
 * Unit helpers (so neither renderer restates a number)
 * ------------------------------------------------------------------ */

/** Fraction → CSS percentage, for the DOM preview. */
export const pct = (v: number) => `${v * 100}%`;

/** Fraction of the card width → CSS `cqw`, for the DOM preview. */
export const cqw = (v: number) => `${v * 100}cqw`;
