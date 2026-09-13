"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { EnrollmentHandoffMethod, UserStatus } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { ADMIN_STUDENT_DIRECTORY_CACHE_TAG } from "@/lib/admin/operations/directory-cache";
import {
  EnrollmentHandoffStateError,
  acknowledgeEnrollmentHandoff,
  reissueEnrollmentHandoff,
} from "@/lib/admin/handoffs/service";
import { buildDirectoryQuery, parseDirectoryQuery, parseUuid } from "@/lib/admin/operations/validation";
import {
  KelasNotificationError,
  sendKelasNotification,
} from "@/lib/notifications/service";
import {
  createAffiliatorEnrollment,
  changeStudentEnrollmentPassword,
  createKaptenEnrollment,
  createStudentEnrollment,
  deleteStudentEnrollment,
  setKaptenEnrollmentStatus,
  setStudentEnrollmentStatus,
  setStudentEnrollmentStatusBulk,
  updateKaptenEnrollment,
  updateStudentEnrollment,
} from "@/lib/admin/enrollment";
import type { FormState } from "@/modules/auth/form-state";

function readTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function withFieldError(
  fields: Record<string, string>,
  message: string,
  fieldErrors: Record<string, string>,
): FormState {
  return {
    fieldErrors,
    fields,
    message,
    status: "error",
  };
}

function readOptionalId(formData: FormData, key: string) {
  const value = readTextField(formData, key);
  return value ? parseUuid(value) : null;
}

function readUuidField(formData: FormData, key: string) {
  return parseUuid(readTextField(formData, key));
}

function readUuidFields(formData: FormData, key: string) {
  const values = formData.getAll(key);
  if (!values.length) {
    return [];
  }

  const parsed = values.map((value) => typeof value === "string" ? parseUuid(value) : null);
  if (parsed.some((value) => !value)) {
    return [];
  }

  return [...new Set(parsed.filter((value): value is string => Boolean(value)))];
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

function isDeleteConfirmed(formData: FormData) {
  return readTextField(formData, "confirmation") === "delete";
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

function invalidateStudentDirectoryCache() {
  updateTag(ADMIN_STUDENT_DIRECTORY_CACHE_TAG);
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
  path = "/admin/enrollment",
  query,
}: {
  error?: string;
  focus?: string;
  notice?: string;
  path?: string;
  query?: string;
}) {
  return buildDirectoryRedirect(path, { error, focus, notice, query });
}

function readStudentReturnPath(formData: FormData, userId: string) {
  const value = readTextField(formData, "returnPath");
  return value === `/admin/enrollment/${userId}` ? value : null;
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
    invalidateStudentDirectoryCache();
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
      userId: result.userId,
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
      userId: result.userId,
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

async function createAffiliatorEnrollmentAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const fullName = readTextField(formData, "fullName");
  const email = readTextField(formData, "email");
  const referralCode = readTextField(formData, "referralCode");
  const handoffMethod = readHandoffMethod(formData);
  const selectedHandoffMethod = handoffMethod ?? EnrollmentHandoffMethod.temporary_password;
  const fields = {
    email,
    fullName,
    handoffMethod: selectedHandoffMethod,
    referralCode,
  };

  if (!fullName || !email || !referralCode) {
    return {
      fieldErrors: {
        ...(fullName ? {} : { fullName: "Affiliator name is required." }),
        ...(email ? {} : { email: "Affiliator email is required." }),
        ...(referralCode ? {} : { referralCode: "Referral code is required." }),
      },
      fields,
      message: "Please fill in the affiliator's name, email, and referral code before creating the account.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Choose a valid credential handoff method." },
      fields,
      message: "Choose a valid credential handoff method before creating the affiliator account.",
      status: "error",
    };
  }

  try {
    const result = await createAffiliatorEnrollment({
      actorUserId: session.user.id,
      email,
      fullName,
      handoffMethod,
      referralCode,
    });

    revalidatePath("/admin/affiliators");
    revalidatePath("/admin");

    return {
      fields: { email: "", fullName: "", handoffMethod, referralCode: "" },
      handoffId: result.handoffId,
      handoffMethod: result.method,
      inviteUrl: result.inviteUrl ?? undefined,
      message: result.method === EnrollmentHandoffMethod.invite_link
        ? "Affiliator account created. Share this invite link promptly; it expires after 24 hours and can be used once."
        : "Affiliator account created. Share the temporary password securely because it will not be shown again.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
      userId: result.userId,
    };
  } catch (error) {
    return {
      fields,
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, we couldn't create the affiliator account. Please try again.",
      status: "error",
    };
  }
}

async function sendKelasNotificationAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const cohortId = readTextField(formData, "cohortId");
  const title = readTextField(formData, "title");
  const body = readTextField(formData, "body");
  const fields = { body, cohortId, title };

  if (!parseUuid(cohortId)) {
    return {
      fieldErrors: { cohortId: "Pilih kelas yang akan menerima notifikasi." },
      fields,
      message: "Pilih kelas sebelum mengirim notifikasi.",
      status: "error",
    };
  }

  try {
    const result = await sendKelasNotification({
      actorUserId: session.user.id,
      body,
      cohortId,
      title,
    });

    revalidatePath("/notifications");

    return {
      fields: { body: "", cohortId: "", title: "" },
      message: `Notifikasi kelas terkirim ke ${result.recipientCount} siswa di ${result.cohortName}.`,
      status: "success",
    };
  } catch (error) {
    if (error instanceof KelasNotificationError) {
      const fieldErrors: Record<string, string> = error.code === "invalid_title"
        ? { title: error.message }
        : error.code === "invalid_body"
          ? { body: error.message }
          : error.code === "invalid_cohort_id" || error.code === "cohort_not_found"
            ? { cohortId: error.message }
            : {};

      return {
        fieldErrors,
        fields,
        message: error.message,
        status: "error",
      };
    }

    return {
      fields,
      message: "Notifikasi kelas belum dapat dikirim. Coba lagi.",
      status: "error",
    };
  }
}

async function updateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const returnPath = userId ? readStudentReturnPath(formData, userId) : null;
  const directoryQuery = readDirectoryQuery(formData);
  const providedFullName = readTextField(formData, "fullName");
  const firstName = readTextField(formData, "firstName");
  const lastName = readTextField(formData, "lastName");
  const fullName = providedFullName || [firstName, lastName].filter(Boolean).join(" ");
  const email = readTextField(formData, "email");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");
  const missingName = !providedFullName && !firstName;

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  if (missingName || !fullName || !email) {
    redirect(
      buildEnrollmentRedirect({
        error: "missing-fields",
        focus: returnPath ? undefined : userId,
        path: returnPath ?? undefined,
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
        focus: returnPath ? undefined : userId,
        path: returnPath ?? undefined,
        query: directoryQuery,
      }),
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();
  if (returnPath) {
    revalidatePath(returnPath);
  }

  redirect(
    buildEnrollmentRedirect({
      focus: returnPath ? undefined : userId,
      notice: "student-updated",
      path: returnPath ?? undefined,
      query: directoryQuery,
    }),
  );
}

async function changeStudentEnrollmentPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const returnPath = userId ? readStudentReturnPath(formData, userId) : null;
  const directoryQuery = readDirectoryQuery(formData);
  const password = readTextField(formData, "password");
  const confirmPassword = readTextField(formData, "confirmPassword");

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  if (!password || !confirmPassword) {
    return withFieldError(
      {},
      "Enter and confirm the new password.",
      {
        ...(password ? {} : { password: "New password is required." }),
        ...(confirmPassword ? {} : { confirmPassword: "Confirm password is required." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "The passwords do not match.",
      { confirmPassword: "Passwords do not match." },
    );
  }

  try {
    await changeStudentEnrollmentPassword({
      actorUserId: session.user.id,
      password,
      userId,
    });
  } catch (error) {
    return {
      message:
        error instanceof Error
          ? error.message
          : "We're sorry, we couldn't update the student password. Please try again.",
      status: "error",
    };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();
  if (returnPath) {
    revalidatePath(returnPath);
  }

  redirect(
    buildEnrollmentRedirect({
      notice: "student-password-updated",
      path: returnPath ?? `/admin/enrollment/${userId}`,
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
  const returnPath = userId ? readStudentReturnPath(formData, userId) : null;
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
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();
  if (returnPath) {
    revalidatePath(returnPath);
  }

  redirect(
    buildEnrollmentRedirect({
      focus: returnPath ? undefined : userId,
      notice: "student-deactivated",
      path: returnPath ?? undefined,
      query: directoryQuery,
    }),
  );
}

async function reactivateStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const returnPath = userId ? readStudentReturnPath(formData, userId) : null;
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
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();
  if (returnPath) {
    revalidatePath(returnPath);
  }

  redirect(
    buildEnrollmentRedirect({
      focus: returnPath ? undefined : userId,
      notice: "student-reactivated",
      path: returnPath ?? undefined,
      query: directoryQuery,
    }),
  );
}

async function deleteStudentEnrollmentAction(formData: FormData) {
  const session = await requireAdminSession();
  const userId = readUuidField(formData, "userId");
  const directoryQuery = readDirectoryQuery(formData);

  if (!userId) {
    redirect(buildEnrollmentRedirect({ error: "invalid-user", query: directoryQuery }));
  }

  if (!isDeleteConfirmed(formData)) {
    redirect(buildEnrollmentRedirect({ error: "delete-confirmation", path: "/admin/enrollment", query: directoryQuery }));
  }

  try {
    await deleteStudentEnrollment({
      actorUserId: session.user.id,
      userId,
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect(buildEnrollmentRedirect({ error: "delete-failed", path: "/admin/enrollment", query: directoryQuery }));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();

  redirect(buildEnrollmentRedirect({ notice: "student-deleted", path: "/admin/enrollment", query: directoryQuery }));
}

async function bulkUpdateStudentEnrollmentStatusAction(formData: FormData) {
  const session = await requireAdminSession();
  const studentIds = readUuidFields(formData, "studentIds");
  const directoryQuery = readDirectoryQuery(formData);
  const nextStatusValue = readTextField(formData, "nextStatus");
  const nextStatus = nextStatusValue === UserStatus.active
    ? UserStatus.active
    : nextStatusValue === UserStatus.disabled
      ? UserStatus.disabled
      : null;
  const confirmation = nextStatus === UserStatus.disabled ? "deactivate" : "reactivate";

  if (!studentIds.length || !nextStatus) {
    redirect(buildEnrollmentRedirect({ error: "bulk-status-failed", query: directoryQuery }));
  }

  if (!isConfirmed(formData, confirmation)) {
    redirect(buildEnrollmentRedirect({ error: "bulk-status-confirmation", query: directoryQuery }));
  }

  let result: Awaited<ReturnType<typeof setStudentEnrollmentStatusBulk>>;
  try {
    result = await setStudentEnrollmentStatusBulk({
      actorUserId: session.user.id,
      confirmed: true,
      nextStatus,
      userIds: studentIds,
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect(buildEnrollmentRedirect({ error: "bulk-status-failed", query: directoryQuery }));
  }

  if (result.changedCount === 0) {
    redirect(buildEnrollmentRedirect({ error: "bulk-status-no-change", query: directoryQuery }));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/enrollment");
  invalidateStudentDirectoryCache();

  redirect(
    buildEnrollmentRedirect({
      notice: nextStatus === UserStatus.disabled ? "students-disabled" : "students-reactivated",
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
    const acknowledged = await acknowledgeEnrollmentHandoff({
      actorUserId: session.user.id,
      handoffId,
    });
    revalidatePath("/admin");
    revalidatePath("/admin/enrollment");
    invalidateStudentDirectoryCache();
    revalidatePath(`/admin/enrollment/${acknowledged.userId}`);
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
    invalidateStudentDirectoryCache();
    revalidatePath(`/admin/enrollment/${result.userId}`);
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
      userId: result.userId,
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
  bulkUpdateStudentEnrollmentStatusAction,
  changeStudentEnrollmentPasswordAction,
  createAffiliatorEnrollmentAction,
  createKaptenEnrollmentAction,
  createStudentEnrollmentAction,
  deleteStudentEnrollmentAction,
  deactivateKaptenEnrollmentAction,
  deactivateStudentEnrollmentAction,
  reactivateKaptenEnrollmentAction,
  reactivateStudentEnrollmentAction,
  reissueEnrollmentHandoffAction,
  sendKelasNotificationAction,
  updateKaptenEnrollmentAction,
  updateStudentEnrollmentAction,
};
