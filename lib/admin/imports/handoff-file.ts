import {
  EnrollmentHandoffMethod,
  EnrollmentHandoffStatus,
  EnrollmentImportOperation,
  EnrollmentImportRowStatus,
  Prisma,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import {
  buildEnrollmentInviteUrl,
  lockHandoff,
  writeHandoffAudit,
} from "@/lib/admin/handoffs/service";
import { openEnrollmentHandoffSecret } from "@/lib/admin/handoffs/envelope";

import { safeImportFilename } from "./contracts";

const MAX_SELECTED_HANDOFFS = 500;

type ReleaseImportHandoffFileInput = {
  actorUserId: string;
  handoffIds: string[];
  importId: string;
};

type ReleaseImportHandoffFileResult = {
  content: string;
  filename: string;
  handoffMethod: EnrollmentHandoffMethod;
  releasedCount: number;
};

type AcknowledgeImportHandoffsInput = {
  actorUserId: string;
  handoffIds: string[];
  importId: string;
};

type AcknowledgeImportHandoffsResult = {
  acknowledgedCount: number;
  importId: string;
};

type HandoffFileErrorCode =
  | "import_not_found"
  | "invalid_selection"
  | "handoff_not_releasable"
  | "handoff_expired"
  | "handoff_account_inactive"
  | "handoff_file_unavailable";

class EnrollmentImportHandoffFileError extends Error {
  readonly code: HandoffFileErrorCode;

  constructor(code: HandoffFileErrorCode, message = code === "import_not_found"
    ? "The import could not be found."
    : code === "invalid_selection"
      ? "The selected handoffs are invalid."
      : code === "handoff_expired"
        ? "One selected handoff has expired and must be reissued."
        : code === "handoff_account_inactive"
          ? "One selected account is not active."
          : code === "handoff_not_releasable"
            ? "One selected handoff is no longer available."
            : "The handoff file could not be generated.") {
    super(message);
    this.name = "EnrollmentImportHandoffFileError";
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function csvEscape(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function formulaSafe(value: string) {
  return /^[=+\-@]/u.test(value) ? `'${value}` : value;
}

function handoffFilename(sourceFilename: string, importId: string) {
  const safe = safeImportFilename(sourceFilename).replace(/\.[^.]+$/u, "");
  const bounded = `${safe || `import-${importId}`}-handoffs.csv`;
  return bounded.slice(0, 180);
}

function validateSelectedHandoffIds(values: string[]) {
  const unique = [...new Set(values)];
  if (
    values.length < 1
    || values.length > MAX_SELECTED_HANDOFFS
    || unique.length !== values.length
    || unique.some((value) => !isUuid(value))
  ) {
    throw new EnrollmentImportHandoffFileError("invalid_selection");
  }
  return unique;
}

async function releaseImportHandoffFile(
  input: ReleaseImportHandoffFileInput,
): Promise<ReleaseImportHandoffFileResult> {
  const handoffIds = validateSelectedHandoffIds(input.handoffIds);

  return prisma.$transaction(async (tx) => {
    const imported = await tx.enrollmentImport.findFirst({
      select: {
        handoffMethod: true,
        id: true,
        sourceFilename: true,
      },
      where: { createdByUserId: input.actorUserId, id: input.importId },
    });
    if (!imported || !imported.handoffMethod) {
      throw new EnrollmentImportHandoffFileError("import_not_found");
    }

    const rows = await tx.enrollmentImportRow.findMany({
      select: {
        handoff: {
          select: {
            id: true,
            method: true,
            status: true,
          },
        },
        handoffId: true,
        id: true,
        inputJson: true,
        operation: true,
        resultUserId: true,
        rowNumber: true,
        status: true,
      },
      where: { handoffId: { in: handoffIds }, importId: input.importId },
      orderBy: { rowNumber: "asc" },
    });
    if (rows.length !== handoffIds.length) {
      throw new EnrollmentImportHandoffFileError("invalid_selection");
    }
    if (rows.some((row) =>
      row.operation !== EnrollmentImportOperation.create
      || row.status !== EnrollmentImportRowStatus.created
      || !row.handoffId
      || !row.resultUserId
      || !row.handoff
      || row.handoff.method !== imported.handoffMethod
      || row.handoff.status !== EnrollmentHandoffStatus.pending
    )) {
      throw new EnrollmentImportHandoffFileError("invalid_selection");
    }

    const now = new Date();
    const released = await Promise.all(rows.map(async (row) => {
      if (!row.handoffId || !row.resultUserId) {
        throw new EnrollmentImportHandoffFileError("invalid_selection");
      }
      const handoff = await lockHandoff(tx, row.handoffId);
      if (!handoff || handoff.status !== EnrollmentHandoffStatus.pending || !handoff.secret_envelope) {
        throw new EnrollmentImportHandoffFileError("handoff_not_releasable");
      }
      if (
        handoff.user_status !== UserStatus.active
        || handoff.soft_deleted_at !== null
        || isManagedPreviewPurpose(handoff.preview_purpose)
      ) {
        throw new EnrollmentImportHandoffFileError("handoff_account_inactive");
      }
      if (
        handoff.method === EnrollmentHandoffMethod.invite_link
        && (handoff.expires_at === null || handoff.expires_at <= now)
      ) {
        throw new EnrollmentImportHandoffFileError("handoff_expired");
      }
      let secret: string;
      try {
        secret = openEnrollmentHandoffSecret(handoff.secret_envelope, {
          handoffId: handoff.id,
          method: handoff.method,
          userId: handoff.user_id,
        });
      } catch {
        throw new EnrollmentImportHandoffFileError("handoff_file_unavailable");
      }
      const user = await tx.user.findUnique({
        select: { email: true, fullName: true },
        where: { id: row.resultUserId },
      });
      if (!user) throw new EnrollmentImportHandoffFileError("invalid_selection");
      const updated = await tx.enrollmentHandoff.updateMany({
        data: {
          releasedAt: now,
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.released,
        },
        where: {
          id: handoff.id,
          secretEnvelope: { not: Prisma.DbNull },
          status: EnrollmentHandoffStatus.pending,
          user: { previewPurpose: null },
        },
      });
      if (updated.count !== 1) throw new EnrollmentImportHandoffFileError("handoff_not_releasable");
      await writeHandoffAudit({
        action: "enrollment_handoff.released",
        actorUserId: input.actorUserId,
        handoffId: handoff.id,
        metadata: { method: handoff.method, source: "import_file" },
        tx,
        userId: handoff.user_id,
      });
      return {
        email: user.email,
        fullName: user.fullName,
        handoffId: handoff.id,
        secret,
      };
    }));

    const header = imported.handoffMethod === EnrollmentHandoffMethod.invite_link
      ? ["email", "full_name", "invite_url"]
      : ["email", "full_name", "temporary_password"];
    const lines = [header.map(csvEscape).join(",")];
    for (const row of released) {
      const credential = imported.handoffMethod === EnrollmentHandoffMethod.invite_link
        ? buildEnrollmentInviteUrl(row.secret)
        : row.secret;
      lines.push([
        formulaSafe(row.email),
        formulaSafe(row.fullName),
        formulaSafe(credential),
      ].map(csvEscape).join(","));
    }
    await tx.auditLog.create({
      data: {
        action: "enrollment_import.handoff_file_released",
        actorUserId: input.actorUserId,
        metadata: {
          importId: input.importId,
          releasedCount: released.length,
        } as Prisma.InputJsonValue,
        targetId: input.importId,
        targetType: "enrollment_import",
      },
    });
    return {
      content: `${lines.join("\r\n")}\r\n`,
      filename: handoffFilename(imported.sourceFilename, imported.id),
      handoffMethod: imported.handoffMethod,
      releasedCount: released.length,
    };
  });
}

async function acknowledgeImportHandoffs(
  input: AcknowledgeImportHandoffsInput,
): Promise<AcknowledgeImportHandoffsResult> {
  const handoffIds = validateSelectedHandoffIds(input.handoffIds);

  return prisma.$transaction(async (tx) => {
    const imported = await tx.enrollmentImport.findFirst({
      select: { id: true },
      where: { createdByUserId: input.actorUserId, id: input.importId },
    });
    if (!imported) {
      throw new EnrollmentImportHandoffFileError("import_not_found");
    }

    const rows = await tx.enrollmentImportRow.findMany({
      select: {
        handoff: {
          select: {
            acknowledgedAt: true,
            id: true,
            status: true,
            user: { select: { previewPurpose: true } },
          },
        },
        handoffId: true,
      },
      where: { handoffId: { in: handoffIds }, importId: input.importId },
    });
    if (rows.length !== handoffIds.length || rows.some((row) => !row.handoff || row.handoffId === null)) {
      throw new EnrollmentImportHandoffFileError("invalid_selection");
    }
    if (rows.some((row) => row.handoff?.status !== EnrollmentHandoffStatus.released)) {
      throw new EnrollmentImportHandoffFileError("handoff_not_releasable");
    }
    if (rows.some((row) => isManagedPreviewPurpose(row.handoff?.user.previewPurpose))) {
      throw new EnrollmentImportHandoffFileError("handoff_account_inactive");
    }

    const acknowledgedAt = new Date();
    const acknowledgementResults = await Promise.all(rows.map(async (row) => {
      if (!row.handoffId || row.handoff?.acknowledgedAt) return 0;
      const updated = await tx.enrollmentHandoff.updateMany({
        data: { acknowledgedAt },
        where: {
          acknowledgedAt: null,
          id: row.handoffId,
          status: EnrollmentHandoffStatus.released,
          user: { previewPurpose: null },
        },
      });
      if (updated.count !== 1) return 0;
      await writeHandoffAudit({
        action: "enrollment_handoff.acknowledged",
        actorUserId: input.actorUserId,
        handoffId: row.handoffId,
        metadata: { source: "import_file" },
        tx,
      });
      return 1;
    }));
    const acknowledgedCount = acknowledgementResults.reduce<number>((total, result) => total + result, 0);

    return { acknowledgedCount, importId: input.importId };
  });
}

export {
  EnrollmentImportHandoffFileError,
  MAX_SELECTED_HANDOFFS,
  acknowledgeImportHandoffs,
  csvEscape,
  formulaSafe,
  releaseImportHandoffFile,
  validateSelectedHandoffIds,
};

export type {
  HandoffFileErrorCode,
  AcknowledgeImportHandoffsInput,
  AcknowledgeImportHandoffsResult,
  ReleaseImportHandoffFileInput,
  ReleaseImportHandoffFileResult,
};
