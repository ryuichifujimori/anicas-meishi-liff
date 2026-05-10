"use client";

import { useEffect, useRef, useState } from "react";
import type { PetPhoto, PhotoTransform } from "@/lib/types";
import { dataUrlToImage } from "@/lib/image";

const CANVAS_W = 1200;
const CANVAS_H = 800;

type Props = {
  photos: PetPhoto[];
  transforms: PhotoTransform[];
  onTransformsChange: (t: PhotoTransform[]) => void;
  onComposed: (dataUrl: string) => void;
};

/**
 * Composes multiple photos side-by-side onto a transparent canvas.
 * Each photo lives in a horizontal slot; user can drag to pan and pinch
 * (or use slider) to zoom within its slot.
 */
export function PhotoComposer({
  photos,
  transforms,
  onTransformsChange,
  onComposed,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgs, setImgs] = useState<HTMLImageElement[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const slotW = CANVAS_W / photos.length;

  // Load images
  useEffect(() => {
    let cancelled = false;
    Promise.all(photos.map((p) => dataUrlToImage(p.dataUrl))).then((loaded) => {
      if (!cancelled) setImgs(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  // Render
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || imgs.length === 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    imgs.forEach((img, i) => {
      const t = transforms[i] ?? { cx: 0.5, cy: 0.5, scale: 1 };
      drawPhotoInSlot(ctx, img, i * slotW, 0, slotW, CANVAS_H, t);
    });

    onComposed(cv.toDataURL("image/png"));
    // We deliberately don't include onComposed in deps — it's a callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgs, transforms, slotW]);

  // Pointer/touch handling for the active slot
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCx: number;
    startCy: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const slotPx = rect.width / photos.length;
    const idx = Math.min(photos.length - 1, Math.max(0, Math.floor(x / slotPx)));
    setActiveIdx(idx);
    const t = transforms[idx];
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCx: t.cx,
      startCy: t.cy,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const slotPxW = rect.width / photos.length;
    const slotPxH = rect.height;
    const dx = (e.clientX - d.startX) / slotPxW;
    const dy = (e.clientY - d.startY) / slotPxH;
    const next = transforms.map((t, i) =>
      i === activeIdx
        ? {
            ...t,
            cx: clamp(d.startCx - dx, 0, 1),
            cy: clamp(d.startCy - dy, 0, 1),
          }
        : t,
    );
    onTransformsChange(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const setScale = (idx: number, scale: number) => {
    const next = transforms.map((t, i) => (i === idx ? { ...t, scale } : t));
    onTransformsChange(next);
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full bg-[repeating-conic-gradient(#eee_0%_25%,#fff_0%_50%)] bg-[length:20px_20px] rounded-lg overflow-hidden touch-none select-none"
        style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        {/* Slot dividers + active indicator */}
        {photos.length > 1 &&
          photos.map((_, i) => (
            <div
              key={i}
              className={`absolute top-0 bottom-0 border-2 pointer-events-none ${
                i === activeIdx ? "border-[#2D6A4F]" : "border-transparent"
              }`}
              style={{
                left: `${(i / photos.length) * 100}%`,
                width: `${100 / photos.length}%`,
              }}
            />
          ))}
      </div>

      {photos.length > 1 && (
        <div className="text-xs text-gray-600 text-center">
          編集中: ペット {activeIdx + 1} / 写真をドラッグして位置調整
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          ペット {activeIdx + 1} の拡大率
        </label>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.05}
          value={transforms[activeIdx]?.scale ?? 1}
          onChange={(e) => setScale(activeIdx, parseFloat(e.target.value))}
          className="w-full accent-[#2D6A4F]"
        />
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Draws an image into a slot using cover-fit, then applies user transform
 * (cx/cy as 0-1 indicating which point of the image is centered in the slot,
 * scale relative to cover-fit baseline).
 */
function drawPhotoInSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  t: PhotoTransform,
) {
  const baseScale = Math.max(sw / img.width, sh / img.height);
  const scale = baseScale * t.scale;
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  // cx/cy ∈ [0,1] is which fraction of the IMAGE is centered in the slot.
  const dx = sx + sw / 2 - drawW * t.cx;
  const dy = sy + sh / 2 - drawH * t.cy;

  ctx.save();
  ctx.beginPath();
  ctx.rect(sx, sy, sw, sh);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
}
