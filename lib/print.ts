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
  type TypeSpec,
  type TypeWeight,
  cardText,
  mmToPt,
} from "./meishi-layout";

/**
 * Print-ready artwork for the meishi.
 *
 * Lays out exactly what `MeishiPreview` shows, from the same
 * `lib/meishi-layout.ts` definition, onto a 61 × 97 mm page (55 × 91 mm card
 * + 3 mm bleed) — but as a real PDF rather than as one flattened raster:
 *
 *   template / ribbon  vector outlines, placed from public/meishi-*.pdf
 *   text               live text in an embedded font, selectable and searchable
 *   QR                 the module shapes drawn as paths
 *   anicas mark        the 500 × 500 master, embedded whole and scaled down
 *   photo              the only image, resampled to 350 dpi
 *
 * so nothing but the photograph carries a pixel grid — which is how the real
 * Illustrator card is built, and where the difference in crispness was coming
 * from.
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
    embedVector(pdf, ASSETS.templateVector),
    embedVector(pdf, ASSETS.ribbonVector),
    input.composedPhoto
      ? embedPhoto(pdf, input.composedPhoto, slot, options)
      : null,
    input.qr ? embedLogo(pdf) : null,
    loadFonts(pdf, Object.values(text).join("")),
  ]);

  // Same paint order as MeishiPreview: template → photo → ribbon → text → QR.
  const placeCard = (art: typeof template) =>
    page.drawPage(art, {
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

  drawRuns(page, {
    block: box(card, LAYOUT.textBlock),
    align: "center",
    cardWidth: card.width,
    pageHeight: pageH,
    fonts,
    lib,
    runs: [
      { spec: TYPE.breed, text: text.breeds },
      { spec: TYPE.name, text: text.names },
      { spec: TYPE.owner, text: text.owner },
    ],
  });

  drawRuns(page, {
    block: box(card, LAYOUT.igBlock),
    align: "left",
    cardWidth: card.width,
    pageHeight: pageH,
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

/** Places a single-page vector PDF as a form XObject — outlines, no pixels. */
async function embedVector(pdf: PDFDocument, url: string) {
  const [embedded] = await pdf.embedPdf(await fetchBytes(url));
  return embedded;
}

/** The anicas mark, embedded at its native 500 × 500 and scaled on the page. */
async function embedLogo(pdf: PDFDocument): Promise<PDFImage> {
  return pdf.embedPng(await fetchBytes(ASSETS.logo));
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

/** One weight, plus whatever is needed for characters it does not carry. */
type FontSet = {
  primary: PDFFont;
  covers: (codePoint: number) => boolean;
  fallback?: PDFFont;
};

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

  const loaded = await Promise.all(
    weights.map(async (weight) => {
      const bytes = await fetchBytes(PRINT_FONTS[weight]);
      const metrics = fontkit.create(bytes) as unknown as {
        hasGlyphForCodePoint(codePoint: number): boolean;
      };
      return {
        weight,
        primary: await pdf.embedFont(bytes, { subset: true }),
        covers: (codePoint: number) => metrics.hasGlyphForCodePoint(codePoint),
      };
    }),
  );

  const uncovered = Array.from(text).some((ch) =>
    loaded.some(({ covers }) => !covers(ch.codePointAt(0) ?? 0)),
  );
  const fallback = uncovered
    ? await pdf.embedFont(await fetchBytes(PRINT_FALLBACK_FONT), { subset: true })
    : undefined;

  return Object.fromEntries(
    loaded.map(({ weight, primary, covers }) => [weight, { primary, covers, fallback }]),
  ) as Fonts;
}

type Run = { spec: TypeSpec; text: string };

/**
 * Lays out a stack of text runs the way the browser lays out the preview's
 * block children: each run gets its `marginTop`, then one line box of
 * `LINE_HEIGHT × font-size` per (wrapped) line, with the glyphs' content area
 * centred in that box via half-leading. Empty runs are skipped entirely, so an
 * absent breed or owner closes the gap exactly as it does on screen.
 */
function drawRuns(
  page: PDFPage,
  opts: {
    block: Box;
    align: "left" | "center";
    cardWidth: number;
    pageHeight: number;
    fonts: Fonts;
    lib: PdfLib;
    runs: Run[];
  },
) {
  let top = opts.block.top;

  for (const run of opts.runs) {
    if (!run.text) continue;

    const font = opts.fonts[run.spec.weight];
    const size = run.spec.size * opts.cardWidth;
    const colour = ink(opts.lib, run.spec.color);
    const width = (text: string) => measure(font, text, size);

    const lineBox = LINE_HEIGHT * size;
    // CSS centres the font's content area (ascent + descent) in the line box
    // and hangs the glyphs off its top.
    const halfLeading = (lineBox - font.primary.heightAtSize(size)) / 2;
    const baseline =
      halfLeading + font.primary.heightAtSize(size, { descender: false });

    top += run.spec.marginTop * opts.cardWidth;

    for (const line of wrapText(width, run.text, opts.block.width)) {
      let x =
        opts.align === "center"
          ? opts.block.x + (opts.block.width - width(line)) / 2
          : opts.block.x;
      for (const piece of splitByFont(font, line)) {
        page.drawText(piece.text, {
          x,
          y: opts.pageHeight - (top + baseline),
          size,
          font: piece.font,
          color: colour,
        });
        x += piece.font.widthOfTextAtSize(piece.text, size);
      }
      top += lineBox;
    }
  }
}

/** Splits a line into the longest runs that one font can set on its own. */
function splitByFont(font: FontSet, line: string): { font: PDFFont; text: string }[] {
  const pieces: { font: PDFFont; text: string }[] = [];
  for (const ch of Array.from(line)) {
    const chosen =
      font.covers(ch.codePointAt(0) ?? 0) || !font.fallback
        ? font.primary
        : font.fallback;
    const last = pieces[pieces.length - 1];
    if (last && last.font === chosen) last.text += ch;
    else pieces.push({ font: chosen, text: ch });
  }
  return pieces;
}

function measure(font: FontSet, text: string, size: number): number {
  return splitByFont(font, text).reduce(
    (total, piece) => total + piece.font.widthOfTextAtSize(piece.text, size),
    0,
  );
}

const CJK =
  /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

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
