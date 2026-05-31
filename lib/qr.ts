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
// Logo placement was measured from public/sample-meishi.png. The visible
// "a nicas" mark there is ~9–11% of the QR width, hugging the bottom-right
// corner. The supplied 500×500 asset carries its own transparent padding, so
// the overlay BOX is larger than the visible mark; LOGO_RATIO below is tuned
// so the rendered mark lands in that 9–11% band while staying clear of all
// three finder patterns (top-left, top-right, bottom-left).

const LOGO_SRC = "/anicas_logo_br_square.png";
const QR_SIZE = 1000; // output canvas size in px (square)
const QR_MARGIN = 12; // quiet-zone margin in px
const LOGO_RATIO = 0.15; // logo box width as a fraction of QR width
const LOGO_RIGHT_GAP = 0.04; // gap from QR right edge (fraction of QR width)
const LOGO_BOTTOM_GAP = 0.04; // gap from QR bottom edge (fraction of QR width)
const WHITE_CIRCLE_RATIO = 1.4; // backing-circle diameter as a multiple of the logo's long edge

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
    const w = QR_SIZE * LOGO_RATIO;
    const x = QR_SIZE - w - QR_SIZE * LOGO_RIGHT_GAP;
    const y = QR_SIZE - w - QR_SIZE * LOGO_BOTTOM_GAP;
    const cx = x + w / 2;
    const cy = y + w / 2;

    // Layer order: QR body → white backing circle → logo. The circle lifts
    // the logo off the QR dots for legibility; its centre matches the logo
    // centre and its diameter is the logo's long edge × WHITE_CIRCLE_RATIO so
    // an even margin surrounds the mark. Kept small enough that the bottom-
    // right data it covers stays recoverable under error-correction level H,
    // and it never reaches the three finder patterns. canvas arc fill is
    // antialiased, so the rim is smooth (no jaggies).
    const radius = (w * WHITE_CIRCLE_RATIO) / 2;
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
