"use client";

import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import type { MeishiQr } from "./qr";
import type { Pet } from "./types";
import {
  ASSETS,
  BLEED_MM,
  CARD_TRIM_MM,
  LAYOUT,
  LINE_HEIGHT,
  PAGE_MM,
  PAPER_COLOR,
  PRINT_DPI,
  PRINT_FALLBACK_FONT,
  PRINT_FONTS,
  TEMPLATE_PX,
  TYPE,
  type Measured,
  type TypeSpec,
  type TypeWeight,
  EMPTY_MEASURE,
  cardGlyphs,
  cardText,
  clampSpread,
  inkCentred,
  inkOffset,
  layoutPets,
  mmToPt,
  spreadLimits,
} from "./meishi-layout";

/**
 * Print-ready artwork for the meishi.
 *
 * Lays out exactly what `MeishiPreview` shows, from the same
 * `lib/meishi-layout.ts` definition, onto a 61 × 97 mm page (55 × 91 mm card
 * + 3 mm bleed) — but as a real PDF rather than as one flattened raster:
 *
 *   template / ribbon  the design's own PNGs, embedded whole (≈483 dpi there)
 *   text               live text in an embedded font, selectable and searchable
 *   QR                 the module shapes drawn as paths
 *   anicas mark        the 500 × 500 master, embedded whole and scaled down
 *   photo              resampled to 350 dpi
 *
 * The talent's own words are the part that has to stay sharp at any size, and
 * they are the part that is type. The drawn design is left as the pixels it
 * was drawn as: tracing it into outlines put a staircase along every curve of
 * the paw prints, the Instagram glyph and the ribbon's caption, because a
 * trace can only follow the pixel grid it is given.
 *
 * This module is deliberately standalone: it takes plain data, touches no
 * React state and is not tied to the submit button, so the same call can be
 * made later from a payment-completion handler.
 */

export type MeishiPrintInput = {
  /** Composed pet photo (data URL) — what `MeishiPreview` shows in the slot. */
  composedPhoto: string | null;
  /** Styled QR and its overlay geometry, from `lib/qr.ts`. */
  qr: MeishiQr | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  /**
   * The step-4 bar: how much to add to the gap between two pets, as a fraction
   * of the card width. 0 is the card as designed.
   */
  nameSpread: number;
  igHandle: string;
  igName: string;
  ownerName: string;
};

export type PrintImageFormat = "png" | "jpeg";

export type PrintOptions = {
  /**
   * Encoding of the embedded photo. PNG (default) is lossless; the QR and the
   * type no longer ride along inside it, but a photograph is worth keeping
   * clean.
   */
  format?: PrintImageFormat;
  /** JPEG quality, only used when `format` is "jpeg". */
  jpegQuality?: number;
};

type PdfLib = typeof import("pdf-lib");

const DEFAULT_FORMAT: PrintImageFormat = "png";
const DEFAULT_JPEG_QUALITY = 0.95;

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Builds the print-ready PDF and returns it as a `data:application/pdf;base64,…`
 * URL: one 61 × 97 mm page carrying the card edge to edge, with TrimBox/BleedBox
 * set so the printer knows where the 55 × 91 mm card is cut.
 *
 * Standalone by design — call it from the submit handler today, or from a
 * payment-completion handler later, with the same plain input.
 */
export async function generateMeishiPrintPdf(
  input: MeishiPrintInput,
  options: PrintOptions = {},
): Promise<string> {
  const lib = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;

  const pdf = await lib.PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`anicas meishi ${input.igHandle.trim()}`.trim());
  pdf.setCreator("anicas 名刺フォーム");

  const pageW = mmToPt(PAGE_MM.width);
  const pageH = mmToPt(PAGE_MM.height);
  const page = pdf.addPage([pageW, pageH]);
  const card = cardBox();
  const slot = box(card, LAYOUT.photo);
  const text = cardText(input);

  // Paper white over the whole sheet, bleed included: the template's ground is
  // white, so anything the artwork does not cover reads as an uninterrupted
  // continuation of the card past the trim line.
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageW,
    height: pageH,
    color: ink(lib, PAPER_COLOR),
  });

  const [template, ribbon, photo, logo, fonts] = await Promise.all([
    embedArtwork(pdf, ASSETS.template),
    embedArtwork(pdf, ASSETS.ribbon),
    input.composedPhoto
      ? embedPhoto(pdf, input.composedPhoto, slot, options)
      : null,
    input.qr ? embedArtwork(pdf, ASSETS.logo) : null,
    loadFonts(pdf, cardGlyphs(text)),
  ]);

  // Same paint order as MeishiPreview: template → photo → ribbon → text → QR.
  const placeCard = (art: PDFImage) =>
    page.drawImage(art, {
      x: card.x,
      y: pageH - card.top - card.height,
      width: card.width,
      height: card.height,
    });

  placeCard(template);

  if (photo) {
    page.drawImage(photo, {
      x: slot.x,
      y: pageH - slot.top - slot.height,
      width: slot.width,
      height: slot.height,
    });
  }

  // The ribbon's white band goes IN FRONT of the photo and hides its lower
  // edge — the reason the photo slot is allowed to run past the band's top.
  placeCard(ribbon);

  // The columns are worked out here against the font going into the PDF, by
  // the same functions the preview runs against the font on screen. A bar
  // value saved when the names were shorter is brought back inside range
  // rather than pushing the type out of its block.
  const measured = (weight: TypeSpec, value: string) =>
    measureRun(fonts[weight.weight], value);
  const names = text.pets.map((pet) => measured(TYPE.name, pet.name));
  const breeds = text.pets.map((pet) => measured(TYPE.breed, pet.breed));
  const columns = layoutPets(
    names,
    breeds,
    clampSpread(input.nameSpread, spreadLimits(names)),
  );
  const column = (
    measures: Measured[],
    size: number,
    value: (pet: (typeof text.pets)[number]) => string,
  ) => ({
    size,
    items: text.pets.map((pet, i) => ({
      text: value(pet),
      x: inkCentred(measures[i], columns.axes[i], size),
    })),
  });

  drawRuns(page, {
    block: box(card, LAYOUT.textBlock),
    align: "center",
    cardX: card.x,
    cardWidth: card.width,
    pageHeight: pageH,
    fonts,
    lib,
    runs: [
      {
        spec: TYPE.breed,
        columns: column(breeds, columns.breedSize, (pet) => pet.breed),
      },
      {
        spec: TYPE.name,
        columns: column(names, columns.nameSize, (pet) => pet.name),
      },
      { spec: TYPE.owner, text: text.owner },
    ],
  });

  drawRuns(page, {
    block: box(card, LAYOUT.igBlock),
    align: "left",
    cardWidth: card.width,
    pageHeight: pageH,
    cardX: card.x,
    fonts,
    lib,
    runs: [
      { spec: TYPE.igName, text: text.igName },
      { spec: TYPE.igHandle, text: text.igHandle },
    ],
  });

  if (input.qr && logo) {
    drawQr(page, input.qr, logo, card, pageH, lib);
  }

  // Where the sheet is cut down to the finished card, and how far the artwork
  // is allowed to run past it.
  page.setTrimBox(
    mmToPt(BLEED_MM),
    mmToPt(BLEED_MM),
    mmToPt(CARD_TRIM_MM.width),
    mmToPt(CARD_TRIM_MM.height),
  );
  page.setBleedBox(0, 0, pageW, pageH);

  return pdf.saveAsBase64({ dataUri: true });
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ *
 *
 * Boxes are kept in PDF points with `top` measured DOWN from the top of the
 * page — the way `lib/meishi-layout.ts` states the layout and the way CSS
 * resolves it — and are flipped into PDF's bottom-left origin only at the
 * moment something is drawn.
 */

type Box = { x: number; top: number; width: number; height: number };

/**
 * Where the card artwork sits on the sheet.
 *
 * The trim rectangle is centred on the page. The template's aspect ratio is a
 * hair narrower than the card's, so the artwork is scaled to *cover* the trim
 * rather than stretched to it — no distortion, and the ≈0.19 mm of overflow at
 * top and bottom falls harmlessly inside the bleed.
 */
function cardBox(): Box {
  const trimW = mmToPt(CARD_TRIM_MM.width);
  const trimH = mmToPt(CARD_TRIM_MM.height);
  const inset = mmToPt(BLEED_MM);

  const scale = Math.max(trimW / TEMPLATE_PX.width, trimH / TEMPLATE_PX.height);
  const width = TEMPLATE_PX.width * scale;
  const height = TEMPLATE_PX.height * scale;

  return {
    x: inset + (trimW - width) / 2,
    top: inset + (trimH - height) / 2,
    width,
    height,
  };
}

/**
 * Resolves a layout rectangle against the card box the way CSS resolves an
 * absolutely positioned child: `top`/`height` against the card height,
 * `left`/`width` against the card width.
 */
function box(
  card: Box,
  rect: { top: number; left: number; width: number; height?: number },
): Box {
  return {
    x: card.x + rect.left * card.width,
    top: card.top + rect.top * card.height,
    width: rect.width * card.width,
    height: (rect.height ?? 0) * card.height,
  };
}

/* ------------------------------------------------------------------ *
 * Artwork
 * ------------------------------------------------------------------ */

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * A piece of the drawn design, embedded byte-for-byte as the PNG it is.
 *
 * No trace, no resample, no re-encode: the file that goes into the PDF is the
 * file the designer drew, placed at whatever size the card wants it. The
 * template and ribbon land at ≈483 dpi that way and the anicas mark far
 * higher, so none of them needs the pixel grid the photo has to live with.
 */
async function embedArtwork(pdf: PDFDocument, url: string): Promise<PDFImage> {
  return pdf.embedPng(await fetchBytes(url));
}

/**
 * The photo, and only the photo, is rasterised.
 *
 * It is resampled onto exactly the pixel grid the slot needs at PRINT_DPI —
 * the same 350 dpi the card has always been produced at — and that resample is
 * also where CSS `object-fit: cover` gets applied, since a PDF cannot crop an
 * image it places.
 */
async function embedPhoto(
  pdf: PDFDocument,
  dataUrl: string,
  slot: Box,
  options: PrintOptions,
): Promise<PDFImage> {
  const width = Math.round((slot.width / 72) * PRINT_DPI);
  const height = Math.round((slot.height / 72) * PRINT_DPI);

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // CSS `object-fit: cover` with the default 50% 50% position.
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);

  const format = options.format ?? DEFAULT_FORMAT;
  const bytes = await canvasToBytes(
    canvas,
    format,
    options.jpegQuality ?? DEFAULT_JPEG_QUALITY,
  );
  return format === "png" ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/* ------------------------------------------------------------------ *
 * QR
 * ------------------------------------------------------------------ */

/**
 * Draws the QR as shapes.
 *
 * `lib/qr.ts` hands over the very QR the preview shows, as SVG; its module
 * outlines go straight into the PDF, so the modules keep hard edges at any
 * size instead of being a picture of a QR that has been scaled down. The white
 * backing disc becomes a PDF circle, and the anicas mark is the untouched
 * 500 × 500 master placed at the size the card wants.
 */
function drawQr(
  page: PDFPage,
  qr: MeishiQr,
  logo: PDFImage,
  card: Box,
  pageHeight: number,
  lib: PdfLib,
) {
  const side = LAYOUT.qr.width * card.width; // square
  const scale = side / qr.size;
  // Page position of the QR's own (0, 0), i.e. its top-left corner.
  const origin = {
    x: card.x + card.width * (1 - LAYOUT.qr.right) - side,
    y: pageHeight - (card.top + LAYOUT.qr.top * card.height),
  };

  const shapes = parseQrShapes(qr.svg);
  // A QR that silently came out blank would be printed as a blank QR.
  if (!shapes.length) throw new Error("QR outlines could not be read");

  for (const shape of shapes) {
    page.drawSvgPath(shape.path, {
      ...anchor(lib, origin, shape.pivot, shape.rotation, scale),
      scale,
      color: ink(lib, shape.fill),
    });
  }

  const { cx, cy, radius, logo: mark } = qr.overlay;
  page.drawEllipse({
    x: origin.x + cx * scale,
    y: origin.y - cy * scale,
    xScale: radius * scale,
    yScale: radius * scale,
    color: ink(lib, "#FFFFFF"),
  });
  page.drawImage(logo, {
    x: origin.x + mark.x * scale,
    y: origin.y - (mark.y + mark.size) * scale,
    width: mark.size * scale,
    height: mark.size * scale,
  });
}

type QrShape = {
  path: string;
  fill: string;
  /** Degrees, in SVG's sense (positive = clockwise on screen). */
  rotation: number;
  pivot: { x: number; y: number };
};

/**
 * Turns qr-code-styling's SVG into flat path data.
 *
 * It paints each colour as one rectangle clipped by a `<clipPath>` holding
 * that colour's module shapes, so what is worth keeping is the clip paths'
 * children — circles, rects and paths, each optionally spun a quarter turn
 * about its own centre.
 */
function parseQrShapes(svg: string): QrShape[] {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const clips = new Map(
    Array.from(doc.querySelectorAll("clipPath")).map((c) => [c.getAttribute("id"), c]),
  );
  const shapes: QrShape[] = [];

  for (const painted of Array.from(doc.querySelectorAll("[clip-path]"))) {
    const fill = painted.getAttribute("fill") ?? "";
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(fill)) continue; // "transparent", gradients
    const ref = /url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(
      painted.getAttribute("clip-path") ?? "",
    );
    const clip = ref && clips.get(ref[1]);
    if (!clip) continue;

    for (const node of Array.from(clip.children)) {
      const path = shapeToPath(node);
      if (!path) continue;
      const spin = /rotate\(\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*\)/.exec(
        node.getAttribute("transform") ?? "",
      );
      shapes.push({
        path,
        fill,
        rotation: spin ? Number(spin[1]) : 0,
        pivot: spin ? { x: Number(spin[2]), y: Number(spin[3]) } : { x: 0, y: 0 },
      });
    }
  }
  return shapes;
}

function shapeToPath(node: Element): string | null {
  const n = (name: string) => Number(node.getAttribute(name) ?? 0);
  switch (node.tagName) {
    case "path":
      return node.getAttribute("d");
    case "rect": {
      const [x, y, w, h] = [n("x"), n("y"), n("width"), n("height")];
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
    }
    case "circle": {
      const [cx, cy, r] = [n("cx"), n("cy"), n("r")];
      return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    }
    default:
      return null;
  }
}

/**
 * Where to hand a shape to `drawSvgPath` so it lands where SVG puts it.
 *
 * `drawSvgPath` rotates about the point it is given, so a shape SVG spins
 * about some other pivot needs a compensated origin. Both the angle and the
 * pivot come back through the y-flip that separates SVG's axes from PDF's,
 * which is where the sign changes come from.
 */
function anchor(
  lib: PdfLib,
  origin: { x: number; y: number },
  pivot: { x: number; y: number },
  rotation: number,
  scale: number,
) {
  const theta = (-rotation * Math.PI) / 180;
  const [u, v] = [pivot.x * scale, -pivot.y * scale];
  return {
    x: origin.x + u - (u * Math.cos(theta) - v * Math.sin(theta)),
    y: origin.y + v - (u * Math.sin(theta) + v * Math.cos(theta)),
    rotate: lib.degrees(-rotation),
  };
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

/**
 * The slice of fontkit's API this module uses. `@pdf-lib/fontkit` ships no
 * type declarations, and pdf-lib's own `PDFFont` gives advance widths but not
 * the glyph outlines the ink measurements need.
 */
type FontkitFont = {
  unitsPerEm: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): {
    glyphs: { advanceWidth: number; bbox?: { minX: number; maxX: number } }[];
  };
};

/** One embedded font file — what pdf-lib draws with, plus the metrics it does
 *  not expose. `ink` is in ems, measured from the point the text is drawn. */
type Face = {
  pdf: PDFFont;
  covers(codePoint: number): boolean;
  ink(text: string): { inkLeft: number; inkRight: number };
};

/** One weight, plus whatever is needed for characters it does not carry. */
type FontSet = { primary: Face; fallback?: Face };

type Fonts = Record<TypeWeight, FontSet>;

/**
 * Fetches and embeds the fonts the card's type needs.
 *
 * The fallback is fetched only when `text` contains something the subset
 * cannot write — an emoji in an Instagram display name, say — so an ordinary
 * card never pays for it. pdf-lib subsets each font again on the way in, so
 * the finished PDF carries only the glyphs this card actually uses.
 */
async function loadFonts(pdf: PDFDocument, text: string): Promise<Fonts> {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const weights = Object.keys(PRINT_FONTS).map(Number) as TypeWeight[];

  const face = async (url: string): Promise<Face> => {
    const bytes = await fetchBytes(url);
    const metrics = fontkit.create(bytes) as unknown as FontkitFont;
    return {
      pdf: await pdf.embedFont(bytes, { subset: true }),
      covers: (codePoint) => metrics.hasGlyphForCodePoint(codePoint),
      ink: (run) => {
        let x = 0;
        let left = Infinity;
        let right = -Infinity;
        for (const glyph of metrics.layout(run).glyphs) {
          const box = glyph.bbox;
          if (box && Number.isFinite(box.minX) && Number.isFinite(box.maxX)) {
            left = Math.min(left, x + box.minX);
            right = Math.max(right, x + box.maxX);
          }
          x += glyph.advanceWidth;
        }
        // A run with no ink at all — a space — has nothing to centre on.
        if (!Number.isFinite(left)) return { inkLeft: 0, inkRight: x / metrics.unitsPerEm };
        return {
          inkLeft: left / metrics.unitsPerEm,
          inkRight: right / metrics.unitsPerEm,
        };
      },
    };
  };

  const loaded = await Promise.all(
    weights.map(async (weight) => [weight, await face(PRINT_FONTS[weight])] as const),
  );

  const uncovered = Array.from(text).some((ch) =>
    loaded.some(([, f]) => !f.covers(ch.codePointAt(0) ?? 0)),
  );
  const fallback = uncovered ? await face(PRINT_FALLBACK_FONT) : undefined;

  return Object.fromEntries(
    loaded.map(([weight, primary]) => [weight, { primary, fallback }]),
  ) as Fonts;
}

/**
 * One string as the embedded fonts will actually set it, in ems — the same
 * numbers `lib/card-metrics.ts` gets from a canvas, so both renderers can be
 * laid out by the same functions in `lib/meishi-layout.ts`.
 *
 * The advance comes from pdf-lib, which is what `drawText` will advance by;
 * the ink comes from fontkit, which pdf-lib does not expose.
 */
function measureRun(font: FontSet, text: string): Measured {
  if (!text) return EMPTY_MEASURE;
  let advance = 0;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  for (const piece of splitByFont(font, text)) {
    const ink = piece.font.ink(piece.text);
    inkLeft = Math.min(inkLeft, advance + ink.inkLeft);
    inkRight = Math.max(inkRight, advance + ink.inkRight);
    advance += piece.font.pdf.widthOfTextAtSize(piece.text, 1);
  }
  return Number.isFinite(inkLeft)
    ? { advance, inkLeft, inkRight }
    : { advance, inkLeft: 0, inkRight: advance };
}

/**
 * One line of the card's type: either a single string flowed in the block, or
 * one item per pet, each already placed on its own column's axis.
 */
type Run = {
  spec: TypeSpec;
  text?: string;
  columns?: { size: number; items: { text: string; x: number }[] };
};

/**
 * Lays a stack of lines down the block the way the browser lays out the
 * preview's block children: each gets its `marginTop`, then one line box of
 * `LINE_HEIGHT × the design font size` per (wrapped) line, with the glyphs'
 * content area centred in that box via half-leading. An empty line is skipped
 * entirely, so an absent breed or owner closes its gap exactly as on screen.
 *
 * The line box is always the DESIGN size even when the glyphs have been set
 * smaller to fit, so shrinking one line never shifts the ones below it.
 */
function drawRuns(
  page: PDFPage,
  opts: {
    block: Box;
    align: "left" | "center";
    /** Left edge of the card artwork on the page, which the columns' own
     *  coordinates are measured from. */
    cardX: number;
    cardWidth: number;
    pageHeight: number;
    fonts: Fonts;
    lib: PdfLib;
    runs: Run[];
  },
) {
  let top = opts.block.top;

  for (const run of opts.runs) {
    const items = run.columns?.items.filter((item) => item.text) ?? [];
    if (!run.text && !items.length) continue;

    const font = opts.fonts[run.spec.weight];
    const colour = ink(opts.lib, run.spec.color);
    const size = (run.columns?.size ?? run.spec.size) * opts.cardWidth;
    const lineBox = LINE_HEIGHT * run.spec.size * opts.cardWidth;
    // CSS centres the font's content area (ascent + descent) in the line box
    // and hangs the glyphs off its top.
    const halfLeading = (lineBox - font.primary.pdf.heightAtSize(size)) / 2;
    const baseline =
      halfLeading + font.primary.pdf.heightAtSize(size, { descender: false });

    top += run.spec.marginTop * opts.cardWidth;
    const y = opts.pageHeight - (top + baseline);

    if (run.columns) {
      for (const item of items) {
        draw(page, font, item.text, opts.cardX + item.x * opts.cardWidth, y, size, colour);
      }
      top += lineBox;
      continue;
    }

    const width = (text: string) => measure(font, text, size);
    for (const line of wrapText(width, run.text ?? "", opts.block.width)) {
      const x =
        opts.align === "center"
          ? opts.block.x +
            (opts.block.width - width(line)) / 2 +
            inkOffset(measureRun(font, line)) * size
          : opts.block.x;
      draw(page, font, line, x, opts.pageHeight - (top + baseline), size, colour);
      top += lineBox;
    }
  }
}

/** Puts one string down, switching face wherever the primary cannot set it. */
function draw(
  page: PDFPage,
  font: FontSet,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: ReturnType<typeof ink>,
) {
  for (const piece of splitByFont(font, text)) {
    page.drawText(piece.text, { x, y, size, font: piece.font.pdf, color: colour });
    x += piece.font.pdf.widthOfTextAtSize(piece.text, size);
  }
}

/** The face that can set a given character: the run's own, or the fallback. */
function pickFont(font: FontSet, ch: string): Face {
  return font.primary.covers(ch.codePointAt(0) ?? 0) || !font.fallback
    ? font.primary
    : font.fallback;
}

/** Splits a line into the longest runs that one font can set on its own. */
function splitByFont(font: FontSet, line: string): { font: Face; text: string }[] {
  const pieces: { font: Face; text: string }[] = [];
  for (const ch of Array.from(line)) {
    const chosen = pickFont(font, ch);
    const last = pieces[pieces.length - 1];
    if (last && last.font === chosen) last.text += ch;
    else pieces.push({ font: chosen, text: ch });
  }
  return pieces;
}

function measure(font: FontSet, text: string, size: number): number {
  return splitByFont(font, text).reduce(
    (total, piece) => total + piece.font.pdf.widthOfTextAtSize(piece.text, size),
    0,
  );
}

const CJK =
  /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

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
function wrapText(
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
 * Plumbing
 * ------------------------------------------------------------------ */

/** `#rgb` / `#rrggbb` → pdf-lib colour. */
function ink(lib: PdfLib, hex: string) {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const v = parseInt(full, 16);
  return lib.rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

async function canvasToBytes(
  canvas: HTMLCanvasElement,
  format: PrintImageFormat,
  jpegQuality: number,
): Promise<Uint8Array> {
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, format === "jpeg" ? jpegQuality : undefined),
  );
  if (!blob) throw new Error("Failed to encode the print image");
  return new Uint8Array(await blob.arrayBuffer());
}
