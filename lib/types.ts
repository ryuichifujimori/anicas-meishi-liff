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
  ig_handle: string;
  ig_name: string;
  owner_name: string;
};

export type SubmitPayload = {
  ig_handle: string;
  ig_name: string;
  owner_name: string;
  pets: Pet[];
  photo_base64: string;
  line_user_id: string | null;
};
