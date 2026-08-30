"use client";

import { Fragment, type CSSProperties } from "react";
import type { Pet } from "@/lib/types";
import {
  ASSETS,
  LAYOUT,
  LINE_HEIGHT,
  TEMPLATE_ASPECT,
  TYPE,
  type TypeSpec,
  cardText,
  clampSpread,
  cqw,
  fittedSize,
  pct,
  petGap,
} from "@/lib/meishi-layout";
import {
  bearingsEm,
  textEm,
  useCardFont,
  useSpreadLimits,
} from "@/lib/card-metrics";

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
  const family = useCardFont();
  const text = cardText({ pets, petCount, ownerName, igName, igHandle });
  // What the talent typed decides how far the bar could go, so a value saved
  // against shorter names is brought back inside range here rather than
  // pushing the card out of its block.
  const limits = useSpreadLimits(text.breeds, text.names, family);
  const spread = clampSpread(nameSpread, limits);

  return (
    <div
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
        <Run spec={TYPE.breed} parts={text.breeds} fit {...{ spread, family }} />
        <Run spec={TYPE.name} parts={text.names} {...{ spread, family }} />
        <Run spec={TYPE.owner} parts={[text.owner]} {...{ family }} />
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
 * With `family` the run is centred on its ink rather than on its advance
 * width; with `fit` it is also set smaller, as far as it takes, rather than
 * allowed onto a second line. The left-aligned runs need neither.
 */
function Run({
  spec,
  parts,
  spread = 0,
  family = "",
  fit = false,
}: {
  spec: TypeSpec;
  parts: string[];
  spread?: number;
  family?: string;
  fit?: boolean;
}) {
  const shown = parts.filter(Boolean);
  if (!shown.length) return null;

  const widths = family ? shown.map((p) => textEm(p, spec.weight, family)) : null;
  const gap = petGap(spec, spread);
  const size = fit && widths ? fittedSize(spec, widths, gap) : spec.size;
  const shift = family ? inkShift(shown, spec.weight, family) : 0;

  const style: CSSProperties = {
    fontSize: cqw(size),
    fontWeight: spec.weight,
    color: spec.color,
  };
  if (spec.marginTop) style.marginTop = cqw(spec.marginTop);
  if (shift) style.transform = `translateX(${shift}em)`;
  // A fitted line has been sized to hold; it must never take the second line
  // it was sized out of, and it keeps the line box the design asks for so the
  // line below it does not move either.
  if (fit) {
    style.whiteSpace = "nowrap";
    style.lineHeight = cqw(LINE_HEIGHT * spec.size);
  }

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
              style={{ display: "inline-block", width: cqw(gap) }}
            />
          )}
          {part}
        </Fragment>
      ))}
    </div>
  );
}

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
 * On a line long enough to wrap, the browser picks the break and the outer
 * characters of the whole run are used for every line of it.
 */
function inkShift(parts: string[], weight: number, family: string): number {
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const tail = Array.from(parts[parts.length - 1] ?? "");
  const last = tail[tail.length - 1] ?? "";
  if (!first || !last) return 0;
  const { lsb } = bearingsEm(first, weight, family);
  const { rsb } = bearingsEm(last, weight, family);
  return -(lsb - rsb) / 2;
}
