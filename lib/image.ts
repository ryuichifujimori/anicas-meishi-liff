"use client";

// Longest edge kept from the uploaded photo. Sized for 350 dpi print rather
// than for the on-screen preview: the card's photo slot is ~682 x 593 px at
// print resolution, and the framing editor lets the talent zoom in up to 3x,
// so the source has to carry more pixels than the slot alone needs.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

/**
 * Loads a File (possibly HEIC) into an HTMLImageElement, converting if needed,
 * and resizes to fit within MAX_DIMENSION on the longest edge.
 */
export async function loadAndNormalizeImage(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  let blob: Blob = file;

  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === "image/heic" ||
    file.type === "image/heif";

  if (isHeic) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }

  const img = await blobToImage(blob);
  const { width, height } = fitWithin(img.width, img.height, MAX_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return { dataUrl, width, height };
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w > h ? max / w : max / h;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
