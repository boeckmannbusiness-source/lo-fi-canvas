/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudinary cloud name for the unsigned mobile upload. */
  readonly VITE_CLOUDINARY_CLOUD_NAME?: string;
  /** Cloudinary unsigned upload preset (video, signing mode: unsigned). */
  readonly VITE_CLOUDINARY_UPLOAD_PRESET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
