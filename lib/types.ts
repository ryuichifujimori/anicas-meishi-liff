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
  // bleed. Text, QR, logo and template are vector/text inside it and the photo
  // is embedded at 350 dpi. The QR is part of it, which is why the form no
  // longer sends a separate qr_base64.
  print_base64: string;
  line_user_id: string | null;
};
