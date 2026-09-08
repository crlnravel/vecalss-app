"use server";

import { revalidatePath } from "next/cache";

import {
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerValidationError,
  parseBannerDesign,
  type BannerMakerFormState,
  type BannerMakerDestinationFormState,
  type BannerSourceDescriptor,
} from "@/lib/admin/banner-maker";
import {
  publishBannerMakerDestinationDesign,
  publishBannerMakerDesign,
  saveBannerMakerDestinationDraft,
  saveBannerMakerDraft,
} from "@/lib/admin/banner-maker-repository";
import { requireAdminSession } from "@/lib/auth/access";
import { isBannerDestination, parseBannerDestination, type BannerDestination } from "@/lib/banner/destinations";

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

const BANNER_V2_MUTATIONS_ENABLED = false;
const BANNER_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

class BannerMakerV2MutationDisabledError extends Error {
  constructor() {
    super("Penyimpanan banner tujuan belum diaktifkan untuk editor live.");
    this.name = "BannerMakerV2MutationDisabledError";
  }
}

function readDestinationActionContext(formData: FormData) {
  const rawDestination = readText(formData, "destination");
  if (!isBannerDestination(rawDestination)) {
    throw new BannerMakerValidationError("Tujuan banner tidak dikenali.");
  }
  const requestId = readText(formData, "requestId");
  if (!BANNER_REQUEST_ID_PATTERN.test(requestId)) {
    throw new BannerMakerValidationError("Identitas permintaan banner tidak valid.");
  }

  return { destination: parseBannerDestination(rawDestination), requestId };
}

function readSubmittedSource(formData: FormData): BannerSourceDescriptor | null {
  const rawSource = readText(formData, "source");
  if (!rawSource) return null;

  try {
    return JSON.parse(rawSource) as BannerSourceDescriptor;
  } catch {
    throw new BannerMakerValidationError("Sumber pemulihan banner tidak dapat dibaca.");
  }
}

async function updateBannerMakerDestinationAction(
  previousState: BannerMakerDestinationFormState,
  formData: FormData,
): Promise<BannerMakerDestinationFormState> {
  const session = await requireAdminSession();
  let context: { destination: BannerDestination; requestId: string };

  try {
    context = readDestinationActionContext(formData);
    const design = readSubmittedDesign(formData);
    const expectedRevision = readText(formData, "revision") || null;
    const source = readSubmittedSource(formData);
    if (!BANNER_V2_MUTATIONS_ENABLED) throw new BannerMakerV2MutationDisabledError();

    const intent = readText(formData, "intent") === "publish" ? "publish" : "save-draft";
    const result = intent === "publish"
      ? await publishBannerMakerDestinationDesign({
          actorUserId: session.user.id,
          design,
          destination: context.destination,
          expectedRevision,
        })
      : await saveBannerMakerDestinationDraft({
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
      message: error instanceof Error ? error.message : "Banner tujuan belum tersimpan.",
      requestId,
      status: "error",
    };
  }
}

function revalidateBannerMakerPaths() {
  revalidatePath("/admin/student-banners");
  revalidatePath("/dashboard");
  revalidatePath("/courses");
  revalidatePath("/quiz");
  revalidatePath("/tryout");
}

async function updateBannerMakerAction(
  previousState: BannerMakerFormState,
  formData: FormData,
): Promise<BannerMakerFormState> {
  const session = await requireAdminSession();
  const expectedVersion = readText(formData, "version") || null;
  const intent = readText(formData, "intent") === "publish" ? "publish" : "save-draft";

  try {
    const design = readSubmittedDesign(formData);

    if (intent === "publish") {
      const result = await publishBannerMakerDesign({
        actorUserId: session.user.id,
        design,
        expectedVersion,
      });

      revalidateBannerMakerPaths();

      return {
        design: result.design,
        hasUnpublishedChanges: false,
        message: "Banner dirilis dan siap ditampilkan.",
        published: true,
        status: "success",
        version: result.updatedAt,
      };
    }

    const result = await saveBannerMakerDraft({
      actorUserId: session.user.id,
      design,
      expectedVersion,
    });

    revalidatePath("/admin/student-banners");

    return {
      design: result.design,
      hasUnpublishedChanges: result.hasUnpublishedChanges,
      message: result.hasUnpublishedChanges
        ? "Draf tersimpan. Banner aktif belum berubah."
        : "Draf tersimpan.",
      published: false,
      status: "success",
      version: result.draftVersion,
    };
  } catch (error) {
    if (error instanceof BannerMakerDraftMismatchError) {
      return {
        ...previousState,
        message: "Simpan draf terlebih dahulu sebelum merilis banner.",
        status: "error",
      };
    }

    if (error instanceof BannerMakerConflictError) {
      return {
        ...previousState,
        message: "Desain berubah di tab lain. Muat ulang halaman lalu coba lagi.",
        status: "error",
      };
    }

    if (error instanceof BannerMakerValidationError) {
      return {
        ...previousState,
        message: error.message,
        status: "error",
      };
    }

    return {
      ...previousState,
      message: "Banner belum tersimpan. Coba lagi.",
      status: "error",
    };
  }
}

export {
  updateBannerMakerAction,
  updateBannerMakerDestinationAction,
};
