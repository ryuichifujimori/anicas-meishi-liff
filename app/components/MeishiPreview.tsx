"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Pet } from "@/lib/types";
import {
  type Adjust,
  type CardRect,
  type FaceAdjust,
  type Guide,
  type MeasureRun,
  type PartKey,
  type PlacedRun,
  type ResolvedCard,
  petIndex,
  readPart,
  resolveCard,
  writePart,
} from "@/lib/card-adjust";
import {
  ASSETS,
  LAYOUT,
  LINE_HEIGHT,
  photoClip,
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
  const card = resolveCard({ text, measure, adjust, hasPhoto: Boolean(composedPhoto) });

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
            band; the ribbon overlay below is then drawn over it. The picture is
            cut to the design's own window (photoClip), whose lower edge is the
            ribbon's outline — so however far it is moved or how big it is made,
            none of it reaches the card outside that window. */}
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

        {/* The Instagram line, where the design flows it. The glyph beside it
            is the template's own, drawn into /meishi-template.png: the line no
            longer moves, so nothing has to be painted out and put back. */}
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
 * The photo's box as CSS, cut to the design's own window — the ribbon's outline
 * for its lower edge. The window is fixed on the CARD, so it is restated here
 * in the box's own coordinates: move the photo or make it bigger and the
 * picture slides and grows BEHIND a cut that does not budge. Nothing outside
 * the window is ever drawn, at any size.
 */
function photoFrame(rect: CardRect): CSSProperties {
  const at = (v: number, from: number, size: number) => `${((v - from) / size) * 100}%`;
  return {
    ...frame(rect),
    clipPath: `polygon(${photoClip(rect)
      .map(([x, y]) => `${at(x, rect.x, rect.width)} ${at(y, rect.y, rect.height)}`)
      .join(", ")})`,
  };
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

/** How much slop a touch gets around a part, in card widths (~3 px at the
 *  preview's size). A single row of small type would be hard to land on
 *  otherwise. */
const TOUCH_SLOP = 0.008;

/**
 * Which parts two fingers may size: the photo, and only the photo. A pet's
 * column is set at the size the whole card's type is set at, from the control
 * under the preview — three names the same size is the thing a card of three
 * pets is judged on, and two hands can only approximate it.
 */
const PINCHABLE = (key: PartKey) => petIndex(key) === null;

/**
 * The green the editing marks are drawn in — the app's own, so the card is
 * never marked up in a colour that could be mistaken for the design.
 */
const MARK = "#2D6A4F";

type Point = { x: number; y: number };

/**
 * What two fingers are doing, as one reading: the point between them, how far
 * apart they are, and the angle of the line joining them. Distances are in
 * card WIDTHS on both axes, so a spread that is mostly up-and-down counts the
 * same as one that is mostly side-to-side.
 *
 * The angle is read although nothing uses it yet. Turning the photo is the
 * obvious next thing to ask of two fingers, and when it is asked for it is a
 * line in `onMove` — not another way of listening to the hand.
 */
type Grip = { centre: Point; spread: number; angle: number };

const grip = (a: Point, b: Point): Grip => ({
  centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  spread: Math.hypot(b.x - a.x, hToW(b.y - a.y)),
  angle: Math.atan2(hToW(b.y - a.y), b.x - a.x),
});

/**
 * What the hand is doing to one part.
 *
 * ONE finger moves it. TWO fingers on the same part size it — there is no
 * handle to find, which is the whole point: a corner three millimetres across
 * is not something anyone notices, and spreading two fingers on a picture is
 * something everyone already does.
 */
type Drag =
  | { kind: "move"; key: PartKey; from: Adjust; start: Point }
  | { kind: "pinch"; key: PartKey; from: Adjust; start: Grip };

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
  /** Every finger currently on the card, in the order they arrived. */
  const fingers = useRef(new Map<number, Point>());

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

  /**
   * Every move of the finger is sent to the CARD, not to the page.
   *
   * A phone decides what a touch is FOR from the first move: if it settles on
   * "this is a scroll", it takes the pointer away — `pointercancel` — and
   * whatever was being dragged is left where it stood, which is what "the page
   * scrolls and the photo does not move" looks like. `touch-action: none` is
   * supposed to settle that question in the card's favour and on a desktop
   * browser it does, but it cannot be relied on alone on a phone. So the move
   * is refused outright as well.
   *
   * It has to be hung on the element by hand: React registers its own touch
   * listeners as PASSIVE, and a passive listener's `preventDefault` does
   * nothing at all.
   */
  useEffect(() => {
    const surface = host.current;
    if (!surface) return;
    const refuse = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    // And the same for the phone's own two-finger zoom, which Safari announces
    // separately from the touches themselves.
    const stopZoom = (e: Event) => e.preventDefault();
    surface.addEventListener("touchmove", refuse, { passive: false });
    surface.addEventListener("gesturestart", stopZoom);
    surface.addEventListener("gesturechange", stopZoom);
    return () => {
      surface.removeEventListener("touchmove", refuse);
      surface.removeEventListener("gesturestart", stopZoom);
      surface.removeEventListener("gesturechange", stopZoom);
    };
  }, []);

  /**
   * Every later move of this finger is delivered to the SURFACE, wherever the
   * finger actually is — so a corner pulled right off the card keeps resizing,
   * and a part dragged past the edge keeps moving.
   *
   * The surface takes the capture rather than the handle that was touched: a
   * handle is a few millimetres across and the finger leaves it immediately,
   * and an element that stops being the pointer's target stops being told
   * where the pointer went.
   */
  const capture = (e: PointerEvent<HTMLElement>) => {
    // A phone can have taken the pointer away before this runs; the drag can
    // still be followed from the events that reach the surface by bubbling.
    try {
      host.current?.setPointerCapture(e.pointerId);
    } catch {
      /* nothing to capture */
    }
  };

  /** The two fingers a pinch is being read from, oldest first. */
  const pair = () => [...fingers.current.values()].slice(0, 2);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const point = at(e);
    if (!point) return;
    fingers.current.set(e.pointerId, point);
    const held = drag.current;

    // A second finger on the part already in hand turns the drag into a pinch:
    // the same part, now sized by how far apart the two fingers are.
    if (held && fingers.current.size === 2 && PINCHABLE(held.key)) {
      const [a, b] = pair();
      capture(e);
      drag.current = {
        kind: "pinch",
        key: held.key,
        from: readPart(adjust, held.key),
        start: grip(a, b),
      };
      return;
    }
    // A third finger, or a second on a part that is not sized this way, is
    // left to rest: the drag already in hand carries on unchanged.
    if (held) return;

    const key = hit(card, point, selected);
    setSelected(key);
    if (!key) return;
    capture(e);
    drag.current = { kind: "move", key, from: readPart(adjust, key), start: point };
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const point = at(e);
    if (!point) return;
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, point);
    const d = drag.current;
    if (!d) return;

    if (d.kind === "pinch") {
      const [a, b] = pair();
      if (!a || !b || !d.start.spread) return;
      const now = grip(a, b);
      // How much further apart the fingers are is how much bigger the picture
      // is, and the point between them takes the picture along with it.
      set(d.key, {
        scale: (d.from.scale * now.spread) / d.start.spread,
        dx: d.from.dx + (now.centre.x - d.start.centre.x),
        dy: d.from.dy + (now.centre.y - d.start.centre.y),
      });
      return;
    }

    // Lined up on the way IN, so what is stored is what the talent watched it
    // stop on — and the line that says why is drawn from the same answer.
    const { adjust: held, guide: line } = card.snap(d.key, {
      ...d.from,
      dx: d.from.dx + (point.x - d.start.x),
      dy: d.from.dy + (point.y - d.start.y),
    });
    setGuide(line);
    onChange(writePart(adjust, d.key, held));
  };

  const release = (e: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    setGuide(null);
    if (!fingers.current.size) {
      drag.current = null;
      return;
    }
    // One finger of a pinch lifted and the other is still down: carry on from
    // where THAT one is, measured afresh, so nothing jumps.
    const [next] = pair();
    drag.current = { kind: "move", key: d.key, from: readPart(adjust, d.key), start: next };
  };

  const rect = selected ? rectOf(selected) : null;

  return (
    <div
      ref={host}
      // `select-none` matters as much as `touch-none`: without it a drag over
      // the card starts one of the browser's own gestures — a text selection,
      // and from a second press on that selection a native drag — which takes
      // the pointer away mid-move and leaves the part stranded. On a phone the
      // press-and-hold callout over the card's pictures does the same, so that
      // is turned off here too.
      className="absolute inset-0 touch-none select-none"
      style={{ WebkitTouchCallout: "none" }}
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
        // The frame the part in hand is wearing. Nothing is hung on it: the
        // photo is sized by spreading two fingers on it and a pet's column by
        // the control under the preview, so there is no corner to find.
        <div
          data-selected=""
          className="absolute border-2 pointer-events-none"
          style={{ ...frame(rect), borderColor: MARK }}
        />
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
