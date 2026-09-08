import {
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerRecoveryUnavailableError,
  BannerMakerSourceConflictError,
  BannerMakerValidationError,
  parseBannerDesign,
  type BannerDesign,
  type BannerMakerDestinationFormState,
  type BannerMakerDestinationMutationResult,
  type BannerSourceDescriptor,
} from "./banner-maker";
import { isUuid } from "../banner/envelope";
import { isBannerDestination, parseBannerDestination, type BannerDestination } from "../banner/destinations";

type BannerMakerDestinationSession = {
  user: {
    id: string;
  };
};

type SaveDestinationDraft = (input: {
  actorUserId: string;
  design: BannerDesign;
  destination: BannerDestination;
  expectedRevision: string | null;
  source: BannerSourceDescriptor | null;
}) => Promise<BannerMakerDestinationMutationResult>;

type PublishDestinationDesign = (input: {
  actorUserId: string;
  design: BannerDesign;
  destination: BannerDestination;
  expectedRevision: string | null;
}) => Promise<BannerMakerDestinationMutationResult>;

type BannerMakerDestinationActionDependencies = {
  mutationsEnabled: boolean;
  publish: PublishDestinationDesign;
  requireAdminSession: () => Promise<BannerMakerDestinationSession>;
  saveDraft: SaveDestinationDraft;
};

class BannerMakerV2MutationDisabledError extends Error {
  constructor() {
    super("Penyimpanan banner tujuan belum diaktifkan untuk editor live.");
    this.name = "BannerMakerV2MutationDisabledError";
  }
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readSubmittedDesign(formData: FormData) {
  const rawDesign = readText(formData, "design");
  if (!rawDesign) {
    throw new BannerMakerValidationError("Desain banner belum siap disimpan.");
  }

  try {
    return parseBannerDesign(JSON.parse(rawDesign));
  } catch (error) {
    if (error instanceof BannerMakerValidationError) throw error;
    throw new BannerMakerValidationError("Desain banner tidak dapat dibaca.");
  }
}

function readDestinationActionContext(formData: FormData) {
  const rawDestination = readText(formData, "destination");
  if (!isBannerDestination(rawDestination)) {
    throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");
  }

  const requestId = readText(formData, "requestId");
  if (!isUuid(requestId)) {
    throw new BannerMakerValidationError("Identitas permintaan banner tidak valid.");
  }

  return { destination: parseBannerDestination(rawDestination), requestId };
}

function readSubmittedSource(formData: FormData): BannerSourceDescriptor | null {
  const rawSource = readText(formData, "source");
  if (!rawSource) return null;

  let value: unknown;
  try {
    value = JSON.parse(rawSource);
  } catch {
    throw new BannerMakerValidationError("Sumber pemulihan banner tidak dapat dibaca.");
  }

  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || typeof (value as Record<string, unknown>).configKey !== "string"
    || ((value as Record<string, unknown>).kind !== "legacy-artwork" && (value as Record<string, unknown>).kind !== "legacy-text")
    || ((value as Record<string, unknown>).sourceColumn !== "configValue" && (value as Record<string, unknown>).sourceColumn !== "draftValue")
    || typeof (value as Record<string, unknown>).digest !== "string"
    || !/^[0-9a-f]{64}$/iu.test((value as Record<string, unknown>).digest as string)
    || !((value as Record<string, unknown>).rowId === null || isUuid((value as Record<string, unknown>).rowId))
  ) {
    throw new BannerMakerValidationError("Sumber pemulihan banner tidak valid.");
  }
  return value as BannerSourceDescriptor;
}

function actionErrorMessage(error: unknown) {
  if (error instanceof BannerMakerV2MutationDisabledError) return error.message;
  if (error instanceof BannerMakerDraftMismatchError) return "Simpan draf terlebih dahulu sebelum menerbitkan.";
  if (error instanceof BannerMakerConflictError) return "Desain berubah di tab lain. Muat ulang halaman lalu coba lagi.";
  if (error instanceof BannerMakerSourceConflictError) return error.message;
  if (error instanceof BannerMakerRecoveryUnavailableError) return error.message;
  if (error instanceof BannerMakerValidationError) return error.message;
  return "Banner tujuan belum tersimpan. Coba lagi.";
}

async function handleBannerMakerDestinationAction(
  previousState: BannerMakerDestinationFormState,
  formData: FormData,
  dependencies: BannerMakerDestinationActionDependencies,
): Promise<BannerMakerDestinationFormState> {
  const session = await dependencies.requireAdminSession();
  let context: { destination: BannerDestination; requestId: string };

  try {
    context = readDestinationActionContext(formData);
    const design = readSubmittedDesign(formData);
    const expectedRevisionText = readText(formData, "revision");
    const expectedRevision = expectedRevisionText ? expectedRevisionText : null;
    if (expectedRevision !== null && !isUuid(expectedRevision)) {
      throw new BannerMakerValidationError("Revisi tujuan banner harus berupa UUID.");
    }
    const source = readSubmittedSource(formData);
    if (!dependencies.mutationsEnabled) throw new BannerMakerV2MutationDisabledError();

    const intent = readText(formData, "intent") === "publish" ? "publish" : "save-draft";
    const result = intent === "publish"
      ? await dependencies.publish({
          actorUserId: session.user.id,
          design,
          destination: context.destination,
          expectedRevision,
        })
      : await dependencies.saveDraft({
          actorUserId: session.user.id,
          design,
          destination: context.destination,
          expectedRevision,
          source,
        });

    return {
      currentRevision: result.currentRevision,
      destination: result.destination,
      design: result.design,
      hasUnpublishedChanges: result.hasUnpublishedChanges,
      message: intent === "publish" ? "Banner tujuan diterbitkan." : "Draf banner tujuan tersimpan.",
      published: intent === "publish",
      requestId: context.requestId,
      status: "success",
    };
  } catch (error) {
    const fallbackDestination = previousState.destination;
    const fallbackRequestId = previousState.requestId;
    const destination = (() => {
      try {
        return readDestinationActionContext(formData).destination;
      } catch {
        return fallbackDestination;
      }
    })();
    const requestId = (() => {
      try {
        return readDestinationActionContext(formData).requestId;
      } catch {
        return fallbackRequestId;
      }
    })();

    return {
      ...previousState,
      destination,
      message: actionErrorMessage(error),
      requestId,
      status: "error",
    };
  }
}

export {
  BannerMakerV2MutationDisabledError,
  handleBannerMakerDestinationAction,
};
export type { BannerMakerDestinationActionDependencies, BannerMakerDestinationSession };
