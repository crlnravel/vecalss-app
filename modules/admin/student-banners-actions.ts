"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth/access";
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

async function updateStudentBannersAction(
  previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const intent = readIntent(formData);
  const fields = buildFields(formData);
  const fieldErrors = validateStudentBannerFields(fields);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      fields,
      hasUnpublishedChanges: previousState.hasUnpublishedChanges,
      message: "Review the highlighted fields before saving or publishing the banner copy.",
      status: "error",
    };
  }

  try {
    if (intent === "publish") {
      const result = await publishStudentBannerContents({
        actorUserId: session.user.id,
        banners: buildBanners(fields),
        expectedVersion: fields.version || null,
      });

      revalidatePath("/dashboard");
      revalidatePath("/courses");
      revalidatePath("/quiz");
      revalidatePath("/tryout");
      revalidatePath("/admin/student-banners");

      return {
        fields: { ...fields, version: result.updatedAt },
        hasUnpublishedChanges: false,
        message: "Student banner copy published. Students will see it on their next page load.",
        published: true,
        status: "success",
      };
    }

    const result = await saveStudentBannerDraft({
      actorUserId: session.user.id,
      banners: buildBanners(fields),
      expectedVersion: fields.version || null,
    });

    revalidatePath("/admin/student-banners");

    return {
      fields: { ...fields, version: result.draftVersion },
      hasUnpublishedChanges: result.hasUnpublishedChanges,
      message: result.hasUnpublishedChanges
        ? "Draft saved. Students will continue seeing the published copy until you publish it."
        : "Draft saved. It matches the currently published banner copy.",
      published: false,
      status: "success",
    };
  } catch (error) {
    if (error instanceof StudentBannerDraftMismatchError) {
      return {
        fields,
        hasUnpublishedChanges: previousState.hasUnpublishedChanges,
        message: "Save the current edits as a draft before publishing them.",
        status: "error",
      };
    }

    if (error instanceof StudentBannerConflictError) {
      return {
        fields,
        hasUnpublishedChanges: previousState.hasUnpublishedChanges,
        message: "These banners changed since you opened the editor. Refresh the page before saving again.",
        status: "error",
      };
    }

    return {
      fields,
      hasUnpublishedChanges: previousState.hasUnpublishedChanges,
      message: "The banner copy could not be saved. Refresh the page and try again.",
      status: "error",
    };
  }
}

export { updateStudentBannersAction };
