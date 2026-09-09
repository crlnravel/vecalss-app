import {
  resolveStudentBannerText,
  type StudentBannerContent,
  type StudentBannerKey,
  type StudentBannerVariables,
} from "./banner-content";
import type {
  BannerPresentationAssetMap,
  BannerPresentationDesign,
} from "@/lib/banner/renderer";

type StudentBannerPresentationSource = "draft-v2" | "legacy-fallback" | "published-v2";

/**
 * Serializable banner data passed to a student or Admin-preview surface.
 * `design: null` is an intentional legacy fallback, never an unpublished
 * v2 draft. Student loaders only produce the published mode.
 */
type StudentBannerPresentation = {
  assets: BannerPresentationAssetMap;
  design: BannerPresentationDesign | null;
  destination: StudentBannerKey;
  fallback: StudentBannerContent;
  kind: "presentation";
  mode: "draft" | "published";
  revision: string | null;
  source: StudentBannerPresentationSource;
};

type StudentBannerDraftUnavailable = {
  destination: StudentBannerKey;
  kind: "draft-missing";
  message: string;
  mode: "draft";
  requestedRevision: string | null;
};

type AdminStudentBannerRead = StudentBannerDraftUnavailable | StudentBannerPresentation;

function isStudentBannerDraftUnavailable(
  value: AdminStudentBannerRead,
): value is StudentBannerDraftUnavailable {
  return value.kind === "draft-missing";
}

function getStudentBannerHeading(
  banner: StudentBannerPresentation,
  variables: StudentBannerVariables = {},
) {
  const authoredTitle = banner.design?.layers.find((layer) => layer.type === "text")?.text;
  return resolveStudentBannerText(authoredTitle ?? banner.fallback.title, variables);
}

function getStudentBannerDescription(
  banner: StudentBannerPresentation,
  variables: StudentBannerVariables = {},
) {
  const textLayers = banner.design?.layers.filter(
    (layer): layer is Extract<typeof layer, { type: "text" }> => layer.type === "text",
  ) ?? [];
  const authoredDescription = textLayers[1]?.text;
  return resolveStudentBannerText(authoredDescription ?? banner.fallback.description, variables);
}

export {
  getStudentBannerDescription,
  getStudentBannerHeading,
  isStudentBannerDraftUnavailable,
};
export type {
  AdminStudentBannerRead,
  StudentBannerDraftUnavailable,
  StudentBannerPresentation,
  StudentBannerPresentationSource,
};
