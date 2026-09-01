"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeasureRun } from "./card-adjust";
import { EMPTY_MEASURE, type Measured, type TypeSpec } from "./meishi-layout";

/**
 * Measuring the card's type in the browser.
 *
 * The layout in `lib/meishi-layout.ts` works from the width of the talent's
 * actual words — how far each one advances, and where its ink starts and ends
 * inside that advance. None of that is readable from CSS, so it is measured on
 * a canvas in the very font the card is being set in.
 *
 * Everything comes back in EMS of the run's own size, which the layout turns
 * into fractions of the card width. That keeps the answers good at any preview
 * size and needs no remeasuring on resize.
 *
 * `lib/print.ts` asks the same questions of the font it embeds, through the
 * same layout functions — it just measures with fontkit instead of a canvas.
 */

/** Measuring size. Large, so rounding cannot reach the third decimal. */
const PROBE = 400;

let probe: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d");
  return probe;
}

/**
 * One string's advance and ink extents, in ems. Returns nothing measurable
 * before the page has told us which font it is actually using.
 */
export function measureText(
  text: string,
  weight: number,
  family: string,
): Measured {
  const ctx = text && family ? context() : null;
  if (!ctx) return EMPTY_MEASURE;

  ctx.font = `${weight} ${PROBE}px ${family}`;
  const m = ctx.measureText(text);
  const advance = m.width / PROBE;
  const inkLeft = -m.actualBoundingBoxLeft / PROBE;
  const inkRight = m.actualBoundingBoxRight / PROBE;
  return {
    advance,
    inkLeft: Number.isFinite(inkLeft) ? inkLeft : 0,
    inkRight: Number.isFinite(inkRight) ? inkRight : advance,
  };
}

/**
 * The font the card's type is set in. It is inherited from the page — neither
 * the preview nor step 4 sets one — so it has to be read back off the document
 * rather than assumed, and only once the fonts have settled: a measurement
 * taken against a font that is still loading would be the wrong one.
 */
export function useCardFont(): string {
  const [family, setFamily] = useState("");
  useEffect(() => {
    const read = () => setFamily(getComputedStyle(document.body).fontFamily);
    document.fonts?.ready.then(read).catch(read) ?? read();
  }, []);
  return family;
}

/**
 * One string as the browser will set it, ready for `lib/card-adjust.ts` — the
 * same question `lib/print.ts` asks of the font it embeds, so both renderers
 * are laid out by the same code from measurements each took itself.
 *
 * It returns nothing measurable until the page has told us which font it is
 * actually using, which is the one frame the preview renders empty of type.
 */
export function useMeasureRun(): MeasureRun {
  const family = useCardFont();
  return useCallback(
    (spec: TypeSpec, text: string) => measureText(text, spec.weight, family),
    [family],
  );
}
