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

/**
 * Renders a preview of the business card by overlaying user-supplied
 * photo, text, and a generated QR onto /meishi-template.png. Positions are
 * percentages of the card so it scales with the container.
 */
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
        aspectRatio: "1058 / 1764",
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

      {/* Photo */}
      {composedPhoto && (
        <div
          className="absolute flex items-center justify-center"
          style={{ top: "6%", left: "15%", width: "70%", height: "33%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={composedPhoto}
            alt="pet"
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* Pet text block (below ribbon) */}
      <div
        className="absolute text-center leading-tight"
        style={{ top: "57%", left: "8%", width: "84%" }}
      >
        {breeds && (
          <div className="text-gray-700" style={{ fontSize: "3.2cqw" }}>
            {breeds}
          </div>
        )}
        {names && (
          <div
            className="font-bold mt-[0.5cqw]"
            style={{ fontSize: "5.6cqw" }}
          >
            {names}
          </div>
        )}
        {ownerName.trim() && (
          <div
            className="text-gray-700 mt-[0.8cqw]"
            style={{ fontSize: "2.8cqw" }}
          >
            【owner:{ownerName.trim()}】
          </div>
        )}
      </div>

      {/* IG name + handle, to the right of the IG icon already drawn in template */}
      <div
        className="absolute leading-tight"
        style={{ top: "82.5%", left: "20%", width: "45%" }}
      >
        {igName.trim() && (
          <div
            className="font-medium text-gray-900"
            style={{ fontSize: "3cqw" }}
          >
            {igName.trim()}
          </div>
        )}
        {handle && (
          <div className="text-gray-700" style={{ fontSize: "2.8cqw" }}>
            @{handle}
          </div>
        )}
      </div>

      {/* QR code, bottom-right */}
      {qrSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrSrc}
          alt="QR"
          className="absolute"
          style={{ top: "78%", right: "6%", width: "14%", height: "auto" }}
        />
      )}
    </div>
  );
}
