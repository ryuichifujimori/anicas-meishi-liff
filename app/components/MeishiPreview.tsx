"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { Pet } from "@/lib/types";
import {
  ASSETS,
  LAYOUT,
  LINE_HEIGHT,
  TEMPLATE_ASPECT,
  TYPE,
  type TypeSpec,
  cardText,
  cqw,
  pct,
  petGap,
} from "@/lib/meishi-layout";

type Props = {
  composedPhoto: string | null;
  qrSrc: string | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  /** The step-4 bar: how far apart the pets sit. 0 is the card as designed. */
  nameSpread: number;
  igHandle: string;
  igName: string;
  ownerName: string;
};

/**
 * On-screen preview of the finished card.
 *
 * Every position, size, weight and colour — and every string, separators
 * included — comes from `lib/meishi-layout.ts`, which `lib/print.ts` also
 * renders from, so the print-ready PDF and this preview can never drift apart.
 * Fractions are turned into CSS percentages (`pct`) and container-query units
 * (`cqw`) here; the print renderer turns the same fractions into PDF points.
 */
export function MeishiPreview({
  composedPhoto,
  qrSrc,
  pets,
  petCount,
  nameSpread,
  igHandle,
  igName,
  ownerName,
}: Props) {
  const card = useRef<HTMLDivElement>(null);
  const family = useCardFontFamily(card);
  const text = cardText({ pets, petCount, ownerName, igName, igHandle });

  return (
    <div
      ref={card}
      className="relative w-full max-w-[360px] mx-auto bg-white shadow-sm rounded overflow-hidden"
      style={{
        aspectRatio: TEMPLATE_ASPECT,
        containerType: "inline-size",
      }}
    >
      {/* Background template */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ASSETS.template}
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Photo. Canvas aspect (~1.15) is matched to this slot so object-cover
          fills without clipping. Drawn ON TOP of the template background and
          intentionally extended into the ribbon band; the ribbon overlay below
          is then drawn over it. */}
      {composedPhoto && (
        <div
          className="absolute overflow-hidden"
          style={{
            top: pct(LAYOUT.photo.top),
            left: pct(LAYOUT.photo.left),
            width: pct(LAYOUT.photo.width),
            height: pct(LAYOUT.photo.height),
          }}
        >
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

      {/* Pet text block below ribbon: breed (small) → name (large) → owner */}
      <div
        className="absolute text-center"
        style={{
          top: pct(LAYOUT.textBlock.top),
          left: pct(LAYOUT.textBlock.left),
          width: pct(LAYOUT.textBlock.width),
          lineHeight: LINE_HEIGHT,
        }}
      >
        <Run spec={TYPE.breed} parts={text.breeds} {...{ nameSpread, family }} />
        <Run spec={TYPE.name} parts={text.names} {...{ nameSpread, family }} />
        <Run spec={TYPE.owner} parts={[text.owner]} {...{ nameSpread, family }} />
      </div>

      {/* IG name (line 1) + @handle (line 2), to the right of the Instagram
          icon that is already drawn in the template */}
      <div
        className="absolute"
        style={{
          top: pct(LAYOUT.igBlock.top),
          left: pct(LAYOUT.igBlock.left),
          width: pct(LAYOUT.igBlock.width),
          lineHeight: LINE_HEIGHT,
        }}
      >
        <Run spec={TYPE.igName} parts={[text.igName]} />
        <Run spec={TYPE.igHandle} parts={[text.igHandle]} />
      </div>

      {/* QR code, bottom-right (square) */}
      {qrSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrSrc}
          alt="QR"
          className="absolute"
          style={{
            top: pct(LAYOUT.qr.top),
            right: pct(LAYOUT.qr.right),
            width: pct(LAYOUT.qr.width),
            aspectRatio: "1 / 1",
          }}
        />
      )}
    </div>
  );
}

/**
 * One text run of the card — the pets' own words, one string each, or a single
 * string for the lines that are not per-pet. Omitted entirely when empty;
 * `lib/print.ts` skips empty runs the same way, so the vertical flow matches.
 *
 * Pass `family` to have the run centred on its ink instead of on its advance
 * width; the left-aligned runs do not need it.
 */
function Run({
  spec,
  parts,
  nameSpread = 0,
  family,
}: {
  spec: TypeSpec;
  parts: string[];
  nameSpread?: number;
  family?: string;
}) {
  const shown = parts.filter(Boolean);
  const shift = useInkShift(shown, spec.weight, family);

  if (!shown.length) return null;

  const style: CSSProperties = {
    fontSize: cqw(spec.size),
    fontWeight: spec.weight,
    color: spec.color,
  };
  if (spec.marginTop) style.marginTop = cqw(spec.marginTop);
  if (shift) style.transform = `translateX(${shift}em)`;

  return (
    <div style={style}>
      {shown.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            // What holds two pets apart. A measured box rather than a
            // full-width space, so the bar in step 4 can open it up — and the
            // same box, in the same units, as the gap lib/print.ts leaves.
            <span
              aria-hidden
              style={{ display: "inline-block", width: cqw(petGap(spec, nameSpread)) }}
            />
          )}
          {part}
        </Fragment>
      ))}
    </div>
  );
}

/** The font the card is actually being drawn in — inherited, so it has to be
 *  read back off the rendered element rather than assumed. */
function useCardFontFamily(card: RefObject<HTMLDivElement | null>): string {
  const [family, setFamily] = useState("");
  useEffect(() => {
    if (card.current) setFamily(getComputedStyle(card.current).fontFamily);
  }, [card]);
  return family;
}

/** Measuring size for the ink readings. Large, so rounding cannot reach the
 *  third decimal of the em-relative answer. */
const INK_PROBE_SIZE = 400;

/**
 * How far a centred line has to slide, in ems of its own size, to sit centred
 * on its INK rather than on its advance width.
 *
 * A Japanese glyph is drawn inside a full-width em and carries whatever is left
 * over as side bearings, and those differ wildly from glyph to glyph — the ト
 * that opens トイプードル hangs 0.30 em of empty space off its left, where the
 * ペ that opens ペコ hangs 0.04. Centring the advance box therefore leaves the
 * breed line and the name line on visibly different axes, the name reading
 * left of the breed. Taking the two outer bearings off first is what "centred"
 * means to the eye. `lib/print.ts` follows the same rule against the font it
 * embeds, so the card and this preview agree.
 *
 * A canvas is the only way to read a glyph's ink extents in the browser. The
 * answer comes back in ems, so it holds at every preview width and never needs
 * remeasuring. On a line long enough to wrap, the browser picks the break and
 * the outer characters of the run are used for every line of it.
 */
function useInkShift(parts: string[], weight: number, family?: string): number {
  const [shift, setShift] = useState(0);
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const tail = Array.from(parts[parts.length - 1] ?? "");
  const last = tail[tail.length - 1] ?? "";

  useEffect(() => {
    if (!family || !first || !last) {
      setShift(0);
      return;
    }
    let cancelled = false;
    const measure = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || cancelled) return;
      ctx.font = `${weight} ${INK_PROBE_SIZE}px ${family}`;
      const head = ctx.measureText(first);
      const tailMetrics = ctx.measureText(last);
      const lsb = -head.actualBoundingBoxLeft;
      const rsb = tailMetrics.width - tailMetrics.actualBoundingBoxRight;
      if (Number.isFinite(lsb) && Number.isFinite(rsb)) {
        setShift(-(lsb - rsb) / 2 / INK_PROBE_SIZE);
      }
    };
    // Whatever the stack finally resolves to is what has to be measured.
    document.fonts?.ready.then(measure).catch(measure) ?? measure();
    return () => {
      cancelled = true;
    };
  }, [first, last, weight, family]);

  return shift;
}
