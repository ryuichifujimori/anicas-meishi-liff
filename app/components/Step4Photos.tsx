"use client";

import { useRef, useState } from "react";
import type { Pet, PetPhoto, PhotoTransform } from "@/lib/types";
import { loadAndNormalizeImage } from "@/lib/image";
import {
  barFromSpread,
  cardText,
  clampSpread,
  spreadFromBar,
} from "@/lib/meishi-layout";
import { useCardFont, useSpreadLimits } from "@/lib/card-metrics";
import { PhotoComposer } from "./PhotoComposer";
import { MeishiPreview } from "./MeishiPreview";

type Props = {
  petCount: 1 | 2 | 3;
  pets: Pet[];
  photos: (PetPhoto | null)[];
  transforms: PhotoTransform[];
  composedPhoto: string | null;
  /** The name-spacing bar's value. 0 is the card as designed. */
  nameSpread: number;
  qrSrc: string | null;
  igHandle: string;
  igName: string;
  ownerName: string;
  onPhotosChange: (photos: (PetPhoto | null)[]) => void;
  onTransformsChange: (t: PhotoTransform[]) => void;
  onComposed: (dataUrl: string) => void;
  onNameSpreadChange: (spread: number) => void;
  onNext: () => void;
  onBack: () => void;
};

export function Step4Photos({
  petCount,
  pets,
  photos,
  transforms,
  composedPhoto,
  nameSpread,
  qrSrc,
  igHandle,
  igName,
  ownerName,
  onPhotosChange,
  onTransformsChange,
  onComposed,
  onNameSpreadChange,
  onNext,
  onBack,
}: Props) {
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Array<HTMLInputElement | null>>([]);

  // The bar's stops are not a fixed distance: they come from the width of the
  // words the talent actually typed, measured in the font the card is set in.
  // Left, the first pair of words meets; right, the names reach the card's
  // margin. Short names therefore open much further than long ones.
  const family = useCardFont();
  const text = cardText({ pets, petCount, ownerName, igName, igHandle });
  const spreadLimits = useSpreadLimits(text.breeds, text.names, family);
  const spreadRange = spreadLimits.max - spreadLimits.min;

  const handleFile = async (idx: number, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setLoadingIdx(idx);
    try {
      const photo = await loadAndNormalizeImage(file);
      const next = photos.slice();
      next[idx] = photo;
      onPhotosChange(next);
    } catch (e) {
      console.error(e);
      setError("画像の読み込みに失敗しました。別の画像をお試しください。");
    } finally {
      setLoadingIdx(null);
    }
  };

  const validPhotos = photos
    .slice(0, petCount)
    .filter((p): p is PetPhoto => p !== null);
  const photoCount = validPhotos.length;
  const hasAny = photoCount >= 1;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-center">写真をアップロード</h2>
      <p className="text-sm text-gray-600 text-center">
        HEIC/HEIF も自動でJPEGに変換されます。1枚以上アップロードしてください。
      </p>

      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: petCount }, (_, i) => (
          <div key={i} className="space-y-1">
            <button
              type="button"
              onClick={() => fileInputs.current[i]?.click()}
              className="w-full aspect-square rounded-lg border-2 border-dashed border-gray-300 bg-white flex items-center justify-center overflow-hidden"
            >
              {loadingIdx === i ? (
                <span className="text-xs text-gray-500">読み込み中…</span>
              ) : photos[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photos[i]!.dataUrl}
                  alt={`pet ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-gray-500">+ 写真{i + 1}</span>
              )}
            </button>
            <input
              ref={(el) => {
                fileInputs.current[i] = el;
              }}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => handleFile(i, e.target.files?.[0])}
            />
          </div>
        ))}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {hasAny && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">写真の編集</h3>
          <PhotoComposer
            photos={validPhotos}
            transforms={transforms.slice(0, photoCount)}
            onTransformsChange={(t) => {
              const next = transforms.slice();
              t.forEach((v, i) => (next[i] = v));
              onTransformsChange(next);
            }}
            onComposed={onComposed}
          />

          {/* How far apart the pets sit. Nothing to space out with a single
              pet, so the bar only exists from two upwards. It rides in the
              same block as the zoom bar above rather than opening a section
              of its own — both are the same kind of nudge to the artwork. */}
          {petCount > 1 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="name-spread">
                名前の間隔
              </label>
              <input
                id="name-spread"
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={barFromSpread(clampSpread(nameSpread, spreadLimits), spreadLimits)}
                disabled={spreadRange <= 0}
                onChange={(e) =>
                  onNameSpreadChange(
                    spreadFromBar(parseFloat(e.target.value), spreadLimits),
                  )
                }
                className="w-full accent-[#2D6A4F] disabled:opacity-50"
              />
            </div>
          )}
        </div>
      )}

      {hasAny && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">名刺プレビュー</h3>
          <MeishiPreview
            composedPhoto={composedPhoto}
            nameSpread={nameSpread}
            qrSrc={qrSrc}
            pets={pets}
            petCount={petCount}
            igHandle={igHandle}
            igName={igName}
            ownerName={ownerName}
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasAny}
          className="flex-1 py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50"
        >
          次へ
        </button>
      </div>
    </div>
  );
}
