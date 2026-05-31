"use client";

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
// Logo placement was measured from public/sample-meishi.png: the "a nicas"
// mark hugs the bottom-right corner. Behind it we draw a white backing circle
// whose diameter equals the QR finder pattern ("eye") outer size — 7 modules —
// so the circle visually matches the three eyes. LOGO_RATIO is then sized so
// the mark fits inside that circle. The circle stays in the bottom-right
// corner, clear of all three finder patterns (top-left, top-right, bottom-left).

const LOGO_SRC = "/anicas_logo_br_square.png";
const QR_SIZE = 1000; // output canvas size in px (square)
const QR_MARGIN = 12; // quiet-zone margin in px
const FINDER_MODULES = 7; // a finder pattern is 7×7 modules (QR spec)
const FINDER_CENTRE_MODULE = 3.5; // a finder centre sits 3.5 modules in from its matrix edge
const LOGO_RATIO = 0.12; // logo box width as a fraction of QR width (fits inside the finder-size circle)

/**
 * Builds the Instagram profile URL encoded into the QR. Mirrors the value
 * shown elsewhere in the form (MeishiPreview uses the same www host).
 */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${encodeURIComponent(handle.trim())}`;
}

/**
 * Generates the styled QR (with the anicas logo composited bottom-right) for
 * the given Instagram handle and returns it as a PNG data URL. Returns null
 * for an empty handle. The same data URL is used both for the on-screen
 * preview and for the image uploaded to Drive, so they are byte-identical.
 */
export async function generateMeishiQr(handle: string): Promise<string | null> {
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

    // Layer order: QR body → white backing circle → logo. The white circle's
    // diameter equals the QR finder pattern ("eye") outer size and it is placed
    // on the finder grid at the bottom-right corner — i.e. exactly where a 4th
    // finder would sit — so it lines up with the bottom-left finder vertically
    // and the top-right finder horizontally, visually matching the three eyes.
    //
    // qr-code-styling draws each module at dotSize = floor((width − 2·margin) /
    // moduleCount) px, centres the matrix (origin = floor((width − count·dotSize)
    // / 2)), and a finder is FINDER_MODULES (7) modules wide with its centre
    // FINDER_CENTRE_MODULE (3.5) modules in from the edge. moduleCount is read
    // from the generated QR, so everything tracks the QR version automatically.
    // The circle covers only bottom-right data, recoverable at EC level H.
    // canvas arc fill is antialiased, so the rim is smooth (no jaggies).
    const moduleCount = qr._qr?.getModuleCount() ?? 37; // fallback ≈ version 5
    const dotSize = Math.floor((QR_SIZE - 2 * QR_MARGIN) / moduleCount);
    const origin = Math.floor((QR_SIZE - moduleCount * dotSize) / 2);
    // Bottom-right finder-grid position: same offset as the top-right finder's
    // x and the bottom-left finder's y.
    const centre = origin + (moduleCount - FINDER_CENTRE_MODULE) * dotSize;
    const cx = centre;
    const cy = centre;
    const radius = (FINDER_MODULES * dotSize) / 2;

    const w = QR_SIZE * LOGO_RATIO;
    const x = cx - w / 2;
    const y = cy - w / 2;

    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(logo, x, y, w, w);
  } catch (e) {
    // A missing/blocked logo asset must not break QR generation — the QR
    // (which is what actually links to Instagram) is still returned.
    console.warn("anicas logo overlay skipped:", e);
  }

  return canvas.toDataURL("image/png");
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
      img.src = LOGO_SRC;
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
