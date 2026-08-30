"use client";

import type { CSSProperties } from "react";
import type { Pet } from "@/lib/types";
import {
  ASSETS,
  LAYOUT,
  LINE_HEIGHT,
  TEMPLATE_ASPECT,
  TYPE,
  type TypeSpec,
  type Measured,
  cardText,
  clampSpread,
  cqw,
  inkCentred,
  inkOffset,
  layoutPets,
  pct,
} from "@/lib/meishi-layout";
import { measureText, useCardFont, useSpreadLimits } from "@/lib/card-metrics";

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
  const limits = useSpreadLimits(
    text.pets.map((p) => p.name),
    family,
  );
  const names = text.pets.map((p) => measureText(p.name, TYPE.name.weight, family));
  const breeds = text.pets.map((p) => measureText(p.breed, TYPE.breed.weight, family));
  const columns = layoutPets(names, breeds, clampSpread(nameSpread, limits));
  const line = (measures: Measured[], size: number, word: (i: number) => string) =>
    text.pets.map((_, i) => ({
      text: word(i),
      left: inkCentred(measures[i], columns.axes[i], size),
    }));

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
        <PetLine
          spec={TYPE.breed}
          size={columns.breedSize}
          items={line(breeds, columns.breedSize, (i) => text.pets[i].breed)}
        />
        <PetLine
          spec={TYPE.name}
          size={columns.nameSize}
          items={line(names, columns.nameSize, (i) => text.pets[i].name)}
        />
        <Run spec={TYPE.owner} text={text.owner} {...{ family }} />
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
        <Run spec={TYPE.igName} text={text.igName} />
        <Run spec={TYPE.igHandle} text={text.igHandle} />
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
 * One line of a pet column block: the breed, or the name. Each item is already
 * placed on its own column's axis by `layoutPets`, so the line is a row of
 * absolutely positioned words rather than a flowed one — the same placement
 * `lib/print.ts` makes in the PDF.
 *
 * The row keeps the height the design asks for even when the words have been
 * set smaller to fit, so shrinking one line never shifts the ones below it.
 */
function PetLine({
  spec,
  size,
  items,
}: {
  spec: TypeSpec;
  size: number;
  items: { text: string; left: number }[];
}) {
  const shown = items.filter((item) => item.text);
  if (!shown.length) return null;

  const style: CSSProperties = {
    position: "relative",
    height: cqw(LINE_HEIGHT * spec.size),
  };
  if (spec.marginTop) style.marginTop = cqw(spec.marginTop);

  return (
    <div style={style}>
      {shown.map((item, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: cqw(item.left - LAYOUT.textBlock.left),
            fontSize: cqw(size),
            lineHeight: cqw(LINE_HEIGHT * spec.size),
            fontWeight: spec.weight,
            color: spec.color,
            whiteSpace: "nowrap",
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

/**
 * One of the card's single-string lines — the owner, the Instagram name, the
 * handle. Omitted entirely when empty; `lib/print.ts` skips empty lines the
 * same way, so the vertical flow matches.
 *
 * Pass `family` to have the line centred on its ink rather than on its advance
 * width (`inkOffset`); the left-aligned lines do not need it.
 */
function Run({
  spec,
  text,
  family = "",
}: {
  spec: TypeSpec;
  text: string;
  family?: string;
}) {
  if (!text) return null;

  const style: CSSProperties = {
    fontSize: cqw(spec.size),
    fontWeight: spec.weight,
    color: spec.color,
  };
  if (spec.marginTop) style.marginTop = cqw(spec.marginTop);
  if (family) {
    const shift = inkOffset(measureText(text, spec.weight, family));
    if (shift) style.transform = `translateX(${shift}em)`;
  }

  return <div style={style}>{text}</div>;
}
