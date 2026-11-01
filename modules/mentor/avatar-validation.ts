const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/u;

type SupportedAvatarMimeType =
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

type AvatarValidationResult =
  | { avatarUrl: string | null; ok: true }
  | { field: "avatarUrl"; message: string; ok: false };

const AVATAR_FORMAT_ERROR_MESSAGE =
  "Gunakan foto berformat JPG, PNG, WebP, atau GIF dengan ukuran maksimal 2 MB.";

function decodeBase64Bytes(base64Payload: string): Uint8Array | null {
  try {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(base64Payload, "base64"));
    }
    const binary = atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function hasMatchingImageSignature(
  mimeType: SupportedAvatarMimeType,
  bytes: Uint8Array,
): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case "image/png":
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      );
    case "image/gif": {
      if (bytes.length < 6) return false;
      const header = String.fromCharCode(...bytes.slice(0, 6));
      return header === "GIF87a" || header === "GIF89a";
    }
    case "image/webp": {
      if (bytes.length < 12) return false;
      const riff = String.fromCharCode(...bytes.slice(0, 4));
      const webp = String.fromCharCode(...bytes.slice(8, 12));
      return riff === "RIFF" && webp === "WEBP";
    }
  }
}

function validateKaptenAvatarDataUrl(
  input: unknown,
): AvatarValidationResult {
  if (input === null) {
    return { avatarUrl: null, ok: true };
  }

  if (typeof input !== "string") {
    return {
      field: "avatarUrl",
      message: AVATAR_FORMAT_ERROR_MESSAGE,
      ok: false,
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { avatarUrl: null, ok: true };
  }

  const match = AVATAR_DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    return {
      field: "avatarUrl",
      message: AVATAR_FORMAT_ERROR_MESSAGE,
      ok: false,
    };
  }

  const mimeType = match[1] as SupportedAvatarMimeType;
  const base64Payload = match[2];
  if (!base64Payload || base64Payload.length % 4 !== 0) {
    return {
      field: "avatarUrl",
      message: AVATAR_FORMAT_ERROR_MESSAGE,
      ok: false,
    };
  }

  const bytes = decodeBase64Bytes(base64Payload);
  if (!bytes || bytes.byteLength <= 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    return {
      field: "avatarUrl",
      message: AVATAR_FORMAT_ERROR_MESSAGE,
      ok: false,
    };
  }

  if (!hasMatchingImageSignature(mimeType, bytes)) {
    return {
      field: "avatarUrl",
      message: AVATAR_FORMAT_ERROR_MESSAGE,
      ok: false,
    };
  }

  return {
    avatarUrl: `data:${mimeType};base64,${base64Payload}`,
    ok: true,
  };
}

export {
  AVATAR_FORMAT_ERROR_MESSAGE,
  MAX_AVATAR_BYTES,
  validateKaptenAvatarDataUrl,
};
export type { AvatarValidationResult, SupportedAvatarMimeType };
