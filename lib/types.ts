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

export type PhotoTransform = {
  // position is the center of the image in canvas coordinates (0-1, normalized to canvas)
  cx: number;
  cy: number;
};

export type FormData = {
  petCount: 1 | 2 | 3;
  pets: Pet[];
  photos: (PetPhoto | null)[];
  transforms: PhotoTransform[];
  composedPhoto: string | null; // data URL of composed image
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
  // Composed pet photo. Kept so a card can be remade or reordered from the
  // original artwork rather than from the flattened print file.
  photo_base64: string;
  // Print-ready PDF (data URL): 61 x 97 mm page = 55 x 91 mm card + 3 mm
  // bleed. The talent's own words are live text in an embedded font and the QR
  // is drawn as paths; the design's artwork and the photo are images. The QR is
  // part of it, which is why the form no longer sends a separate qr_base64.
  print_base64: string;
  // The talent's own placement of the card's five movable parts, as one object
  // keyed by face — so a card remade from this payload comes back laid out the
  // way they left it, and a second face is a key rather than a new field.
  adjust: CardAdjust;
  line_user_id: string | null;
};
