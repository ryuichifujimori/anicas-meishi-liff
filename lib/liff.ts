"use client";

import type { Liff } from "@line/liff";

let liffInstance: Liff | null = null;
let initPromise: Promise<Liff | null> | null = null;

export function getLiff(): Liff | null {
  return liffInstance;
}

/**
 * Initialize LIFF. Returns the liff object on success, or null if
 * initialization failed (e.g. running on a non-LINE browser, or no LIFF ID).
 * Form should still work even if this returns null.
 */
export async function initLiff(): Promise<Liff | null> {
  if (typeof window === "undefined") return null;
  if (liffInstance) return liffInstance;
  if (initPromise) return initPromise;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    console.warn("[liff] NEXT_PUBLIC_LIFF_ID is not set; skipping init");
    return null;
  }

  initPromise = (async () => {
    try {
      const mod = await import("@line/liff");
      const liff = mod.default;
      await liff.init({ liffId });
      liffInstance = liff;
      return liff;
    } catch (e) {
      console.error("[liff] init failed", e);
      return null;
    }
  })();

  return initPromise;
}

export function getLineUserId(): string | null {
  if (!liffInstance) return null;
  try {
    if (!liffInstance.isLoggedIn()) return null;
    const ctx = liffInstance.getContext();
    return ctx?.userId ?? null;
  } catch {
    return null;
  }
}
