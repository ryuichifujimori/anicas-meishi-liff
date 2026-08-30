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
  scale: number; // relative to fit-cover scale
};

export type FormData = {
  petCount: 1 | 2 | 3;
  pets: Pet[];
  photos: (PetPhoto | null)[];
  transforms: PhotoTransform[];
  composedPhoto: string | null; // data URL of composed image
  // How much the bar in step 4 adds to the gap between two pets, as a fraction
  // of the card width. 0 is the card as designed; how far either way the bar
  // reaches depends on the words typed. Only adjustable with 2+ pets.
  nameSpread: number;
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
  // The talent's setting for the gap between the pets, as a fraction of the
  // card width, so a card remade from this payload comes back spaced the way
  // they left it.
  name_spread: number;
  line_user_id: string | null;
};
