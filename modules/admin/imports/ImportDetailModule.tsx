"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleAlert,
  CircleX,
  Download,
  FileClock,
  Info,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Timer,
  X,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import {
  ReferencePageHeader,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// The shared bottom-center Sonner surface is mounted by components/ui/sonner.tsx.
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

import type { ImportStatusDto } from "@/lib/admin/imports/service";
import {
  ADMIN_STATUS_CLASS_NAMES,
} from "../admin-ui-contract";
import {
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
  MAX_KAPTEN_BIO_PREVIEW_LENGTH,
} from "./import-ui-contract";

type HandoffMethod = "invite_link" | "temporary_password";
type RowStatus = "created" | "failed" | "invalid" | "pending" | "processing" | "skipped" | "updated";
type RowStatusTone = "danger" | "info" | "neutral" | "success" | "warning";

const actionErrorMessages: Record<string, string> = {
  active_claims: "A worker is still finishing this import. Wait for the claim to expire, then retry.",
  handoff_account_inactive: "One account is inactive. Review the account before releasing its handoff.",
  handoff_expired: "One invite has expired. It cannot be released again; use a fresh preview for this account.",
  handoff_file_unavailable: "The handoff file could not be prepared. The import state is unchanged; try again.",
  handoff_not_releasable: "One handoff is already released or closed. Refresh to see the current state.",
  handoff_conflict: "This handoff changed elsewhere. Refresh to see the current state.",
  handoff_reissue_unavailable: "The handoff replacement could not be created. Refresh and try again.",
  import_confirmation_unavailable: "The import could not be confirmed. Refresh and check the current row counts.",
  import_not_draft: "This draft is no longer editable. Refresh to see its current state.",
  import_not_found: "This import is no longer available to your admin account.",
  import_retry_unavailable: "The failed rows could not be queued again. Refresh and try once more.",
  invalid_import_state: "This import is not in a state that accepts that action.",
  invalid_origin: "This action expired. Refresh the page and try again.",
  invalid_rows_pending_skip: "This bulk import is blocked because the CSV contains invalid rows. Correct the CSV and upload a new file; no rows will be imported.",
  invalid_selection: "The selected rows are no longer available for handoff release.",
  no_failed_rows: "There are no failed rows available for retry.",
  row_selection_invalid: "Select only failed rows from this result.",
};

function apiErrorMessage(code: unknown, fallback: string) {
  return typeof code === "string" && actionErrorMessages[code] ? actionErrorMessages[code] : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function methodLabel(method: HandoffMethod | null) {
  return method === "temporary_password" ? "Temporary password" : "Invite link";
}

function statusCopy(status: string) {
  switch (status) {
    case "draft": return { detail: "Preview saved. No accounts have changed.", label: "Draft needs review", tone: "warning" as const };
    case "queued": return { detail: "The import is queued for the background worker.", label: "Queued", tone: "info" as const };
    case "processing": return { detail: "Rows are being processed from the PostgreSQL state.", label: "Processing", tone: "info" as const };
    case "completed": return { detail: "Every eligible row completed without a failure.", label: "Completed", tone: "success" as const };
    case "partial": return { detail: "Some rows completed; review the remaining failures or skipped rows.", label: "Partially complete", tone: "warning" as const };
    case "failed": return { detail: "The import stopped before all rows completed.", label: "Import failed", tone: "danger" as const };
    case "cancelled": return { detail: "This draft was abandoned before account changes began.", label: "Cancelled", tone: "neutral" as const };
    default: return { detail: "The import state is unavailable.", label: status, tone: "neutral" as const };
  }
}

function statusIcon(status: string) {
  if (status === "completed") return <CheckCircle2 aria-hidden="true" size={17} />;
  if (status === "failed") return <CircleX aria-hidden="true" size={17} />;
  if (status === "partial" || status === "draft") return <CircleAlert aria-hidden="true" size={17} />;
  if (status === "queued" || status === "processing") return <Timer aria-hidden="true" size={17} />;
  return <FileClock aria-hidden="true" size={17} />;
}

function toneClasses(tone: ReturnType<typeof statusCopy>["tone"]) {
  if (tone === "danger") return ADMIN_STATUS_CLASS_NAMES.danger;
  if (tone === "info") return ADMIN_STATUS_CLASS_NAMES.info;
  if (tone === "success") return ADMIN_STATUS_CLASS_NAMES.success;
  if (tone === "warning") return ADMIN_STATUS_CLASS_NAMES.warning;
  return ADMIN_STATUS_CLASS_NAMES.neutral;
}

function referenceBadgeTone(tone: ReturnType<typeof statusCopy>["tone"]): "danger" | "info" | "neutral" | "success" | "attention" {
  return tone === "warning" ? "attention" : tone;
}

function rowStatusCopy(status: RowStatus): { icon: React.ReactNode; label: string; tone: RowStatusTone } {
  switch (status) {
    case "created": return { icon: <CheckCircle2 aria-hidden="true" size={14} />, label: "Created", tone: "success" };
    case "updated": return { icon: <Check aria-hidden="true" size={14} />, label: "Updated", tone: "success" };
    case "failed": return { icon: <CircleX aria-hidden="true" size={14} />, label: "Failed", tone: "danger" };
    case "invalid": return { icon: <CircleAlert aria-hidden="true" size={14} />, label: "Needs review", tone: "warning" };
    case "skipped": return { icon: <SkipForward aria-hidden="true" size={14} />, label: "Skipped", tone: "neutral" };
    case "processing": return { icon: <RefreshCw aria-hidden="true" size={14} />, label: "Processing", tone: "info" };
    case "pending": return { icon: <FileClock aria-hidden="true" size={14} />, label: "Pending", tone: "warning" };
    default: return { icon: <FileClock aria-hidden="true" size={14} />, label: "Ready", tone: "info" };
  }
}

function rowBadgeTone(tone: RowStatusTone): "danger" | "info" | "neutral" | "success" | "attention" {
  return tone === "warning" ? "attention" : tone;
}

function rowIssueLabel(code: string | null) {
  if (!code) return null;
  if (code === "duplicate_email_in_file") return "Duplicate in this file";
  if (["opposite_role", "role_conflict", "revoked_role", "soft_deleted_user", "inactive_account"].includes(code)) return "Account or role conflict";
  if (code === "changed_since_preview") return "Changed since preview";
  return code.replaceAll("_", " ");
}

function ImportInputSummary({ input }: { input: ImportStatusDto["rows"][number]["input"] }) {
  const entries = Object.entries(input).reduce<Array<{ key: string; value: string }>>((result, [key, value]) => {
    if (key !== "email" && value !== null && value !== "") {
      result.push({ key, value: String(value) });
    }
    return result;
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="mt-1 space-y-1 text-xs leading-5 text-secondary-600">
      {entries.map(({ key, value }) => {
        const isLongBio = key === "bio" && value.trim().length > MAX_KAPTEN_BIO_PREVIEW_LENGTH;
        return (
          <div key={key}>
            <span>{key.replaceAll("_", " ")}: {isLongBio ? getBoundedKaptenBioPreview(value) : value}</span>
            {isLongBio ? (
              <details className="mt-1">
                <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">View full bio ({value.trim().length} characters)</summary>
                <p className="mt-1 max-w-[48ch] whitespace-pre-wrap rounded-xl bg-secondary-50 px-3 py-2 text-xs leading-5 text-secondary-900">{value}</p>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function responseErrorCode(payload: unknown) {
  return payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : null;
}

function redirectedPath(response: Response) {
  if (!response.redirected || typeof window === "undefined") return null;
  try {
    return new URL(response.url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function responseSessionIssue(response: Response, payload: unknown) {
  const errorCode = responseErrorCode(payload);
  return classifyImportSessionRecovery({
    errorCode: typeof errorCode === "string" ? errorCode : null,
    redirectPath: redirectedPath(response),
    status: response.status,
  });
}

function ImportSessionRecoveryNotice({
  importId,
  kind,
  onRefresh,
}: {
  importId: string;
  kind: "expired" | "forbidden";
  onRefresh: () => void;
}) {
  return (
    <ReferenceSurface as="section" aria-labelledby="import-session-recovery-heading" className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6 ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert" variant="inset">
      <div>
        <p className="text-base font-semibold" id="import-session-recovery-heading">{kind === "expired" ? "Admin session expired" : "Admin permission required"}</p>
        <p className="mt-1 max-w-[68ch] text-sm leading-6">{kind === "expired" ? "Sign in again to return to this import review. The import ID stays in this page context; credentials are never included in the recovery link." : "This admin account can no longer review the import. Sign in with an active admin account or return to the admin home."}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link href={getImportLoginRecoveryHref(`/admin/imports/${encodeURIComponent(importId)}`)} />}
          size="default"
          variant="dangerOutline"
        >
          {kind === "expired" ? "Sign in again" : "Sign in as admin"}
        </Button>
        <Button onClick={onRefresh} size="default" variant="dangerOutline">Refresh page</Button>
      </div>
    </ReferenceSurface>
  );
}

function CountStrip({ counts, mode }: { counts: ImportStatusDto["counts"]; mode: "preview" | "result" }) {
  const items = mode === "preview"
    ? [
      ["New accounts", counts.create],
      ["Profile updates", counts.update],
      ["Failed", counts.failed],
      ["Needs review", counts.invalid],
      ["Skipped", counts.skipped],
    ] as const
    : [
      ["Created", counts.created],
      ["Updated", counts.updated],
      ["Failed", counts.failed],
      ["Skipped", counts.skipped],
    ] as const;

  return (
    <dl className={`grid grid-cols-2 gap-2 ${items.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      {items.map(([label, value]) => (
        <ReferenceSurface as="div" className="px-3 py-3" key={label} variant="inset">
          <dt className="text-xs font-semibold text-secondary-600">{label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums tracking-[-0.03em] text-secondary-900">{value.toLocaleString("en-US")}</dd>
        </ReferenceSurface>
      ))}
    </dl>
  );
}

function ImportProgressPanel({ importStatus }: { importStatus: ImportStatusDto }) {
  if (!isImportPollingStatus(importStatus.status)) return null;
  const progress = getImportProgressSnapshot(importStatus.counts);
  const progressMax = Math.max(progress.total, 1);

  return (
    <ReferenceSurface as="section" aria-labelledby="import-progress-heading" className="p-5 sm:p-6" variant="inset">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="import-progress-heading">Import progress</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">The worker reports durable row outcomes from PostgreSQL. This page will keep polling until the import reaches a terminal state.</p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-primary-800">{progress.percent}% complete</p>
      </div>
      <div aria-label={`Import progress: ${progress.processed} of ${progress.total} rows processed`} aria-valuemax={progressMax} aria-valuemin={0} aria-valuenow={progress.processed} aria-valuetext={`${progress.processed} of ${progress.total} rows processed`} className="mt-5 h-3 overflow-hidden rounded-full bg-primary-100" role="progressbar">
        <div className="h-full rounded-full bg-primary-600 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-2 text-sm font-semibold tabular-nums text-secondary-900">Processed {progress.processed} of {progress.total} rows</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Pending", progress.pending],
          ["Processing", progress.processing],
          ["Remaining", progress.remaining],
          ["Rows with outcomes", progress.processed],
        ].map(([label, value]) => (
          <ReferenceSurface as="div" className="px-3 py-3" key={label}>
            <dt className="text-xs font-semibold text-secondary-600">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-secondary-900">{value.toLocaleString("en-US")}</dd>
          </ReferenceSurface>
        ))}
      </dl>
    </ReferenceSurface>
  );
}

function ImportStatusBanner({ importStatus }: { importStatus: ImportStatusDto }) {
  const copy = statusCopy(importStatus.status);
  return (
    <ReferenceSurface as="section" aria-live="polite" className={`p-5 ${toneClasses(copy.tone)} sm:p-6`} variant="inset">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/70">{statusIcon(importStatus.status)}</span>
          <div>
            <p className="text-lg font-semibold tracking-[-0.02em]">{copy.label}</p>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 opacity-85">{copy.detail}</p>
          </div>
        </div>
        <div className="text-left text-xs sm:text-right">
          <p className="font-semibold">Last saved</p>
          <time className="mt-1 block opacity-80" dateTime={importStatus.updatedAt}>{formatDate(importStatus.updatedAt)}</time>
        </div>
      </div>
    </ReferenceSurface>
  );
}

function ImportRowTable({ importStatus }: { importStatus: ImportStatusDto }) {
  return (
    <ReferenceSurface as="section" aria-labelledby="import-rows-heading" className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-primary-100/80 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="import-rows-heading">Preview rows</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-500">Each row keeps its original operation decision. Existing email matches update the role profile only.</p>
        </div>
      </div>
      <Table className="min-w-[760px] text-left text-sm">
        <TableCaption className="sr-only">Import preview rows and their operation status.</TableCaption>
        <TableHeader>
          <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Row</TableHead>
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Email</TableHead>
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Operation</TableHead>
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">State</TableHead>
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Explanation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {importStatus.rows.length > 0 ? importStatus.rows.map((row) => {
            const copy = rowStatusCopy(row.status as RowStatus);
            const isInvalid = row.status === "invalid";
            return (
              <TableRow className={isInvalid ? "bg-student-status-attention-bg/45" : undefined} key={row.rowId}>
                <TableCell className="px-4 py-3.5 align-top font-semibold tabular-nums text-secondary-900 sm:px-5">{row.rowNumber}</TableCell>
                <TableCell className="max-w-[240px] px-4 py-3.5 align-top sm:px-5">
                  <span className="block truncate font-semibold text-secondary-900">{row.normalizedEmail || "No email"}</span>
                  <ImportInputSummary input={row.input} />
                </TableCell>
                <TableCell className="px-4 py-3.5 align-top text-secondary-600 sm:px-5">{row.operation === "create" ? "Create" : row.operation === "update" ? "Update profile" : "No operation"}</TableCell>
                <TableCell className="px-4 py-3.5 align-top sm:px-5">
                  <StudentBadge size="sm" tone={rowBadgeTone(copy.tone)}>
                    {copy.icon}
                    {copy.label}
                  </StudentBadge>
                </TableCell>
                <TableCell className="max-w-[270px] px-4 py-3.5 align-top text-xs leading-5 text-secondary-600 sm:px-5">
                  {row.errorMessage ? <><span className="font-semibold text-student-status-attention-fg">{rowIssueLabel(row.errorCode)}</span><span className="mt-0.5 block">{row.errorMessage}</span></> : row.status === "created" && row.handoffStatus ? `${methodLabel(row.handoffMethod)} handoff · ${row.handoffStatus.replaceAll("_", " ")}` : "Ready for the next step."}
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow className="hover:bg-transparent">
              <TableCell className="px-5 py-12 text-center" colSpan={5}>
                <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-primary-50 text-primary-800"><FileClock size={18} /></span>
                  <p className="font-semibold text-secondary-900">No import rows</p>
                  <p className="text-sm leading-6 text-secondary-600">The preview contains no rows to review.</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </ReferenceSurface>
  );
}

function WorkerHealthNotice({
  importStatus,
  lastFetchedAt,
  heartbeatStale,
  statusReadStale,
}: {
  importStatus: ImportStatusDto;
  lastFetchedAt: number;
  heartbeatStale: boolean;
  statusReadStale: boolean;
}) {
  const active = isImportPollingStatus(importStatus.status);
  if (!active) return null;
  const dispatchError = importStatus.dispatch?.lastErrorCode;
  const queueUnavailable = dispatchError === "queue_unavailable"
    || dispatchError === "queue_job_missing"
    || importStatus.lastErrorCode === "queue_unavailable";
  const noticeState = getImportWorkerHealthNoticeState({
    heartbeatStale,
    queueUnavailable,
    statusReadStale,
  });
  if (noticeState === "none") return null;
  const statusReadOnly = noticeState === "status_read_stale";
  const workerOnly = noticeState === "worker_stale";
  return (
    <ReferenceSurface as="div" className={`flex items-start gap-3 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.warning}`} role="status" variant="inset">
      <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
      <div>
        <p className="font-semibold">
          {statusReadOnly ? "Status refresh is delayed" : workerOnly ? "Worker or queue needs attention" : "Status and worker health need attention"}
        </p>
        {statusReadOnly ? (
          <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL remains the source of truth. The last database read was {formatDate(new Date(lastFetchedAt).toISOString())}; this read outage does not establish a worker heartbeat failure.</p>
        ) : workerOnly ? (
          <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL remains the source of truth. A worker heartbeat has been missing or stale for at least 45 seconds, or the queue reported an unavailable job. This page will keep backing off instead of claiming success.</p>
        ) : (
          <>
            <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL remains the source of truth, but the last database read was {formatDate(new Date(lastFetchedAt).toISOString())} and the worker heartbeat is also stale or the queue reported an unavailable job. This page will keep backing off instead of claiming success.</p>
          </>
        )}
        {!statusReadOnly ? <p className="mt-1 text-xs opacity-80">Last row heartbeat: {formatDate(importStatus.lastHeartbeatAt)}</p> : null}
      </div>
    </ReferenceSurface>
  );
}

type HandoffDeliveryState = {
  acknowledgeBusy: boolean;
  acknowledgeIntent: boolean;
  downloadedIds: Set<string>;
  downloadBusy: boolean;
  message: string;
  reissueBusy: string | null;
  selectedRows: Set<string>;
  transferConfirmed: boolean;
};

type HandoffDeliveryAction =
  | { type: "acknowledgeBusy"; value: boolean }
  | { type: "acknowledgeIntent"; value: boolean }
  | { type: "acknowledgeSuccess"; message: string }
  | { type: "downloadBusy"; value: boolean }
  | { type: "downloadSuccess"; ids: string[]; message: string }
  | { type: "message"; value: string }
  | { type: "reissueBusy"; value: string | null }
  | { type: "reissueSuccess"; message: string }
  | { type: "selectPending"; ids: string[] }
  | { type: "toggleRow"; rowId: string }
  | { type: "transferConfirmed"; value: boolean };

const INITIAL_HANDOFF_DELIVERY_STATE: HandoffDeliveryState = {
  acknowledgeBusy: false,
  acknowledgeIntent: false,
  downloadedIds: new Set(),
  downloadBusy: false,
  message: "",
  reissueBusy: null,
  selectedRows: new Set(),
  transferConfirmed: false,
};

function handoffDeliveryReducer(
  state: HandoffDeliveryState,
  action: HandoffDeliveryAction,
): HandoffDeliveryState {
  switch (action.type) {
    case "acknowledgeBusy":
      return { ...state, acknowledgeBusy: action.value };
    case "acknowledgeIntent":
      return { ...state, acknowledgeIntent: action.value };
    case "acknowledgeSuccess":
      return {
        ...state,
        acknowledgeIntent: false,
        acknowledgeBusy: false,
        downloadedIds: new Set(),
        message: action.message,
        selectedRows: new Set(),
        transferConfirmed: false,
      };
    case "downloadBusy":
      return { ...state, downloadBusy: action.value };
    case "downloadSuccess":
      return {
        ...state,
        acknowledgeIntent: false,
        downloadedIds: new Set(action.ids),
        message: action.message,
        selectedRows: new Set(),
        transferConfirmed: false,
      };
    case "message":
      return { ...state, message: action.value };
    case "reissueBusy":
      return { ...state, reissueBusy: action.value };
    case "reissueSuccess":
      return {
        ...state,
        downloadedIds: new Set(),
        message: action.message,
        reissueBusy: null,
        selectedRows: new Set(),
        transferConfirmed: false,
      };
    case "selectPending":
      return {
        ...state,
        selectedRows: state.selectedRows.size === action.ids.length
          ? new Set()
          : new Set(action.ids),
      };
    case "toggleRow": {
      const selectedRows = new Set(state.selectedRows);
      if (selectedRows.has(action.rowId)) {
        selectedRows.delete(action.rowId);
      } else {
        selectedRows.add(action.rowId);
      }
      return { ...state, selectedRows };
    }
    case "transferConfirmed":
      return { ...state, transferConfirmed: action.value };
  }
}

function HandoffDeliveryPanel({
  importStatus,
  onRefresh,
  onSessionIssue,
}: {
  importStatus: ImportStatusDto;
  onRefresh: () => Promise<boolean>;
  onSessionIssue: (kind: "expired" | "forbidden") => void;
}) {
  const [state, dispatch] = useReducer(handoffDeliveryReducer, INITIAL_HANDOFF_DELIVERY_STATE);
  const {
    acknowledgeBusy,
    acknowledgeIntent,
    downloadedIds,
    downloadBusy,
    message,
    reissueBusy,
    selectedRows,
    transferConfirmed,
  } = state;

  const pendingRows = importStatus.rows.filter((row) => isPendingHandoffRow(row));
  const releasedRows = importStatus.rows.filter((row) => row.handoffId && row.handoffStatus === "released" && !row.handoffAcknowledgedAt);
  const expiredRows = importStatus.rows.filter((row) => getHandoffSelectionState(row) === "expired");
  const handoffState = getHandoffDeliveryState(importStatus.rows);
  const selectedIds = [...selectedRows];
  const acknowledgementIds = downloadedIds.size ? [...downloadedIds] : selectedIds;
  const method = importStatus.handoffMethod;

  const toggleRow = (rowId: string) => {
    dispatch({ rowId, type: "toggleRow" });
  };

  async function downloadFile() {
    if (!selectedIds.length || !acknowledgeIntent) return;
    dispatch({ type: "downloadBusy", value: true });
    dispatch({ type: "message", value: "Preparing the one-time file in memory…" });
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/handoff-file`, {
        body: JSON.stringify({ handoffIds: selectedIds }),
        cache: "no-store",
        headers: { Accept: "text/csv", "Content-Type": "application/json" },
        method: "POST",
      });
      const redirectedRecovery = responseSessionIssue(response, null);
      if (redirectedRecovery) {
        onSessionIssue(redirectedRecovery);
        return;
      }
      if (!response.ok) {
        const payload = await readJson(response);
        const recovery = responseSessionIssue(response, payload);
        if (recovery) {
          onSessionIssue(recovery);
          return;
        }
        dispatch({ type: "message", value: apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The one-time file could not be released. Refresh and review the handoff state.") });
        return;
      }
      const file = await response.blob();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/u)?.[1] ?? "import-handoffs.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      dispatch({
        ids: selectedIds,
        message: `Downloaded ${selectedIds.length} ${selectedIds.length === 1 ? "handoff" : "handoffs"}. Transfer the file now; the credentials will not be released again.`,
        type: "downloadSuccess",
      });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "The one-time file could not be downloaded. Refresh before trying again." });
    } finally {
      dispatch({ type: "downloadBusy", value: false });
    }
  }

  async function acknowledgeTransfer() {
    const ids = [...downloadedIds].length ? [...downloadedIds] : selectedIds;
    if (!ids.length || !transferConfirmed) return;
    dispatch({ type: "acknowledgeBusy", value: true });
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/handoff-file/acknowledge`, {
        body: JSON.stringify({ handoffIds: ids }),
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        onSessionIssue(recovery);
        return;
      }
      if (!response.ok) {
        dispatch({ type: "message", value: apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The acknowledgement could not be recorded. Refresh and try again.") });
        return;
      }
      dispatch({ message: "Handoff acknowledgement recorded. The one-time credentials remain out of the app state.", type: "acknowledgeSuccess" });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "The acknowledgement could not reach the server. Refresh and try again." });
    } finally {
      dispatch({ type: "acknowledgeBusy", value: false });
    }
  }

  async function reissueHandoff(handoffId: string) {
    dispatch({ type: "reissueBusy", value: handoffId });
    dispatch({ type: "message", value: "Creating a sealed replacement handoff…" });
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/handoff-file/reissue`, {
        body: JSON.stringify({ handoffId }),
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        onSessionIssue(recovery);
        return;
      }
      if (!response.ok) {
        dispatch({ type: "message", value: apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The replacement handoff could not be created.") });
        return;
      }
      dispatch({ message: "Replacement handoff ready. Select it below and download the new one-time file.", type: "reissueSuccess" });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "The replacement request could not reach the server. Refresh and try again." });
    } finally {
      dispatch({ type: "reissueBusy", value: null });
    }
  }

  if (!method || handoffState === "not_applicable") {
    return null;
  }

  if (handoffState === "all_acknowledged") {
    return (
      <ReferenceSurface as="section" aria-labelledby="handoff-file-heading" className="p-5 sm:p-6" variant="inset">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-student-status-success-bg text-student-status-success-fg"><CheckCircle2 size={19} /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-file-heading">All handoffs acknowledged</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">Every released credential file for this import has been confirmed as transferred. No handoff file remains available to download.</p>
          </div>
        </div>
      </ReferenceSurface>
    );
  }

  if (handoffState === "terminal") {
    return (
      <ReferenceSurface as="section" aria-labelledby="handoff-file-heading" className="bg-secondary-50 p-5 sm:p-6" variant="inset">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary-100 text-secondary-700"><FileClock size={19} /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-file-heading">No handoff action remains</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">Every new-account handoff for this import is terminal. Completed or revoked handoffs cannot be downloaded, reissued, or acknowledged here.</p>
          </div>
        </div>
      </ReferenceSurface>
    );
  }

  return (
    <ReferenceSurface as="section" aria-labelledby="handoff-file-heading" className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-file-heading">One-time handoff file</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">This import uses one method for all new accounts: <span className="font-semibold text-secondary-900">{methodLabel(method)}</span>. The file is generated in memory and is never stored.</p>
        </div>
        <p className="flex max-w-[18rem] items-start gap-2 text-xs leading-5 text-student-status-info-fg">
          <Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
          <span>Credentials are shown once.</span>
        </p>
      </div>

      <ReferenceSurface as="div" className="mt-4 px-4 py-3 text-sm leading-6 text-secondary-600" variant="inset">
        {method === "invite_link"
          ? "Invite links expire after 24 hours and are used once. Share the link manually; no email delivery is implied. The recipient follows it to set a password."
          : "Temporary passwords work for the first login only and require a password change. Share the file securely; no email delivery is implied."}
      </ReferenceSurface>

      {pendingRows.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-secondary-900">Pending new-account handoffs</p>
            <Button className="text-xs" onClick={() => dispatch({ ids: pendingRows.map((row) => row.handoffId).filter((id): id is string => Boolean(id)), type: "selectPending" })} size="default" variant="reference">
              {selectedRows.size === pendingRows.length ? "Clear selection" : "Select all pending"}
            </Button>
          </div>
          <div className="mt-2 divide-y divide-primary-100 rounded-2xl border border-primary-100">
            {pendingRows.map((row) => (
              <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
                <input aria-label={`Select handoff for row ${row.rowNumber}`} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-primary-700" onChange={() => row.handoffId && toggleRow(row.handoffId)} type="checkbox" />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-secondary-900">Row {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs text-secondary-600">Expires {formatDate(row.handoffExpiresAt)}</span></span>
                <StudentBadge size="sm" tone="attention">Pending</StudentBadge>
              </label>
            ))}
          </div>
          <label className={cn(REFERENCE_SURFACE_CLASS_NAMES.inset, "mt-4 flex items-start gap-3 px-4 py-3 text-xs leading-5 text-secondary-600")}>
            <input checked={acknowledgeIntent} className="mt-1 size-4 accent-primary-700" onChange={(event) => dispatch({ type: "acknowledgeIntent", value: event.target.checked })} type="checkbox" />
            <span>I will share this file through a secure channel and understand the selected credentials cannot be recovered after release.</span>
          </label>
          <Button className="mt-3" disabled={!selectedIds.length || !acknowledgeIntent || downloadBusy} onClick={downloadFile} type="button" variant="brand">
            <Download aria-hidden="true" size={16} />
            {downloadBusy ? "Preparing file…" : `Download selected (${selectedIds.length})`}
          </Button>
        </div>
      ) : null}

      {releasedRows.length > 0 ? (
        <ReferenceSurface as="div" className={`mt-5 px-4 py-4 text-sm ${ADMIN_STATUS_CLASS_NAMES.warning}`} variant="inset">
          <p className="font-semibold">Some credentials are already released</p>
          <p className="mt-1 text-xs leading-5">The response cannot be downloaded again. If the file was lost, start a new preview/import for those accounts; do not expect the old credentials to reappear. Once you have transferred the file, acknowledge the released rows below.</p>
          <div className="mt-3 space-y-2">
            {releasedRows.map((row) => (
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-student-status-attention-border bg-white/50 px-3 py-2 text-xs" key={row.rowId}>
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input aria-label={`Select released handoff for row ${row.rowNumber}`} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-student-status-attention-fg" onChange={() => row.handoffId && toggleRow(row.handoffId)} type="checkbox" />
                  <span className="truncate">Row {row.rowNumber} · {row.normalizedEmail}</span>
                </label>
                <span className="font-semibold">Already released</span>
                {row.handoffId ? <Button className="shrink-0 text-xs" disabled={reissueBusy !== null} onClick={() => void reissueHandoff(row.handoffId as string)} size="default" type="button" variant="attentionOutline">{reissueBusy === row.handoffId ? "Reissuing…" : "Reissue"}</Button> : null}
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-student-status-attention-fg">
            <input checked={transferConfirmed} className="mt-1 size-4 accent-student-status-attention-fg" onChange={(event) => dispatch({ type: "transferConfirmed", value: event.target.checked })} type="checkbox" />
            <span>I confirm the released file was transferred through a secure channel.</span>
          </label>
          <Button className="mt-3" disabled={!acknowledgementIds.length || !transferConfirmed || acknowledgeBusy} onClick={acknowledgeTransfer} type="button" variant="attentionOutline">
            <Check aria-hidden="true" size={16} />
            {acknowledgeBusy ? "Saving…" : "Acknowledge transfer"}
          </Button>
        </ReferenceSurface>
      ) : null}

      {expiredRows.length > 0 ? (
        <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.danger}`} variant="inset">
          <p className="font-semibold">Expired handoffs need a new preview</p>
          <p className="mt-1">Expired invite secrets are no longer releasable. Reissue a sealed replacement here, then select the new pending row for download. If the source data is wrong, create a new preview instead.</p>
          <div className="mt-3 space-y-2">
            {expiredRows.map((row) => (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-student-status-danger-border bg-white/50 px-3 py-2" key={row.rowId}>
                <span className="truncate text-xs">Row {row.rowNumber} · {row.normalizedEmail}</span>
                {row.handoffId ? <Button className="shrink-0 text-xs" disabled={reissueBusy !== null} onClick={() => void reissueHandoff(row.handoffId as string)} size="default" type="button" variant="dangerOutline">{reissueBusy === row.handoffId ? "Reissuing…" : "Reissue"}</Button> : null}
              </div>
            ))}
          </div>
        </ReferenceSurface>
      ) : null}

      {downloadedIds.size > 0 && releasedRows.length === 0 ? (
        <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.success}`} variant="inset">
          <p className="font-semibold">File downloaded</p>
          <p className="mt-1 text-xs leading-5">Confirm that the file reached the recipient. The acknowledgement records the handoff; it does not expose the credentials again.</p>
          <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-student-status-success-fg">
            <input checked={transferConfirmed} className="mt-1 size-4 accent-primary-700" onChange={(event) => dispatch({ type: "transferConfirmed", value: event.target.checked })} type="checkbox" />
            <span>I confirm the released file was transferred through a secure channel.</span>
          </label>
          <Button className="mt-3" disabled={!transferConfirmed || acknowledgeBusy} onClick={acknowledgeTransfer} type="button" variant="brandOutline">
            <Check aria-hidden="true" size={16} />
            {acknowledgeBusy ? "Saving…" : "Acknowledge transfer"}
          </Button>
        </ReferenceSurface>
      ) : null}

      {message ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-secondary-600" role="status">{message}</p> : null}
    </ReferenceSurface>
  );
}

function RetryPanel({ importStatus, onRefresh, onSessionIssue }: { importStatus: ImportStatusDto; onRefresh: () => Promise<boolean>; onSessionIssue: (kind: "expired" | "forbidden") => void }) {
  const failedRows = importStatus.rows.filter((row) => row.status === "failed");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retryAll, setRetryAll] = useState(false);

  if (!failedRows.length || (importStatus.status !== "failed" && importStatus.status !== "partial")) return null;

  function toggleRow(rowId: string) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function retryRows() {
    if (!retryAll && !selectedRows.size) return;
    setBusy(true);
    setMessage("Queueing the selected failed rows…");
    try {
      const body: Record<string, unknown> = {
        expectedGeneration: importStatus.dispatchGeneration,
        idempotencyKey: crypto.randomUUID(),
      };
      if (!retryAll) body.rowIds = [...selectedRows];
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/retry`, {
        body: JSON.stringify(body),
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        onSessionIssue(recovery);
        return;
      }
      if (!response.ok) {
        setMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The failed rows could not be queued."));
        return;
      }
      setSelectedRows(new Set());
      setRetryAll(false);
      await onRefresh();
      setMessage("Retry queued. The status will update from the worker's database outcomes.");
    } catch {
      setMessage("The retry could not reach the server. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReferenceSurface as="section" aria-labelledby="retry-heading" className={`p-5 sm:p-6 ${ADMIN_STATUS_CLASS_NAMES.danger}`} variant="inset">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="retry-heading">Review failed rows</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-600">Retry is for transient or operational failures. Data corrections require a new preview/import.</p>
        </div>
        <StudentBadge size="sm" tone="danger">{failedRows.length} failed</StudentBadge>
      </div>
      <div className="mt-4 divide-y divide-student-status-danger-border rounded-2xl border border-student-status-danger-border bg-white">
        {failedRows.map((row) => (
          <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
            <input aria-label={`Select failed row ${row.rowNumber} for retry`} checked={selectedRows.has(row.rowId)} className="size-4 accent-student-status-danger-solid-bg" onChange={() => toggleRow(row.rowId)} type="checkbox" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-secondary-900">Row {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs leading-5 text-student-status-danger-fg">{row.errorMessage ?? row.errorCode?.replaceAll("_", " ") ?? "Operational failure"}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 items-center gap-2 text-xs text-secondary-600"><input checked={retryAll} className="size-4 accent-student-status-danger-solid-bg" onChange={(event) => setRetryAll(event.target.checked)} type="checkbox" /> Retry all failed rows</label>
        <Button disabled={busy || (!retryAll && !selectedRows.size)} onClick={retryRows} type="button" variant="destructive">
          <RotateCcw aria-hidden="true" size={16} />
          {busy ? "Queueing retry…" : retryAll ? "Retry all failed" : `Retry selected (${selectedRows.size})`}
        </Button>
      </div>
      {message ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-secondary-600" role="status">{message}</p> : null}
    </ReferenceSurface>
  );
}

type ImportStatusLoader = (options?: { source?: "manual" | "poll" | "resume" }) => Promise<boolean>;

type ImportDetailViewProps = {
  cancelArmed: boolean;
  cancelBusy: boolean;
  cancelImport: () => Promise<void>;
  cancelMessage: string;
  confirmBusy: boolean;
  confirmImport: () => Promise<void>;
  confirmMessage: string;
  handoffMethod: HandoffMethod;
  heartbeatIsStale: boolean;
  importStatus: ImportStatusDto;
  lastFetchedAt: number;
  loadStatus: ImportStatusLoader;
  onCancelArmedChange: (armed: boolean) => void;
  onHandoffMethodChange: (method: HandoffMethod) => void;
  onSessionIssueChange: (kind: "expired" | "forbidden" | null) => void;
  pollError: boolean;
  readIsStale: boolean;
  refreshing: boolean;
  sessionIssue: "expired" | "forbidden" | null;
};

function ImportDetailView({
  cancelArmed,
  cancelBusy,
  cancelImport,
  cancelMessage,
  confirmBusy,
  confirmImport,
  confirmMessage,
  handoffMethod,
  heartbeatIsStale,
  importStatus,
  lastFetchedAt,
  loadStatus,
  onCancelArmedChange,
  onHandoffMethodChange,
  onSessionIssueChange,
  pollError,
  readIsStale,
  refreshing,
  sessionIssue,
}: ImportDetailViewProps) {
  const invalidRows = importStatus.rows.filter((row) => row.status === "invalid");
  const canConfirm = canConfirmImport(importStatus.status, importStatus.rowCount, importStatus.counts);
  const copy = statusCopy(importStatus.status);

  return (
    <div className="space-y-7">
      <div className="flex min-w-0 items-start gap-3">
        <Button
          aria-label="Back to enrollment"
          className="mt-1 shrink-0"
          nativeButton={false}
          render={<Link href="/admin/enrollment" />}
          size="icon"
          title="Back to enrollment"
          variant="ghost"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </Button>
        <ReferencePageHeader
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button aria-label="Refresh import status" disabled={refreshing} onClick={() => void loadStatus()} size="sm" variant="reference">
                <RefreshCw aria-hidden="true" size={15} />
                {refreshing ? "Refreshing…" : "Refresh status"}
              </Button>
              <ReferenceStatusBadge label={copy.label} status={importStatus.status} tone={referenceBadgeTone(copy.tone)} />
            </div>
          )}
          className="min-w-0 flex-1"
          description="Review rows and release the next handoff."
          title="Import review"
        />
      </div>

      {sessionIssue ? <ImportSessionRecoveryNotice importId={importStatus.importId} kind={sessionIssue} onRefresh={() => window.location.reload()} /> : null}
      {pollError && !sessionIssue && !readIsStale ? <ReferenceSurface as="div" className={`flex items-start gap-3 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert" variant="inset"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div><p className="font-semibold">Status refresh is unavailable</p><p className="mt-1 text-xs leading-5">The last database read was {formatDate(new Date(lastFetchedAt).toISOString())}. Refresh to recover; no success is inferred from a missing response.</p></div></ReferenceSurface> : null}
      <WorkerHealthNotice importStatus={importStatus} lastFetchedAt={lastFetchedAt} heartbeatStale={heartbeatIsStale} statusReadStale={readIsStale} />

      <ImportStatusBanner importStatus={importStatus} />
      <ImportProgressPanel importStatus={importStatus} />

      <ReferenceSurface as="section" aria-labelledby="import-summary-heading" className="p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="import-summary-heading">Import details</h2>
            <p className="mt-2 text-base font-semibold text-secondary-900">{importStatus.sourceFilename}</p>
            <p className="mt-1 text-sm text-secondary-500">{importStatus.role === "tutor" ? "Kapten" : "Students"} · {importStatus.templateVersion} · {importStatus.rowCount} rows</p>
          </div>
          <p className="text-xs text-secondary-500">Preview created {formatDate(importStatus.createdAt)}</p>
        </div>
        <div className="mt-5"><CountStrip counts={importStatus.counts} mode={importStatus.status === "draft" ? "preview" : "result"} /></div>
      </ReferenceSurface>

      {importStatus.status === "draft" ? (
        <>
          <ImportRowTable importStatus={importStatus} />
          <ReferenceSurface as="section" aria-labelledby="confirm-import-heading" className="p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="confirm-import-heading">Choose one handoff method</h2>
                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-500">The choice applies to every new account in this import. Existing accounts receive profile-only updates and never receive new credentials.</p>
              </div>
              <div
                className={`flex max-w-sm items-start gap-2 text-sm leading-5 ${importStatus.counts.invalid ? "text-student-status-attention-fg" : "text-student-status-success-fg"}`}
                role="status"
              >
                {importStatus.counts.invalid ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                <span>
                  <strong className="block font-semibold">
                    {importStatus.counts.invalid ? `${importStatus.counts.invalid} invalid rows block this batch` : "Ready to confirm"}
                  </strong>
                  {importStatus.counts.invalid ? <span className="block text-xs leading-5 text-secondary-600">No rows will be imported until you upload a corrected CSV.</span> : null}
                </span>
              </div>
            </div>

            {invalidRows.length > 0 ? (
              <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.warning}`} role="alert" variant="inset">
                <p className="font-semibold">Bulk import blocked</p>
                <p className="mt-1 text-xs leading-5">This CSV contains {importStatus.counts.invalid} invalid row{importStatus.counts.invalid === 1 ? "" : "s"}. No rows will be imported. Correct the highlighted data, upload a new CSV, and start a fresh preview.</p>
              </ReferenceSurface>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className={cn(
                REFERENCE_SURFACE_CLASS_NAMES.inset,
                "flex min-h-20 cursor-pointer items-start gap-3 px-4 py-3 transition-[background-color,border-color,box-shadow] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-300",
                handoffMethod === "invite_link" ? "border-primary-500 bg-white shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "hover:bg-primary-50/90",
              )}>
                <input checked={handoffMethod === "invite_link"} className="mt-1 size-4 accent-primary-700" name="handoff-method" onChange={() => onHandoffMethodChange("invite_link")} type="radio" value="invite_link" />
                <span><span className="block text-sm font-semibold text-secondary-900">Invite link</span><span className="mt-1 block text-xs leading-5 text-secondary-600">Manual share · expires after 24 hours · recipient sets a password</span></span>
              </label>
              <label className={cn(
                REFERENCE_SURFACE_CLASS_NAMES.inset,
                "flex min-h-20 cursor-pointer items-start gap-3 px-4 py-3 transition-[background-color,border-color,box-shadow] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-300",
                handoffMethod === "temporary_password" ? "border-primary-500 bg-white shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "hover:bg-primary-50/90",
              )}>
                <input checked={handoffMethod === "temporary_password"} className="mt-1 size-4 accent-primary-700" name="handoff-method" onChange={() => onHandoffMethodChange("temporary_password")} type="radio" value="temporary_password" />
                <span><span className="block text-sm font-semibold text-secondary-900">Temporary password</span><span className="mt-1 block text-xs leading-5 text-secondary-600">Manual share · shown once · recipient must change it on first login</span></span>
              </label>
            </div>

            <ReferenceSurface as="div" className="mt-5 px-4 py-4" variant="inset">
              <p className="text-sm font-semibold text-secondary-900">Confirmation counts</p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-5"><span className="text-secondary-600">New <strong className="text-secondary-900">{importStatus.counts.create}</strong></span><span className="text-secondary-600">Updates <strong className="text-secondary-900">{importStatus.counts.update}</strong></span><span className="text-secondary-600">Failed <strong className={importStatus.counts.failed ? "text-student-status-danger-fg" : "text-secondary-900"}>{importStatus.counts.failed}</strong></span><span className="text-secondary-600">Skipped <strong className="text-secondary-900">{importStatus.counts.skipped}</strong></span><span className="text-secondary-600">Unresolved <strong className={importStatus.counts.invalid ? "text-student-status-danger-fg" : "text-secondary-900"}>{importStatus.counts.invalid}</strong></span></div>
            </ReferenceSurface>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Button onClick={() => void cancelImport()} type="button" variant="dangerOutline"><X aria-hidden="true" size={16} />{cancelArmed ? "Confirm abandon draft" : "Abandon draft"}</Button>
                {cancelArmed ? <Button className="ml-2 text-xs" onClick={() => onCancelArmedChange(false)} size="default" type="button" variant="ghost">Keep draft</Button> : null}
                {cancelMessage ? <p aria-live="polite" className="mt-2 text-xs leading-5 text-secondary-600" role="status">{cancelBusy ? "Abandoning…" : cancelMessage}</p> : null}
              </div>
              <Button disabled={!canConfirm || confirmBusy || cancelBusy} onClick={() => void confirmImport()} size="lg" type="button" variant="brand"><CheckCircle2 aria-hidden="true" size={17} />{confirmBusy ? "Confirming…" : "Confirm and queue import"}</Button>
            </div>
            {confirmMessage ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-secondary-600" role="status">{confirmMessage}</p> : null}
          </ReferenceSurface>
        </>
      ) : (
        <>
          <ReferenceSurface as="section" aria-labelledby="result-heading" className="p-5 sm:p-6">
            <div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${toneClasses(copy.tone)}`}>{statusIcon(importStatus.status)}</span><div><h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="result-heading">Import result</h2><p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-500">{copy.detail}</p></div></div>
            <div className="mt-5"><CountStrip counts={importStatus.counts} mode="result" /></div>
            {importStatus.lastErrorMessage ? <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.danger}`} variant="inset"><p className="font-semibold">Operational note</p><p className="mt-1 text-xs leading-5">{importStatus.lastErrorMessage}</p></ReferenceSurface> : null}
          </ReferenceSurface>
          {importStatus.status === "completed" || importStatus.status === "partial" || importStatus.status === "failed" ? <HandoffDeliveryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={(kind) => onSessionIssueChange(kind)} /> : null}
          <RetryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={(kind) => onSessionIssueChange(kind)} />
          <ImportRowTable importStatus={importStatus} />
        </>
      )}
    </div>
  );
}

type ImportDetailActionSetters = {
  setConfirmBusy: (busy: boolean) => void;
  setConfirmMessage: (message: string) => void;
  setPollError: (hasError: boolean) => void;
  setSessionIssue: (issue: "expired" | "forbidden" | null) => void;
};

function useImportDetailActions({
  canConfirm,
  handoffMethod,
  importId,
  loadStatus,
  setters,
}: {
  canConfirm: boolean;
  handoffMethod: HandoffMethod;
  importId: string;
  loadStatus: ImportStatusLoader;
  setters: ImportDetailActionSetters;
}) {
  const {
    setConfirmBusy,
    setConfirmMessage,
    setPollError,
    setSessionIssue,
  } = setters;

  const confirmImport = useCallback(async () => {
    if (!canConfirm) return;
    setConfirmBusy(true);
    setConfirmMessage("Saving the handoff method and queueing this import…");
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importId)}/confirm`, {
        body: JSON.stringify({ handoffMethod }),
        cache: "no-store",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        setSessionIssue(recovery);
        setPollError(false);
        return;
      }
      if (!response.ok) {
        const message = apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The import could not be confirmed.");
        setConfirmMessage(message);
        toast.error("Bulk import blocked", { description: message });
        return;
      }
      setConfirmMessage("Import queued. This page will poll the database status and stop on a terminal result.");
      await loadStatus();
    } catch {
      const message = "The confirmation could not reach the server. Refresh before trying again.";
      setConfirmMessage(message);
      toast.error("Import confirmation unavailable", { description: message });
    } finally {
      setConfirmBusy(false);
    }
  }, [canConfirm, handoffMethod, importId, loadStatus, setConfirmBusy, setConfirmMessage, setPollError, setSessionIssue]);

  return { confirmImport };
}

type ImportDetailState = {
  activeSince: number | null;
  cancelArmed: boolean;
  cancelBusy: boolean;
  cancelMessage: string;
  confirmBusy: boolean;
  confirmMessage: string;
  handoffMethod: HandoffMethod;
  importStatus: ImportStatusDto;
  lastFetchedAt: number;
  pollError: boolean;
  refreshing: boolean;
  sessionIssue: "expired" | "forbidden" | null;
};

type ImportDetailAction =
  | { type: "cancelArmed"; value: boolean }
  | { type: "cancelBusy"; value: boolean }
  | { type: "cancelMessage"; value: string }
  | { type: "confirmBusy"; value: boolean }
  | { type: "confirmMessage"; value: string }
  | { type: "handoffMethod"; value: HandoffMethod }
  | { type: "pollError"; value: boolean }
  | { type: "refreshFinished" }
  | { type: "refreshStarted" }
  | { type: "sessionIssue"; value: "expired" | "forbidden" | null }
  | { fetchedAt: number; importStatus: ImportStatusDto; type: "statusLoaded" };

function importDetailReducer(
  state: ImportDetailState,
  action: ImportDetailAction,
): ImportDetailState {
  switch (action.type) {
    case "cancelArmed":
      return { ...state, cancelArmed: action.value };
    case "cancelBusy":
      return { ...state, cancelBusy: action.value };
    case "cancelMessage":
      return { ...state, cancelMessage: action.value };
    case "confirmBusy":
      return { ...state, confirmBusy: action.value };
    case "confirmMessage":
      return { ...state, confirmMessage: action.value };
    case "handoffMethod":
      return { ...state, handoffMethod: action.value };
    case "pollError":
      return { ...state, pollError: action.value };
    case "refreshFinished":
      return { ...state, refreshing: false };
    case "refreshStarted":
      return { ...state, refreshing: true };
    case "sessionIssue":
      return { ...state, sessionIssue: action.value };
    case "statusLoaded":
      return {
        ...state,
        activeSince: isImportPollingStatus(action.importStatus.status)
          ? state.activeSince ?? action.fetchedAt
          : null,
        handoffMethod: action.importStatus.handoffMethod ?? state.handoffMethod,
        importStatus: action.importStatus,
        lastFetchedAt: action.fetchedAt,
        pollError: false,
        sessionIssue: null,
      };
  }
}

function ImportDetailModule({ initialImport }: { initialImport: ImportStatusDto }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(importDetailReducer, initialImport, (importStatus) => ({
    activeSince: isImportPollingStatus(importStatus.status) ? Date.now() : null,
    cancelArmed: false,
    cancelBusy: false,
    cancelMessage: "",
    confirmBusy: false,
    confirmMessage: "",
    handoffMethod: importStatus.handoffMethod ?? "invite_link",
    importStatus,
    lastFetchedAt: Date.now(),
    pollError: false,
    refreshing: false,
    sessionIssue: null,
  }));
  const {
    activeSince,
    cancelArmed,
    cancelBusy,
    cancelMessage,
    confirmBusy,
    confirmMessage,
    handoffMethod,
    importStatus,
    lastFetchedAt,
    pollError,
    refreshing,
    sessionIssue,
  } = state;
  const [clock, setClock] = useState(() => Date.now());
  const [pageVisible, setPageVisible] = useState(true);
  const pollAttemptRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollSequenceRef = useRef(0);
  const pageVisibleRef = useRef(true);
  const priorityRefreshRef = useRef<"manual" | "resume" | null>(null);
  const priorityRefreshWaitersRef = useRef(new Set<() => void>());

  const settlePriorityRefreshWaiters = useCallback(() => {
    const waiters = [...priorityRefreshWaitersRef.current];
    priorityRefreshWaitersRef.current.clear();
    waiters.forEach((resolve) => resolve());
  }, []);

  const waitForPriorityRefresh = useCallback(() => new Promise<void>((resolve) => {
    if (!priorityRefreshRef.current) {
      resolve();
      return;
    }
    priorityRefreshWaitersRef.current.add(resolve);
  }), []);

  const loadStatus = useCallback(async ({ source = "manual" }: { source?: "manual" | "poll" | "resume" } = {}) => {
    if (source === "poll" && !pageVisibleRef.current) return false;
    const isPriorityRefresh = isImportPriorityRefreshSource(source);
    if (isPriorityRefresh) priorityRefreshRef.current = source;
    const sequence = pollSequenceRef.current + 1;
    pollSequenceRef.current = sequence;
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;
    dispatch({ type: "refreshStarted" });
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(initialImport.importId)}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (controller.signal.aborted || sequence !== pollSequenceRef.current) return false;
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        dispatch({ type: "sessionIssue", value: recovery });
        dispatch({ type: "pollError", value: false });
        return false;
      }
      if (!response.ok || !payload || typeof payload !== "object" || !("import" in payload)) {
        dispatch({ type: "pollError", value: true });
        return false;
      }
      const nextImport = (payload as { import: ImportStatusDto }).import;
      dispatch({ fetchedAt: Date.now(), importStatus: nextImport, type: "statusLoaded" });
      return true;
    } catch (error) {
      if (controller.signal.aborted || sequence !== pollSequenceRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return false;
      }
      dispatch({ type: "pollError", value: true });
      return false;
    } finally {
      if (sequence === pollSequenceRef.current) {
        dispatch({ type: "refreshFinished" });
        pollAbortRef.current = null;
        if (isPriorityRefresh) {
          priorityRefreshRef.current = null;
          settlePriorityRefreshWaiters();
        }
      }
    }
  }, [initialImport.importId, settlePriorityRefreshWaiters]);

  const heartbeatTimestamp = importStatus.lastHeartbeatAt ? Date.parse(importStatus.lastHeartbeatAt) : Number.NaN;
  const heartbeatGraceMs = 45_000;
  const heartbeatIsStale = isImportPollingStatus(importStatus.status)
    && (Number.isFinite(heartbeatTimestamp)
      ? clock - heartbeatTimestamp > heartbeatGraceMs
      : activeSince !== null && clock - activeSince > heartbeatGraceMs);

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isImportPollingStatus(importStatus.status) || sessionIssue || !pageVisible) return;
    let cancelled = false;
    let timer: number | undefined;

    const schedulePoll = () => {
      if (cancelled) return;
      const decision = getImportPollLifecycleDecision({
        pageVisible: pageVisibleRef.current,
        priorityRefreshPending: Boolean(priorityRefreshRef.current),
      });
      if (decision === "pause_hidden") return;
      if (decision === "wait_for_priority_refresh") {
        void waitForPriorityRefresh().then(() => {
          if (!cancelled) schedulePoll();
        });
        return;
      }
      timer = window.setTimeout(poll, getImportPollDelayMs(pollAttemptRef.current, heartbeatIsStale));
    };

    const poll = async () => {
      if (cancelled || !pageVisibleRef.current) return;
      const decision = getImportPollLifecycleDecision({
        pageVisible: pageVisibleRef.current,
        priorityRefreshPending: Boolean(priorityRefreshRef.current),
      });
      if (decision === "pause_hidden") return;
      if (decision === "wait_for_priority_refresh") {
        await waitForPriorityRefresh();
        if (cancelled || !pageVisibleRef.current) return;
      }
      const succeeded = await loadStatus({ source: "poll" });
      pollAttemptRef.current = succeeded && !heartbeatIsStale
        ? 0
        : Math.min(pollAttemptRef.current + 1, 4);
      if (!cancelled && pageVisibleRef.current) {
        schedulePoll();
      }
    };

    schedulePoll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [heartbeatIsStale, importStatus.status, loadStatus, pageVisible, sessionIssue, waitForPriorityRefresh]);

  useEffect(() => {
    const abortStatusRead = () => {
      pageVisibleRef.current = false;
      setPageVisible(false);
      priorityRefreshRef.current = null;
      settlePriorityRefreshWaiters();
      pollSequenceRef.current += 1;
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
    };
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || pageVisibleRef.current) return;
      pageVisibleRef.current = true;
      setPageVisible(true);
      pollAttemptRef.current = 0;
      void loadStatus({ source: "resume" });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshOnReturn();
      else abortStatusRead();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", abortStatusRead);
    window.addEventListener("pageshow", refreshOnReturn);
    if (document.visibilityState !== "visible") abortStatusRead();
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", abortStatusRead);
      window.removeEventListener("pageshow", refreshOnReturn);
      pollSequenceRef.current += 1;
      pollAbortRef.current?.abort();
      pollAbortRef.current = null;
      priorityRefreshRef.current = null;
      settlePriorityRefreshWaiters();
    };
  }, [loadStatus, settlePriorityRefreshWaiters]);

  const readIsStale = isImportPollingStatus(importStatus.status) && pollError && clock - lastFetchedAt > 30_000;

  const canConfirm = canConfirmImport(importStatus.status, importStatus.rowCount, importStatus.counts);
  const { confirmImport } = useImportDetailActions({
    canConfirm,
    handoffMethod,
    importId: importStatus.importId,
    loadStatus,
    setters: {
      setConfirmBusy: (value) => dispatch({ type: "confirmBusy", value }),
      setConfirmMessage: (value) => dispatch({ type: "confirmMessage", value }),
      setPollError: (value) => dispatch({ type: "pollError", value }),
      setSessionIssue: (value) => dispatch({ type: "sessionIssue", value }),
    },
  });

  async function cancelImport() {
    if (!cancelArmed) {
      dispatch({ type: "cancelArmed", value: true });
      return;
    }
    dispatch({ type: "cancelBusy", value: true });
    dispatch({ type: "cancelMessage", value: "Abandoning this draft…" });
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/cancel`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const payload = await readJson(response);
      const recovery = responseSessionIssue(response, payload);
      if (recovery) {
        dispatch({ type: "sessionIssue", value: recovery });
        dispatch({ type: "pollError", value: false });
        return;
      }
      if (!response.ok) {
        dispatch({ type: "cancelMessage", value: apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The draft could not be abandoned.") });
        return;
      }
      dispatch({ type: "cancelArmed", value: false });
      dispatch({ type: "cancelMessage", value: "Draft abandoned. No account changes were made." });
      await loadStatus();
      router.refresh();
    } catch {
      dispatch({ type: "cancelMessage", value: "The cancel action could not reach the server. Refresh and try again." });
    } finally {
      dispatch({ type: "cancelBusy", value: false });
    }
  }

  return (
    <ImportDetailView
      cancelArmed={cancelArmed}
      cancelBusy={cancelBusy}
      cancelImport={cancelImport}
      cancelMessage={cancelMessage}
      confirmBusy={confirmBusy}
      confirmImport={confirmImport}
      confirmMessage={confirmMessage}
      handoffMethod={handoffMethod}
      heartbeatIsStale={heartbeatIsStale}
      importStatus={importStatus}
      lastFetchedAt={lastFetchedAt}
      loadStatus={loadStatus}
      onCancelArmedChange={(value) => dispatch({ type: "cancelArmed", value })}
      onHandoffMethodChange={(value) => dispatch({ type: "handoffMethod", value })}
      onSessionIssueChange={(value) => dispatch({ type: "sessionIssue", value })}
      pollError={pollError}
      readIsStale={readIsStale}
      refreshing={refreshing}
      sessionIssue={sessionIssue}
    />
  );
}

export { ImportDetailModule };
