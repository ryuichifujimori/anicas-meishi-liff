"use client";

import type { Pet } from "./types";
import {
  ASSETS,
  BLEED_MM,
  CARD_TRIM_MM,
  LAYOUT,
  LINE_HEIGHT,
  PAGE_MM,
  PAPER_COLOR,
  PRINT_PX,
  TEMPLATE_PX,
  TYPE,
  type TypeSpec,
  mmToPt,
  resolveCardFontFamily,
} from "./meishi-layout";

/**
 * Print-ready artwork for the meishi.
 *
 * Renders exactly what `MeishiPreview` shows — same template, photo, ribbon,
 * text, QR and logo — from the same `lib/meishi-layout.ts` definition, but at
 * 350 dpi with a 3 mm bleed, and wraps it in a PDF the printer can accept.
 *
 * This module is deliberately standalone: it takes plain data, touches no
 * React state and is not tied to the submit button, so the same call can be
 * made later from a payment-completion handler.
 */

export type MeishiPrintInput = {
  /** Composed pet photo (data URL) — what `MeishiPreview` shows in the slot. */
  composedPhoto: string | null;
  /** Styled QR with the anicas logo (data URL) from `lib/qr.ts`. */
  qrDataUrl: string | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  igHandle: string;
  igName: string;
  ownerName: string;
};

export type PrintImageFormat = "png" | "jpeg";

export type PrintOptions = {
  /**
   * Encoding of the single full-bleed image embedded in the PDF.
   * PNG (default) is lossless — it keeps the QR modules and the type crisp,
   * which matters more here than file size.
   */
  format?: PrintImageFormat;
  /** JPEG quality, only used when `format` is "jpeg". */
  jpegQuality?: number;
};

const DEFAULT_FORMAT: PrintImageFormat = "png";
const DEFAULT_JPEG_QUALITY = 0.95;

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Renders the card onto a 840 × 1336 px canvas — the 61 × 97 mm PDF page
 * (55 × 91 mm card + 3 mm bleed all round) at 350 dpi.
 */
export async function renderMeishiPrintCanvas(
  input: MeishiPrintInput,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = PRINT_PX.width;
  canvas.height = PRINT_PX.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Flood the whole sheet, bleed included, with paper white: the template's
  // background is white, so anything the artwork does not cover reads as an
  // uninterrupted continuation of the card past the trim line.
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const card = cardBox();

  // System fonts only, but wait anyway so the first measureText below cannot
  // race a font that has not been resolved yet.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const [template, ribbon, photo, qr] = await Promise.all([
    loadImage(ASSETS.template),
    loadImage(ASSETS.ribbon),
    input.composedPhoto ? loadImage(input.composedPhoto) : null,
    input.qrDataUrl ? loadImage(input.qrDataUrl) : null,
  ]);

  // Same paint order as MeishiPreview: template → photo → ribbon → text → QR.
  ctx.drawImage(template, card.x, card.y, card.width, card.height);

  if (photo) {
    const slot = box(card, LAYOUT.photo);
    ctx.save();
    ctx.beginPath();
    ctx.rect(slot.x, slot.y, slot.width, slot.height);
    ctx.clip();
    drawCover(ctx, photo, slot);
    ctx.restore();
  }

  // The ribbon's white band goes IN FRONT of the photo and hides its lower
  // edge — the reason the photo slot is allowed to run past the band's top.
  ctx.drawImage(ribbon, card.x, card.y, card.width, card.height);

  const fontFamily = resolveCardFontFamily();

  const visiblePets = input.pets.slice(0, input.petCount);
  const breeds = visiblePets
    .map((p) => p.breed.trim())
    .filter(Boolean)
    .join(" / ");
  const names = visiblePets
    .map((p) => p.name.trim())
    .filter(Boolean)
    .join(" & ");
  const owner = input.ownerName.trim();
  const handle = input.igHandle.trim();

  const textBlock = box(card, LAYOUT.textBlock);
  drawRuns(ctx, {
    x: textBlock.x,
    y: textBlock.y,
    width: textBlock.width,
    align: "center",
    cardWidth: card.width,
    fontFamily,
    runs: [
      { spec: TYPE.breed, text: breeds },
      { spec: TYPE.name, text: names },
      { spec: TYPE.owner, text: owner && `【owner：${owner}】` },
    ],
  });

  const igBlock = box(card, LAYOUT.igBlock);
  drawRuns(ctx, {
    x: igBlock.x,
    y: igBlock.y,
    width: igBlock.width,
    align: "left",
    cardWidth: card.width,
    fontFamily,
    runs: [
      { spec: TYPE.igName, text: input.igName.trim() },
      { spec: TYPE.igHandle, text: handle && `@${handle}` },
    ],
  });

  if (qr) {
    const size = LAYOUT.qr.width * card.width; // square
    const x = card.x + card.width * (1 - LAYOUT.qr.right) - size;
    const y = card.y + LAYOUT.qr.top * card.height;
    ctx.drawImage(qr, x, y, size, size);
  }

  return canvas;
}

/**
 * Builds the print-ready PDF and returns it as a `data:application/pdf;base64,…`
 * URL: one 61 × 97 mm page carrying the 350 dpi artwork edge to edge, with
 * TrimBox/BleedBox set so the printer knows where the 55 × 91 mm card is cut.
 *
 * Standalone by design — call it from the submit handler today, or from a
 * payment-completion handler later, with the same plain input.
 */
export async function generateMeishiPrintPdf(
  input: MeishiPrintInput,
  options: PrintOptions = {},
): Promise<string> {
  const format = options.format ?? DEFAULT_FORMAT;
  const canvas = await renderMeishiPrintCanvas(input);
  const bytes = await canvasToBytes(
    canvas,
    format,
    options.jpegQuality ?? DEFAULT_JPEG_QUALITY,
  );

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(`anicas meishi ${input.igHandle.trim()}`.trim());
  pdf.setCreator("anicas 名刺フォーム");

  const pageW = mmToPt(PAGE_MM.width);
  const pageH = mmToPt(PAGE_MM.height);
  const page = pdf.addPage([pageW, pageH]);

  const image =
    format === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  page.drawImage(image, { x: 0, y: 0, width: pageW, height: pageH });

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
 * ------------------------------------------------------------------ */

type Box = { x: number; y: number; width: number; height: number };

/**
 * Where the card artwork sits on the sheet.
 *
 * The trim rectangle is centred on the page. The template's aspect ratio is a
 * hair narrower than the card's, so the artwork is scaled to *cover* the trim
 * rather than stretched to it — no distortion, and the ≈0.19 mm of overflow at
 * top and bottom falls harmlessly inside the bleed.
 */
function cardBox(): Box {
  const pxPerMmX = PRINT_PX.width / PAGE_MM.width;
  const pxPerMmY = PRINT_PX.height / PAGE_MM.height;

  const trimW = CARD_TRIM_MM.width * pxPerMmX;
  const trimH = CARD_TRIM_MM.height * pxPerMmY;
  const trimX = BLEED_MM * pxPerMmX;
  const trimY = BLEED_MM * pxPerMmY;

  const scale = Math.max(trimW / TEMPLATE_PX.width, trimH / TEMPLATE_PX.height);
  const width = TEMPLATE_PX.width * scale;
  const height = TEMPLATE_PX.height * scale;

  return {
    x: trimX + (trimW - width) / 2,
    y: trimY + (trimH - height) / 2,
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
    y: card.y + rect.top * card.height,
    width: rect.width * card.width,
    height: (rect.height ?? 0) * card.height,
  };
}

/** CSS `object-fit: cover` with the default 50% 50% position. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  slot: Box,
) {
  const scale = Math.max(slot.width / img.width, slot.height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(
    img,
    slot.x + (slot.width - w) / 2,
    slot.y + (slot.height - h) / 2,
    w,
    h,
  );
}

/* ------------------------------------------------------------------ *
 * Text
 * ------------------------------------------------------------------ */

type Run = { spec: TypeSpec; text: string | false };

/**
 * Lays out a stack of text runs the way the browser lays out the preview's
 * block children: each run gets its `marginTop`, then one line box of
 * `LINE_HEIGHT × font-size` per (wrapped) line, with the glyphs' content area
 * centred in that box via half-leading. Empty runs are skipped entirely, so an
 * absent breed or owner closes the gap exactly as it does on screen.
 */
function drawRuns(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    width: number;
    align: "left" | "center";
    cardWidth: number;
    fontFamily: string;
    runs: Run[];
  },
) {
  ctx.save();
  ctx.textAlign = opts.align === "center" ? "center" : "left";
  ctx.textBaseline = "alphabetic";
  const anchorX = opts.align === "center" ? opts.x + opts.width / 2 : opts.x;

  let y = opts.y;
  for (const run of opts.runs) {
    if (!run.text) continue;

    const fontSize = run.spec.size * opts.cardWidth;
    ctx.font = `${run.spec.weight} ${fontSize}px ${opts.fontFamily}`;
    ctx.fillStyle = run.spec.color;

    y += run.spec.marginTop * opts.cardWidth;

    const lineBox = LINE_HEIGHT * fontSize;
    for (const line of wrapText(ctx, run.text, opts.width)) {
      const m = ctx.measureText(line);
      const ascent = m.fontBoundingBoxAscent ?? fontSize * 0.88;
      const descent = m.fontBoundingBoxDescent ?? fontSize * 0.12;
      const halfLeading = (lineBox - (ascent + descent)) / 2;
      ctx.fillText(line, anchorX, y + halfLeading + ascent);
      y += lineBox;
    }
  }
  ctx.restore();
}

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
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const parts = segments(text);
  const lines: string[] = [];
  let line = "";
  for (const part of parts) {
    const candidate = line + part;
    if (line && ctx.measureText(candidate.trimEnd()).width > maxWidth) {
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
