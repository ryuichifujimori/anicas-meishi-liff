"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Pet } from "@/lib/types";
import {
  type Adjust,
  type CardRect,
  type FaceAdjust,
  type Guide,
  type MeasureRun,
  type PartKey,
  type PlacedPhoto,
  type PlacedRun,
  type ResolvedCard,
  petIndex,
  readPart,
  resolveCard,
  writePart,
} from "@/lib/card-adjust";
import {
  ASSETS,
  IG_MARK_COVER,
  LAYOUT,
  LINE_HEIGHT,
  TEMPLATE_ASPECT,
  cardText,
  cqw,
  hToW,
  inkOffset,
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
  /** Where the talent has put the card's movable parts. */
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
  const text = cardText({ pets, petCount, ownerName, igName, igHandle });
  const card = resolveCard({
    text,
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
            band; the ribbon overlay below is then drawn over it. The picture
            is cut to the window the design left for it, so moving and resizing
            pan and zoom it inside that window. */}
        {composedPhoto && (
          <div className="absolute overflow-hidden" style={photoFrame(card.photo)}>
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
        {card.ig.mark && <div className="absolute bg-white" style={frame(COVER_BOX)} />}

        {/* The pet text block: the breed row, the name row and the owner line,
            stacked exactly as the design stacks them. Both rows keep their
            BOXES in that stack however the talent moves and resizes the pets
            inside them — so every breed shares one baseline, every name shares
            another, and the owner, which is not hers to move, cannot be pushed
            about by anything done above it. */}
        <div
          className="absolute text-center"
          style={{
            top: pct(LAYOUT.textBlock.top),
            left: pct(LAYOUT.textBlock.left),
            width: pct(LAYOUT.textBlock.width),
            lineHeight: LINE_HEIGHT,
          }}
        >
          <PetRow run={card.breed} />
          <PetRow run={card.name} />
          <OwnerLine run={card.owner} text={text.owner} measure={measure} />
        </div>

        {card.ig.mark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ASSETS.igMark} alt="" className="absolute" style={frame(card.ig.mark)} />
        )}
        {card.ig.runs.map((run, i) => (
          <Run key={i} run={run} />
        ))}

        {/* QR code, bottom-right. Its height is left to `aspect-ratio` rather
            than stated as a percentage of the card: the QR is square by
            construction, and a percentage of the card's height lands a
            sixteenth of a pixel away from a percentage of its width, which is
            enough to resample the code differently. */}
        {qrSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrSrc}
            alt="QR"
            className="absolute"
            style={{
              left: pct(card.qr.x),
              top: pct(card.qr.y),
              width: pct(card.qr.width),
              aspectRatio: "1 / 1",
            }}
          />
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

/** What paints the template's own Instagram glyph out, as a card rectangle. */
const COVER_BOX: CardRect = {
  x: IG_MARK_COVER.left,
  y: IG_MARK_COVER.top,
  width: IG_MARK_COVER.width,
  height: IG_MARK_COVER.height,
};

/**
 * One pet row — the breeds, or the names — inside the text block.
 *
 * The row's box stays where the design's flow puts it and keeps the design's
 * height. Inside it every pet is placed by `lib/card-adjust.ts`, and each may
 * be set at its own size: the OUTER span is struck at the row's own size and
 * holds the line box, so its baseline is the row's baseline, and the inner
 * span — which takes no height of its own — hangs the pet's words on that same
 * baseline whatever size they are set at. That is what keeps three names level
 * with each other while each is sized on its own.
 */
function PetRow({ run }: { run: PlacedRun }) {
  if (!run.lines.length) return null;

  const style: CSSProperties = {
    position: "relative",
    height: cqw(LINE_HEIGHT * run.spec.size),
  };
  if (run.spec.marginTop) style.marginTop = cqw(run.spec.marginTop);

  return (
    <div style={style}>
      {run.lines.map((line, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: cqw(line.x - LAYOUT.textBlock.left),
            fontSize: cqw(run.size),
            lineHeight: cqw(run.lineBox),
            fontWeight: run.spec.weight,
            color: run.spec.color,
            whiteSpace: "nowrap",
          }}
        >
          {line.size === run.size ? (
            line.text
          ) : (
            <span style={{ fontSize: cqw(line.size), lineHeight: 0 }}>{line.text}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/** One run of type placed straight onto the card: each line exactly where
 *  `lib/card-adjust.ts` put it, with nothing left for CSS to flow or break. */
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
            fontSize: cqw(line.size),
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

/**
 * The owner line — the one run on the card the talent cannot pick up.
 *
 * It flows under the two pet rows inside the text block, centred by CSS and
 * nudged onto its ink, exactly as it always has. The print file places it from
 * `run.lines` instead, where `lib/card-adjust.ts` has centred it on the same
 * ink by the same rule — but on screen a computed centre and a CSS one
 * disagree in the last sixteenth of a pixel, which is enough to redraw the
 * line, and a card nobody has touched has to come out of here unchanged.
 */
function OwnerLine({
  run,
  text,
  measure,
}: {
  run: PlacedRun;
  text: string;
  measure: MeasureRun;
}) {
  if (!text) return null;

  const style: CSSProperties = {
    fontSize: cqw(run.size),
    fontWeight: run.spec.weight,
    color: run.spec.color,
  };
  if (run.spec.marginTop) style.marginTop = cqw(run.spec.marginTop);
  const shift = inkOffset(measure(run.spec, text));
  if (shift) style.transform = `translateX(${shift}em)`;

  return <div style={style}>{text}</div>;
}

/**
 * The photo's box as CSS, cut to the window the design left for it. A box that
 * is already inside the window is given no cut at all, so a card whose photo
 * nobody has moved carries exactly the declarations it always did.
 */
function photoFrame(photo: PlacedPhoto): CSSProperties {
  const style = frame(photo.box);
  if (photo.drawn === photo.box) return style;
  const { box, drawn } = photo;
  const cut = (v: number) => `${(v / box.height) * 100}%`;
  const side = (v: number) => `${(v / box.width) * 100}%`;
  style.clipPath = `inset(${cut(drawn.y - box.y)} ${side(box.x + box.width - drawn.x - drawn.width)} ${cut(box.y + box.height - drawn.y - drawn.height)} ${side(drawn.x - box.x)})`;
  return style;
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

/**
 * The green the editing marks are drawn in — the app's own, so the card is
 * never marked up in a colour that could be mistaken for the design.
 */
const MARK = "#2D6A4F";

type Point = { x: number; y: number };

type Drag =
  | { kind: "move"; key: PartKey; from: Adjust; start: Point }
  | { kind: "scale"; key: PartKey; from: Adjust; reach: number };

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
  const [selected, setSelected] = useState<PartKey | null>(null);
  /** How the part being dragged has lined itself up, while it is being dragged
   *  and no longer — see `lib/card-adjust.ts`'s table. */
  const [guide, setGuide] = useState<Guide | null>(null);
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

  const rectOf = (key: PartKey) => card.parts.find((part) => part.key === key)?.rect ?? null;

  // Held to what the card allows before it is stored, not after — so a finger
  // that runs past an edge does not build up travel it has to give back before
  // the part moves again, and the value that reaches the payload is one the
  // card can actually be printed from. A pet's column drops its `dy` on the way
  // in, which is what stops one pet drifting off its row's baseline.
  const set = (key: PartKey, value: Adjust) =>
    onChange(writePart(adjust, key, card.clamp(key, value)));

  const startScale = (key: PartKey) => (e: PointerEvent<HTMLElement>) => {
    const point = at(e);
    const rect = rectOf(key);
    if (!point || !rect) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "scale",
      key,
      from: readPart(adjust, key),
      reach: reach(rect, point),
    };
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const point = at(e);
    if (!point) return;
    const key = hit(card, point, selected);
    setSelected(key);
    if (!key) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "move", key, from: readPart(adjust, key), start: point };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const point = at(e);
    if (!d || !point) return;
    if (d.kind === "move") {
      // Lined up on the way IN, so what is stored is what the talent watched
      // it stop on — and the line that says why is drawn from the same answer.
      const { adjust: held, guide: line } = card.snap(d.key, {
        ...d.from,
        dx: d.from.dx + (point.x - d.start.x),
        dy: d.from.dy + (point.y - d.start.y),
      });
      setGuide(line);
      onChange(writePart(adjust, d.key, held));
      return;
    }
    // The part scales about its own centre, which a scale drag never moves, so
    // the live frame is as good a centre to measure from as the one the finger
    // went down on.
    const rect = rectOf(d.key);
    if (!rect || !d.reach) return;
    set(d.key, { ...d.from, scale: (d.from.scale * reach(rect, point)) / d.reach });
  };

  const release = () => {
    drag.current = null;
    setGuide(null);
  };

  const rect = selected ? rectOf(selected) : null;

  return (
    <div
      ref={host}
      // `select-none` matters as much as `touch-none`: without it a drag over
      // the card starts one of the browser's own gestures — a text selection,
      // and from a second press on that selection a native drag — which takes
      // the pointer away mid-move and leaves the part stranded.
      className="absolute inset-0 touch-none select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={release}
      onPointerCancel={release}
    >
      {/* What can be picked up. A faint dotted frame round every movable part,
          for as long as the card is being laid out — this screen is the one
          that says what can be moved, and the confirmation screen (which has
          no editor at all) is where the finished card is seen. */}
      {card.parts
        .filter((part) => part.key !== selected)
        .map((part) => (
          <div
            key={part.key}
            aria-hidden
            data-movable=""
            className="absolute border border-dotted pointer-events-none"
            style={{ ...frame(part.rect), borderColor: MARK, opacity: 0.45 }}
          />
        ))}

      {/* How the part being dragged has lined itself up. It exists only while
          the finger is down: let go and it is gone. */}
      {guide && <GuideMark guide={guide} />}

      {selected && rect && (
        <div
          data-selected=""
          className="absolute border-2 pointer-events-none"
          style={{ ...frame(rect), borderColor: MARK }}
        >
          {/* Only the parts that can be resized carry handles. A pet's column
              is sized with the rest of the card's type, from the control under
              the preview, so its frame says "drag me" and nothing else. */}
          {petIndex(selected) === null &&
            CORNERS.map((corner, i) => (
              <span
                key={i}
                aria-hidden
                onPointerDown={startScale(selected)}
                className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-auto"
                style={{ left: pct(corner.x), top: pct(corner.y) }}
              >
                <span
                  className="w-3 h-3 rounded-full bg-white border-2 shadow"
                  style={{ borderColor: MARK }}
                />
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * The mark that says why a part stopped where it did.
 *
 * A line down the card means it is on the card's own middle; two short lines
 * of the same length, one in each gap, mean the gaps either side have come out
 * equal. They have to look different, or the two say nothing.
 */
function GuideMark({ guide }: { guide: Guide }) {
  if (guide.kind === "middle") {
    return (
      <div
        aria-hidden
        data-guide="middle"
        className="absolute top-0 bottom-0 w-px -translate-x-1/2 pointer-events-none"
        style={{ left: pct(guide.x), backgroundColor: MARK }}
      />
    );
  }
  return (
    <>
      {guide.spans.map((span, i) => (
        <div
          key={i}
          aria-hidden
          data-guide="gap"
          className="absolute h-px -translate-y-1/2 pointer-events-none"
          style={{
            left: pct(span.from),
            width: pct(span.to - span.from),
            top: pct(guide.y),
            backgroundColor: MARK,
          }}
        />
      ))}
    </>
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
 * Which part a touch landed on: the topmost one whose box holds it. The parts
 * arrive from `lib/card-adjust.ts` already in that order, and the part already
 * being held wins a tie, so a finger coming back to it never jumps to a
 * neighbour.
 */
function hit(
  card: ResolvedCard,
  point: Point,
  selected: PartKey | null,
): PartKey | null {
  const padY = wToH(TOUCH_SLOP);
  const inside = ({ rect }: { rect: CardRect }) =>
    point.x >= rect.x - TOUCH_SLOP &&
    point.x <= rect.x + rect.width + TOUCH_SLOP &&
    point.y >= rect.y - padY &&
    point.y <= rect.y + rect.height + padY;

  const held = card.parts.find((part) => part.key === selected);
  if (held && inside(held)) return held.key;
  return card.parts.find(inside)?.key ?? null;
}
