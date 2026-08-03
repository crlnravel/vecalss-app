const MEDIA_MAX_SIZE_BYTES = 15 * 1024 * 1024;

const mediaMimeExtensions = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

type MediaScope = "admin" | "kapten";
type SupportedMediaMimeType = keyof typeof mediaMimeExtensions;
type ImageMediaMimeType = Exclude<SupportedMediaMimeType, "application/pdf">;

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
): value is SupportedMediaMimeType => Object.prototype.hasOwnProperty.call(mediaMimeExtensions, value.trim().toLowerCase());

const isPdfMimeType = (value: string | null | undefined): value is "application/pdf" =>
  value?.trim().toLowerCase() === "application/pdf";

const isImageMimeType = (value: string | null | undefined): value is ImageMediaMimeType =>
  typeof value === "string"
  && Object.prototype.hasOwnProperty.call(mediaMimeExtensions, value.trim().toLowerCase())
  && !isPdfMimeType(value);

const imageMediaMimeTypes = Object.keys(mediaMimeExtensions).filter(
  (mimeType): mimeType is ImageMediaMimeType => !isPdfMimeType(mimeType),
);

const allMediaMimeTypes = Object.keys(mediaMimeExtensions) as SupportedMediaMimeType[];

const normalizeMediaFileName = (value: string) => {
  const normalized = value
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  return (normalized || "gambar").slice(0, 255);
};

const safeDownloadFileName = (fileName: string | null | undefined) => {
  const normalized = (fileName ?? "materi.pdf")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/[\\/\"<>:|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const withPdf = normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized || "materi"}.pdf`;
  return withPdf || "materi.pdf";
};

const validateMediaUpload = ({
  fileName,
  mimeType,
  sizeBytes,
}: MediaUploadInput): MediaUploadValidation => {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const isPdf = isPdfMimeType(normalizedMimeType);
  const mediaLabel = isPdf ? "PDF" : "gambar";

  if (!fileName.trim()) {
    return { error: "Nama file tidak boleh kosong.", isValid: false };
  }

  if (!isSupportedMediaMimeType(normalizedMimeType)) {
    return {
      error: "Gunakan gambar berformat JPG, PNG, WebP, GIF, atau dokumen PDF.",
      isValid: false,
    };
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { error: `File ${mediaLabel} kosong atau tidak valid.`, isValid: false };
  }

  if (sizeBytes > MEDIA_MAX_SIZE_BYTES) {
    return { error: `Ukuran ${mediaLabel} maksimal 15 MB.`, isValid: false };
  }

  return { isValid: true };
};

const buildMediaObjectKey = (
  scope: MediaScope,
  assetId: string,
  mimeType: SupportedMediaMimeType,
) => `${scope}/${assetId}.${mediaMimeExtensions[mimeType.trim().toLowerCase() as SupportedMediaMimeType]}`;

const formatMediaBytes = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

export {
  MEDIA_MAX_SIZE_BYTES,
  allMediaMimeTypes,
  buildMediaObjectKey,
  formatMediaBytes,
  imageMediaMimeTypes,
  isImageMimeType,
  isPdfMimeType,
  isSupportedMediaMimeType,
  mediaMimeExtensions,
  normalizeMediaFileName,
  parseMediaScope,
  safeDownloadFileName,
  validateMediaUpload,
};
export type { ImageMediaMimeType, MediaScope, SupportedMediaMimeType };
