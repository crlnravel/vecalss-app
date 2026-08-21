"use server";

import { revalidatePath } from "next/cache";

import {
  AdminStudentPreviewUnavailableError,
} from "@/lib/admin/student-preview";
import {
  AdminPreviewTryoutRestartError,
  restartAdminStudentPreviewTryout,
  type AdminPreviewTryoutRestartInput,
} from "@/lib/admin/student-preview-tryout";

async function restartAdminStudentPreviewTryoutAction(
  input: AdminPreviewTryoutRestartInput,
) {
  try {
    const result = await restartAdminStudentPreviewTryout(input);
    revalidatePath("/admin/student-preview");
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof AdminPreviewTryoutRestartError || error instanceof AdminStudentPreviewUnavailableError) {
      return {
        code: "code" in error ? error.code : "feature_disabled",
        message: error.message,
        ok: false as const,
      };
    }

    // Next's redirect/notFound sentinels must escape the action boundary so
    // unauthenticated or non-admin callers retain the normal auth behavior.
    throw error;
  }
}

export { restartAdminStudentPreviewTryoutAction };
