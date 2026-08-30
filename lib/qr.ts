"use client";

import { ASSETS, LOGO_IN_DISC } from "./meishi-layout";

// QR generation matching the real c-cloud (qr.c-cloud.co.jp) business-card QR,
// which is built on qr-code-styling. We generate the QR in the browser (this
// library is DOM/canvas dependent and cannot run on GAS V8) and composite the
// anicas logo into the bottom-right corner ourselves — qr-code-styling's own
// `image` option is centre-anchored only, which is not where the real card
// places the mark.
//
// Style values reproduce the printed card (public/sample-meishi.png):
//   dots            = extra-rounded
//   corner squares  = dot   (circular finder rings)
//   corner dots     = dot   (circular finder centres)
//   colour          = #000000, transparent background
//   error level     = H     (tolerates the bottom-right logo overlay)
//
// The same QR comes out twice, from one encode: as a PNG for the on-screen
// preview, and as SVG outlines for the print PDF, which draws the modules as
// shapes so they are never resampled. The overlay geometry (white disc + logo
// box) is computed once and returned alongside, so neither consumer restates
// it.
//
// Logo placement was measured from public/sample-meishi.png: the "a nicas"
// mark hugs the bottom-right corner. Behind it we draw a white backing circle
// whose diameter equals the QR finder pattern ("eye") outer size — 7 modules —
// so the circle visually matches the three eyes. The circle stays in the
// bottom-right corner, clear of all three finder patterns, and covers only
// bottom-right data, which error-correction level H reconstructs.
//
// The circle has a second job: /meishi-template.png ALREADY carries an anicas
// mark, drawn into the design at exactly this spot. The circle sits over it,
// so the card shows the one mark this module draws rather than two. Move or
// shrink the circle and the design's own mark reappears from under it — which
// is what happened when the circle was briefly resized in PR #9.

const QR_SIZE = 1000; // output canvas size in px (square)
const QR_MARGIN = 12; // quiet-zone margin in px
const FINDER_MODULES = 7; // a finder pattern is 7×7 modules (QR spec)
const FINDER_CENTRE_MODULE = 3.5; // a finder centre sits 3.5 modules in from its matrix edge

/** The finished QR, in both the forms the card needs. */
export type MeishiQr = {
  /** Rasterised QR with the logo composited — what the preview shows. */
  png: string;
  /** The same QR as SVG markup: outlines only, transparent background. */
  svg: string;
  /** Side of the square coordinate space `svg` and `overlay` are given in. */
  size: number;
  /** White backing disc and the logo box that sits inside it. */
  overlay: {
    cx: number;
    cy: number;
    radius: number;
    logo: { x: number; y: number; size: number };
  };
};

/**
 * Builds the Instagram profile URL encoded into the QR. Mirrors the value
 * shown elsewhere in the form (MeishiPreview uses the same www host).
 */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle.trim())}`;
}

/**
 * Generates the styled QR for the given Instagram handle. Returns null for an
 * empty handle. Preview and print are driven from this one result, so what is
 * on screen and what is printed encode the same URL and sit identically.
 */
export async function generateMeishiQr(handle: string): Promise<MeishiQr | null> {
  const h = handle.trim();
  if (!h) return null;

  const QRCodeStyling = (await import("qr-code-styling")).default;
  const qr = new QRCodeStyling({
    width: QR_SIZE,
    height: QR_SIZE,
    type: "canvas",
    data: instagramUrl(h),
    margin: QR_MARGIN,
    qrOptions: { errorCorrectionLevel: "H" },
    dotsOptions: { type: "extra-rounded", color: "#000000" },
    cornersSquareOptions: { type: "dot", color: "#000000" },
    cornersDotOptions: { type: "dot", color: "#000000" },
    backgroundOptions: { color: "transparent" },
  });

  const overlay = overlayGeometry(qr);
  const [png, svg] = await Promise.all([
    rasterise(qr, overlay),
    qr.getRawData("svg").then(readText),
  ]);

  return { png, svg, size: QR_SIZE, overlay };
}

/**
 * Where the white backing circle and the logo go.
 *
 * qr-code-styling draws each module at dotSize = floor((width − 2·margin) /
 * moduleCount) px, centres the matrix (origin = floor((width − count·dotSize)
 * / 2)), and a finder is FINDER_MODULES (7) modules wide with its centre
 * FINDER_CENTRE_MODULE (3.5) modules in from the edge. moduleCount is read
 * from the generated QR, so everything tracks the QR version automatically.
 *
 * The circle is placed on that same finder grid at the bottom-right corner —
 * i.e. exactly where a 4th finder would sit — so it lines up with the
 * bottom-left finder vertically and the top-right finder horizontally, and
 * visually matches the three eyes. That is also where the design's own baked
 * mark is, which the circle has to cover; do not move or resize it.
 */
function overlayGeometry(qr: {
  _qr?: { getModuleCount(): number };
}): MeishiQr["overlay"] {
  const moduleCount = qr._qr?.getModuleCount() ?? 37; // fallback ≈ version 5
  const dotSize = Math.floor((QR_SIZE - 2 * QR_MARGIN) / moduleCount);
  const origin = Math.floor((QR_SIZE - moduleCount * dotSize) / 2);
  // Bottom-right finder-grid position: same offset as the top-right finder's
  // x and the bottom-left finder's y.
  const centre = origin + (moduleCount - FINDER_CENTRE_MODULE) * dotSize;
  const radius = (FINDER_MODULES * dotSize) / 2;
  const size = radius * 2 * LOGO_IN_DISC;
  return {
    cx: centre,
    cy: centre,
    radius,
    logo: { x: centre - size / 2, y: centre - size / 2, size },
  };
}

/** The preview's PNG: QR body → white backing circle → logo. */
async function rasterise(
  qr: { getRawData(ext: "png"): Promise<Blob | Buffer | null> },
  overlay: MeishiQr["overlay"],
): Promise<string> {
  const raw = await qr.getRawData("png");
  if (!raw || typeof Blob === "undefined" || !(raw instanceof Blob)) {
    throw new Error("QR raw data unavailable");
  }
  const qrImg = await blobToImage(raw);

  const canvas = document.createElement("canvas");
  canvas.width = QR_SIZE;
  canvas.height = QR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(qrImg, 0, 0, QR_SIZE, QR_SIZE);

  try {
    const logo = await loadLogo();
    // canvas arc fill is antialiased, so the rim is smooth (no jaggies).
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(overlay.cx, overlay.cy, overlay.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.drawImage(logo, overlay.logo.x, overlay.logo.y, overlay.logo.size, overlay.logo.size);
  } catch (e) {
    // A missing/blocked logo asset must not break QR generation — the QR
    // (which is what actually links to Instagram) is still returned.
    console.warn("anicas logo overlay skipped:", e);
  }

  return canvas.toDataURL("image/png");
}

async function readText(raw: Blob | Buffer | null): Promise<string> {
  if (!raw || typeof Blob === "undefined" || !(raw instanceof Blob)) {
    throw new Error("QR svg data unavailable");
  }
  return raw.text();
}

let cachedLogo: Promise<HTMLImageElement> | null = null;

function loadLogo(): Promise<HTMLImageElement> {
  if (!cachedLogo) {
    cachedLogo = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        cachedLogo = null;
        reject(e);
      };
      img.src = ASSETS.logo;
    });
  }
  return cachedLogo;
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
