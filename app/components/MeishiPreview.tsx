"use client";

import type { Pet } from "@/lib/types";

type Props = {
  composedPhoto: string | null;
  pets: Pet[];
  petCount: 1 | 2 | 3;
  igHandle: string;
  igName: string;
  ownerName: string;
};

// Template image is 1046 × 1738 px. Layout values calibrated against the
// real reference card (public/sample-meishi.png, 1070 × 1778). Measured
// landmarks (as % of the card):
//   photo slot              top 2.9%, left 5%, w 90%, bottom 46.9%
//                           (extends past the ribbon top so it overlaps the band)
//   ribbon box top          y ≈ 45.1% — the ribbon is re-drawn ON TOP of the
//                           photo via /meishi-ribbon.png (transparent overlay)
//                           so the white band + text float over the photo,
//                           matching the printed card.
//   breed / name / owner    y ≈ 61% / 66% / 71%
//   Instagram icon          x ≈ 6–16%, y ≈ 84–90% (drawn in template)
//   IG text (name + handle) x ≈ 18%, y ≈ 85–90%
//   QR code                 w 26.5%, right margin 7.5%, vertical center 88%
//                           (square; top derived: 88% − 26.5%·(1046/1738)/2 ≈ 80%)
//   anicas mark (bottom-R)  x ≈ 88–91%, y ≈ 93–95%
// All layout values below are percentages of the card so the card scales
// with its container; font sizes use cqw via inline-size container queries.
const TEMPLATE_ASPECT = "1046 / 1738";

const LAYOUT = {
  photo: { top: "2.9%", left: "5%", width: "90%", height: "44%" },
  textBlock: { top: "60%", left: "10%", width: "80%" },
  igBlock: { top: "84.5%", left: "18%", width: "46%" },
  qr: { top: "80%", right: "7.5%", width: "26.5%" },
};

const FONT = {
  breed: "3.3cqw",
  name: "7.6cqw",
  owner: "4.5cqw",
  igName: "3.8cqw",
  igHandle: "3.4cqw",
};

export function MeishiPreview({
  composedPhoto,
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
  const igProfileUrl = handle
    ? `https://www.instagram.com/${encodeURIComponent(handle)}`
    : "";
  const qrSrc = handle
    ? `https://quickchart.io/qr?text=${encodeURIComponent(igProfileUrl)}&size=240&margin=1`
    : "";

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
        src="/meishi-template.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Photo. Canvas aspect (~1.27) is matched to this slot so object-cover
          fills without clipping. */}
      {composedPhoto && (
        <div className="absolute overflow-hidden" style={LAYOUT.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={composedPhoto}
            alt="pet"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Ribbon overlay — same framing as the template, drawn AFTER the photo
          so the banner (white + outline + text) sits on top of the photo where
          they overlap, like the printed card. Transparent everywhere else. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/meishi-ribbon.png"
        alt=""
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
      />

      {/* Pet text block below ribbon: breed (small) → name (large) → owner */}
      <div
        className="absolute text-center leading-tight"
        style={LAYOUT.textBlock}
      >
        {breeds && (
          <div className="text-gray-800" style={{ fontSize: FONT.breed }}>
            {breeds}
          </div>
        )}
        {names && (
          <div
            className="font-bold text-gray-900"
            style={{ fontSize: FONT.name, marginTop: "0.5cqw" }}
          >
            {names}
          </div>
        )}
        {ownerName.trim() && (
          <div
            className="text-gray-800"
            style={{ fontSize: FONT.owner, marginTop: "2cqw" }}
          >
            【owner：{ownerName.trim()}】
          </div>
        )}
      </div>

      {/* IG name (line 1) + @handle (line 2), to the right of the Instagram
          icon that is already drawn in the template */}
      <div className="absolute leading-tight" style={LAYOUT.igBlock}>
        {igName.trim() && (
          <div
            className="font-medium text-gray-900"
            style={{ fontSize: FONT.igName }}
          >
            {igName.trim()}
          </div>
        )}
        {handle && (
          <div
            className="text-gray-800"
            style={{ fontSize: FONT.igHandle, marginTop: "0.3cqw" }}
          >
            @{handle}
          </div>
        )}
      </div>

      {/* QR code, bottom-right (square) */}
      {qrSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrSrc}
          alt="QR"
          className="absolute"
          style={{
            top: LAYOUT.qr.top,
            right: LAYOUT.qr.right,
            width: LAYOUT.qr.width,
            aspectRatio: "1 / 1",
          }}
        />
      )}
    </div>
  );
}
