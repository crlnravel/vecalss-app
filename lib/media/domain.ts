const MEDIA_MAX_SIZE_BYTES = 15 * 1024 * 1024;

const mediaMimeExtensions = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type MediaScope = "admin" | "kapten";
type SupportedMediaMimeType = keyof typeof mediaMimeExtensions;

type MediaUploadInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type MediaUploadValidation =
  | { isValid: true }
  | { error: string; isValid: false };

const parseMediaScope = (value: string): MediaScope | null => {
  if (value === "admin" || value === "kapten") {
    return value;
  }

  return null;
};

const isSupportedMediaMimeType = (
  value: string,
): value is SupportedMediaMimeType => value in mediaMimeExtensions;

const normalizeMediaFileName = (value: string) => {
  const normalized = value
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return (normalized || "gambar").slice(0, 255);
};

const validateMediaUpload = ({
  fileName,
  mimeType,
  sizeBytes,
}: MediaUploadInput): MediaUploadValidation => {
  if (!fileName.trim()) {
    return { error: "Nama file tidak boleh kosong.", isValid: false };
  }

  if (!isSupportedMediaMimeType(mimeType)) {
    return {
      error: "Gunakan gambar berformat JPG, PNG, WebP, atau GIF.",
      isValid: false,
    };
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { error: "File gambar kosong atau tidak valid.", isValid: false };
  }

  if (sizeBytes > MEDIA_MAX_SIZE_BYTES) {
    return { error: "Ukuran gambar maksimal 15 MB.", isValid: false };
  }

  return { isValid: true };
};

const buildMediaObjectKey = (
  scope: MediaScope,
  assetId: string,
  mimeType: SupportedMediaMimeType,
) => `${scope}/${assetId}.${mediaMimeExtensions[mimeType]}`;

const formatMediaBytes = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

export {
  MEDIA_MAX_SIZE_BYTES,
  buildMediaObjectKey,
  formatMediaBytes,
  isSupportedMediaMimeType,
  mediaMimeExtensions,
  normalizeMediaFileName,
  parseMediaScope,
  validateMediaUpload,
};
export type { MediaScope, SupportedMediaMimeType };
