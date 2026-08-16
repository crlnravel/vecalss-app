"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth/access";
import {
  STUDENT_BANNER_KEYS,
  type StudentBannerSet,
} from "@/lib/student/banner-content";
import { updateStudentBannerContents } from "@/lib/student/banner-repository";
import type { FormState } from "@/modules/auth/form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildFields(formData: FormData) {
  return Object.fromEntries(
    STUDENT_BANNER_KEYS.flatMap((key) => [
      [`${key}.title`, readTextField(formData, `${key}.title`)],
      [`${key}.description`, readTextField(formData, `${key}.description`)],
    ]),
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

function validateFields(fields: Record<string, string>) {
  const fieldErrors: Record<string, string> = {};

  for (const key of STUDENT_BANNER_KEYS) {
    const titleField = `${key}.title`;
    const descriptionField = `${key}.description`;
    const title = fields[titleField] ?? "";
    const description = fields[descriptionField] ?? "";

    if (!title) {
      fieldErrors[titleField] = "Heading is required.";
    } else if (title.length > 180) {
      fieldErrors[titleField] = "Heading must be 180 characters or fewer.";
    }

    if (!description) {
      fieldErrors[descriptionField] = "Supporting text is required.";
    } else if (description.length > 1000) {
      fieldErrors[descriptionField] = "Supporting text must be 1,000 characters or fewer.";
    }
  }

  return fieldErrors;
}

async function updateStudentBannersAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fields = buildFields(formData);
  const fieldErrors = validateFields(fields);

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      fields,
      message: "Review the highlighted fields before saving the banner copy.",
      status: "error",
    };
  }

  try {
    await updateStudentBannerContents({
      actorUserId: session.user.id,
      banners: buildBanners(fields),
    });

    revalidatePath("/dashboard");
    revalidatePath("/courses");
    revalidatePath("/quiz");
    revalidatePath("/tryout");
    revalidatePath("/admin/student-banners");

    return {
      fields,
      message: "Student banner copy saved. Students will see the update on their next page load.",
      status: "success",
    };
  } catch {
    return {
      fields,
      message: "The banner copy could not be saved. Refresh the page and try again.",
      status: "error",
    };
  }
}

export { updateStudentBannersAction };
