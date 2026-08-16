export type ImportLifecycleStatus =
  | "cancelled"
  | "completed"
  | "draft"
  | "failed"
  | "partial"
  | "processing"
  | "queued";

export type ImportCountSnapshot = {
  created: number;
  failed: number;
  invalid: number;
  pending: number;
  processing: number;
  skipped: number;
  total: number;
  updated: number;
};

export type ImportProgressSnapshot = {
  pending: number;
  percent: number;
  processed: number;
  processing: number;
  remaining: number;
  total: number;
};

export type ImportSessionRecoveryKind = "expired" | "forbidden";

export type ImportRefreshSource = "manual" | "poll" | "resume";

export type ImportPollLifecycleDecision = "pause_hidden" | "schedule_poll" | "wait_for_priority_refresh";

export type ImportWorkerHealthNoticeState = "none" | "status_read_stale" | "worker_stale" | "status_and_worker_stale";

export type HandoffRowSnapshot = {
  handoffAcknowledgedAt: string | null;
  handoffExpiresAt: string | null;
  handoffId: string | null;
  handoffStatus: string | null;
  operation: string;
  status: string;
};

const TERMINAL_IMPORT_STATUSES = new Set<ImportLifecycleStatus>([
  "cancelled",
  "completed",
  "failed",
  "partial",
]);

function isTerminalImportStatus(status: string): status is ImportLifecycleStatus {
  return TERMINAL_IMPORT_STATUSES.has(status as ImportLifecycleStatus);
}

function isImportPollingStatus(status: string): status is "processing" | "queued" {
  return status === "queued" || status === "processing";
}

function isImportPriorityRefreshSource(source: ImportRefreshSource) {
  return source === "manual" || source === "resume";
}

function getImportPollLifecycleDecision({
  pageVisible,
  priorityRefreshPending,
}: {
  pageVisible: boolean;
  priorityRefreshPending: boolean;
}): ImportPollLifecycleDecision {
  if (!pageVisible) return "pause_hidden";
  if (priorityRefreshPending) return "wait_for_priority_refresh";
  return "schedule_poll";
}

function getImportWorkerHealthNoticeState({
  heartbeatStale,
  queueUnavailable,
  statusReadStale,
}: {
  heartbeatStale: boolean;
  queueUnavailable: boolean;
  statusReadStale: boolean;
}): ImportWorkerHealthNoticeState {
  const workerStale = heartbeatStale || queueUnavailable;
  if (statusReadStale && workerStale) return "status_and_worker_stale";
  if (workerStale) return "worker_stale";
  if (statusReadStale) return "status_read_stale";
  return "none";
}

function getImportPollDelayMs(failedAttempts: number, workerStale = false) {
  const attempt = Number.isSafeInteger(failedAttempts) && failedAttempts >= 0
    ? Math.min(failedAttempts, 4)
    : 0;
  const baseDelay = Math.min(30_000, 2_000 * (2 ** attempt));
  return workerStale ? Math.min(30_000, baseDelay * 2) : baseDelay;
}

function getImportProgressSnapshot(counts: ImportCountSnapshot): ImportProgressSnapshot {
  const total = Math.max(0, Number.isFinite(counts.total) ? Math.trunc(counts.total) : 0);
  const processed = Math.min(total, Math.max(0, [counts.created, counts.updated, counts.failed, counts.skipped]
    .map((value) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
    .reduce((sum, value) => sum + value, 0)));
  const pending = Number.isFinite(counts.pending) ? Math.max(0, Math.trunc(counts.pending)) : 0;
  const processing = Number.isFinite(counts.processing) ? Math.max(0, Math.trunc(counts.processing)) : 0;

  return {
    pending,
    percent: total === 0 ? 0 : Math.round((processed / total) * 100),
    processed,
    processing,
    remaining: Math.max(0, total - processed),
    total,
  };
}

function classifyImportSessionRecovery({
  errorCode,
  redirectPath,
  status,
}: {
  errorCode?: string | null;
  redirectPath?: string | null;
  status: number;
}): ImportSessionRecoveryKind | null {
  if (errorCode === "invalid_origin") return null;
  if (
    status === 401
    || redirectPath?.startsWith("/login")
    || redirectPath?.startsWith("/admin/login")
    || redirectPath?.startsWith("/mentor/login")
  ) return "expired";
  if (status === 403) return "forbidden";
  if (redirectPath && !redirectPath.startsWith("/api/admin/")) return "forbidden";
  return null;
}

function resetImportFileSelection(input: { value: string } | null) {
  if (input) input.value = "";
}

const MAX_KAPTEN_BIO_PREVIEW_LENGTH = 140;

function getBoundedKaptenBioPreview(value: string, maxLength = MAX_KAPTEN_BIO_PREVIEW_LENGTH) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function getImportLoginRecoveryHref(returnTo: string) {
  return `/login?notice=signed-out&returnTo=${encodeURIComponent(returnTo)}`;
}

function getHandoffDeliveryState(rows: HandoffRowSnapshot[]): "action_needed" | "all_acknowledged" | "not_applicable" | "terminal" {
  const handoffRows = rows.filter((row) => row.operation === "create" && row.status === "created" && row.handoffId);
  if (handoffRows.length === 0) return "not_applicable";
  const states = handoffRows.map((row) => getHandoffSelectionState(row));
  if (states.every((state) => state === "acknowledged")) return "all_acknowledged";
  if (states.some((state) => state === "pending" || state === "already_released" || state === "expired")) {
    return "action_needed";
  }
  return "terminal";
}

function canConfirmImport(
  status: string,
  rowCount: number,
  counts: ImportCountSnapshot,
) {
  return status === "draft"
    && rowCount > 0
    && counts.total === rowCount
    && counts.invalid === 0
    && counts.failed === 0
    && counts.processing === 0
    && counts.pending + counts.skipped === counts.total;
}

function getHandoffSelectionState(
  row: HandoffRowSnapshot,
  now = Date.now(),
): "acknowledged" | "already_released" | "closed" | "expired" | "not_applicable" | "pending" {
  if (row.operation !== "create" || row.status !== "created" || !row.handoffId) {
    return "not_applicable";
  }
  if (row.handoffStatus === "pending") {
    const expiresAt = row.handoffExpiresAt ? Date.parse(row.handoffExpiresAt) : Number.POSITIVE_INFINITY;
    return Number.isFinite(expiresAt) && expiresAt <= now ? "expired" : "pending";
  }
  if (row.handoffStatus === "released") {
    return row.handoffAcknowledgedAt ? "acknowledged" : "already_released";
  }
  if (row.handoffStatus === "expired") {
    return "expired";
  }
  return "closed";
}

function isPendingHandoffRow(row: HandoffRowSnapshot, now = Date.now()) {
  return getHandoffSelectionState(row, now) === "pending";
}

export {
  canConfirmImport,
  classifyImportSessionRecovery,
  getBoundedKaptenBioPreview,
  getHandoffDeliveryState,
  getImportLoginRecoveryHref,
  getImportPollLifecycleDecision,
  getHandoffSelectionState,
  getImportPollDelayMs,
  getImportProgressSnapshot,
  getImportWorkerHealthNoticeState,
  isImportPriorityRefreshSource,
  isImportPollingStatus,
  isPendingHandoffRow,
  isTerminalImportStatus,
  MAX_KAPTEN_BIO_PREVIEW_LENGTH,
  resetImportFileSelection,
};
