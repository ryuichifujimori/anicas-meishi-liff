"use client";

import type { PetPhoto } from "./types";
import { LAYOUT, PHOTO_SLOT_ASPECT } from "./meishi-layout";

/**
 * How the pets' pictures share the card's photo window, and how each one is
 * drawn inside its own share of it.
 *
 * The window is divided into EQUAL VERTICAL SLOTS, one per picture, left to
 * right — the same division the separate photo-editing screen used to make,
 * kept exactly so a card composed before this change comes out the same. What
 * changed is where the talent does the framing: on the card itself, one slot at
 * a time, rather than on a second canvas above it.
 *
 * A slot's picture is COVER-FIT into the slot and then moved and grown by the
 * talent's own `SlotAdjust`. Nothing here knows about the ribbon or the card's
 * lower edge: the composed picture is handed to both renderers as one image
 * and they cut it to the window, so what happens inside a slot can never reach
 * the card outside it.
 */

/**
 * What the talent did to ONE slot's picture.
 *
 * `dx`/`dy` are fractions of the SLOT (not of the card), so a finger that
 * crosses half the slot moves the picture by half the slot whatever size the
 * picture is. `scale` is how much bigger than cover-fit it is drawn.
 *
 * Untouched — `{ dx: 0, dy: 0, scale: 1 }` — is the picture cover-fit and
 * centred, which is exactly what the old editing screen started every photo at.
 */
export type SlotAdjust = { dx: number; dy: number; scale: number };

export const UNTOUCHED_SLOT: SlotAdjust = { dx: 0, dy: 0, scale: 1 };

/**
 * How far a slot's picture may be grown. It may not be made SMALLER than
 * cover-fit: below that the picture stops filling its slot and the card's own
 * white shows through a hole in the middle of the photograph.
 */
export const SLOT_SCALE = { min: 1, max: 4 } as const;

/**
 * The canvas the pictures are composed onto — the shape of the card's photo
 * window, 1200 px wide. That is comfortably more than the ~682 px the window
 * occupies at the 350 dpi the card is printed at.
 */
export const COMPOSED = {
  width: 1200,
  height: Math.round(1200 / PHOTO_SLOT_ASPECT),
} as const;

/** The pictures the card is actually carrying, in order. */
export const usablePhotos = (photos: (PetPhoto | null)[], petCount: number) =>
  photos.slice(0, petCount).filter((p): p is PetPhoto => p !== null);

/** The box a slot occupies on the CARD, in the card's own fractions. */
export const slotRect = (index: number, count: number) => ({
  x: LAYOUT.photo.left + (LAYOUT.photo.width * index) / count,
  y: LAYOUT.photo.top,
  width: LAYOUT.photo.width / count,
  height: LAYOUT.photo.height,
});

/**
 * How much bigger than its slot the picture is drawn, on each axis.
 *
 * Cover-fit makes the picture at least as big as the slot on both axes and
 * exactly as big on one of them, so one of these is 1 at `scale` 1 and the
 * other is however much the picture overflows by. That overflow is what there
 * is to pan through.
 */
const overflow = (aspect: number, count: number, scale: number) => {
  const slotAspect = PHOTO_SLOT_ASPECT / count;
  return {
    x: Math.max(1, aspect / slotAspect) * scale,
    y: Math.max(1, slotAspect / aspect) * scale,
  };
};

/**
 * Holds one slot's value to what the slot allows: grown but never shrunk past
 * cover-fit, and panned only as far as there is picture to pan through — so no
 * corner of a slot is ever left empty.
 */
export function clampSlot(value: SlotAdjust, aspect: number, count: number): SlotAdjust {
  const scale = Math.min(Math.max(value.scale, SLOT_SCALE.min), SLOT_SCALE.max);
  const room = overflow(aspect, count, scale);
  const hold = (v: number, span: number) => {
    const reach = Math.max(0, (span - 1) / 2);
    return Math.min(Math.max(v, -reach), reach);
  };
  return { scale, dx: hold(value.dx, room.x), dy: hold(value.dy, room.y) };
}

/** Where one picture lands inside its slot, in canvas pixels. */
export function placeInSlot(
  img: { width: number; height: number },
  index: number,
  count: number,
  value: SlotAdjust,
) {
  const slotW = COMPOSED.width / count;
  const slotH = COMPOSED.height;
  const cover = Math.max(slotW / img.width, slotH / img.height) * value.scale;
  const width = img.width * cover;
  const height = img.height * cover;
  return {
    x: index * slotW + slotW / 2 - width / 2 + value.dx * slotW,
    y: slotH / 2 - height / 2 + value.dy * slotH,
    width,
    height,
    slot: { x: index * slotW, y: 0, width: slotW, height: slotH },
  };
}

/**
 * Draws every picture onto the composing canvas, each cut to its own slot.
 *
 * The canvas is CLEARED first and never filled: what the pictures do not cover
 * stays transparent, so the card's own ground shows through exactly as it did
 * when a separate screen composed this.
 */
export function drawSlots(
  ctx: CanvasRenderingContext2D,
  imgs: HTMLImageElement[],
  values: SlotAdjust[],
) {
  ctx.clearRect(0, 0, COMPOSED.width, COMPOSED.height);
  imgs.forEach((img, i) => {
    const at = placeInSlot(img, i, imgs.length, values[i] ?? UNTOUCHED_SLOT);
    ctx.save();
    ctx.beginPath();
    ctx.rect(at.slot.x, at.slot.y, at.slot.width, at.slot.height);
    ctx.clip();
    ctx.drawImage(img, at.x, at.y, at.width, at.height);
    ctx.restore();
  });
}
