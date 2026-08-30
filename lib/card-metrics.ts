"use client";

import { useEffect, useState } from "react";
import {
  type SpreadLine,
  type TypeSpec,
  TYPE,
  spreadLimits,
} from "./meishi-layout";

/**
 * Measuring the card's type in the browser.
 *
 * Three things need to know how wide the talent's words actually come out:
 * the optical centring in `MeishiPreview`, how far the spacing bar in step 4
 * may travel, and whether the breed line still fits on one line. None of that
 * is readable from CSS, so it is measured on a canvas in the very font the
 * card is being set in.
 *
 * Everything is returned in EMS of the run's own size, which
 * `lib/meishi-layout.ts` turns into fractions of the card width. That keeps
 * the answers good at any preview size and needs no remeasuring on resize.
 *
 * `lib/print.ts` asks the same questions of the font it embeds, through the
 * same functions in `lib/meishi-layout.ts` — it just measures with fontkit
 * instead of a canvas.
 */

/** Measuring size. Large, so rounding cannot reach the third decimal. */
const PROBE = 400;

let probe: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d");
  return probe;
}

function withFont(weight: number, family: string): CanvasRenderingContext2D | null {
  const ctx = context();
  if (!ctx || !family) return null;
  ctx.font = `${weight} ${PROBE}px ${family}`;
  return ctx;
}

/** Width of a string, in ems of its own size. */
export function textEm(text: string, weight: number, family: string): number {
  const ctx = withFont(weight, family);
  return ctx ? ctx.measureText(text).width / PROBE : text.length;
}

/**
 * The empty space one character carries either side of its ink, in ems — what
 * has to come off a line before it can be centred on what the eye sees.
 */
export function bearingsEm(
  ch: string,
  weight: number,
  family: string,
): { lsb: number; rsb: number } {
  const ctx = withFont(weight, family);
  if (!ctx || !ch) return { lsb: 0, rsb: 0 };
  const m = ctx.measureText(ch);
  const lsb = -m.actualBoundingBoxLeft / PROBE;
  const rsb = (m.width - m.actualBoundingBoxRight) / PROBE;
  return {
    lsb: Number.isFinite(lsb) ? lsb : 0,
    rsb: Number.isFinite(rsb) ? rsb : 0,
  };
}

/** One line of the card, measured and ready for `spreadLimits`/`fittedSize`. */
export function measureLine(
  spec: TypeSpec,
  parts: string[],
  family: string,
  shrinks = false,
): SpreadLine {
  return {
    spec,
    widths: parts.map((part) => textEm(part, spec.weight, family)),
    shrinks,
  };
}

/**
 * The font the card's type is set in. It is inherited from the page — neither
 * the preview nor step 4 sets one — so it has to be read back off the document
 * rather than assumed, and read again once webfonts have settled.
 */
export function useCardFont(): string {
  const [family, setFamily] = useState("");
  useEffect(() => {
    const read = () => setFamily(getComputedStyle(document.body).fontFamily);
    read();
    document.fonts?.ready.then(read).catch(() => {});
  }, []);
  return family;
}

/**
 * How far the spacing bar may travel for the words currently typed, as a
 * fraction of the card width. Both the bar and the preview read it, so the
 * bar's stops and what the card does at them cannot disagree.
 */
export function useSpreadLimits(
  breeds: string[],
  names: string[],
  family: string,
): { min: number; max: number } {
  const key = JSON.stringify([family, breeds, names]);
  const [limits, setLimits] = useState({ min: 0, max: 0 });

  useEffect(() => {
    if (!family) return;
    setLimits(
      spreadLimits([
        measureLine(TYPE.breed, breeds, family, true),
        measureLine(TYPE.name, names, family),
      ]),
    );
    // `key` carries every string the answer depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return limits;
}
