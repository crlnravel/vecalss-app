import "server-only";

import { unstable_noStore } from "next/cache";

import {
  getBannerActivationState,
  isBannerV2ReaderEnabled,
} from "@/lib/banner/activation";
import { buildBannerPresentationAssetMap } from "@/lib/banner/presentation-assets";
import {
  getBannerMakerDestinationDraft,
  getPublishedBannerMakerDestinationDesign,
} from "@/lib/admin/banner-maker-repository";
import {
  getPublishedStudentBannerContents,
} from "@/lib/student/banner-repository";
import type {
  StudentBannerKey,
  StudentBannerSet,
} from "@/lib/student/banner-content";
import type {
  AdminStudentBannerRead,
  StudentBannerDraftUnavailable,
  StudentBannerPresentation,
} from "@/lib/student/banner-presentation";
import { parseBannerDestination, type BannerDestination } from "@/lib/banner/destinations";

type AdminStudentBannerRequest =
  | { mode: "draft"; revision: string | null }
  | { mode: "published" };

type BannerReaderTestOverrides = {
  readDraft?: (
    destination: BannerDestination,
    revision: string,
  ) => Promise<{ design: StudentBannerPresentation["design"]; revision: string } | null>;
  readLegacy?: () => Promise<StudentBannerSet>;
  readPublished?: (
    destination: BannerDestination,
  ) => Promise<{ design: StudentBannerPresentation["design"]; revision: string | null }>;
};

let bannerReaderTestOverrides: BannerReaderTestOverrides | null = null;

function legacyFallback(
  destination: StudentBannerKey,
  fallback: StudentBannerSet[StudentBannerKey],
  mode: "draft" | "published" = "published",
): StudentBannerPresentation {
  return {
    assets: {},
    design: null,
    destination,
    fallback,
    kind: "presentation",
    mode,
    revision: null,
    source: "legacy-fallback",
  };
}

async function readLegacyBanners() {
  return bannerReaderTestOverrides?.readLegacy?.() ?? getPublishedStudentBannerContents();
}

async function readPublishedDesign(destination: BannerDestination) {
  return bannerReaderTestOverrides?.readPublished?.(destination)
    ?? getPublishedBannerMakerDestinationDesign(destination);
}

async function readDraftDesign(destination: BannerDestination, revision: string) {
  return bannerReaderTestOverrides?.readDraft?.(destination, revision)
    ?? getBannerMakerDestinationDraft(destination, revision);
}

function publishedPresentation({
  destination,
  fallback,
  published,
  source,
}: {
  destination: BannerDestination;
  fallback: StudentBannerSet[StudentBannerKey];
  published: { design: StudentBannerPresentation["design"]; revision: string | null };
  source: "admin-published" | "published";
}) {
  if (!published.design || !published.revision) {
    return legacyFallback(destination, fallback);
  }

  return {
    assets: buildBannerPresentationAssetMap({
      design: published.design,
      destination,
      revision: published.revision,
      source,
    }),
    design: published.design,
    destination,
    fallback,
    kind: "presentation" as const,
    mode: "published" as const,
    revision: published.revision,
    source: "published-v2" as const,
  } satisfies StudentBannerPresentation;
}

async function getPublishedStudentBannerPresentation(destinationValue: StudentBannerKey) {
  unstable_noStore();
  const destination = parseBannerDestination(destinationValue);
  const banners = await readLegacyBanners();
  if (!isBannerV2ReaderEnabled()) return legacyFallback(destination, banners[destination]);

  return publishedPresentation({
    destination,
    fallback: banners[destination],
    published: await readPublishedDesign(destination),
    source: "published",
  });
}

function missingDraft(
  destination: BannerDestination,
  requestedRevision: string | null,
  message: string,
): StudentBannerDraftUnavailable {
  return {
    destination,
    kind: "draft-missing",
    message,
    mode: "draft",
    requestedRevision,
  };
}

async function getAdminStudentPreviewBannerPresentation(
  destinationValue: StudentBannerKey,
  request: AdminStudentBannerRequest = { mode: "published" },
): Promise<AdminStudentBannerRead> {
  unstable_noStore();
  const destination = parseBannerDestination(destinationValue);
  const banners = await readLegacyBanners();

  if (request.mode === "draft") {
    if (!request.revision) {
      return missingDraft(destination, null, "Draf banner tersimpan membutuhkan revisi yang eksplisit.");
    }
    if (!isBannerV2ReaderEnabled()) {
      const activation = getBannerActivationState();
      return missingDraft(
        destination,
        request.revision,
        `Preview draf tidak tersedia selama mode aman aktif${activation.reason ? `: ${activation.reason}.` : "."}`,
      );
    }

    const draft = await readDraftDesign(destination, request.revision);
    if (!draft?.design || draft.revision !== request.revision) {
      return missingDraft(destination, request.revision, "Draf banner tersimpan tidak ditemukan atau sudah tidak berlaku.");
    }

    return {
      assets: buildBannerPresentationAssetMap({
        design: draft.design,
        destination,
        revision: draft.revision,
        source: "draft",
      }),
      design: draft.design,
      destination,
      fallback: banners[destination],
      kind: "presentation",
      mode: "draft",
      revision: draft.revision,
      source: "draft-v2",
    } satisfies StudentBannerPresentation;
  }

  if (!isBannerV2ReaderEnabled()) return legacyFallback(destination, banners[destination]);
  return publishedPresentation({
    destination,
    fallback: banners[destination],
    published: await readPublishedDesign(destination),
    source: "admin-published",
  });
}

async function withBannerReaderTestOverrides<T>(
  overrides: BannerReaderTestOverrides,
  callback: () => Promise<T>,
) {
  const previous = bannerReaderTestOverrides;
  bannerReaderTestOverrides = overrides;
  try {
    return await callback();
  } finally {
    bannerReaderTestOverrides = previous;
  }
}

export {
  getAdminStudentPreviewBannerPresentation,
  getPublishedStudentBannerPresentation,
  withBannerReaderTestOverrides,
};
export type { AdminStudentBannerRequest, BannerReaderTestOverrides };
