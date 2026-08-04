"use server";

import { redirect, unstable_rethrow } from "next/navigation";

import { UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import {
  createStudentEnrollment,
  setStudentEnrollmentStatus,
  updateStudentEnrollment,
} from "@/lib/auth/service";
import type { FormState } from "@/modules/auth/form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalId(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  return value || null;
}

function buildEnrollmentRedirect({
  error,
  focus,
  notice,
}: {
  error?: string;
  focus?: string;
  notice?: string;
}) {
  const searchParams = new URLSearchParams();

  if (error) {
    searchParams.set("error", error);
  }

  if (focus) {
    searchParams.set("focus", focus);
  }

  if (notice) {
    searchParams.set("notice", notice);
  }

  const query = searchParams.toString();

  return query ? `/admin/enrollment?${query}` : "/admin/enrollment";
}

async function createStudentEnrollmentAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");

  if (!fullName || !email) {
    return {
      fieldErrors: {
        ...(fullName ? {} : { fullName: "Student name is required." }),
        ...(email ? {} : { email: "Student email is required." }),
      },
      fields: {
        email,
        fullName,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: "Please fill in the student's name and email before creating the account.",
      status: "error",
    };
  }

  try {
    const result = await createStudentEnrollment({
      actorUserId: session.user.id,
      email,
      fullName,
      targetExamEventId,
    });

    return {
      fields: {
        email: "",
        fullName: "",
        targetExamEventId: "",
      },
      message:
        "Student account created. Share the temporary password securely because it will not be shown again.",
      status: "success",
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    return {
      fields: {
        email,
        fullName,
        targetExamEventId: targetExamEventId ?? "",
      },
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, we couldn't create the student account. Please try again.",
      status: "error",
    };
  }
}

async function updateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readTextField(formData, "userId");
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");

  if (!userId || !fullName || !email) {
    redirect(
      buildEnrollmentRedirect({
        error: "missing-fields",
        focus: userId,
      }),
    );
  }

  let updateError: string | null = null;

  try {
    await updateStudentEnrollment({
      actorUserId: session.user.id,
      email,
      fullName,
      targetExamEventId,
      userId,
    });
  } catch (error) {
    unstable_rethrow(error);
    updateError = error instanceof Error && error.message.includes("already exists")
      ? "duplicate-email"
      : "update-failed";
  }

  if (updateError) {
    redirect(
      buildEnrollmentRedirect({
        error: updateError,
        focus: userId,
      }),
    );
  }

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-updated",
    }),
  );
}

async function deactivateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readTextField(formData, "userId");

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "missing-user" }));
  }

  await setStudentEnrollmentStatus({
    actorUserId: session.user.id,
    nextStatus: UserStatus.disabled,
    userId,
  });

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-deactivated",
    }),
  );
}

async function reactivateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readTextField(formData, "userId");

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "missing-user" }));
  }

  await setStudentEnrollmentStatus({
    actorUserId: session.user.id,
    nextStatus: UserStatus.active,
    userId,
  });

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-reactivated",
    }),
  );
}

export {
  createStudentEnrollmentAction,
  deactivateStudentEnrollmentAction,
  reactivateStudentEnrollmentAction,
  updateStudentEnrollmentAction,
};
