"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { EnrollmentHandoffMethod, UserStatus } from "@/generated/prisma/client";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/constants";
import { requireAdminSession } from "@/lib/auth/access";
import { serverLogger } from "@/lib/server-logger";
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
  EnrollmentServiceError,
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
        return "Informasi akses dari impor perlu dibagikan melalui halaman detail impor.";
      case "handoff_account_inactive":
        return "Akun ini tidak aktif, jadi informasi aksesnya belum bisa diubah.";
      case "handoff_not_found":
        return "Informasi akses tidak ditemukan. Segarkan halaman lalu coba lagi.";
      default:
        return "Informasi akses belum berhasil dibuat ulang. Periksa status akun lalu coba lagi.";
    }
  }

  return "Informasi akses belum berhasil dibuat ulang. Periksa status akun lalu coba lagi.";
}

function enrollmentCreationErrorMessage(error: unknown, role: string) {
  if (error instanceof EnrollmentServiceError) {
    switch (error.code) {
      case "duplicate_email":
        return "Alamat email ini sudah digunakan. Gunakan alamat email lain.";
      case "invalid_email":
        return "Masukkan alamat email yang valid.";
      case "invalid_field":
        return "Ada data yang perlu diperbaiki. Periksa kembali isian formulir.";
      case "invalid_handoff_method":
        return "Pilih cara pemberian akses yang tersedia.";
      case "not_found":
        return "Data yang dipilih sudah tidak tersedia. Segarkan halaman lalu coba lagi.";
      case "role_conflict":
        return "Alamat email ini sudah digunakan untuk jenis akun lain.";
      default:
        break;
    }
  }

  return `Akun ${role} belum berhasil dibuat. Coba lagi.`;
}

function logEnrollmentCreationFailure(error: unknown, operation: "student" | "kapten" | "affiliator") {
  if (error instanceof EnrollmentServiceError) return;

  serverLogger.error(
    `admin.enrollment.create_${operation}.failed`,
    error,
    { area: "admin.enrollment", operation: `create_${operation}` },
  );
}

function isDuplicateEmailFailure(error: unknown) {
  return (
    (error instanceof EnrollmentServiceError
      && (error.code === "duplicate_email" || error.code === "role_conflict"))
    || (error instanceof Error && error.message.toLowerCase().includes("already exists"))
  );
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
        ...(fullName ? {} : { fullName: "Nama siswa wajib diisi." }),
        ...(email ? {} : { email: "Alamat email siswa wajib diisi." }),
      },
      fields: {
        email,
        fullName,
        handoffMethod: selectedHandoffMethod,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: "Isi nama dan alamat email siswa sebelum membuat akun.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Pilih cara pemberian akses yang tersedia." },
      fields: {
        email,
        fullName,
        handoffMethod: selectedHandoffMethod,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: "Pilih cara pemberian akses sebelum membuat akun siswa.",
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
        ? "Akun siswa berhasil dibuat. Bagikan tautan undangan sekarang; tautan berlaku 24 jam dan hanya bisa digunakan sekali."
        : "Akun siswa berhasil dibuat. Bagikan kata sandi sementara melalui kanal yang aman; kata sandi hanya ditampilkan sekali.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
      userId: result.userId,
    };
  } catch (error) {
    logEnrollmentCreationFailure(error, "student");
    return {
      fields: {
        email,
        fullName,
        handoffMethod,
        targetExamEventId: targetExamEventId ?? "",
      },
      message: enrollmentCreationErrorMessage(error, "siswa"),
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
        ...(fullName ? {} : { fullName: "Nama Kapten wajib diisi." }),
        ...(email ? {} : { email: "Alamat email Kapten wajib diisi." }),
      },
      fields: { bio: bio ?? "", email, fullName, handoffMethod: selectedHandoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message: "Isi nama dan alamat email Kapten sebelum membuat akun.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Pilih cara pemberian akses yang tersedia." },
      fields: { bio: bio ?? "", email, fullName, handoffMethod: selectedHandoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message: "Pilih cara pemberian akses sebelum membuat akun Kapten.",
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
        ? "Akun Kapten berhasil dibuat. Bagikan tautan undangan sekarang; tautan berlaku 24 jam dan hanya bisa digunakan sekali."
        : "Akun Kapten berhasil dibuat. Bagikan kata sandi sementara melalui kanal yang aman; kata sandi hanya ditampilkan sekali.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
      userId: result.userId,
    };
  } catch (error) {
    logEnrollmentCreationFailure(error, "kapten");
    return {
      fields: { bio: bio ?? "", email, fullName, handoffMethod, headline: headline ?? "", phone: phone ?? "" },
      message: enrollmentCreationErrorMessage(error, "Kapten"),
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
        ...(fullName ? {} : { fullName: "Nama Affiliator wajib diisi." }),
        ...(email ? {} : { email: "Alamat email Affiliator wajib diisi." }),
        ...(referralCode ? {} : { referralCode: "Kode referral wajib diisi." }),
      },
      fields,
      message: "Isi nama, alamat email, dan kode referral Affiliator sebelum membuat akun.",
      status: "error",
    };
  }

  if (!handoffMethod) {
    return {
      fieldErrors: { handoffMethod: "Pilih cara pemberian akses yang tersedia." },
      fields,
      message: "Pilih cara pemberian akses sebelum membuat akun Affiliator.",
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
        ? "Akun Affiliator berhasil dibuat. Bagikan tautan undangan sekarang; tautan berlaku 24 jam dan hanya bisa digunakan sekali."
        : "Akun Affiliator berhasil dibuat. Bagikan kata sandi sementara melalui kanal yang aman; kata sandi hanya ditampilkan sekali.",
      status: "success",
      temporaryPassword: result.temporaryPassword ?? undefined,
      userId: result.userId,
    };
  } catch (error) {
    logEnrollmentCreationFailure(error, "affiliator");
    return {
      fields,
      message: enrollmentCreationErrorMessage(error, "Affiliator"),
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

    serverLogger.error("admin.notifications.send.failed", error, {
      area: "admin.notifications",
      operation: "send_to_class",
    });

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
    if (!isDuplicateEmailFailure(error)) {
      serverLogger.error("admin.enrollment.update_student.failed", error, {
        area: "admin.enrollment",
        operation: "update_student",
      });
    }
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
      "Isi dan ulangi kata sandi baru.",
      {
        ...(password ? {} : { password: "Kata sandi baru wajib diisi." }),
        ...(confirmPassword ? {} : { confirmPassword: "Ulangi kata sandi baru." }),
      },
    );
  }

  if (password !== confirmPassword) {
    return withFieldError(
      {},
      "Kata sandi belum sama.",
      { confirmPassword: "Kata sandi belum sama." },
    );
  }

  try {
    await changeStudentEnrollmentPassword({
      actorUserId: session.user.id,
      password,
      userId,
    });
  } catch (error) {
    const message = error instanceof EnrollmentServiceError
      ? error.code === "invalid_field"
        ? `Kata sandi harus terdiri dari minimal ${PASSWORD_MIN_LENGTH} karakter dan memuat huruf besar, huruf kecil, serta angka.`
        : error.code === "not_found"
          ? "Akun siswa tidak ditemukan. Segarkan halaman lalu coba lagi."
          : "Kata sandi siswa belum berhasil diperbarui. Coba lagi."
      : "Kata sandi siswa belum berhasil diperbarui. Periksa koneksi lalu coba lagi.";

    if (!(error instanceof EnrollmentServiceError)) {
      serverLogger.error("admin.enrollment.password_update.failed", error, {
        area: "admin.enrollment",
        operation: "change_student_password",
      });
    }

    return {
      message,
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
    if (!isDuplicateEmailFailure(error)) {
      serverLogger.error("admin.enrollment.update_kapten.failed", error, {
        area: "admin.enrollment",
        operation: "update_kapten",
      });
    }
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
    if (!(error instanceof EnrollmentServiceError)) {
      serverLogger.error("admin.enrollment.delete_student.failed", error, {
        area: "admin.enrollment",
        operation: "delete_student",
      });
    }
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
    if (!(error instanceof EnrollmentServiceError)) {
      serverLogger.error("admin.enrollment.bulk_status_update.failed", error, {
        area: "admin.enrollment",
        operation: "bulk_update_student_status",
      });
    }
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
    return { message: "Informasi akses tidak ditemukan. Segarkan halaman lalu coba lagi.", status: "error" };
  }

  if (!isHandoffConfirmed(formData, "acknowledge")) {
    return { handoffId, message: "Konfirmasi bahwa informasi akses sudah diberikan kepada penerima.", status: "error" };
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
      message: "Konfirmasi bahwa informasi akses sudah dibagikan berhasil dicatat.",
      status: "success",
    };
  } catch (error) {
    if (!(error instanceof EnrollmentHandoffStateError)) {
      serverLogger.error("admin.enrollment.handoff_acknowledgement.failed", error, {
        area: "admin.enrollment.handoff",
        operation: "acknowledge",
      });
    }
    return {
      handoffId,
      message: "Informasi akses ini tidak lagi menunggu konfirmasi. Segarkan halaman untuk melihat status terbaru.",
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
    return { message: "Informasi akses tidak ditemukan. Segarkan halaman lalu coba lagi.", status: "error" };
  }

  if (!isHandoffConfirmed(formData, "reissue")) {
    return { handoffId, message: "Konfirmasi bahwa akses saat ini akan dicabut sebelum membuat akses baru.", status: "error" };
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
        ? "Informasi akses pengganti siap diunduh sekali. Akses sebelumnya sudah dicabut."
        : result.method === EnrollmentHandoffMethod.invite_link
          ? "Tautan undangan baru berhasil dibuat. Tautan sebelumnya sudah tidak berlaku."
          : "Kata sandi sementara baru berhasil dibuat. Kata sandi sebelumnya sudah tidak berlaku.",
      status: "success",
      temporaryPassword: result.method === EnrollmentHandoffMethod.temporary_password
        ? result.secret ?? undefined
        : undefined,
      userId: result.userId,
    };
  } catch (error) {
    if (!(error instanceof EnrollmentHandoffStateError)) {
      serverLogger.error("admin.enrollment.handoff_reissue.failed", error, {
        area: "admin.enrollment.handoff",
        operation: "reissue",
      });
    }
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
