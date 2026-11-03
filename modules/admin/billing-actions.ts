"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth/access";
import { isAccessPlan } from "@/lib/billing/plans";
import {
  BillingAccessError,
  extendAccess,
  grantAccess,
  pauseAccess,
  resumeAccess,
  revokeAccess,
  type OperationResult,
} from "@/lib/billing/service";
import { serverLogger } from "@/lib/server-logger";
import type { FormState } from "@/modules/auth/form-state";

import {
  ACCESS_ERROR_MESSAGE,
  ACCESS_GENERIC_ERROR,
  ACCESS_OPERATION_LABEL,
  type AccessOperation,
} from "./billing-copy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatEnd(date: Date | null) {
  if (!date) return "";
  return `${date.toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "Asia/Jakarta", year: "numeric" })} pukul ${date
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    .replace(":", ".")} WIB`;
}

function successMessage(operation: AccessOperation, result: OperationResult) {
  if (result.outcome === "duplicate") return "Perubahan ini sudah tercatat sebelumnya, jadi tidak diulang.";
  if (result.outcome === "unchanged") return "Tidak ada yang berubah: akses siswa sudah dalam keadaan itu.";

  const until = result.state.endsAt ? ` Akses berlaku sampai ${formatEnd(result.state.endsAt)}.` : "";
  switch (operation) {
    case "grant": return `Akses diberikan.${until}`;
    case "extend": return `Akses diperpanjang.${until}`;
    case "pause": return "Akses dijeda. Tanggal akhirnya tidak berubah.";
    case "resume": return `Akses dilanjutkan.${until}`;
    case "revoke": return "Akses dicabut. Hasil belajar siswa tetap tersimpan.";
  }
}

/**
 * Grant, extend, pause, resume or revoke a student's paid access. Admin only
 * (and, for admins, only with a verified second factor, because that is part of
 * what requireAdminSession means). Every change carries a written reason and is
 * recorded in the access history and the audit log.
 */
async function manageStudentAccessAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminSession();

  const operation = text(formData, "operation") as AccessOperation;
  const studentId = text(formData, "studentId");
  if (!(operation in ACCESS_OPERATION_LABEL) || !UUID.test(studentId)) {
    return { message: ACCESS_GENERIC_ERROR, status: "error" };
  }

  const base = {
    actorUserId: session.user.id,
    idempotencyKey: `admin:${text(formData, "idempotencyKey")}`,
    reason: text(formData, "reason"),
    source: "admin" as const,
    studentId,
  };

  try {
    let result: OperationResult;
    if (operation === "grant" || operation === "extend") {
      const plan = text(formData, "plan");
      if (!isAccessPlan(plan)) return { message: ACCESS_ERROR_MESSAGE.unknown_plan, status: "error" };
      result = await (operation === "grant" ? grantAccess : extendAccess)({ ...base, plan });
    } else if (operation === "revoke") {
      result = await revokeAccess(base);
    } else if (operation === "pause") {
      result = await pauseAccess(base);
    } else {
      result = await resumeAccess(base);
    }

    revalidatePath(`/admin/enrollment/${studentId}`);
    return { message: successMessage(operation, result), status: "success" };
  } catch (error) {
    if (error instanceof BillingAccessError) {
      return { message: ACCESS_ERROR_MESSAGE[error.code], status: "error" };
    }
    serverLogger.error("billing.access.admin_action_failed", error, { area: "billing", operation: `admin_${operation}` });
    return { message: ACCESS_GENERIC_ERROR, status: "error" };
  }
}

export { manageStudentAccessAction };
