"use server";

import { revalidatePath } from "next/cache";

import {
  BannerMakerConflictError,
  BannerMakerDraftMismatchError,
  BannerMakerValidationError,
  parseBannerDesign,
  type BannerMakerFormState,
} from "@/lib/admin/banner-maker";
import {
  publishBannerMakerDesign,
  saveBannerMakerDraft,
} from "@/lib/admin/banner-maker-repository";
import { requireAdminSession } from "@/lib/auth/access";

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

export { updateBannerMakerAction };
