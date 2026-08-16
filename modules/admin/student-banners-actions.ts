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
  updateStudentBannerContents,
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

async function updateStudentBannersAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fields = buildFields(formData);
  const fieldErrors = validateStudentBannerFields(fields);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      fields,
      message: "Review the highlighted fields before saving the banner copy.",
      status: "error",
    };
  }

  try {
    const result = await updateStudentBannerContents({
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
      message: "Student banner copy saved. Students will see the update on their next page load.",
      status: "success",
    };
  } catch (error) {
    if (error instanceof StudentBannerConflictError) {
      return {
        fields,
        message: "These banners changed since you opened the editor. Refresh the page before saving again.",
        status: "error",
      };
    }

    return {
      fields,
      message: "The banner copy could not be saved. Refresh the page and try again.",
      status: "error",
    };
  }
}

export { updateStudentBannersAction };
