import {
  EnrollmentHandoffMethod,
  EnrollmentHandoffStatus,
  EnrollmentImportDispatchStatus,
  EnrollmentImportOperation,
  EnrollmentImportRole,
  EnrollmentImportRowStatus,
  EnrollmentImportStatus,
  Prisma,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/admin/operations/validation";

import {
  CsvContractError,
  MAX_DATA_ROWS,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_REQUEST_BYTES,
  getImportTemplateDefinition,
  isImportIdUuid,
  parseBoundedCsv,
  safeImportFilename,
  sha256Hex,
  truncateCodePoints,
} from "./contracts";
import type {
  ImportTemplateDefinition,
  ImportTemplateVersion,
  NormalizedImportInput,
  ParsedCsvRecord,
} from "./contracts";
import { buildImportJobId } from "./job-id";

const PREVIEW_METADATA_KEY = "__preview";

type ImportPreviewErrorCode =
  | "ambiguous_exam"
  | "ambiguous_existing_user"
  | "csv_empty_file"
  | "csv_header_mismatch"
  | "csv_invalid_utf8"
  | "csv_malformed"
  | "csv_row_limit"
  | "duplicate_email_in_file"
  | "exam_not_found"
  | "field_contains_control_character"
  | "field_too_long"
  | "inactive_account"
  | "import_not_draft"
  | "invalid_handoff_method"
  | "invalid_import_role"
  | "invalid_import_template"
  | "invalid_import_state"
  | "invalid_rows_pending_skip"
  | "invalid_email"
  | "invalid_role"
  | "invalid_template"
  | "missing_required_field"
  | "managed_preview_fixture"
  | "multipart_invalid"
  | "opposite_role"
  | "request_too_large"
  | "revoked_role"
  | "role_conflict"
  | "soft_deleted_user"
  | "rows_required"
  | "row_selection_invalid"
  | "import_not_found";

const ERROR_MESSAGES: Readonly<Record<ImportPreviewErrorCode | "column_count_mismatch", string>> = {
  ambiguous_exam: "More than one active exam matches this name.",
  ambiguous_existing_user: "More than one account matches this email.",
  column_count_mismatch: "The row has the wrong number of columns.",
  csv_empty_file: "The CSV must include a header and at least one data row.",
  csv_header_mismatch: "The CSV header does not match the selected template.",
  csv_invalid_utf8: "The CSV must be valid UTF-8.",
  csv_malformed: "The CSV contains malformed quoted data.",
  csv_row_limit: "The CSV contains more than 500 data rows.",
  duplicate_email_in_file: "This email appears more than once in the CSV.",
  exam_not_found: "No active exam matches this name.",
  field_contains_control_character: "A field contains an unsupported control character.",
  field_too_long: "A field exceeds the allowed length.",
  inactive_account: "The matching account is not active.",
  import_not_draft: "This draft is no longer editable.",
  invalid_handoff_method: "Choose a supported handoff method.",
  invalid_import_role: "The import role is invalid.",
  invalid_import_template: "The import template is invalid for this role.",
  invalid_import_state: "This import is not ready for confirmation.",
  invalid_rows_pending_skip: "Every invalid row must be explicitly skipped before confirmation.",
  invalid_email: "Enter a valid email address.",
  invalid_role: "Choose a supported import role.",
  invalid_template: "Choose a supported import template.",
  missing_required_field: "A required field is missing.",
  managed_preview_fixture: "Managed preview fixtures cannot be changed through enrollment imports.",
  multipart_invalid: "The multipart request is invalid.",
  opposite_role: "The email belongs to an account with the opposite role.",
  request_too_large: "The upload exceeds the 2 MiB request limit.",
  revoked_role: "The matching role assignment is revoked.",
  role_conflict: "The email cannot be used for this role.",
  soft_deleted_user: "The matching account has been deleted.",
  rows_required: "Select at least one invalid row.",
  row_selection_invalid: "The selected rows are invalid.",
  import_not_found: "The import could not be found.",
};

class EnrollmentImportPreviewError extends Error {
  readonly code: ImportPreviewErrorCode;

  constructor(code: ImportPreviewErrorCode, message = ERROR_MESSAGES[code]) {
    super(message);
    this.name = "EnrollmentImportPreviewError";
    this.code = code;
  }
}

type PreviewEnrollmentImportInput = {
  actorUserId: string;
  csv: Uint8Array | string;
  sourceFilename?: string | null;
  template: ImportTemplateVersion | string;
};

type PersistParsedEnrollmentImportInput = {
  actorUserId: string;
  contentHash: string;
  records: ParsedCsvRecord[];
  sourceFilename?: string | null;
  template: ImportTemplateVersion | string;
};

type PreviewRoleSnapshot = {
  assignmentId: string;
  assignedAt: string;
  revokedAt: string | null;
  role: RoleName;
};

type PreviewMetadata = {
  matchedUserRole: EnrollmentImportRole | null;
  matchedUserRoleAssignmentId: string | null;
  matchedUserRoleSnapshot: PreviewRoleSnapshot[];
  matchedUserSoftDeletedAt: string | null;
  matchedUserStatus: UserStatus | null;
  targetExamEventId: string | null;
};

type ExistingUser = {
  email: string;
  id: string;
  previewPurpose?: string | null;
  status: UserStatus;
  softDeletedAt: Date | null;
  updatedAt: Date;
  roleAssignments: Array<{
    assignedAt: Date;
    id: string;
    revokedAt: Date | null;
    role: RoleName;
  }>;
};

type ExamEventReference = {
  id: string;
  name: string;
};

type EvaluatedPreviewRow = {
  errorCode: string | null;
  errorMessage: string | null;
  inputJson: Prisma.InputJsonValue;
  matchedUserId: string | null;
  matchedUserUpdatedAt: Date | null;
  normalizedEmail: string;
  operation: EnrollmentImportOperation;
  rowNumber: number;
  status: EnrollmentImportRowStatus;
};

type ImportRowDto = {
  errorCode: string | null;
  errorMessage: string | null;
  handoffAcknowledgedAt: string | null;
  handoffExpiresAt: string | null;
  handoffId: string | null;
  handoffMethod: EnrollmentHandoffMethod | null;
  handoffStatus: EnrollmentHandoffStatus | null;
  input: NormalizedImportInput;
  matchedUserUpdatedAt: string | null;
  normalizedEmail: string;
  operation: EnrollmentImportOperation;
  rowId: string;
  rowNumber: number;
  status: EnrollmentImportRowStatus;
};

type ImportStatusDto = {
  canConfirm: boolean;
  contentHash: string;
  counts: {
    created: number;
    create: number;
    failed: number;
    invalid: number;
    pending: number;
    processing: number;
    skipped: number;
    total: number;
    updated: number;
    update: number;
  };
  createdAt: string;
  dispatch: {
    generation: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    nextAttemptAt: string | null;
    status: EnrollmentImportDispatchStatus;
  } | null;
  dispatchGeneration: number;
  handoffMethod: EnrollmentHandoffMethod | null;
  importId: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHeartbeatAt: string | null;
  role: EnrollmentImportRole;
  rowCount: number;
  rows: ImportRowDto[];
  sourceFilename: string;
  status: EnrollmentImportStatus;
  templateVersion: string;
  updatedAt: string;
};

type ConfirmEnrollmentImportInput = {
  actorUserId: string;
  handoffMethod: EnrollmentHandoffMethod;
  importId: string;
};

type ConfirmEnrollmentImportResult = {
  counts: {
    created: number;
    failed: number;
    invalid: number;
    pending: number;
    processing: number;
    skipped: number;
    total: number;
    updated: number;
  };
  handoffMethod: EnrollmentHandoffMethod;
  idempotent: boolean;
  importId: string;
  generation: number;
  queueJobId: string;
  status: EnrollmentImportStatus;
};

type CancelEnrollmentImportInput = {
  actorUserId: string;
  importId: string;
};

type CancelEnrollmentImportResult = {
  cancelledAt: string;
  idempotent: boolean;
  importId: string;
  status: EnrollmentImportStatus;
};

class EnrollmentImportCancellationError extends Error {
  readonly code: "import_not_found" | "invalid_import_state";

  constructor(
    code: EnrollmentImportCancellationError["code"],
    message = code === "import_not_found"
      ? "The import could not be found."
      : "Only a draft import can be cancelled.",
  ) {
    super(message);
    this.name = "EnrollmentImportCancellationError";
    this.code = code;
  }
}

function jsonValue(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function errorMessage(code: string | null) {
  if (!code) {
    return null;
  }
  const message = ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES] ?? "This row needs review.";
  return truncateCodePoints(message, MAX_ERROR_MESSAGE_LENGTH);
}

function toCsvBytes(value: Uint8Array | string) {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  return new Uint8Array(value);
}

function roleSnapshot(user: ExistingUser | null): PreviewRoleSnapshot[] {
  return user?.roleAssignments.map((assignment) => ({
    assignmentId: assignment.id,
    assignedAt: assignment.assignedAt.toISOString(),
    revokedAt: assignment.revokedAt?.toISOString() ?? null,
    role: assignment.role,
  })) ?? [];
}

function metadataFor({
  existingUser,
  role,
  targetExamEventId,
}: {
  existingUser: ExistingUser | null;
  role: EnrollmentImportRole;
  targetExamEventId: string | null;
}): PreviewMetadata {
  const matchingAssignment = existingUser?.roleAssignments.find(
    (assignment) => assignment.role === role && assignment.revokedAt === null,
  );

  return {
    matchedUserRole: matchingAssignment
      ? matchingAssignment.role === RoleName.student
        ? EnrollmentImportRole.student
        : EnrollmentImportRole.tutor
      : null,
    matchedUserRoleAssignmentId: matchingAssignment?.id ?? null,
    matchedUserRoleSnapshot: roleSnapshot(existingUser),
    matchedUserSoftDeletedAt: existingUser?.softDeletedAt?.toISOString() ?? null,
    matchedUserStatus: existingUser?.status ?? null,
    targetExamEventId,
  };
}

function withMetadata(input: NormalizedImportInput, metadata: PreviewMetadata) {
  return jsonValue({
    ...input,
    [PREVIEW_METADATA_KEY]: metadata,
  });
}

function examKey(name: string) {
  return name.trim().normalize("NFKC").toLowerCase();
}

function evaluateExistingUser(
  existingUsers: ExistingUser[],
  role: EnrollmentImportRole,
) {
  if (existingUsers.length > 1) {
    return { errorCode: "ambiguous_existing_user", operation: EnrollmentImportOperation.none, user: null } as const;
  }

  const user = existingUsers[0] ?? null;
  if (!user) {
    return { errorCode: null, operation: EnrollmentImportOperation.create, user: null } as const;
  }
  if (user.softDeletedAt !== null || user.status === UserStatus.soft_deleted) {
    return { errorCode: "soft_deleted_user", operation: EnrollmentImportOperation.none, user } as const;
  }
  if (user.previewPurpose != null) {
    return { errorCode: "managed_preview_fixture", operation: EnrollmentImportOperation.none, user } as const;
  }
  if (user.status !== UserStatus.active) {
    return { errorCode: "inactive_account", operation: EnrollmentImportOperation.none, user } as const;
  }

  const activeSameRole = user.roleAssignments.find(
    (assignment) => assignment.revokedAt === null && assignment.role === role,
  );
  if (activeSameRole) {
    return { errorCode: null, operation: EnrollmentImportOperation.update, user } as const;
  }

  const oppositeRole = role === EnrollmentImportRole.student ? RoleName.tutor : RoleName.student;
  if (user.roleAssignments.some((assignment) => assignment.revokedAt === null && assignment.role === oppositeRole)) {
    return { errorCode: "opposite_role", operation: EnrollmentImportOperation.none, user } as const;
  }
  if (user.roleAssignments.some((assignment) => assignment.revokedAt !== null && assignment.role === role)) {
    return { errorCode: "revoked_role", operation: EnrollmentImportOperation.none, user } as const;
  }
  if (user.roleAssignments.some((assignment) => assignment.revokedAt !== null && assignment.role === oppositeRole)) {
    return { errorCode: "revoked_role", operation: EnrollmentImportOperation.none, user } as const;
  }
  return { errorCode: "role_conflict", operation: EnrollmentImportOperation.none, user } as const;
}

function evaluatePreviewRows({
  definition,
  records,
  existingUsers,
  examEvents,
}: {
  definition: ImportTemplateDefinition;
  examEvents: ExamEventReference[];
  existingUsers: ExistingUser[];
  records: ParsedCsvRecord[];
}) {
  const usersByEmail = new Map<string, ExistingUser[]>();
  for (const user of existingUsers) {
    const email = user.email.toLowerCase();
    const current = usersByEmail.get(email) ?? [];
    current.push(user);
    usersByEmail.set(email, current);
  }

  const emailCounts = new Map<string, number>();
  for (const record of records) {
    const email = record.input.email;
    if (email) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }

  const eventsByName = new Map<string, ExamEventReference[]>();
  for (const event of examEvents) {
    const key = examKey(event.name);
    const current = eventsByName.get(key) ?? [];
    current.push(event);
    eventsByName.set(key, current);
  }

  return records.map((record): EvaluatedPreviewRow => {
    const duplicateEmail = record.input.email && (emailCounts.get(record.input.email) ?? 0) > 1;
    const candidates = record.input.email ? usersByEmail.get(record.input.email) ?? [] : [];
    const userEvaluation = evaluateExistingUser(candidates, definition.role);
    let rowError = duplicateEmail ? "duplicate_email_in_file" : record.validationError;
    let targetExamEventId: string | null = null;

    if (!rowError && definition.role === EnrollmentImportRole.student && "target_exam" in record.input && record.input.target_exam) {
      const matchingEvents = eventsByName.get(examKey(record.input.target_exam)) ?? [];
      if (matchingEvents.length === 0) {
        rowError = "exam_not_found";
      } else if (matchingEvents.length !== 1) {
        rowError = "ambiguous_exam";
      } else {
        targetExamEventId = matchingEvents[0].id;
      }
    }

    if (!rowError && userEvaluation.errorCode) {
      rowError = userEvaluation.errorCode;
    }

    const operation = rowError ? EnrollmentImportOperation.none : userEvaluation.operation;
    const status = rowError ? EnrollmentImportRowStatus.invalid : EnrollmentImportRowStatus.pending;
    const existingUser = userEvaluation.user;
    const metadata = metadataFor({
      existingUser,
      role: definition.role,
      targetExamEventId,
    });

    return {
      errorCode: rowError,
      errorMessage: errorMessage(rowError),
      inputJson: withMetadata(record.input, metadata),
      matchedUserId: existingUser?.id ?? null,
      matchedUserUpdatedAt: existingUser?.updatedAt ?? null,
      normalizedEmail: record.input.email,
      operation,
      rowNumber: record.rowNumber,
      status,
    };
  });
}

async function persistParsedEnrollmentImport(input: PersistParsedEnrollmentImportInput) {
  const definition = getImportTemplateDefinition(input.template);
  if (!definition) {
    throw new EnrollmentImportPreviewError("invalid_template");
  }

  if (input.records.length > MAX_DATA_ROWS) {
    throw new EnrollmentImportPreviewError("csv_row_limit");
  }

  const emailSet = new Set<string>();
  for (const record of input.records) {
    const email = record.input.email;
    if (email) {
      emailSet.add(email);
    }
  }
  const emails = [...emailSet];
  const examNames = definition.role === EnrollmentImportRole.student
    ? [...new Set(input.records.map((record) => "target_exam" in record.input ? record.input.target_exam : null).filter((value): value is string => Boolean(value)))]
    : [];
  const sourceFilename = safeImportFilename(input.sourceFilename);

  return prisma.$transaction(async (tx) => {
    const existingUsers = emails.length === 0
      ? []
      : await tx.user.findMany({
        select: {
          email: true,
          id: true,
          previewPurpose: true,
          roleAssignments: {
            orderBy: { assignedAt: "desc" },
            select: { assignedAt: true, id: true, revokedAt: true, role: true },
          },
          softDeletedAt: true,
          status: true,
          updatedAt: true,
        },
        where: { email: { in: emails, mode: "insensitive" } },
      });

    const examEvents = examNames.length === 0
      ? []
      : await tx.examEvent.findMany({
        select: { id: true, name: true },
        where: {
          isActive: true,
          OR: examNames.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
        },
      });

    const evaluatedRows = evaluatePreviewRows({
      definition,
      examEvents,
      existingUsers,
      records: input.records,
    });

    const draft = await tx.enrollmentImport.create({
      data: {
        contentHash: input.contentHash,
        createdByUserId: input.actorUserId,
        role: definition.role,
        rowCount: evaluatedRows.length,
        sourceFilename,
        templateVersion: definition.version,
        rows: {
          createMany: {
            data: evaluatedRows.map((row) => ({
              errorCode: row.errorCode,
              errorMessage: row.errorMessage,
              inputJson: row.inputJson,
              matchedUserId: row.matchedUserId,
              matchedUserUpdatedAt: row.matchedUserUpdatedAt,
              normalizedEmail: row.normalizedEmail,
              operation: row.operation,
              rowNumber: row.rowNumber,
              status: row.status,
            })),
          },
        },
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        action: "enrollment_import.preview_created",
        actorUserId: input.actorUserId,
        metadata: jsonValue({
          contentHash: input.contentHash,
          invalidCount: evaluatedRows.filter((row) => row.status === EnrollmentImportRowStatus.invalid).length,
          role: definition.role,
          rowCount: evaluatedRows.length,
          templateVersion: definition.version,
        }),
        targetId: draft.id,
        targetType: "enrollment_import",
      },
    });

    return getEnrollmentImportStatus({ actorUserId: input.actorUserId, importId: draft.id, tx });
  });
}

async function previewEnrollmentImport(input: PreviewEnrollmentImportInput) {
  const definition = getImportTemplateDefinition(input.template);
  if (!definition) {
    throw new EnrollmentImportPreviewError("invalid_template");
  }

  const bytes = toCsvBytes(input.csv);
  if (bytes.byteLength > MAX_REQUEST_BYTES) {
    throw new EnrollmentImportPreviewError("request_too_large");
  }

  let records: ParsedCsvRecord[];
  try {
    records = parseBoundedCsv(bytes, definition);
  } catch (error) {
    if (error instanceof CsvContractError) {
      const code = error.code === "csv_request_too_large"
        ? "request_too_large"
        : error.code;
      throw new EnrollmentImportPreviewError(code);
    }
    throw error;
  }

  return persistParsedEnrollmentImport({
    actorUserId: input.actorUserId,
    contentHash: sha256Hex(bytes),
    records,
    sourceFilename: input.sourceFilename,
    template: definition.version,
  });
}

function stripPreviewMetadata(value: Prisma.JsonValue): NormalizedImportInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { email: "", full_name: "" } as NormalizedImportInput;
  }
  const input = { ...(value as Record<string, unknown>) };
  delete input[PREVIEW_METADATA_KEY];
  return input as NormalizedImportInput;
}

function buildStatusDto(record: {
  contentHash: string;
  createdAt: Date;
  dispatchGeneration: number;
  handoffMethod: EnrollmentHandoffMethod | null;
  dispatches: Array<{
    generation: number;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    nextAttemptAt: Date | null;
    status: EnrollmentImportDispatchStatus;
  }>;
  id: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastHeartbeatAt: Date | null;
  role: EnrollmentImportRole;
  rowCount: number;
  rows: Array<{
    errorCode: string | null;
    errorMessage: string | null;
    handoff: {
      acknowledgedAt: Date | null;
      expiresAt: Date | null;
      method: EnrollmentHandoffMethod;
      status: EnrollmentHandoffStatus;
    } | null;
    handoffId: string | null;
    id: string;
    inputJson: Prisma.JsonValue;
    matchedUserUpdatedAt: Date | null;
    normalizedEmail: string;
    operation: EnrollmentImportOperation;
    rowNumber: number;
    status: EnrollmentImportRowStatus;
  }>;
  sourceFilename: string;
  status: EnrollmentImportStatus;
  templateVersion: string;
  updatedAt: Date;
}): ImportStatusDto {
  const counts = {
    created: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.created).length,
    create: record.rows.filter((row) => row.operation === EnrollmentImportOperation.create).length,
    failed: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.failed).length,
    invalid: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.invalid).length,
    pending: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.pending).length,
    processing: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.processing).length,
    skipped: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.skipped).length,
    total: record.rows.length,
    updated: record.rows.filter((row) => row.status === EnrollmentImportRowStatus.updated).length,
    update: record.rows.filter((row) => row.operation === EnrollmentImportOperation.update).length,
  };

  return {
    canConfirm: record.status === EnrollmentImportStatus.draft && counts.invalid === 0,
    contentHash: record.contentHash,
    counts,
    createdAt: record.createdAt.toISOString(),
    dispatch: record.dispatches[0]
      ? {
        generation: record.dispatches[0].generation,
        lastErrorCode: record.dispatches[0].lastErrorCode,
        lastErrorMessage: record.dispatches[0].lastErrorMessage,
        nextAttemptAt: record.dispatches[0].nextAttemptAt?.toISOString() ?? null,
        status: record.dispatches[0].status,
      }
      : null,
    dispatchGeneration: record.dispatchGeneration,
    handoffMethod: record.handoffMethod,
    importId: record.id,
    lastErrorCode: record.lastErrorCode,
    lastErrorMessage: record.lastErrorMessage,
    lastHeartbeatAt: record.lastHeartbeatAt?.toISOString() ?? null,
    role: record.role,
    rowCount: record.rowCount,
    rows: record.rows.map((row) => ({
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      handoffAcknowledgedAt: row.handoff?.acknowledgedAt?.toISOString() ?? null,
      handoffExpiresAt: row.handoff?.expiresAt?.toISOString() ?? null,
      handoffId: row.handoffId,
      handoffMethod: row.handoff?.method ?? null,
      handoffStatus: row.handoff?.status ?? null,
      input: stripPreviewMetadata(row.inputJson),
      matchedUserUpdatedAt: row.matchedUserUpdatedAt?.toISOString() ?? null,
      normalizedEmail: row.normalizedEmail,
      operation: row.operation,
      rowId: row.id,
      rowNumber: row.rowNumber,
      status: row.status,
    })),
    sourceFilename: record.sourceFilename,
    status: record.status,
    templateVersion: record.templateVersion,
    updatedAt: record.updatedAt.toISOString(),
  };
}

type StatusTransaction = Pick<typeof prisma, "enrollmentImport">;

async function getEnrollmentImportStatus({
  actorUserId,
  importId,
  tx = prisma,
}: {
  actorUserId: string;
  importId: string;
  tx?: StatusTransaction;
}): Promise<ImportStatusDto> {
  const record = await tx.enrollmentImport.findFirst({
    include: {
      dispatches: {
        orderBy: { generation: "desc" },
        select: {
          generation: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          nextAttemptAt: true,
          status: true,
        },
        take: 1,
      },
      rows: {
        orderBy: { rowNumber: "asc" },
        select: {
          errorCode: true,
          errorMessage: true,
          handoff: {
            select: {
              acknowledgedAt: true,
              expiresAt: true,
              method: true,
              status: true,
            },
          },
          handoffId: true,
          id: true,
          inputJson: true,
          matchedUserUpdatedAt: true,
          normalizedEmail: true,
          operation: true,
          rowNumber: true,
          status: true,
        },
      },
    },
    where: { createdByUserId: actorUserId, id: importId },
  });

  if (!record) {
    throw new EnrollmentImportPreviewError("import_not_found");
  }

  return buildStatusDto(record);
}

type SkipInvalidRowsInput = {
  actorUserId: string;
  importId: string;
  rowIds?: string[];
  rowNumbers?: number[];
};

async function skipInvalidEnrollmentImportRows(input: SkipInvalidRowsInput) {
  const rowIds = input.rowIds ?? [];
  const rowNumbers = input.rowNumbers ?? [];
  if (!Array.isArray(rowIds) || !Array.isArray(rowNumbers)) {
    throw new EnrollmentImportPreviewError("row_selection_invalid");
  }
  const duplicateRowIds = new Set(rowIds).size !== rowIds.length;
  const duplicateRowNumbers = new Set(rowNumbers).size !== rowNumbers.length;
  if (
    duplicateRowIds
    || duplicateRowNumbers
    || rowIds.some((value) => typeof value !== "string" || !isUuid(value))
    || rowNumbers.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > MAX_DATA_ROWS)
  ) {
    throw new EnrollmentImportPreviewError("row_selection_invalid");
  }
  if (!rowIds.length && !rowNumbers.length) {
    throw new EnrollmentImportPreviewError("rows_required");
  }
  if (rowIds.length > 0 && rowNumbers.length > 0) {
    throw new EnrollmentImportPreviewError("row_selection_invalid");
  }
  if (rowIds.length + rowNumbers.length > MAX_DATA_ROWS) {
    throw new EnrollmentImportPreviewError("row_selection_invalid");
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.enrollmentImport.findFirst({
      select: { id: true, status: true },
      where: { createdByUserId: input.actorUserId, id: input.importId },
    });
    if (!record) {
      throw new EnrollmentImportPreviewError("import_not_found");
    }
    if (record.status !== EnrollmentImportStatus.draft) {
      throw new EnrollmentImportPreviewError("import_not_draft");
    }

    const selected = await tx.enrollmentImportRow.findMany({
      select: { id: true, status: true },
      where: {
        importId: input.importId,
        OR: [
          ...(rowIds.length ? [{ id: { in: rowIds } }] : []),
          ...(rowNumbers.length ? [{ rowNumber: { in: rowNumbers } }] : []),
        ],
      },
    });
    if (selected.length !== rowIds.length + rowNumbers.length || selected.some((row) => row.status !== EnrollmentImportRowStatus.invalid)) {
      throw new EnrollmentImportPreviewError("row_selection_invalid");
    }

    const updated = await tx.enrollmentImportRow.updateMany({
      data: { status: EnrollmentImportRowStatus.skipped },
      where: {
        importId: input.importId,
        status: EnrollmentImportRowStatus.invalid,
        id: { in: selected.map((row) => row.id) },
      },
    });

    if (updated.count !== selected.length) {
      throw new EnrollmentImportPreviewError("row_selection_invalid");
    }

    await tx.auditLog.create({
      data: {
        action: "enrollment_import.invalid_rows_skipped",
        actorUserId: input.actorUserId,
        metadata: jsonValue({ importId: input.importId, skippedCount: updated.count }),
        targetId: input.importId,
        targetType: "enrollment_import",
      },
    });

    return getEnrollmentImportStatus({ actorUserId: input.actorUserId, importId: input.importId, tx });
  });
}

class EnrollmentImportConfirmationError extends Error {
  readonly code: Extract<ImportPreviewErrorCode,
    | "import_not_found"
    | "invalid_handoff_method"
    | "invalid_import_role"
    | "invalid_import_template"
    | "invalid_import_state"
    | "invalid_rows_pending_skip"
    | "import_not_draft"
  >;

  constructor(
    code: EnrollmentImportConfirmationError["code"],
    message = ERROR_MESSAGES[code],
  ) {
    super(message);
    this.name = "EnrollmentImportConfirmationError";
    this.code = code;
  }
}

type LockedImport = {
  id: string;
  role: EnrollmentImportRole;
  status: EnrollmentImportStatus;
  source_filename: string;
  template_version: string;
  row_count: number;
  handoff_method: EnrollmentHandoffMethod | null;
  created_by_user_id: string;
  confirmed_by_user_id: string | null;
  dispatch_generation: number;
};

type ImportRowCount = {
  status: EnrollmentImportRowStatus;
  count: number;
};

function emptyConfirmCounts(): ConfirmEnrollmentImportResult["counts"] {
  return {
    created: 0,
    failed: 0,
    invalid: 0,
    pending: 0,
    processing: 0,
    skipped: 0,
    total: 0,
    updated: 0,
  };
}

function countConfirmRows(rows: ImportRowCount[]) {
  const counts = emptyConfirmCounts();
  for (const row of rows) {
    counts.total += row.count;
    if (row.status === EnrollmentImportRowStatus.created) counts.created += row.count;
    if (row.status === EnrollmentImportRowStatus.updated) counts.updated += row.count;
    if (row.status === EnrollmentImportRowStatus.failed) counts.failed += row.count;
    if (row.status === EnrollmentImportRowStatus.invalid) counts.invalid += row.count;
    if (row.status === EnrollmentImportRowStatus.pending) counts.pending += row.count;
    if (row.status === EnrollmentImportRowStatus.processing) counts.processing += row.count;
    if (row.status === EnrollmentImportRowStatus.skipped) counts.skipped += row.count;
  }
  return counts;
}

function isSupportedHandoffMethod(value: unknown): value is EnrollmentHandoffMethod {
  return value === EnrollmentHandoffMethod.invite_link
    || value === EnrollmentHandoffMethod.temporary_password;
}

function expectedTemplateForRole(role: EnrollmentImportRole) {
  return role === EnrollmentImportRole.student ? "students.v1" : "kapten.v1";
}

/**
 * Cancel an abandoned draft without touching accounts or open handoffs.
 * completedAt is the shared terminal timestamp used by retention cleanup;
 * cancellation is intentionally limited to pre-confirmation drafts.
 */
async function cancelEnrollmentImport(
  input: CancelEnrollmentImportInput,
): Promise<CancelEnrollmentImportResult> {
  if (!isImportIdUuid(input.importId)) {
    throw new EnrollmentImportCancellationError("import_not_found");
  }

  return prisma.$transaction(async (tx) => {
    const imports = await tx.$queryRaw<Array<{
      completed_at: Date | null;
      id: string;
      status: EnrollmentImportStatus;
    }>>`
      SELECT id, status, completed_at
      FROM enrollment_imports
      WHERE id = ${input.importId}::uuid
        AND created_by_user_id = ${input.actorUserId}::uuid
      FOR UPDATE
    `;
    const imported = imports[0];
    if (!imported) {
      throw new EnrollmentImportCancellationError("import_not_found");
    }

    if (imported.status === EnrollmentImportStatus.cancelled) {
      const terminalAt = imported.completed_at ?? new Date();
      if (!imported.completed_at) {
        await tx.enrollmentImport.update({
          data: { completedAt: terminalAt },
          where: { id: imported.id },
        });
      }
      return {
        cancelledAt: terminalAt.toISOString(),
        idempotent: true,
        importId: imported.id,
        status: EnrollmentImportStatus.cancelled,
      };
    }
    if (imported.status !== EnrollmentImportStatus.draft) {
      throw new EnrollmentImportCancellationError("invalid_import_state");
    }

    const cancelledAt = new Date();
    await tx.enrollmentImport.update({
      data: {
        completedAt: cancelledAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        status: EnrollmentImportStatus.cancelled,
      },
      where: { id: imported.id },
    });
    await tx.auditLog.create({
      data: {
        action: "enrollment_import.cancelled",
        actorUserId: input.actorUserId,
        metadata: jsonValue({ importId: imported.id }),
        targetId: imported.id,
        targetType: "enrollment_import",
      },
    });

    return {
      cancelledAt: cancelledAt.toISOString(),
      idempotent: false,
      importId: imported.id,
      status: EnrollmentImportStatus.cancelled,
    };
  });
}

async function confirmEnrollmentImport(input: ConfirmEnrollmentImportInput): Promise<ConfirmEnrollmentImportResult> {
  if (!isSupportedHandoffMethod(input.handoffMethod)) {
    throw new EnrollmentImportConfirmationError("invalid_handoff_method");
  }
  if (!isImportIdUuid(input.importId)) {
    throw new EnrollmentImportConfirmationError("import_not_found");
  }

  return prisma.$transaction(async (tx) => {
    const imports = await tx.$queryRaw<LockedImport[]>`
      SELECT
        id,
        role,
        status,
        source_filename,
        template_version,
        row_count,
        handoff_method,
        created_by_user_id,
        confirmed_by_user_id,
        dispatch_generation
      FROM enrollment_imports
      WHERE id = ${input.importId}::uuid
        AND created_by_user_id = ${input.actorUserId}::uuid
      FOR UPDATE
    `;
    const imported = imports[0];

    if (!imported) {
      // Ownership is deliberately folded into not-found so an arbitrary
      // import ID cannot disclose another admin's draft or status.
      throw new EnrollmentImportConfirmationError("import_not_found");
    }

    const existingDispatch = await tx.enrollmentImportDispatch.findFirst({
      orderBy: { generation: "desc" },
      select: {
        id: true,
        generation: true,
        queueJobId: true,
      },
      where: { importId: imported.id },
    });

    if (
      imported.status === EnrollmentImportStatus.queued
      || imported.status === EnrollmentImportStatus.processing
    ) {
      const generation = imported.dispatch_generation;
      const queueJobId = buildImportJobId(imported.id, generation);
      if (
        existingDispatch?.generation === generation
        && existingDispatch.queueJobId !== queueJobId
      ) {
        // The import row is locked and ownership was checked above. Repair a
        // pre-BullMQ-fix dispatch ID before returning the idempotent result;
        // the rollout drain note covers any old Redis job under that ID.
        await tx.enrollmentImportDispatch.updateMany({
          data: { queueJobId },
          where: {
            generation,
            id: existingDispatch.id,
            importId: imported.id,
          },
        });
      }
      return {
        counts: emptyConfirmCounts(),
        handoffMethod: imported.handoff_method ?? input.handoffMethod,
        idempotent: true,
        importId: imported.id,
        generation,
        queueJobId,
        status: imported.status,
      };
    }

    if (imported.status !== EnrollmentImportStatus.draft) {
      throw new EnrollmentImportConfirmationError(
        imported.status === EnrollmentImportStatus.cancelled
          ? "invalid_import_state"
          : "import_not_draft",
      );
    }

    if (!Object.values(EnrollmentImportRole).includes(imported.role)) {
      throw new EnrollmentImportConfirmationError("invalid_import_role");
    }

    if (imported.template_version !== expectedTemplateForRole(imported.role)) {
      throw new EnrollmentImportConfirmationError("invalid_import_template");
    }

    if (imported.row_count < 1 || imported.row_count > MAX_DATA_ROWS) {
      throw new EnrollmentImportConfirmationError("invalid_import_state");
    }

    const rowCounts = await tx.$queryRaw<ImportRowCount[]>`
      SELECT status, count(*)::int AS count
      FROM enrollment_import_rows
      WHERE import_id = ${imported.id}::uuid
      GROUP BY status
    `;
    const counts = countConfirmRows(rowCounts);

    if (counts.total !== imported.row_count) {
      throw new EnrollmentImportConfirmationError("invalid_import_state");
    }

    if (rowCounts.some((row) => row.status !== EnrollmentImportRowStatus.pending && row.status !== EnrollmentImportRowStatus.skipped)) {
      throw new EnrollmentImportConfirmationError("invalid_import_state");
    }

    if (counts.invalid > 0) {
      throw new EnrollmentImportConfirmationError("invalid_rows_pending_skip");
    }

    if (imported.dispatch_generation !== 0 || existingDispatch) {
      throw new EnrollmentImportConfirmationError("invalid_import_state");
    }

    const generation = 1;
    const queueJobId = buildImportJobId(imported.id, generation);
    const confirmedAt = new Date();

    await tx.enrollmentImport.update({
      data: {
        confirmedAt,
        confirmedByUserId: input.actorUserId,
        dispatchGeneration: generation,
        handoffMethod: input.handoffMethod,
        status: EnrollmentImportStatus.queued,
      },
      where: { id: imported.id },
    });

    await tx.enrollmentImportDispatch.create({
      data: {
        generation,
        importId: imported.id,
        queueJobId,
        status: EnrollmentImportDispatchStatus.pending,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "enrollment_import.confirmed",
        actorUserId: input.actorUserId,
        metadata: jsonValue({
          createdCount: counts.created,
          failedCount: counts.failed,
          generation,
          handoffMethod: input.handoffMethod,
          invalidCount: counts.invalid,
          pendingCount: counts.pending,
          rowCount: counts.total,
          skippedCount: counts.skipped,
          updatedCount: counts.updated,
        }),
        targetId: imported.id,
        targetType: "enrollment_import",
      },
    });

    return {
      counts,
      handoffMethod: input.handoffMethod,
      idempotent: false,
      importId: imported.id,
      generation,
      queueJobId,
      status: EnrollmentImportStatus.queued,
    };
  });
}

export {
  EnrollmentImportConfirmationError,
  EnrollmentImportCancellationError,
  EnrollmentImportPreviewError,
  PREVIEW_METADATA_KEY,
  buildStatusDto,
  confirmEnrollmentImport,
  cancelEnrollmentImport,
  evaluatePreviewRows,
  getEnrollmentImportStatus,
  persistParsedEnrollmentImport,
  previewEnrollmentImport,
  skipInvalidEnrollmentImportRows,
};

export type {
  EvaluatedPreviewRow,
  ImportPreviewErrorCode,
  ImportRowDto,
  ImportStatusDto,
  PreviewEnrollmentImportInput,
  PersistParsedEnrollmentImportInput,
  PreviewMetadata,
  SkipInvalidRowsInput,
  ConfirmEnrollmentImportInput,
  ConfirmEnrollmentImportResult,
  CancelEnrollmentImportInput,
  CancelEnrollmentImportResult,
};
