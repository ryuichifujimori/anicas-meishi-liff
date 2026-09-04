"use client";

import {
  type CardRect,
  type PlacedRun,
  resolveCard,
} from "./card-adjust";
import { measureText } from "./card-metrics";
import {
  ASSETS,
  PAPER_COLOR,
  TEMPLATE_PX,
  cardText,
  photoClip,
} from "./meishi-layout";
import type { MeishiPrintInput } from "./print";

/**
 * The finished card as ONE PICTURE — what the talent is shown once the order
 * has gone, and what a press-and-hold on their phone offers to save.
 *
 * It is the same card as everywhere else, laid out by the same call:
 * `resolveCard` from `lib/card-adjust.ts`, measured in the very font the
 * browser is setting the preview in (`lib/card-metrics.ts`), painted in the
 * order `MeishiPreview` paints it — template, photo, ribbon, type, QR. Nothing
 * here restates a position, a size or a string.
 *
 * It takes the SAME input the print file is built from (`MeishiPrintInput`),
 * so the picture the talent keeps and the artwork the printer receives can
 * only ever come from one set of numbers. It is shown and nothing else: it is
 * not part of the payload, and nothing that goes to GAS is built from it.
 */

/**
 * The picture's pixel grid — the design's own (`TEMPLATE_PX`).
 *
 * At that size the template and the ribbon go down 1:1, with no resampling of
 * the artwork at all, and the QR's modules land on whole pixels. It is also
 * about the size of a phone screenshot, which is what a saved picture of a
 * card is competing with.
 */
const IMAGE_PX = TEMPLATE_PX;

/**
 * The string the line box is struck from — the strut, in CSS's sense.
 *
 * A line's height comes from the ELEMENT's font, not from the glyphs that end
 * up on it: a Japanese name set from a fallback face still sits in a line box
 * struck by the primary one. Measuring a Latin letter asks the primary face
 * for exactly that, which is what keeps this baseline on the preview's.
 */
const STRUT = "M";

/**
 * Draws the card and hands it back as a `data:image/png;base64,…` URL.
 *
 * A data URL rather than an object URL on purpose: it carries its own bytes,
 * so the picture survives for as long as the completion screen is up without
 * anything having to be revoked, and a press-and-hold has real image data
 * under it rather than a reference this page has to keep alive.
 */
export async function generateMeishiCardImage(
  input: MeishiPrintInput,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_PX.width;
  canvas.height = IMAGE_PX.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // The font the card's type is actually being set in, read off the page the
  // same way the preview reads it. By the time an order has been sent the
  // fonts have long settled, so there is nothing to wait for here.
  const family = getComputedStyle(document.body).fontFamily;
  const text = cardText(input);
  const card = resolveCard({
    text,
    measure: (spec, value) => measureText(value, spec.weight, family),
    adjust: input.adjust,
    photos: input.photos,
  });

  const [template, ribbon, photo, qr] = await Promise.all([
    loadImage(ASSETS.template),
    loadImage(ASSETS.ribbon),
    input.composedPhoto ? loadImage(input.composedPhoto) : null,
    input.qr ? loadImage(input.qr.png) : null,
  ]);

  // The preview's card box is white; so is the paper.
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, IMAGE_PX.width, IMAGE_PX.height);

  ctx.drawImage(template, 0, 0, IMAGE_PX.width, IMAGE_PX.height);

  if (photo) {
    // Cut to the design's own window, the ribbon's outline for its lower edge
    // — the same shape, from the same function, that the preview cuts it with
    // and the print file clips it to. The window is fixed on the card, so
    // whatever the talent did inside a share of it stays inside.
    ctx.save();
    ctx.beginPath();
    photoClip(card.photo).forEach(([x, y], i) => {
      const at = { x: x * IMAGE_PX.width, y: y * IMAGE_PX.height };
      if (i === 0) ctx.moveTo(at.x, at.y);
      else ctx.lineTo(at.x, at.y);
    });
    ctx.closePath();
    ctx.clip();
    const box = place(card.photo);
    ctx.drawImage(photo, box.x, box.y, box.width, box.height);
    ctx.restore();
  }

  // The ribbon's white band goes IN FRONT of the photo and hides its lower
  // edge, exactly as it does on screen. On screen this is the PNG; the print
  // file draws the designer's own paths in its place (see lib/vector-art.ts),
  // and a picture of the card is a picture of what is on screen.
  ctx.drawImage(ribbon, 0, 0, IMAGE_PX.width, IMAGE_PX.height);

  for (const run of [card.breed, card.name, card.owner, ...card.ig.runs]) {
    drawRun(ctx, run, family);
  }

  if (qr) {
    // Square by construction, so its height is its width — the same reason the
    // preview gives it `aspect-ratio` rather than a second percentage.
    const box = place(card.qr);
    ctx.drawImage(qr, box.x, box.y, box.width, box.width);
  }

  return canvas.toDataURL("image/png");
}

/**
 * One run of type, with the one thing a canvas needs that CSS does for free:
 * the baseline inside the line box.
 *
 * CSS centres the font's own ascent + descent in the line box and hangs the
 * glyphs off it, which is what `halfLeading` reproduces — and the box is
 * struck at the RUN's size, not each line's, so a pet whose column was set
 * larger still sits on the very same baseline as the pets beside it. This is
 * the same arithmetic `lib/print.ts` does against the font it embeds.
 */
function drawRun(
  ctx: CanvasRenderingContext2D,
  run: PlacedRun,
  family: string,
): void {
  if (!run.lines.length) return;

  const struck = run.size * IMAGE_PX.width;
  const lineBox = run.lineBox * IMAGE_PX.width;
  ctx.font = `${run.spec.weight} ${struck}px ${family}`;
  const strut = ctx.measureText(STRUT);
  const ascent = strut.fontBoundingBoxAscent;
  const descent = strut.fontBoundingBoxDescent;
  const baseline = (lineBox - (ascent + descent)) / 2 + ascent;

  ctx.fillStyle = run.spec.color;
  for (const line of run.lines) {
    ctx.font = `${run.spec.weight} ${line.size * IMAGE_PX.width}px ${family}`;
    ctx.fillText(
      line.text,
      line.x * IMAGE_PX.width,
      line.top * IMAGE_PX.height + baseline,
    );
  }
}

/** A card rectangle in the picture's own pixels. `x`/`width` are fractions of
 *  the card's width, `y`/`height` of its height — as everywhere else. */
function place(rect: CardRect): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: rect.x * IMAGE_PX.width,
    y: rect.y * IMAGE_PX.height,
    width: rect.width * IMAGE_PX.width,
    height: rect.height * IMAGE_PX.height,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 64)}`));
    img.src = src;
  });
}
