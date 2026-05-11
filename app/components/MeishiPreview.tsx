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

// Template image is 1046 × 1738 px. Measured key landmarks:
//   ribbon                  y ≈ 42–56%
//   right-side paw prints   y ≈ 65–79%
//   Instagram icon          x ≈ 6–17%, y ≈ 83–89%
//   anicas mark (bottom-R)  x ≈ 87–94%, y ≈ 90–94%
// All layout values below are percentages of the card so the card scales
// with its container; font sizes use cqw via inline-size container queries.
const TEMPLATE_ASPECT = "1046 / 1738";

const LAYOUT = {
  photo: { top: "2.5%", left: "7%", width: "86%", height: "39%" },
  textBlock: { top: "57%", left: "10%", width: "80%" },
  igBlock: { top: "83%", left: "18%", width: "50%" },
  qr: { top: "80%", right: "14%", width: "15%" },
};

const FONT = {
  breed: "3.3cqw",
  name: "6.6cqw",
  owner: "3cqw",
  igName: "3.4cqw",
  igHandle: "3cqw",
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
            style={{ fontSize: FONT.owner, marginTop: "1.2cqw" }}
          >
            【owner:{ownerName.trim()}】
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
