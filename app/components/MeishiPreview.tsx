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
  cqw,
  pct,
} from "@/lib/meishi-layout";

type Props = {
  composedPhoto: string | null;
  qrSrc: string | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  igHandle: string;
  igName: string;
  ownerName: string;
};

/**
 * On-screen preview of the finished card.
 *
 * Every position, size, weight and colour comes from `lib/meishi-layout.ts`,
 * which `lib/print.ts` also renders from — so the print-ready PDF and this
 * preview can never drift apart. Fractions are turned into CSS percentages
 * (`pct`) and container-query units (`cqw`) here; the print renderer turns the
 * same fractions into device pixels.
 */
export function MeishiPreview({
  composedPhoto,
  qrSrc,
  pets,
  petCount,
  igHandle,
  igName,
  ownerName,
}: Props) {
  const visiblePets = pets.slice(0, petCount);
  const breeds = visiblePets
    .map((p) => p.breed.trim())
    .filter(Boolean)
    .join(" / ");
  const names = visiblePets
    .map((p) => p.name.trim())
    .filter(Boolean)
    .join(" & ");

  const handle = igHandle.trim();

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
        <Run spec={TYPE.breed} text={breeds} />
        <Run spec={TYPE.name} text={names} />
        <Run
          spec={TYPE.owner}
          text={ownerName.trim() && `【owner：${ownerName.trim()}】`}
        />
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
        <Run spec={TYPE.igName} text={igName.trim()} />
        <Run spec={TYPE.igHandle} text={handle && `@${handle}`} />
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
 * One text run of the card. Omitted entirely when empty — `lib/print.ts`
 * skips empty runs the same way, so the vertical flow matches.
 */
function Run({ spec, text }: { spec: TypeSpec; text: string | false }) {
  if (!text) return null;
  const style: CSSProperties = {
    fontSize: cqw(spec.size),
    fontWeight: spec.weight,
    color: spec.color,
  };
  if (spec.marginTop) style.marginTop = cqw(spec.marginTop);
  return <div style={style}>{text}</div>;
}
