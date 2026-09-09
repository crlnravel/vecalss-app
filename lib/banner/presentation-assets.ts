import type { StudentBannerKey } from "@/lib/student/banner-content";

import {
  BANNER_LAYER_SLOT_PREFIX,
  getBannerImageSlots,
  type BannerPresentationAssetMap,
  type BannerPresentationDesign,
} from "./renderer";

type BannerPresentationAssetSource = "admin-published" | "draft" | "published";

function bannerLayerSlot(layerId: string) {
  return `${BANNER_LAYER_SLOT_PREFIX}${layerId}`;
}

function bannerImageEndpoint({
  destination,
  revision,
  slot,
  source,
}: {
  destination: StudentBannerKey;
  revision: string;
  slot: string;
  source: BannerPresentationAssetSource;
}) {
  const encodedDestination = encodeURIComponent(destination);
  const encodedRevision = encodeURIComponent(revision);
  const encodedSlot = encodeURIComponent(slot);
  if (source === "draft") {
    return `/api/admin/student-banners/${encodedDestination}/draft/${encodedRevision}/${encodedSlot}`;
  }
  if (source === "admin-published") {
    return `/api/admin/student-banners/${encodedDestination}/published/${encodedRevision}/${encodedSlot}`;
  }
  return `/api/student-banners/${encodedDestination}/${encodedRevision}/${encodedSlot}`;
}

/**
 * Convert a validated published/draft design into the only image URLs a
 * renderer may receive. The slot is always derived from the design; callers
 * cannot supply an arbitrary asset id or Admin media endpoint.
 */
function buildBannerPresentationAssetMap({
  design,
  destination,
  revision,
  source = "published",
}: {
  design: BannerPresentationDesign;
  destination: StudentBannerKey;
  revision: string;
  source?: BannerPresentationAssetSource;
}): BannerPresentationAssetMap {
  const assets: Record<string, { alt: string; src: string }> = {};
  for (const image of getBannerImageSlots(design)) {
    if (assets[image.assetId]) continue;
    assets[image.assetId] = {
      alt: image.alt,
      src: bannerImageEndpoint({ destination, revision, slot: image.slot, source }),
    };
  }
  return assets;
}

export { BANNER_LAYER_SLOT_PREFIX, bannerImageEndpoint, bannerLayerSlot, buildBannerPresentationAssetMap };
export type { BannerPresentationAssetSource };
