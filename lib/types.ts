import type { CardAdjust } from "./card-adjust";
import type { MeishiQr } from "./qr";

export type Pet = {
  breed: string;
  name: string;
};

export type PetPhoto = {
  dataUrl: string; // JPEG/PNG data URL
  width: number;
  height: number;
};

export type FormData = {
  petCount: 1 | 2 | 3;
  pets: Pet[];
  photos: (PetPhoto | null)[];
  // The pets' pictures composed onto one transparent canvas, one per share of
  // the card's photo window. Made by the preview itself, and what the print
  // file is drawn from — it goes into the card at 350 dpi and does not travel
  // as a field of its own.
  composedPhoto: string | null;
  // Where the talent has dragged and resized the five movable parts of the
  // card, one entry per face. Untouched, every part is at the design's own
  // position and size and the card is byte-for-byte what it always was.
  adjust: CardAdjust;
  qr: MeishiQr | null; // the styled QR, as both a preview PNG and print outlines
  ig_handle: string;
  ig_name: string;
  owner_name: string;
};

export type SubmitPayload = {
  ig_handle: string;
  ig_name: string;
  owner_name: string;
  pets: Pet[];
  // Print-ready PDF (data URL): 61 x 97 mm page = 55 x 91 mm card + 3 mm
  // bleed. The talent's own words are live text in an embedded font and the QR
  // is drawn as paths; the design's artwork and the photo are images. The QR
  // and the photo are both inside it at print resolution, which is why the
  // form sends neither a qr_base64 nor a photo_base64 of its own.
  print_base64: string;
  // The talent's own placement of the card's five movable parts, as one object
  // keyed by face — so a card remade from this payload comes back laid out the
  // way they left it, and a second face is a key rather than a new field.
  adjust: CardAdjust;
  line_user_id: string | null;
};
