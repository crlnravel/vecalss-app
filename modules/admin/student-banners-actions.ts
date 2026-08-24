"use server";

import { revalidatePath } from "next/cache";

import {
  requireAdminSession,
  requireAdminStudentPreviewContext,
} from "@/lib/auth/access";
import {
  isAdminStudentPreviewUnavailableError,
} from "@/lib/admin/student-preview";
import {
  STUDENT_BANNER_KEYS,
  type StudentBannerSet,
} from "@/lib/student/banner-content";
import { validateStudentBannerFields } from "@/lib/student/banner-validation";
import {
  StudentBannerConflictError,
  StudentBannerDraftMismatchError,
  publishStudentBannerContents,
  saveStudentBannerDraft,
} from "@/lib/student/banner-repository";
import type { FormState } from "@/modules/auth/form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildFields(formData: FormData) {
  return Object.fromEntries(
    [
      ["version", readTextField(formData, "version")],
      ...STUDENT_BANNER_KEYS.flatMap((key) => [
        [`${key}.title`, readTextField(formData, `${key}.title`)],
        [`${key}.description`, readTextField(formData, `${key}.description`)],
      ]),
    ],
  );
}

function buildBanners(fields: Record<string, string>): StudentBannerSet {
  return Object.fromEntries(
    STUDENT_BANNER_KEYS.map((key) => [key, {
      description: fields[`${key}.description`] ?? "",
      title: fields[`${key}.title`] ?? "",
    }]),
  ) as StudentBannerSet;
}

function readIntent(formData: FormData) {
  return formData.get("intent") === "publish" ? "publish" : "save-draft";
}

function revalidatePreviewBannerPaths() {
  revalidatePath("/admin/student-preview");
  revalidatePath("/admin/student-preview/courses");
  revalidatePath("/admin/student-preview/quiz");
  revalidatePath("/admin/student-preview/tryout");
}

function revalidatePublishedBannerPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/courses");
  revalidatePath("/quiz");
  revalidatePath("/tryout");
}

async function runUpdateStudentBannersAction(
  previousState: FormState,
  formData: FormData,
  actorUserId: string,
): Promise<FormState> {
  const intent = readIntent(formData);
  const fields = buildFields(formData);
  const fieldErrors = validateStudentBannerFields(fields);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      fields,
      hasUnpublishedChanges: previousState.hasUnpublishedChanges,
      message: "Fix the highlighted fields.",
      status: "error",
    };
  }

  try {
    if (intent === "publish") {
      const result = await publishStudentBannerContents({
        actorUserId,
        banners: buildBanners(fields),
        expectedVersion: fields.version || null,
      });

      revalidatePublishedBannerPaths();
      revalidatePreviewBannerPaths();
      revalidatePath("/admin/student-banners");

      return {
        fields: { ...fields, version: result.updatedAt },
        hasUnpublishedChanges: false,
        message: "Published.",
        published: true,
        status: "success",
      };
    }

    const result = await saveStudentBannerDraft({
      actorUserId,
      banners: buildBanners(fields),
      expectedVersion: fields.version || null,
    });

    revalidatePath("/admin/student-banners");
    revalidatePreviewBannerPaths();

    return {
      fields: { ...fields, version: result.draftVersion },
      hasUnpublishedChanges: result.hasUnpublishedChanges,
      message: result.hasUnpublishedChanges
        ? "Draft saved. Students still see the published copy."
        : "Draft saved.",
      published: false,
      status: "success",
    };
  } catch (error) {
    if (error instanceof StudentBannerDraftMismatchError) {
      return {
        fields,
        hasUnpublishedChanges: previousState.hasUnpublishedChanges,
        message: "Save a draft first.",
        status: "error",
      };
    }

    if (error instanceof StudentBannerConflictError) {
      return {
        fields,
        hasUnpublishedChanges: previousState.hasUnpublishedChanges,
        message: "Content changed. Refresh and try again.",
        status: "error",
      };
    }

    return {
      fields,
      hasUnpublishedChanges: previousState.hasUnpublishedChanges,
      message: "Couldn’t save. Refresh and try again.",
      status: "error",
    };
  }
}

async function updateStudentBannersAction(
  previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  return runUpdateStudentBannersAction(previousState, formData, session.user.id);
}

async function updateAdminStudentPreviewBannersAction(
  previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const context = await requireAdminStudentPreviewContext();
    return runUpdateStudentBannersAction(
      previousState,
      formData,
      context.actor.session.user.id,
    );
  } catch (error) {
    if (isAdminStudentPreviewUnavailableError(error)) {
      return {
        ...previousState,
        message: error.message,
        status: "error",
      };
    }

    throw error;
  }
}

export {
  updateAdminStudentPreviewBannersAction,
  updateStudentBannersAction,
};
