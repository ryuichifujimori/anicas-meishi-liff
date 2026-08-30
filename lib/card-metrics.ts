"use client";

import { useEffect, useState } from "react";
import {
  EMPTY_MEASURE,
  type Measured,
  type SpreadLimits,
  TYPE,
  spreadLimits,
} from "./meishi-layout";

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
 * How far the spacing bar may travel for the words currently typed. Both the
 * bar and the preview read it, so the bar's stops and what the card does at
 * them cannot disagree.
 */
export function useSpreadLimits(names: string[], family: string): SpreadLimits {
  const key = JSON.stringify([family, names]);
  const [limits, setLimits] = useState<SpreadLimits>({ min: 0, max: 0 });

  useEffect(() => {
    if (!family) return;
    setLimits(
      spreadLimits(
        names.map((name) => measureText(name, TYPE.name.weight, family)),
      ),
    );
    // `key` carries every string the answer depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return limits;
}
