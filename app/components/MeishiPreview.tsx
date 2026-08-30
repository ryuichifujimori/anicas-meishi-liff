"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Pet } from "@/lib/types";
import {
  ADJUSTABLE,
  type Adjust,
  type AdjustKey,
  type CardRect,
  type FaceAdjust,
  type PlacedRun,
  type ResolvedCard,
  resolveCard,
} from "@/lib/card-adjust";
import {
  ASSETS,
  IG_MARK,
  TEMPLATE_ASPECT,
  cardText,
  cqw,
  hToW,
  pct,
  wToH,
} from "@/lib/meishi-layout";
import { useMeasureRun } from "@/lib/card-metrics";

type Props = {
  composedPhoto: string | null;
  qrSrc: string | null;
  /** The QR's module pitch, which decides how far it may be shrunk. */
  qrPitch: number | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  igHandle: string;
  igName: string;
  ownerName: string;
  /** Where the talent has put the five movable parts. */
  adjust: FaceAdjust;
  /**
   * Supply this to let them move and resize those parts on the preview.
   * Without it the preview is only a preview — step 5 shows it that way.
   */
  onAdjustChange?: (adjust: FaceAdjust) => void;
};

/**
 * On-screen preview of the finished card — and, in step 4, the surface the
 * talent lays it out on.
 *
 * Every position, size, weight and colour — and every string, separators
 * included — comes from `lib/meishi-layout.ts` by way of `lib/card-adjust.ts`,
 * which `lib/print.ts` also renders from, so the print-ready PDF and this
 * preview can never drift apart. Fractions are turned into CSS percentages
 * (`pct`) and container-query units (`cqw`) here; the print renderer turns the
 * same fractions into PDF points.
 */
export function MeishiPreview({
  composedPhoto,
  qrSrc,
  qrPitch,
  pets,
  petCount,
  igHandle,
  igName,
  ownerName,
  adjust,
  onAdjustChange,
}: Props) {
  const measure = useMeasureRun();
  const card = resolveCard({
    text: cardText({ pets, petCount, ownerName, igName, igHandle }),
    measure,
    adjust,
    hasPhoto: Boolean(composedPhoto),
    qrPitch,
  });

  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      <div
        className="relative w-full bg-white shadow-sm rounded overflow-hidden"
        style={{ aspectRatio: TEMPLATE_ASPECT, containerType: "inline-size" }}
      >
        {/* Background template */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ASSETS.template}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Photo. Canvas aspect (~1.15) is matched to this slot so object-cover
            fills without clipping — and the slot only ever changes size, never
            shape, so that holds wherever the talent puts it. Drawn ON TOP of
            the template background and intentionally extended into the ribbon
            band; the ribbon overlay below is then drawn over it. */}
        {composedPhoto && (
          <div className="absolute overflow-hidden" style={frame(card.photo)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={composedPhoto}
              alt="pet"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Ribbon overlay — the ribbon graphic on a transparent background,
            positioned identically to the template so it aligns pixel-perfectly
            with the baked ribbon. Drawn AFTER the photo so the white band sits
            IN FRONT of the photo and hides its lower edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ASSETS.ribbon}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* The Instagram glyph belongs to the Instagram line, but the template
            draws it — so once the line has been moved, the template's glyph is
            covered over here and the same pixels are placed again below, at
            wherever the line went. Untouched, neither of these exists and the
            card is the card it always was. */}
        {card.ig.mark && <div className="absolute bg-white" style={frame(MARK_BOX)} />}

        {/* Pet columns (breed above name), then the owner line under them */}
        <Run run={card.breed} />
        <Run run={card.name} />
        <Run run={card.owner} />

        {card.ig.mark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ASSETS.igMark} alt="" className="absolute" style={frame(card.ig.mark)} />
        )}
        {card.ig.runs.map((run, i) => (
          <Run key={i} run={run} />
        ))}

        {/* QR code, bottom-right (square) */}
        {qrSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrSrc} alt="QR" className="absolute" style={frame(card.qr)} />
        )}
      </div>

      {/* The frame and its handles sit OUTSIDE the card's clipping box, so a
          part dragged flush against an edge still has grabbable corners. */}
      {onAdjustChange && (
        <Editor card={card} adjust={adjust} onChange={onAdjustChange} />
      )}
    </div>
  );
}

/** Where the template draws the Instagram glyph, as a card rectangle. */
const MARK_BOX: CardRect = {
  x: IG_MARK.left,
  y: IG_MARK.top,
  width: IG_MARK.width,
  height: IG_MARK.height,
};

/** One run of type: each line exactly where `lib/card-adjust.ts` put it, so
 *  nothing is left for CSS to flow, centre or break. */
function Run({ run }: { run: PlacedRun }) {
  if (!run.lines.length) return null;
  return (
    <>
      {run.lines.map((line, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: cqw(line.x),
            top: pct(line.top),
            fontSize: cqw(run.size),
            lineHeight: cqw(run.lineBox),
            fontWeight: run.spec.weight,
            color: run.spec.color,
            whiteSpace: "nowrap",
          }}
        >
          {line.text}
        </span>
      ))}
    </>
  );
}

/** A card rectangle as the CSS that puts a box exactly there. */
function frame(rect: CardRect): CSSProperties {
  return {
    left: pct(rect.x),
    top: pct(rect.y),
    width: pct(rect.width),
    height: pct(rect.height),
  };
}

/* ------------------------------------------------------------------ *
 * Laying the card out by hand
 * ------------------------------------------------------------------ */

/** Where the handles go. Dragging any of them scales the part about its own
 *  centre, so it grows and shrinks in place. */
const CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const;

/** How much slop a touch gets around a part, in card widths (~3 px at the
 *  preview's size). A single row of small type would be hard to land on
 *  otherwise. */
const TOUCH_SLOP = 0.008;

type Point = { x: number; y: number };

type Drag =
  | { kind: "move"; key: AdjustKey; from: Adjust; start: Point }
  | { kind: "scale"; key: AdjustKey; from: Adjust; reach: number };

/**
 * The one thing the talent has to keep in their head is which part they are
 * holding, so that is the only state kept here. Touching a part selects it and
 * starts moving it; touching anywhere outside it lets go.
 */
function Editor({
  card,
  adjust,
  onChange,
}: {
  card: ResolvedCard;
  adjust: FaceAdjust;
  onChange: (adjust: FaceAdjust) => void;
}) {
  const [selected, setSelected] = useState<AdjustKey | null>(null);
  const host = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);

  /** Pointer position in card fractions: x across the width, y down the height. */
  const at = (e: PointerEvent): Point | null => {
    const box = host.current?.getBoundingClientRect();
    if (!box?.width || !box.height) return null;
    return {
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    };
  };

  // Held to what the card allows before it is stored, not after — so a finger
  // that runs past an edge does not build up travel it has to give back before
  // the part moves again, and the value that reaches the payload is one the
  // card can actually be printed from.
  const set = (key: AdjustKey, value: Adjust) =>
    onChange({ ...adjust, [key]: card.clamp[key](value) });

  const startScale = (key: AdjustKey) => (e: PointerEvent<HTMLElement>) => {
    const point = at(e);
    const rect = card.frames[key];
    if (!point || !rect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "scale", key, from: adjust[key], reach: reach(rect, point) };
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const point = at(e);
    if (!point) return;
    const key = hit(card, point, selected);
    setSelected(key);
    if (!key) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "move", key, from: adjust[key], start: point };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const point = at(e);
    if (!d || !point) return;
    if (d.kind === "move") {
      set(d.key, {
        ...d.from,
        dx: d.from.dx + (point.x - d.start.x),
        dy: d.from.dy + (point.y - d.start.y),
      });
      return;
    }
    // The part scales about its own centre, which a scale drag never moves, so
    // the live frame is as good a centre to measure from as the one the finger
    // went down on.
    const rect = card.frames[d.key];
    if (!rect || !d.reach) return;
    set(d.key, { ...d.from, scale: (d.from.scale * reach(rect, point)) / d.reach });
  };

  const release = () => {
    drag.current = null;
  };

  const rect = selected ? card.frames[selected] : null;

  return (
    <div
      ref={host}
      className="absolute inset-0 touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {selected && rect && (
        <div
          className="absolute border-2 border-[#2D6A4F] pointer-events-none"
          style={frame(rect)}
        >
          {CORNERS.map((corner, i) => (
            <span
              key={i}
              aria-hidden
              onPointerDown={startScale(selected)}
              className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-auto"
              style={{ left: pct(corner.x), top: pct(corner.y) }}
            >
              <span className="w-3 h-3 rounded-full bg-white border-2 border-[#2D6A4F] shadow" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How far a point sits from a box's centre, in card widths — one number, so a
 * handle drag reads the same whatever shape the box is. The scale it produces
 * is that distance now over what it was when the finger went down.
 */
function reach(rect: CardRect, point: Point): number {
  return Math.hypot(
    point.x - (rect.x + rect.width / 2),
    hToW(point.y - (rect.y + rect.height / 2)),
  );
}

/**
 * Which part a touch landed on: the topmost one whose box holds it, tested in
 * reverse paint order. The part already being held wins a tie, so a finger
 * coming back to it never jumps to a neighbour.
 */
function hit(
  card: ResolvedCard,
  point: Point,
  selected: AdjustKey | null,
): AdjustKey | null {
  const padY = wToH(TOUCH_SLOP);
  const inside = (key: AdjustKey) => {
    const rect = card.frames[key];
    return (
      !!rect &&
      point.x >= rect.x - TOUCH_SLOP &&
      point.x <= rect.x + rect.width + TOUCH_SLOP &&
      point.y >= rect.y - padY &&
      point.y <= rect.y + rect.height + padY
    );
  };
  if (selected && inside(selected)) return selected;
  return [...ADJUSTABLE].reverse().find(inside) ?? null;
}
