"use client";

import { generateMeishiPrintPdf, type MeishiPrintInput } from "./print";
import { usablePhotos } from "./photo-slots";
import type { FormData, SubmitPayload } from "./types";

/**
 * Turning the finished form into what gets sent to GAS, in two independent
 * steps: build the payload (which is where the print-ready PDF is produced),
 * then post it. They are separate on purpose — once payment is part of the
 * flow, the build can run while the talent pays and the post can wait for the
 * payment to settle, without either step moving into a button handler.
 */

/** The subset of the form the print renderer needs. */
export function toPrintInput(form: FormData): MeishiPrintInput {
  return {
    composedPhoto: form.composedPhoto,
    photos: usablePhotos(form.photos, form.petCount).map((p) => ({
      aspect: p.width / p.height,
    })),
    qr: form.qr,
    pets: form.pets,
    petCount: form.petCount,
    adjust: form.adjust.front,
    igHandle: form.ig_handle,
    igName: form.ig_name,
    ownerName: form.owner_name,
  };
}

/**
 * Builds the GAS payload, generating the print-ready PDF along the way.
 * Throws if the photo is missing, since there is nothing to print without it.
 *
 * The composed photo goes into the PDF and nowhere else. It used to ride along
 * as `photo_base64` too, which made every order carry the same picture twice —
 * once at 350 dpi inside the card, once whole — and GAS stopped saving the
 * loose copy. It was the largest thing in the post, so the post is now a
 * fraction of what it was and the talent waits that much less.
 */
export async function buildSubmitPayload(
  form: FormData,
  lineUserId: string | null,
): Promise<SubmitPayload> {
  if (!form.composedPhoto) throw new Error("composedPhoto is required");

  const print_base64 = await generateMeishiPrintPdf(toPrintInput(form));

  return {
    ig_handle: form.ig_handle.trim(),
    ig_name: form.ig_name.trim(),
    owner_name: form.owner_name.trim(),
    pets: form.pets.slice(0, form.petCount).map((p) => ({
      breed: p.breed.trim(),
      name: p.name.trim(),
    })),
    print_base64,
    adjust: form.adjust,
    line_user_id: lineUserId,
  };
}

/**
 * Posts the payload to the GAS WebApp. GAS doPost does not echo CORS headers,
 * so `mode:"no-cors"` makes the response opaque — the POST still arrives, but
 * nothing can be read back from it.
 */
export async function postMeishiOrder(
  gasUrl: string,
  payload: SubmitPayload,
): Promise<void> {
  await fetch(gasUrl, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
