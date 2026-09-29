import {
  EDIT_LEASE_RESOURCE_TYPES,
  type EditLeaseResourceType,
} from "./types";

const UUID_RESOURCE_TYPES = new Set<EditLeaseResourceType>([
  "quiz",
  "question_bank",
  "question_package",
  "tryout",
  "media_asset",
  "media_folder",
]);

class InvalidResourceKeyError extends Error {
  readonly code = "invalid_proof" as const;
  readonly status = 422;

  constructor(message = "Resource edit proof tidak valid.") {
    super(message);
    this.name = "InvalidResourceKeyError";
  }
}

function isEditLeaseResourceType(value: unknown): value is EditLeaseResourceType {
  return typeof value === "string"
    && (EDIT_LEASE_RESOURCE_TYPES as readonly string[]).includes(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function canonicalizeResourceKey(
  resourceType: unknown,
  resourceId: unknown,
) {
  if (!isEditLeaseResourceType(resourceType) || typeof resourceId !== "string") {
    throw new InvalidResourceKeyError();
  }

  const normalizedId = resourceId.normalize("NFKC").trim();
  if (
    !normalizedId
    || normalizedId !== normalizedId.replace(/[\u0000-\u001f\u007f]/gu, "")
    || normalizedId.includes("/")
    // Materi codes are stable catalog keys and may include colon-delimited segments.
    // UUID-backed resources keep the delimiter restriction so their identifiers remain canonical.
    || (resourceType !== "materi" && normalizedId.includes(":"))
    || utf8ByteLength(normalizedId) > 128
  ) {
    throw new InvalidResourceKeyError();
  }

  if (UUID_RESOURCE_TYPES.has(resourceType) && !isUuid(normalizedId)) {
    throw new InvalidResourceKeyError();
  }

  return {
    resourceId: UUID_RESOURCE_TYPES.has(resourceType) ? normalizedId.toLowerCase() : normalizedId,
    resourceType,
    resourceKey: `${resourceType}:${UUID_RESOURCE_TYPES.has(resourceType) ? normalizedId.toLowerCase() : normalizedId}`,
  } as const;
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) return null;

  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=";
    const binary = atob(padded);
    if (binary.length !== 32) return null;
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes))
      .replace(/\+/gu, "-")
      .replace(/\//gu, "_")
      .replace(/=+$/u, "");
    return canonical === value ? bytes : null;
  } catch {
    return null;
  }
}

function isLeaseInstanceToken(value: unknown): value is string {
  return typeof value === "string" && decodeBase64Url(value) !== null;
}

function isPositiveGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export {
  InvalidResourceKeyError,
  canonicalizeResourceKey,
  decodeBase64Url,
  isEditLeaseResourceType,
  isLeaseInstanceToken,
  isPositiveGeneration,
  isUuid,
  utf8ByteLength,
};

export type { EditLeaseResourceType };
