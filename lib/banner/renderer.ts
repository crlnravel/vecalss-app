import {
  resolveStudentBannerText,
  STUDENT_BANNER_DEFAULTS,
  type StudentBannerKey,
  type StudentBannerVariables,
} from "@/lib/student/banner-content";

/**
 * The presentation boundary deliberately repeats only the serializable shape
 * that the renderer needs. Keeping it here means student bundles do not import
 * the Admin editor or Admin media DTOs merely to paint a published design.
 */
type BannerPresentationBackground =
  | {
      color: string;
      type: "color";
    }
  | {
      angle: number;
      from: string;
      to: string;
      type: "gradient";
    }
  | {
      assetId: string;
      type: "image";
    };

type BannerPresentationFrame = {
  height: number;
  padding: number;
  radius: number;
  snapToPadding?: boolean;
  width: number;
};

type BannerPresentationTextLayer = {
  align: "left" | "center" | "right";
  color: string;
  fontSize: number;
  height: number;
  id: string;
  opacity: number;
  rotation: number;
  text: string;
  type: "text";
  weight: "regular" | "medium" | "bold";
  width: number;
  x: number;
  y: number;
};

type BannerPresentationImageLayer = {
  alt: string;
  assetId: string;
  height: number;
  id: string;
  opacity: number;
  rotation: number;
  type: "image";
  width: number;
  x: number;
  y: number;
};

type BannerPresentationLayer = BannerPresentationTextLayer | BannerPresentationImageLayer;

type BannerPresentationDesign = {
  background: BannerPresentationBackground;
  frame: BannerPresentationFrame;
  layers: BannerPresentationLayer[];
  name: string;
  version: number;
};

type BannerPresentationAsset = {
  alt?: string | null;
  src: string;
};

type BannerPresentationAssetMap = Readonly<Record<string, BannerPresentationAsset>>;

type BannerPresentationFallback = {
  description: string;
  title: string;
};

type BannerPresentationGeometry = {
  height: number;
  padding: number;
  radius: number;
  scale: number;
  textInset: number;
  width: number;
};

type BannerPresentationLayerLayout = {
  height: string;
  left: string;
  opacity: number;
  top: string;
  transform: string;
  transformOrigin: "center";
  width: string;
};

type BannerPresentationTextPaint = {
  boxSizing: "border-box";
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 500 | 700;
  lineHeight: number;
  overflow: "hidden";
  padding: number;
  textAlign: "left" | "center" | "right";
  whiteSpace: "pre-wrap";
  wordBreak: "break-word";
};

type BannerPresentationImagePaint = {
  objectFit: "contain" | "cover";
  objectPosition: "center";
};

type BannerImageSlot = {
  alt: string;
  assetId: string;
  slot: "background" | string;
};

const BANNER_TEXT_INSET_DESIGN_PIXELS = 8;
const BANNER_LAYER_SLOT_PREFIX = "layer:";
const BANNER_TEXT_FONT_FAMILY = "var(--font-heading), Plus Jakarta Sans, sans-serif";
const BANNER_TEXT_LINE_HEIGHT = 1.05;

function calculateBannerGeometry(
  frame: BannerPresentationFrame,
  viewportWidth: number,
): BannerPresentationGeometry {
  const width = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : frame.width;
  const scale = width / frame.width;

  return {
    height: frame.height * scale,
    padding: frame.padding * scale,
    radius: frame.radius * scale,
    scale,
    textInset: BANNER_TEXT_INSET_DESIGN_PIXELS * scale,
    width,
  };
}

/**
 * The serializable layout contract is shared by the student renderer and the
 * future Admin overlay. Percent placement stays in design space while the
 * geometry scale is applied to frame and text-paint measurements.
 */
function getBannerLayerLayout(
  layer: BannerPresentationLayer,
): BannerPresentationLayerLayout {
  return {
    height: `${layer.height}%`,
    left: `${layer.x}%`,
    opacity: layer.opacity,
    top: `${layer.y}%`,
    transform: `rotate(${layer.rotation}deg)`,
    transformOrigin: "center",
    width: `${layer.width}%`,
  };
}

function getBannerTextPaint(
  layer: BannerPresentationTextLayer,
  geometry: BannerPresentationGeometry,
): BannerPresentationTextPaint {
  return {
    boxSizing: "border-box",
    color: layer.color,
    fontFamily: BANNER_TEXT_FONT_FAMILY,
    fontSize: layer.fontSize * geometry.scale,
    fontWeight: layer.weight === "bold" ? 700 : layer.weight === "medium" ? 500 : 400,
    lineHeight: BANNER_TEXT_LINE_HEIGHT,
    overflow: "hidden",
    padding: geometry.textInset,
    textAlign: layer.align,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
}

function getBannerImagePaint(kind: "background" | "layer"): BannerPresentationImagePaint {
  return {
    objectFit: kind === "background" ? "cover" : "contain",
    objectPosition: "center",
  };
}

function getBannerPresentationGenerationFingerprint({
  assets,
  design,
  destination,
  revision,
}: {
  assets: BannerPresentationAssetMap;
  design: BannerPresentationDesign;
  destination: StudentBannerKey;
  revision?: string | null;
}) {
  const assetEntries = Object.entries(assets)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([assetId, asset]) => [assetId, asset.alt ?? null, asset.src]);
  return JSON.stringify({
    assets: assetEntries,
    design,
    destination,
    revision: revision ?? null,
  });
}

function getBannerImageSlots(design: BannerPresentationDesign): BannerImageSlot[] {
  const slots: BannerImageSlot[] = [];
  if (design.background.type === "image") {
    slots.push({ alt: "", assetId: design.background.assetId, slot: "background" });
  }

  for (const layer of design.layers) {
    if (layer.type === "image") {
      slots.push({ alt: layer.alt, assetId: layer.assetId, slot: `${BANNER_LAYER_SLOT_PREFIX}${layer.id}` });
    }
  }

  return slots;
}

function hasAllBannerImages(
  design: BannerPresentationDesign,
  assetMap: BannerPresentationAssetMap,
) {
  return getBannerImageSlots(design).every(({ assetId }) => {
    const asset = assetMap[assetId];
    return Boolean(asset?.src);
  });
}

function resolveBannerPresentationText(
  value: string,
  variables: StudentBannerVariables = {},
) {
  return resolveStudentBannerText(value, variables);
}

function getBannerAccessibleText(
  design: BannerPresentationDesign,
  variables: StudentBannerVariables = {},
) {
  const parts = design.layers.flatMap((layer) => {
    if (layer.type === "text") return [resolveBannerPresentationText(layer.text, variables)];
    return layer.alt.trim() ? [resolveBannerPresentationText(layer.alt, variables)] : [];
  });

  return parts.filter(Boolean).join(" ").trim();
}

function getBannerPresentationFallback(
  destination: StudentBannerKey,
  variables: StudentBannerVariables = {},
): BannerPresentationFallback {
  const fallback = STUDENT_BANNER_DEFAULTS[destination];
  return {
    description: resolveBannerPresentationText(fallback.description, variables),
    title: resolveBannerPresentationText(fallback.title, variables),
  };
}

function shouldUseBannerFallback({
  design,
  failedImage,
  assetMap,
}: {
  assetMap: BannerPresentationAssetMap;
  design: BannerPresentationDesign;
  failedImage: boolean;
}) {
  return failedImage || !hasAllBannerImages(design, assetMap);
}

export {
  BANNER_TEXT_INSET_DESIGN_PIXELS,
  BANNER_LAYER_SLOT_PREFIX,
  calculateBannerGeometry,
  getBannerImagePaint,
  getBannerAccessibleText,
  getBannerImageSlots,
  getBannerLayerLayout,
  getBannerPresentationGenerationFingerprint,
  getBannerPresentationFallback,
  getBannerTextPaint,
  hasAllBannerImages,
  resolveBannerPresentationText,
  shouldUseBannerFallback,
};
export type {
  BannerImageSlot,
  BannerPresentationAsset,
  BannerPresentationAssetMap,
  BannerPresentationBackground,
  BannerPresentationDesign,
  BannerPresentationFallback,
  BannerPresentationFrame,
  BannerPresentationGeometry,
  BannerPresentationImagePaint,
  BannerPresentationImageLayer,
  BannerPresentationLayerLayout,
  BannerPresentationLayer,
  BannerPresentationTextPaint,
  BannerPresentationTextLayer,
};
