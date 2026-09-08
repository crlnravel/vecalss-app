import { BANNER_LEGACY_CONFIG_KEY } from "@/lib/banner/destinations";
import type { BannerDestination } from "@/lib/banner/destinations";

const BANNER_MAKER_CONFIG_KEY = BANNER_LEGACY_CONFIG_KEY;
const BANNER_DESIGN_VERSION = 1 as const;
const BANNER_DESIGN_WIDTH = 1600;
const BANNER_DESIGN_HEIGHT = 600;
const BANNER_MIN_WIDTH = 320;
const BANNER_MAX_WIDTH = 2400;
const BANNER_MIN_HEIGHT = 160;
const BANNER_MAX_HEIGHT = 1200;
const BANNER_MAX_RADIUS = 160;
const BANNER_MAX_PADDING = 200;
const BANNER_MAX_LAYERS = 20;
const BANNER_MAX_ALT_LENGTH = 120;
const BANNER_MAX_TEXT_LENGTH = 180;

type BannerBackground =
  | {
      type: "color";
      color: string;
    }
  | {
      type: "gradient";
      from: string;
      to: string;
      angle: number;
    }
  | {
      type: "image";
      assetId: string;
    };

type BannerLayerBase = {
  height: number;
  id: string;
  opacity: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

type BannerImageLayer = BannerLayerBase & {
  alt: string;
  assetId: string;
  type: "image";
};

type BannerTextLayer = BannerLayerBase & {
  align: "left" | "center" | "right";
  color: string;
  fontSize: number;
  text: string;
  type: "text";
  weight: "regular" | "medium" | "bold";
};

type BannerLayer = BannerImageLayer | BannerTextLayer;

type BannerFrame = {
  height: number;
  padding: number;
  radius: number;
  snapToPadding: boolean;
  width: number;
};

type BannerDesign = {
  background: BannerBackground;
  frame: BannerFrame;
  layers: BannerLayer[];
  name: string;
  version: typeof BANNER_DESIGN_VERSION;
};

type BannerAssetView = {
  assetId: string;
  height: number | null;
  name: string;
  url: string;
  width: number | null;
};

type BannerMakerSnapshot = {
  assetUrls: Record<string, BannerAssetView>;
  design: BannerDesign;
  draftVersion: string | null;
  hasUnpublishedChanges: boolean;
  published: BannerDesign;
  publishedAt: string | null;
  version: string | null;
};

type BannerSourceKind = "legacy-artwork" | "legacy-text";
type BannerSourceColumn = "configValue" | "draftValue";

/**
 * A source descriptor is intentionally reconstructable rather than a copy of
 * the legacy JSON. The server re-reads the identified row and recomputes the
 * digest while holding the banner/media mutation lock before the first v2
 * write. The digest covers both JSON columns and all SystemConfig metadata.
 */
type BannerSourceDescriptor = {
  configKey: string;
  digest: string;
  kind: BannerSourceKind;
  rowId: string | null;
  sourceColumn: BannerSourceColumn;
};

type BannerPublicationState = "invalid" | "never-published" | "published";

type BannerStarterIssue = {
  actualLength: number;
  code: "too-long";
  field: "description" | "title";
  limit: number;
  message: string;
};

type BannerBootstrap =
  | {
      design: BannerDesign;
      kind: "valid-design";
      requiresSave: boolean;
      source: BannerSourceDescriptor | null;
    }
  | {
      diagnostic: string;
      destination: BannerDestination;
      kind: "unavailable-recovery";
      recoveryOptions: BannerRecoveryOption[];
      source: BannerSourceDescriptor | null;
    }
  | {
      description: string;
      destination: BannerDestination;
      issues: BannerStarterIssue[];
      kind: "starter-needs-edit";
      source: BannerSourceDescriptor;
      title: string;
    };

type BannerRecoveryOption =
  | {
      design: BannerDesign;
      kind: "legacy-published";
      source: BannerSourceDescriptor;
    }
  | {
      bootstrap: Extract<BannerBootstrap, { kind: "starter-needs-edit" | "valid-design" }>;
      kind: "legacy-text";
      source: BannerSourceDescriptor;
    };

type BannerMakerDestinationSnapshot = {
  assetUrls: Record<string, BannerAssetView>;
  bootstrap: BannerBootstrap;
  configId: string | null;
  currentRevision: string | null;
  design: BannerDesign | null;
  destination: BannerDestination;
  draft: BannerDesign | null;
  draftRevision: string | null;
  hasPublishedDesign: boolean;
  hasSavedDraft: boolean;
  hasUnpublishedChanges: boolean;
  publicationState: BannerPublicationState;
  published: BannerDesign | null;
  publishedAt: string | null;
  diagnostic?: string;
};

type BannerMakerDestinationMutationResult = {
  configId: string;
  currentRevision: string;
  design: BannerDesign;
  destination: BannerDestination;
  hasPublishedDesign: boolean;
  hasSavedDraft: boolean;
  hasUnpublishedChanges: boolean;
  publicationState: Exclude<BannerPublicationState, "invalid">;
  publishedAt: string | null;
};

type BannerMakerDestinationFormState = {
  currentRevision?: string | null;
  destination: BannerDestination | null;
  design?: BannerDesign;
  hasUnpublishedChanges?: boolean;
  message?: string;
  published?: boolean;
  requestId: string | null;
  status: "error" | "idle" | "success";
};

type BannerMakerFormState = {
  design?: BannerDesign;
  hasUnpublishedChanges?: boolean;
  message?: string;
  published?: boolean;
  status: "error" | "idle" | "success";
  version: string | null;
};

class BannerMakerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BannerMakerValidationError";
  }
}

class BannerMakerConflictError extends Error {
  constructor() {
    super("Desain banner berubah sejak editor ini dibuka.");
    this.name = "BannerMakerConflictError";
  }
}

class BannerMakerDraftMismatchError extends Error {
  constructor() {
    super("Desain yang dirilis tidak sama dengan draf tersimpan.");
    this.name = "BannerMakerDraftMismatchError";
  }
}

class BannerMakerSourceConflictError extends Error {
  constructor() {
    super("Sumber banner berubah sejak pemulihan ini dibuka.");
    this.name = "BannerMakerSourceConflictError";
  }
}

class BannerMakerRecoveryUnavailableError extends Error {
  constructor(message = "Sumber banner lama tidak dapat dipulihkan dengan aman.") {
    super(message);
    this.name = "BannerMakerRecoveryUnavailableError";
  }
}

const DEFAULT_DESIGN: BannerDesign = {
  background: {
    angle: 120,
    from: "#014C38",
    to: "#2F8A5D",
    type: "gradient",
  },
  frame: {
    height: BANNER_DESIGN_HEIGHT,
    padding: 48,
    radius: 28,
    snapToPadding: true,
    width: BANNER_DESIGN_WIDTH,
  },
  layers: [
    {
      align: "left",
      color: "#FFFFFF",
      fontSize: 68,
      height: 24,
      id: "headline",
      opacity: 1,
      rotation: 0,
      text: "Belajar dengan arah yang jelas",
      type: "text",
      weight: "bold",
      width: 70,
      x: 8,
      y: 24,
    },
    {
      align: "left",
      color: "#DDF3E4",
      fontSize: 28,
      height: 18,
      id: "supporting-copy",
      opacity: 1,
      rotation: 0,
      text: "Susun langkahmu, lalu berangkat.",
      type: "text",
      weight: "medium",
      width: 48,
      x: 8,
      y: 57,
    },
  ],
  name: "Banner utama siswa",
  version: BANNER_DESIGN_VERSION,
};

const cloneDefaultDesign = (): BannerDesign => ({
  background: { ...DEFAULT_DESIGN.background },
  frame: { ...DEFAULT_DESIGN.frame },
  layers: DEFAULT_DESIGN.layers.map((layer) => ({ ...layer })),
  name: DEFAULT_DESIGN.name,
  version: DEFAULT_DESIGN.version,
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const isHexColor = (value: unknown): value is string => (
  typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
);

const isAssetId = (value: unknown): value is string => (
  typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
);

const isLayerId = (value: unknown): value is string => (
  typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value)
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function readString(
  value: unknown,
  field: string,
  {
    maxLength,
    required = true,
  }: {
    maxLength: number;
    required?: boolean;
  },
) {
  if (typeof value !== "string") {
    throw new BannerMakerValidationError(`${field} tidak valid.`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throw new BannerMakerValidationError(`${field} tidak boleh kosong.`);
  }
  if (normalized.length > maxLength) {
    throw new BannerMakerValidationError(`${field} terlalu panjang.`);
  }

  return normalized;
}

function readNumber(
  value: unknown,
  field: string,
  {
    fallback,
    max,
    min,
  }: {
    fallback?: number;
    max: number;
    min: number;
  },
) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BannerMakerValidationError(`${field} tidak valid.`);
  }

  return clamp(value, min, max);
}

function readHexColor(value: unknown, field: string, fallback?: string) {
  if (value === undefined && fallback) return fallback;
  if (!isHexColor(value)) {
    throw new BannerMakerValidationError(`${field} harus berupa kode warna HEX.`);
  }

  return value.toUpperCase();
}

function parseFrame(value: unknown): BannerFrame {
  const frame = isRecord(value) ? value : {};
  const width = readNumber(frame.width, "Lebar banner", {
    fallback: DEFAULT_DESIGN.frame.width,
    max: BANNER_MAX_WIDTH,
    min: BANNER_MIN_WIDTH,
  });
  const height = readNumber(frame.height, "Tinggi banner", {
    fallback: DEFAULT_DESIGN.frame.height,
    max: BANNER_MAX_HEIGHT,
    min: BANNER_MIN_HEIGHT,
  });

  return {
    height,
    padding: readNumber(frame.padding, "Padding banner", {
      fallback: DEFAULT_DESIGN.frame.padding,
      max: Math.min(BANNER_MAX_PADDING, Math.floor(Math.min(width, height) / 2)),
      min: 0,
    }),
    radius: readNumber(frame.radius, "Radius banner", {
      fallback: DEFAULT_DESIGN.frame.radius,
      max: Math.min(BANNER_MAX_RADIUS, Math.floor(Math.min(width, height) / 2)),
      min: 0,
    }),
    snapToPadding: frame.snapToPadding === undefined
      ? DEFAULT_DESIGN.frame.snapToPadding
      : frame.snapToPadding === true,
    width,
  };
}

function parseBackground(value: unknown): BannerBackground {
  if (!isRecord(value)) {
    throw new BannerMakerValidationError("Latar banner tidak valid.");
  }

  if (value.type === "color") {
    return {
      color: readHexColor(value.color, "Warna latar"),
      type: "color",
    };
  }

  if (value.type === "gradient") {
    return {
      angle: readNumber(value.angle, "Arah gradasi", { max: 360, min: 0 }),
      from: readHexColor(value.from, "Warna awal gradasi"),
      to: readHexColor(value.to, "Warna akhir gradasi"),
      type: "gradient",
    };
  }

  if (value.type === "image" && isAssetId(value.assetId)) {
    return { assetId: value.assetId, type: "image" };
  }

  throw new BannerMakerValidationError("Latar gambar harus memilih aset gambar admin.");
}

function parseLayer(value: unknown, index: number): BannerLayer {
  if (!isRecord(value)) {
    throw new BannerMakerValidationError(`Layer ${index + 1} tidak valid.`);
  }

  if (!isLayerId(value.id)) {
    throw new BannerMakerValidationError(`ID layer ${index + 1} tidak valid.`);
  }

  const height = readNumber(value.height, `Tinggi layer ${index + 1}`, { max: 100, min: 1 });
  const width = readNumber(value.width, `Lebar layer ${index + 1}`, { max: 100, min: 1 });
  const base: BannerLayerBase = {
    height,
    id: value.id,
    opacity: readNumber(value.opacity, `Opasitas layer ${index + 1}`, { max: 1, min: 0 }),
    rotation: readNumber(value.rotation, `Rotasi layer ${index + 1}`, { max: 180, min: -180 }),
    width,
    x: readNumber(value.x, `Posisi horizontal layer ${index + 1}`, { max: Math.max(0, 100 - width), min: 0 }),
    y: readNumber(value.y, `Posisi vertikal layer ${index + 1}`, { max: Math.max(0, 100 - height), min: 0 }),
  };

  if (value.type === "image") {
    if (!isAssetId(value.assetId)) {
      throw new BannerMakerValidationError(`Layer gambar ${index + 1} belum memilih aset.`);
    }

    return {
      ...base,
      alt: readString(value.alt ?? "", `Deskripsi gambar ${index + 1}`, { maxLength: BANNER_MAX_ALT_LENGTH, required: false }),
      assetId: value.assetId,
      type: "image",
    };
  }

  if (value.type === "text") {
    const align = value.align === "center" || value.align === "right" ? value.align : "left";
    const weight = value.weight === "medium" || value.weight === "bold" ? value.weight : "regular";

    return {
      ...base,
      align,
      color: readHexColor(value.color, `Warna teks ${index + 1}`),
      fontSize: readNumber(value.fontSize, `Ukuran teks ${index + 1}`, { max: 240, min: 12 }),
      text: readString(value.text, `Teks layer ${index + 1}`, { maxLength: BANNER_MAX_TEXT_LENGTH }),
      type: "text",
      weight,
    };
  }

  throw new BannerMakerValidationError(`Jenis layer ${index + 1} tidak didukung.`);
}

function parseBannerDesign(value: unknown): BannerDesign {
  if (!isRecord(value)) {
    throw new BannerMakerValidationError("Desain banner tidak valid.");
  }

  if (value.version !== BANNER_DESIGN_VERSION) {
    throw new BannerMakerValidationError("Versi desain banner tidak didukung.");
  }

  if (!Array.isArray(value.layers) || value.layers.length > BANNER_MAX_LAYERS) {
    throw new BannerMakerValidationError(`Banner dapat memuat maksimal ${BANNER_MAX_LAYERS} layer.`);
  }

  const layers = value.layers.map(parseLayer);
  if (new Set(layers.map((layer) => layer.id)).size !== layers.length) {
    throw new BannerMakerValidationError("Setiap layer banner harus memiliki ID yang unik.");
  }
  const name = readString(value.name ?? DEFAULT_DESIGN.name, "Nama banner", { maxLength: 120 });

  return {
    background: parseBackground(value.background),
    frame: parseFrame(value.frame),
    layers,
    name,
    version: BANNER_DESIGN_VERSION,
  };
}

function normalizeBannerDesign(value: unknown): BannerDesign {
  try {
    return parseBannerDesign(value);
  } catch {
    return cloneDefaultDesign();
  }
}

function collectBannerAssetIds(design: BannerDesign) {
  const ids = new Set<string>();
  if (design.background.type === "image") ids.add(design.background.assetId);
  for (const layer of design.layers) {
    if (layer.type === "image") ids.add(layer.assetId);
  }
  return [...ids];
}

function bannerDesignsEqual(left: BannerDesign, right: BannerDesign) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createDefaultBannerDesign() {
  return cloneDefaultDesign();
}

/**
 * One bounded, documented text-starter frame is shared by every destination.
 * It deliberately reuses the existing default geometry while replacing only
 * the two authored text layers; legacy text is never truncated here.
 */
function createTextBannerStarterDesign({
  description,
  destination,
  title,
}: {
  description: string;
  destination: BannerDestination;
  title: string;
}): BannerDesign {
  const defaultDesign = cloneDefaultDesign();
  const [headline, supportingCopy] = defaultDesign.layers;

  if (!headline || headline.type !== "text" || !supportingCopy || supportingCopy.type !== "text") {
    throw new BannerMakerValidationError("Template starter banner tidak valid.");
  }

  return {
    ...defaultDesign,
    layers: [
      { ...headline, id: `${destination}-title`, text: title },
      { ...supportingCopy, id: `${destination}-description`, text: description },
    ],
    name: `Banner ${destination}`,
  };
}

export {
  BANNER_DESIGN_HEIGHT,
  BANNER_DESIGN_VERSION,
  BANNER_DESIGN_WIDTH,
  BANNER_MAX_HEIGHT,
  BANNER_MAX_PADDING,
  BANNER_MAX_RADIUS,
  BANNER_MAX_WIDTH,
  BANNER_MAKER_CONFIG_KEY,
  BANNER_MAX_ALT_LENGTH,
  BANNER_MAX_LAYERS,
  BANNER_MAX_TEXT_LENGTH,
  BANNER_MIN_HEIGHT,
  BANNER_MIN_WIDTH,
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerRecoveryUnavailableError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
  bannerDesignsEqual,
  collectBannerAssetIds,
  createDefaultBannerDesign,
  createTextBannerStarterDesign,
  normalizeBannerDesign,
  parseBannerDesign,
};
export type {
  BannerAssetView,
  BannerBackground,
  BannerBootstrap,
  BannerDesign,
  BannerFrame,
  BannerImageLayer,
  BannerLayer,
  BannerMakerDestinationMutationResult,
  BannerMakerDestinationFormState,
  BannerMakerDestinationSnapshot,
  BannerMakerFormState,
  BannerMakerSnapshot,
  BannerPublicationState,
  BannerSourceColumn,
  BannerSourceDescriptor,
  BannerSourceKind,
  BannerRecoveryOption,
  BannerStarterIssue,
  BannerTextLayer,
};
