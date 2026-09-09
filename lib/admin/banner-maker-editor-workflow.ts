import {
  BANNER_MAX_TEXT_LENGTH,
  createTextBannerStarterDesign,
  type BannerBootstrap,
  type BannerDesign,
  type BannerMakerDestinationFormState,
  type BannerStarterIssue,
} from "@/lib/admin/banner-maker";
import type { BannerDestination } from "@/lib/banner/destinations";

type BannerMakerMountIdentity = {
  destination: BannerDestination;
  requestId: string;
};

type BannerStarterValidation = {
  descriptionMissing: boolean;
  issues: BannerStarterIssue[];
  titleMissing: boolean;
  valid: boolean;
};

function createBannerMakerRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "00000000-0000-4000-8000-000000000000";
}

function getBannerDestinationLabel(destination: BannerDestination) {
  return destination.charAt(0).toUpperCase() + destination.slice(1);
}

function isBannerActionResultForMount(
  result: BannerMakerDestinationFormState,
  mount: BannerMakerMountIdentity,
) {
  return result.destination === mount.destination && result.requestId === mount.requestId;
}

function validateBannerStarterText(title: string, description: string): BannerStarterValidation {
  const issues: BannerStarterIssue[] = [];
  for (const [field, value] of [["title", title], ["description", description]] as const) {
    if (value.length <= BANNER_MAX_TEXT_LENGTH) continue;
    issues.push({
      actualLength: value.length,
      code: "too-long",
      field,
      limit: BANNER_MAX_TEXT_LENGTH,
      message: `${field === "title" ? "Judul" : "Deskripsi"} melebihi batas ${BANNER_MAX_TEXT_LENGTH} karakter; edit sebelum menyimpan.`,
    });
  }

  const titleMissing = title.trim().length === 0;
  const descriptionMissing = description.trim().length === 0;

  return {
    descriptionMissing,
    issues,
    titleMissing,
    valid: !titleMissing && !descriptionMissing && issues.length === 0,
  };
}

function createStarterDesignIfValid({
  description,
  destination,
  title,
}: {
  description: string;
  destination: BannerDestination;
  title: string;
}) {
  return validateBannerStarterText(title, description).valid
    ? createTextBannerStarterDesign({ description, destination, title })
    : null;
}

function getBootstrapDesign(bootstrap: BannerBootstrap): BannerDesign | null {
  return bootstrap.kind === "valid-design" ? bootstrap.design : null;
}

function canSaveBannerMakerDestination({
  design,
  isPending,
  starterInvalid,
}: {
  design: BannerDesign | null;
  isPending: boolean;
  starterInvalid: boolean;
}) {
  return Boolean(design) && !starterInvalid && !isPending;
}

function canPublishBannerMakerDestination({
  design,
  hasSavedDraft,
  isDirty,
  isPending,
  starterInvalid,
}: {
  design: BannerDesign | null;
  hasSavedDraft: boolean;
  isDirty: boolean;
  isPending: boolean;
  starterInvalid: boolean;
}) {
  return Boolean(design) && hasSavedDraft && !isDirty && !starterInvalid && !isPending;
}

function actionResultIsAuthoritative(
  result: BannerMakerDestinationFormState,
  mount: BannerMakerMountIdentity,
  submittedEditRevision: number,
  currentEditRevision: number,
) {
  return result.status === "success"
    && isBannerActionResultForMount(result, mount)
    && submittedEditRevision === currentEditRevision
    && Boolean(result.design);
}

export {
  actionResultIsAuthoritative,
  canPublishBannerMakerDestination,
  canSaveBannerMakerDestination,
  createBannerMakerRequestId,
  createStarterDesignIfValid,
  getBannerDestinationLabel,
  getBootstrapDesign,
  isBannerActionResultForMount,
  validateBannerStarterText,
};
export type { BannerMakerMountIdentity, BannerStarterValidation };
