"use server";

import {
  requireAdminSession,
  requireAdminStudentPreviewContext,
} from "@/lib/auth/access";
import {
  isAdminStudentPreviewUnavailableError,
} from "@/lib/admin/student-preview";
import {
  assertLegacyBannerWritesRetired,
  LegacyBannerWritesRetiredError,
} from "@/lib/banner/activation";
import type { FormState } from "@/modules/auth/form-state";

function retiredLegacyBannerState(previousState: FormState): FormState {
  try {
    assertLegacyBannerWritesRetired();
  } catch (error) {
    if (error instanceof LegacyBannerWritesRetiredError) {
      return {
        ...previousState,
        message: error.message,
        status: "error",
      };
    }
    throw error;
  }

  // The guard above is deliberately unconditional. Keep a fail-closed return
  // for type-level exhaustiveness if the retirement policy changes later.
  return {
    ...previousState,
    message: "Penulisan banner lama tidak tersedia.",
    status: "error",
  };
}

/**
 * The pre-BP05 four-field editor remains only as a stale-form compatibility
 * boundary. It authenticates the caller, then rejects without parsing or
 * mutating `student.banners`.
 */
async function updateStudentBannersAction(
  previousState: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _formData;
  await requireAdminSession();
  return retiredLegacyBannerState(previousState);
}

/**
 * Managed student Preview used to expose the same legacy writer. Keep its
 * capability check, but retire the mutation path so an old tab cannot write
 * after cutover.
 */
async function updateAdminStudentPreviewBannersAction(
  previousState: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _formData;
  try {
    await requireAdminStudentPreviewContext();
    return retiredLegacyBannerState(previousState);
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
