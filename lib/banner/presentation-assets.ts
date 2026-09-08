import type { StudentBannerKey } from "@/lib/student/banner-content";

import {
  getBannerImageSlots,
  type BannerPresentationAssetMap,
  type BannerPresentationDesign,
} from "./renderer";

type BannerPresentationAssetSource = "draft" | "published";

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
  return source === "draft"
    ? `/api/admin/student-banners/${encodedDestination}/draft/${encodedRevision}/${encodedSlot}`
    : `/api/student-banners/${encodedDestination}/${encodedRevision}/${encodedSlot}`;
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

export { bannerImageEndpoint, buildBannerPresentationAssetMap };
export type { BannerPresentationAssetSource };
