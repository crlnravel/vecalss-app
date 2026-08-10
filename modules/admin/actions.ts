"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { EnrollmentHandoffMethod, UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import {
  EnrollmentHandoffStateError,
  acknowledgeEnrollmentHandoff,
  reissueEnrollmentHandoff,
} from "@/lib/admin/handoffs/service";
import { buildDirectoryQuery, parseDirectoryQuery, parseUuid } from "@/lib/admin/operations/validation";
import {
  createKaptenEnrollment,
  createStudentEnrollment,
  setKaptenEnrollmentStatus,
  setStudentEnrollmentStatus,
  updateKaptenEnrollment,
  updateStudentEnrollment,
} from "@/lib/admin/enrollment";
import type { FormState } from "@/modules/auth/form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalId(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  return value ? parseUuid(value) : null;
}

function readUuidField(formData: FormData, key: string) {
  return parseUuid(readTextField(formData, key));
}

function readHandoffMethod(formData: FormData) {
  const value = readTextField(formData, "handoffMethod");

  if (!value) {
    return EnrollmentHandoffMethod.temporary_password;
  }

  return value === EnrollmentHandoffMethod.invite_link
    ? EnrollmentHandoffMethod.invite_link
    : value === EnrollmentHandoffMethod.temporary_password
      ? EnrollmentHandoffMethod.temporary_password
      : null;
}

function isConfirmed(formData: FormData, expected: "deactivate" | "reactivate") {
  return readTextField(formData, "confirmation") === expected;
}

function isHandoffConfirmed(formData: FormData, expected: "acknowledge" | "reissue") {
  return readTextField(formData, "confirmation") === expected;
}

function readDirectoryQuery(formData: FormData) {
  const value = readTextField(formData, "directoryQuery");

  if (!value) {
    return "";
  }

  const parsed = parseDirectoryQuery(value);
  return parsed.invalid ? "" : buildDirectoryQuery(parsed);
}

function handoffErrorMessage(error: unknown) {
  if (error instanceof EnrollmentHandoffStateError) {
    switch (error.code) {
      case "handoff_import_recovery_required":
        return "Import-sourced handoffs must be released through the authenticated handoff-file workflow before they can be replaced.";
      case "handoff_account_inactive":
        return "The account is inactive, so this handoff cannot be changed.";
      case "handoff_not_found":
        return "The enrollment handoff could not be found.";
      default:
        return error.message;
    }
  }

  return "The handoff could not be changed. Refresh the directory and try again.";
}

function buildDirectoryRedirect(
  path: string,
  {
    error,
    focus,
    notice,
    query,
  }: {
    error?: string;
    focus?: string;
    notice?: string;
    query?: string;
  },
) {
  const searchParams = new URLSearchParams(query?.startsWith("?") ? query.slice(1) : "");
  searchParams.delete("error");
  searchParams.delete("focus");
  searchParams.delete("notice");

  if (error) {
    searchParams.set("error", error);
  }

  if (focus) {
    searchParams.set("focus", focus);
  }

  if (notice) {
    searchParams.set("notice", notice);
  }

  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function buildEnrollmentRedirect({
  error,
  focus,
  notice,
  query,
}: {
  error?: string;
  focus?: string;
  notice?: string;
  query?: string;
}) {
  return buildDirectoryRedirect("/admin/enrollment", { error, focus, notice, query });
}

function buildKaptenRedirect({
  error,
  focus,
  notice,
  query,
}: {
  error?: string;
  focus?: string;
  notice?: string;
  query?: string;
}) {
  return buildDirectoryRedirect("/admin/kapten", { error, focus, notice, query });
}

async function createStudentEnrollmentAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");
  const handoffMethod = readHandoffMethod(formData);
  const selectedHandoffMethod = handoffMethod ?? EnrollmentHandoffMethod.temporary_password;

  if (!fullName || !email) {
    return {
      fieldErrors: {
        ...(fullName ? {} : { fullName: "Student name is required." }),
        ...(email ? {} : { email: "Student email is required." }),
      },
      fields: {
        email,
        fullName,
        handoffMethod: selectedHandoffMethod,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: "Please fill in the student's name and email before creating the account.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Choose a valid credential handoff method." },
      fields: {
        email,
        fullName,
        handoffMethod: selectedHandoffMethod,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: "Choose a valid credential handoff method before creating the student account.",
      status: "error",
    };
  }

  try {
    const result = await createStudentEnrollment({
      actorUserId: session.user.id,
      email,
      fullName,
      handoffMethod,
      targetExamEventId,
    });

    revalidatePath("/admin/enrollment");
    revalidatePath("/admin");

    return {
      fields: {
        email: "",
        fullName: "",
        handoffMethod,
        targetExamEventId: "",
      },
      handoffId: result.handoffId,
      handoffMethod: result.method,
      inviteUrl: result.inviteUrl ?? undefined,
      message: result.method === EnrollmentHandoffMethod.invite_link
        ? "Student account created. Share this invite link promptly; it expires after 24 hours and can be used once."
        : "Student account created. Share the temporary password securely because it will not be shown again.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
    };
  } catch (error) {
    return {
      fields: {
        email,
        fullName,
        handoffMethod,
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

async function createKaptenEnrollmentAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const phone = readTextField(formData, "phone") || null;
  const headline = readTextField(formData, "headline") || null;
  const bio = readTextField(formData, "bio") || null;
  const handoffMethod = readHandoffMethod(formData);
  const selectedHandoffMethod = handoffMethod ?? EnrollmentHandoffMethod.temporary_password;

  if (!fullName || !email) {
    return {
      fieldErrors: {
        ...(fullName ? {} : { fullName: "Kapten name is required." }),
        ...(email ? {} : { email: "Kapten email is required." }),
      },
      fields: { bio: bio ?? "", email, fullName, handoffMethod: selectedHandoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message: "Please fill in the Kapten's name and email before creating the account.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Choose a valid credential handoff method." },
      fields: { bio: bio ?? "", email, fullName, handoffMethod: selectedHandoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message: "Choose a valid credential handoff method before creating the Kapten account.",
      status: "error",
    };
  }

  try {
    const result = await createKaptenEnrollment({
      actorUserId: session.user.id,
      bio,
      email,
      fullName,
      handoffMethod,
      headline,
      phone,
    });

    revalidatePath("/admin/kapten");
    revalidatePath("/admin");

    return {
      fields: { bio: "", email: "", fullName: "", handoffMethod, headline: "", phone: "" },
      handoffId: result.handoffId,
      handoffMethod: result.method,
      inviteUrl: result.inviteUrl ?? undefined,
      message: result.method === EnrollmentHandoffMethod.invite_link
        ? "Kapten account created. Share this invite link promptly; it expires after 24 hours and can be used once."
        : "Kapten account created. Share the temporary password securely because it will not be shown again.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
    };
  } catch (error) {
    return {
      fields: { bio: bio ?? "", email, fullName, handoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, we couldn't create the Kapten account. Please try again.",
      status: "error",
    };
  }
}

async function updateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  if (!fullName || !email) {
    redirect(
      buildEnrollmentRedirect({
        error: "missing-fields",
        focus: userId,
        query: directoryQuery,
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
        query: directoryQuery,
      }),
    );
  }

  revalidatePath("/admin");

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-updated",
      query: directoryQuery,
    }),
  );
}

async function updateKaptenEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const phone = readTextField(formData, "phone") || null;
  const headline = readTextField(formData, "headline") || null;
  const bio = readTextField(formData, "bio") || null;

  if (!userId) {
    redirect(buildKaptenRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  if (!fullName || !email) {
    redirect(buildKaptenRedirect({ error: "missing-fields", focus: userId, query: directoryQuery }));
  }

  try {
    await updateKaptenEnrollment({
      actorUserId: session.user.id,
      bio,
      email,
      fullName,
      headline,
      phone,
      userId,
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect(buildKaptenRedirect({ error: error instanceof Error && error.message.includes("already exists") ? "duplicate-email" : "update-failed", focus: userId, query: directoryQuery }));
  }

  revalidatePath("/admin");

  redirect(buildKaptenRedirect({ focus: userId, notice: "kapten-updated", query: directoryQuery }));
}

async function deactivateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  await setStudentEnrollmentStatus({
    actorUserId: session.user.id,
    confirmed: isConfirmed(formData, "deactivate"),
    nextStatus: UserStatus.disabled,
    userId,
  });

  revalidatePath("/admin");

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-deactivated",
      query: directoryQuery,
    }),
  );
}

async function reactivateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  await setStudentEnrollmentStatus({
    actorUserId: session.user.id,
    confirmed: isConfirmed(formData, "reactivate"),
    nextStatus: UserStatus.active,
    userId,
  });

  revalidatePath("/admin");

  redirect(
    buildEnrollmentRedirect({
      focus: userId,
      notice: "student-reactivated",
      query: directoryQuery,
    }),
  );
}

async function deactivateKaptenEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);

  if (!userId) {
    redirect(buildKaptenRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  await setKaptenEnrollmentStatus({
    actorUserId: session.user.id,
    confirmed: isConfirmed(formData, "deactivate"),
    nextStatus: UserStatus.disabled,
    userId,
  });

  revalidatePath("/admin");

  redirect(buildKaptenRedirect({ focus: userId, notice: "kapten-deactivated", query: directoryQuery }));
}

async function reactivateKaptenEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);

  if (!userId) {
    redirect(buildKaptenRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  await setKaptenEnrollmentStatus({
    actorUserId: session.user.id,
    confirmed: isConfirmed(formData, "reactivate"),
    nextStatus: UserStatus.active,
    userId,
  });

  revalidatePath("/admin");

  redirect(buildKaptenRedirect({ focus: userId, notice: "kapten-reactivated", query: directoryQuery }));
}

async function acknowledgeEnrollmentHandoffAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const handoffId = readUuidField(formData, "handoffId");

  if (!handoffId) {
    return { message: "The enrollment handoff could not be found.", status: "error" };
  }

  if (!isHandoffConfirmed(formData, "acknowledge")) {
    return { handoffId, message: "Confirm that this handoff was delivered before acknowledging it.", status: "error" };
  }

  try {
    await acknowledgeEnrollmentHandoff({
      actorUserId: session.user.id,
      handoffId,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/enrollment");
    revalidatePath("/admin/kapten");
    return {
      handoffId,
      message: "Handoff acknowledgement recorded.",
      status: "success",
    };
  } catch {
    return {
      handoffId,
      message: "This handoff is no longer awaiting acknowledgement.",
      status: "error",
    };
  }
}

async function reissueEnrollmentHandoffAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const handoffId = readUuidField(formData, "handoffId");

  if (!handoffId) {
    return { message: "The enrollment handoff could not be found.", status: "error" };
  }

  if (!isHandoffConfirmed(formData, "reissue")) {
    return { handoffId, message: "Confirm that the current handoff should be revoked before reissuing it.", status: "error" };
  }

  try {
    const result = await reissueEnrollmentHandoff({
      actorUserId: session.user.id,
      handoffId,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/enrollment");
    revalidatePath("/admin/kapten");

    return {
      handoffId: result.handoffId,
      handoffMethod: result.method,
      inviteUrl: result.inviteUrl ?? undefined,
      message: result.recoverableByImportFile
        ? "A replacement handoff is ready for one-time bulk download. The previous handoff is revoked."
        : result.method === EnrollmentHandoffMethod.invite_link
          ? "A replacement invite link was generated. The previous handoff is revoked."
          : "A replacement temporary password was generated. The previous password is revoked.",
      status: "success",
      temporaryPassword: result.method === EnrollmentHandoffMethod.temporary_password
        ? result.secret ?? undefined
        : undefined,
    };
  } catch (error) {
    return {
      handoffId,
      message: handoffErrorMessage(error),
      status: "error",
    };
  }
}

export {
  acknowledgeEnrollmentHandoffAction,
  createKaptenEnrollmentAction,
  createStudentEnrollmentAction,
  deactivateKaptenEnrollmentAction,
  deactivateStudentEnrollmentAction,
  reactivateKaptenEnrollmentAction,
  reactivateStudentEnrollmentAction,
  reissueEnrollmentHandoffAction,
  updateKaptenEnrollmentAction,
  updateStudentEnrollmentAction,
};
