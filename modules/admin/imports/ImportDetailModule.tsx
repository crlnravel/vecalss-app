"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
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
} from "lucide-react";

import type { ImportStatusDto } from "@/lib/admin/imports/service";
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
  invalid_rows_pending_skip: "Skip every invalid row before confirming the import.",
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
  switch (tone) {
    case "danger": return "border-[#e3c2bb] bg-[#fff0ee] text-[#8b3f32]";
    case "info": return "border-[#b7ddc3] bg-[#eef8f1] text-[#176b4d]";
    case "success": return "border-[#9ed1ac] bg-[#eef8f1] text-[#176b4d]";
    case "warning": return "border-[#ead899] bg-[#fff5cf] text-[#725400]";
    default: return "border-[#d6e5db] bg-[#f1f5f2] text-[#506a5d]";
  }
}

function rowStatusCopy(status: RowStatus) {
  switch (status) {
    case "created": return { icon: <CheckCircle2 aria-hidden="true" size={14} />, label: "Created", tone: "success" };
    case "updated": return { icon: <Check aria-hidden="true" size={14} />, label: "Updated", tone: "success" };
    case "failed": return { icon: <CircleX aria-hidden="true" size={14} />, label: "Failed", tone: "danger" };
    case "invalid": return { icon: <CircleAlert aria-hidden="true" size={14} />, label: "Needs review", tone: "warning" };
    case "skipped": return { icon: <SkipForward aria-hidden="true" size={14} />, label: "Skipped", tone: "neutral" };
    case "processing": return { icon: <RefreshCw aria-hidden="true" size={14} />, label: "Processing", tone: "info" };
    default: return { icon: <FileClock aria-hidden="true" size={14} />, label: "Ready", tone: "info" };
  }
}

function rowIssueLabel(code: string | null) {
  if (!code) return null;
  if (code === "duplicate_email_in_file") return "Duplicate in this file";
  if (["opposite_role", "role_conflict", "revoked_role", "soft_deleted_user", "inactive_account"].includes(code)) return "Account or role conflict";
  if (code === "changed_since_preview") return "Changed since preview";
  return code.replaceAll("_", " ");
}

function ImportInputSummary({ input }: { input: ImportStatusDto["rows"][number]["input"] }) {
  const entries = Object.entries(input)
    .filter(([key, value]) => key !== "email" && value !== null && value !== "")
    .map(([key, value]) => ({ key, value: String(value) }));

  if (entries.length === 0) return null;

  return (
    <div className="mt-1 space-y-1 text-xs leading-5 text-[#5f776a]">
      {entries.map(({ key, value }) => {
        const isLongBio = key === "bio" && value.trim().length > MAX_KAPTEN_BIO_PREVIEW_LENGTH;
        return (
          <div key={key}>
            <span>{key.replaceAll("_", " ")}: {isLongBio ? getBoundedKaptenBioPreview(value) : value}</span>
            {isLongBio ? (
              <details className="mt-1">
                <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-bold text-[#014c38] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]">View full bio ({value.trim().length} characters)</summary>
                <p className="mt-1 max-w-[48ch] whitespace-pre-wrap rounded-xl bg-[#f8fcf9] px-3 py-2 text-xs leading-5 text-[#173c2d]">{value}</p>
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
    <section aria-labelledby="import-session-recovery-heading" className="flex flex-col gap-3 rounded-[22px] border border-[#e3c2bb] bg-[#fff0ee] p-5 text-[#8b3f32] sm:flex-row sm:items-start sm:justify-between sm:p-6" role="alert">
      <div>
        <p className="text-base font-bold" id="import-session-recovery-heading">{kind === "expired" ? "Admin session expired" : "Admin permission required"}</p>
        <p className="mt-1 max-w-[68ch] text-sm leading-6">{kind === "expired" ? "Sign in again to return to this import review. The import ID stays in this page context; credentials are never included in the recovery link." : "This admin account can no longer review the import. Sign in with an active admin account or return to the admin home."}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center rounded-xl border border-[#c87868] px-3 text-sm font-bold text-[#8b3f32] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c87868]" href={getImportLoginRecoveryHref(`/admin/imports/${encodeURIComponent(importId)}`)}>
          {kind === "expired" ? "Sign in again" : "Sign in as admin"}
        </Link>
        <button className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-bold text-[#8b3f32] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c87868]" onClick={onRefresh} type="button">Refresh page</button>
      </div>
    </section>
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
        <div className="rounded-2xl border border-[#d6e5db] bg-[#f8fcf9] px-3 py-3" key={label}>
          <dt className="text-xs font-semibold text-[#5f776a]">{label}</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums tracking-[-0.03em] text-[#173c2d]">{value.toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}

function ImportProgressPanel({ importStatus }: { importStatus: ImportStatusDto }) {
  if (!isImportPollingStatus(importStatus.status)) return null;
  const progress = getImportProgressSnapshot(importStatus.counts);
  const progressMax = Math.max(progress.total, 1);

  return (
    <section aria-labelledby="import-progress-heading" className="rounded-[22px] border border-[#b7ddc3] bg-[#f8fcf9] p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="import-progress-heading">Import progress</h2>
          <p className="mt-1 text-sm leading-6 text-[#5f776a]">The worker reports durable row outcomes from PostgreSQL. This page will keep polling until the import reaches a terminal state.</p>
        </div>
        <p className="text-sm font-bold tabular-nums text-[#014c38]">{progress.percent}% complete</p>
      </div>
      <div aria-label={`Import progress: ${progress.processed} of ${progress.total} rows processed`} aria-valuemax={progressMax} aria-valuemin={0} aria-valuenow={progress.processed} aria-valuetext={`${progress.processed} of ${progress.total} rows processed`} className="mt-5 h-3 overflow-hidden rounded-full bg-[#dceee1]" role="progressbar">
        <div className="h-full rounded-full bg-[#2f8a5d] transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-2 text-sm font-bold tabular-nums text-[#173c2d]">Processed {progress.processed} of {progress.total} rows</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Pending", progress.pending],
          ["Processing", progress.processing],
          ["Remaining", progress.remaining],
          ["Rows with outcomes", progress.processed],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-[#d6e5db] bg-white px-3 py-3" key={label}>
            <dt className="text-xs font-semibold text-[#5f776a]">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums text-[#173c2d]">{value.toLocaleString("en-US")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ImportStatusBanner({ importStatus }: { importStatus: ImportStatusDto }) {
  const copy = statusCopy(importStatus.status);
  return (
    <section aria-live="polite" className={`rounded-[22px] border p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6 ${toneClasses(copy.tone)}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/70">{statusIcon(importStatus.status)}</span>
          <div>
            <p className="text-lg font-bold tracking-[-0.02em]">{copy.label}</p>
            <p className="mt-1 max-w-[65ch] text-sm leading-6 opacity-85">{copy.detail}</p>
          </div>
        </div>
        <div className="text-left text-xs sm:text-right">
          <p className="font-semibold">Last saved</p>
          <time className="mt-1 block opacity-80" dateTime={importStatus.updatedAt}>{formatDate(importStatus.updatedAt)}</time>
        </div>
      </div>
    </section>
  );
}

function ImportRowTable({
  importStatus,
  onToggleInvalid,
  selectedInvalidRows,
}: {
  importStatus: ImportStatusDto;
  onToggleInvalid: (rowId: string) => void;
  selectedInvalidRows: Set<string>;
}) {
  const invalidRows = importStatus.rows.filter((row) => row.status === "invalid");
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#d6e5db] bg-white shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)]">
      <div className="flex flex-col gap-3 border-b border-[#e7f0ea] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]">Preview rows</h2>
          <p className="mt-1 text-sm leading-6 text-[#5f776a]">Each row keeps its original operation decision. Existing email matches update the role profile only.</p>
        </div>
        {invalidRows.length > 0 ? (
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d7bf75] px-3 text-sm font-bold text-[#725400] hover:bg-[#fff9df] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad8d2c]" onClick={() => invalidRows.filter((row) => selectedInvalidRows.size === invalidRows.length || !selectedInvalidRows.has(row.rowId)).forEach((row) => onToggleInvalid(row.rowId))} type="button">
            <CircleAlert aria-hidden="true" size={15} />
            {selectedInvalidRows.size === invalidRows.length ? "Clear invalid selection" : "Select invalid rows"}
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-[#e7f0ea] text-xs font-bold text-[#5f776a]">
            <tr>
              <th className="w-14 px-4 py-3 font-bold"><span className="sr-only">Select</span></th>
              <th className="px-3 py-3 font-bold">Row</th>
              <th className="px-3 py-3 font-bold">Email</th>
              <th className="px-3 py-3 font-bold">Operation</th>
              <th className="px-3 py-3 font-bold">State</th>
              <th className="px-3 py-3 font-bold">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {importStatus.rows.map((row) => {
              const copy = rowStatusCopy(row.status as RowStatus);
              const isInvalid = row.status === "invalid";
              return (
                <tr className={`border-b border-[#edf3ee] last:border-b-0 ${isInvalid ? "bg-[#fffdf5]" : ""}`} key={row.rowId}>
                  <td className="px-4 py-3 align-top">
                    {isInvalid ? (
                      <label className="flex min-h-11 items-center justify-center" title={`Select row ${row.rowNumber} to skip`}>
                        <input aria-label={`Select invalid row ${row.rowNumber} to skip`} checked={selectedInvalidRows.has(row.rowId)} className="size-4 accent-[#014c38]" onChange={() => onToggleInvalid(row.rowId)} type="checkbox" />
                      </label>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 align-top font-bold tabular-nums text-[#173c2d]">{row.rowNumber}</td>
                  <td className="max-w-[240px] px-3 py-3 align-top">
                    <span className="block truncate font-semibold text-[#173c2d]">{row.normalizedEmail || "No email"}</span>
                    <ImportInputSummary input={row.input} />
                  </td>
                  <td className="px-3 py-3 align-top text-[#5f776a]">{row.operation === "create" ? "Create" : row.operation === "update" ? "Update profile" : "No operation"}</td>
                  <td className="px-3 py-3 align-top">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${copy.tone === "danger" ? "border-[#e3c2bb] bg-[#fff0ee] text-[#8b3f32]" : copy.tone === "warning" ? "border-[#ead899] bg-[#fff5cf] text-[#725400]" : copy.tone === "success" ? "border-[#b7ddc3] bg-[#eef8f1] text-[#176b4d]" : "border-[#d6e5db] bg-[#f1f5f2] text-[#506a5d]"}`}>
                      {copy.icon}
                      {copy.label}
                    </span>
                  </td>
                  <td className="max-w-[270px] px-3 py-3 align-top text-xs leading-5 text-[#5f776a]">
                    {row.errorMessage ? <><span className="font-bold text-[#725400]">{rowIssueLabel(row.errorCode)}</span><span className="mt-0.5 block">{row.errorMessage}</span></> : row.status === "created" && row.handoffStatus ? `${methodLabel(row.handoffMethod)} handoff · ${row.handoffStatus.replaceAll("_", " ")}` : "Ready for the next step."}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="flex items-start gap-3 rounded-2xl border border-[#ead899] bg-[#fff9df] px-4 py-3 text-sm text-[#725400]" role="status">
      <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} />
      <div>
        <p className="font-bold">
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
    </div>
  );
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
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [acknowledgeIntent, setAcknowledgeIntent] = useState(false);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [acknowledgeBusy, setAcknowledgeBusy] = useState(false);
  const [reissueBusy, setReissueBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const pendingRows = importStatus.rows.filter((row) => isPendingHandoffRow(row));
  const releasedRows = importStatus.rows.filter((row) => row.handoffId && row.handoffStatus === "released" && !row.handoffAcknowledgedAt);
  const expiredRows = importStatus.rows.filter((row) => getHandoffSelectionState(row) === "expired");
  const handoffState = getHandoffDeliveryState(importStatus.rows);
  const selectedIds = [...selectedRows];
  const acknowledgementIds = downloadedIds.size ? [...downloadedIds] : selectedIds;
  const method = importStatus.handoffMethod;

  const toggleRow = (rowId: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  async function downloadFile() {
    if (!selectedIds.length || !acknowledgeIntent) return;
    setDownloadBusy(true);
    setMessage("Preparing the one-time file in memory…");
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
        setMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The one-time file could not be released. Refresh and review the handoff state."));
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
      setDownloadedIds(new Set(selectedIds));
      setMessage(`Downloaded ${selectedIds.length} ${selectedIds.length === 1 ? "handoff" : "handoffs"}. Transfer the file now; the credentials will not be released again.`);
      setSelectedRows(new Set());
      setAcknowledgeIntent(false);
      setTransferConfirmed(false);
      await onRefresh();
    } catch {
      setMessage("The one-time file could not be downloaded. Refresh before trying again.");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function acknowledgeTransfer() {
    const ids = [...downloadedIds].length ? [...downloadedIds] : selectedIds;
    if (!ids.length || !transferConfirmed) return;
    setAcknowledgeBusy(true);
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
        setMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The acknowledgement could not be recorded. Refresh and try again."));
        return;
      }
      setMessage("Handoff acknowledgement recorded. The one-time credentials remain out of the app state.");
      setDownloadedIds(new Set());
      setSelectedRows(new Set());
      setAcknowledgeIntent(false);
      setTransferConfirmed(false);
      await onRefresh();
    } catch {
      setMessage("The acknowledgement could not reach the server. Refresh and try again.");
    } finally {
      setAcknowledgeBusy(false);
    }
  }

  async function reissueHandoff(handoffId: string) {
    setReissueBusy(handoffId);
    setMessage("Creating a sealed replacement handoff…");
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
        setMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The replacement handoff could not be created."));
        return;
      }
      setMessage("Replacement handoff ready. Select it below and download the new one-time file.");
      setDownloadedIds(new Set());
      setSelectedRows(new Set());
      setTransferConfirmed(false);
      await onRefresh();
    } catch {
      setMessage("The replacement request could not reach the server. Refresh and try again.");
    } finally {
      setReissueBusy(null);
    }
  }

  if (!method || handoffState === "not_applicable") {
    return null;
  }

  if (handoffState === "all_acknowledged") {
    return (
      <section aria-labelledby="handoff-file-heading" className="rounded-[22px] border border-[#b7ddc3] bg-[#f8fcf9] p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef8f1] text-[#176b4d]"><CheckCircle2 size={19} /></span>
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="handoff-file-heading">All handoffs acknowledged</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[#5f776a]">Every released credential file for this import has been confirmed as transferred. No handoff file remains available to download.</p>
          </div>
        </div>
      </section>
    );
  }

  if (handoffState === "terminal") {
    return (
      <section aria-labelledby="handoff-file-heading" className="rounded-[22px] border border-[#d6e5db] bg-[#f8fcf9] p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.45)] sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef8f1] text-[#506a5d]"><FileClock size={19} /></span>
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="handoff-file-heading">No handoff action remains</h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[#5f776a]">Every new-account handoff for this import is terminal. Completed or revoked handoffs cannot be downloaded, reissued, or acknowledged here.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="handoff-file-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="handoff-file-heading">One-time handoff file</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[#5f776a]">This import uses one method for all new accounts: <span className="font-bold text-[#173c2d]">{methodLabel(method)}</span>. The file is generated in memory and is never stored.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eef8f1] px-3 py-1.5 text-xs font-bold text-[#176b4d]"><Info aria-hidden="true" size={14} /> Credentials shown once</span>
      </div>

      <div className="mt-4 rounded-2xl bg-[#f8fcf9] px-4 py-3 text-sm leading-6 text-[#5f776a]">
        {method === "invite_link"
          ? "Invite links expire after 24 hours and are used once. Share the link manually; no email delivery is implied. The recipient follows it to set a password."
          : "Temporary passwords work for the first login only and require a password change. Share the file securely; no email delivery is implied."}
      </div>

      {pendingRows.length > 0 ? (
        <div className="mt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-[#173c2d]">Pending new-account handoffs</p>
            <button className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-bold text-[#014c38] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={() => setSelectedRows((current) => current.size === pendingRows.length ? new Set() : new Set(pendingRows.map((row) => row.handoffId).filter((id): id is string => Boolean(id))))} type="button">
              {selectedRows.size === pendingRows.length ? "Clear selection" : "Select all pending"}
            </button>
          </div>
          <div className="mt-2 divide-y divide-[#e7f0ea] rounded-2xl border border-[#d6e5db]">
            {pendingRows.map((row) => (
              <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
                <input aria-label={`Select handoff for row ${row.rowNumber}`} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-[#014c38]" onChange={() => row.handoffId && toggleRow(row.handoffId)} type="checkbox" />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-[#173c2d]">Row {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs text-[#5f776a]">Expires {formatDate(row.handoffExpiresAt)}</span></span>
                <span className="rounded-full bg-[#eef8f1] px-2 py-1 text-xs font-bold text-[#176b4d]">Pending</span>
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[#d6e5db] bg-white px-4 py-3 text-xs leading-5 text-[#5f776a]">
            <input checked={acknowledgeIntent} className="mt-1 size-4 accent-[#014c38]" onChange={(event) => setAcknowledgeIntent(event.target.checked)} type="checkbox" />
            <span>I will share this file through a secure channel and understand the selected credentials cannot be recovered after release.</span>
          </label>
          <button className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#014c38] px-4 text-sm font-bold text-white hover:bg-[#176b4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a] disabled:cursor-not-allowed disabled:opacity-55" disabled={!selectedIds.length || !acknowledgeIntent || downloadBusy} onClick={downloadFile} type="button">
            <Download aria-hidden="true" size={16} />
            {downloadBusy ? "Preparing file…" : `Download selected (${selectedIds.length})`}
          </button>
        </div>
      ) : null}

      {releasedRows.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-[#ead899] bg-[#fff9df] px-4 py-4 text-sm text-[#725400]">
          <p className="font-bold">Some credentials are already released</p>
          <p className="mt-1 text-xs leading-5">The response cannot be downloaded again. If the file was lost, start a new preview/import for those accounts; do not expect the old credentials to reappear. Once you have transferred the file, acknowledge the released rows below.</p>
          <div className="mt-3 space-y-2">
            {releasedRows.map((row) => (
              <div className="flex min-h-11 items-center gap-3 rounded-xl border border-[#ead899] bg-white/50 px-3 py-2 text-xs" key={row.rowId}>
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input aria-label={`Select released handoff for row ${row.rowNumber}`} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-[#725400]" onChange={() => row.handoffId && toggleRow(row.handoffId)} type="checkbox" />
                  <span className="truncate">Row {row.rowNumber} · {row.normalizedEmail}</span>
                </label>
                <span className="font-bold">Already released</span>
                {row.handoffId ? <button className="inline-flex min-h-11 items-center rounded-lg px-2 font-bold text-[#725400] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad8d2c] disabled:cursor-not-allowed disabled:opacity-55" disabled={reissueBusy !== null} onClick={() => void reissueHandoff(row.handoffId as string)} type="button">{reissueBusy === row.handoffId ? "Reissuing…" : "Reissue"}</button> : null}
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-[#725400]">
            <input checked={transferConfirmed} className="mt-1 size-4 accent-[#725400]" onChange={(event) => setTransferConfirmed(event.target.checked)} type="checkbox" />
            <span>I confirm the released file was transferred through a secure channel.</span>
          </label>
          <button className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b79d47] px-4 text-sm font-bold text-[#725400] hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad8d2c] disabled:cursor-not-allowed disabled:opacity-55" disabled={!acknowledgementIds.length || !transferConfirmed || acknowledgeBusy} onClick={acknowledgeTransfer} type="button">
            <Check aria-hidden="true" size={16} />
            {acknowledgeBusy ? "Saving…" : "Acknowledge transfer"}
          </button>
        </div>
      ) : null}

      {expiredRows.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e3c2bb] bg-[#fff0ee] px-4 py-3 text-xs leading-5 text-[#8b3f32]">
          <p className="font-bold">Expired handoffs need a new preview</p>
          <p className="mt-1">Expired invite secrets are no longer releasable. Reissue a sealed replacement here, then select the new pending row for download. If the source data is wrong, create a new preview instead.</p>
          <div className="mt-3 space-y-2">
            {expiredRows.map((row) => (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#e3c2bb] bg-white/50 px-3 py-2" key={row.rowId}>
                <span className="truncate text-xs">Row {row.rowNumber} · {row.normalizedEmail}</span>
                {row.handoffId ? <button className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-bold text-[#8b3f32] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c87868] disabled:cursor-not-allowed disabled:opacity-55" disabled={reissueBusy !== null} onClick={() => void reissueHandoff(row.handoffId as string)} type="button">{reissueBusy === row.handoffId ? "Reissuing…" : "Reissue"}</button> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {downloadedIds.size > 0 && releasedRows.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-[#b7ddc3] bg-[#eef8f1] px-4 py-3 text-sm text-[#176b4d]">
          <p className="font-bold">File downloaded</p>
          <p className="mt-1 text-xs leading-5">Confirm that the file reached the recipient. The acknowledgement records the handoff; it does not expose the credentials again.</p>
          <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-[#176b4d]">
            <input checked={transferConfirmed} className="mt-1 size-4 accent-[#014c38]" onChange={(event) => setTransferConfirmed(event.target.checked)} type="checkbox" />
            <span>I confirm the released file was transferred through a secure channel.</span>
          </label>
          <button className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#73bc8a] px-4 text-sm font-bold text-[#014c38] hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a] disabled:cursor-not-allowed disabled:opacity-55" disabled={!transferConfirmed || acknowledgeBusy} onClick={acknowledgeTransfer} type="button">
            <Check aria-hidden="true" size={16} />
            {acknowledgeBusy ? "Saving…" : "Acknowledge transfer"}
          </button>
        </div>
      ) : null}

      {message ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-[#5f776a]" role="status">{message}</p> : null}
    </section>
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
    <section aria-labelledby="retry-heading" className="rounded-[22px] border border-[#e3c2bb] bg-[#fffaf8] p-5 shadow-[0_20px_46px_-42px_rgba(139,63,50,0.35)] sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="retry-heading">Review failed rows</h2>
          <p className="mt-1 text-sm leading-6 text-[#5f776a]">Retry is for transient or operational failures. Data corrections require a new preview/import.</p>
        </div>
        <span className="rounded-full bg-[#fff0ee] px-3 py-1.5 text-xs font-bold text-[#8b3f32]">{failedRows.length} failed</span>
      </div>
      <div className="mt-4 divide-y divide-[#f0dfdb] rounded-2xl border border-[#e3c2bb] bg-white">
        {failedRows.map((row) => (
          <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
            <input aria-label={`Select failed row ${row.rowNumber} for retry`} checked={selectedRows.has(row.rowId)} className="size-4 accent-[#8b3f32]" onChange={() => toggleRow(row.rowId)} type="checkbox" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-[#173c2d]">Row {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs leading-5 text-[#8b3f32]">{row.errorMessage ?? row.errorCode?.replaceAll("_", " ") ?? "Operational failure"}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-11 items-center gap-2 text-xs text-[#5f776a]"><input checked={retryAll} className="size-4 accent-[#8b3f32]" onChange={(event) => setRetryAll(event.target.checked)} type="checkbox" /> Retry all failed rows</label>
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b3f32] px-4 text-sm font-bold text-white hover:bg-[#713126] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c87868] disabled:cursor-not-allowed disabled:opacity-55" disabled={busy || (!retryAll && !selectedRows.size)} onClick={retryRows} type="button">
          <RotateCcw aria-hidden="true" size={16} />
          {busy ? "Queueing retry…" : retryAll ? "Retry all failed" : `Retry selected (${selectedRows.size})`}
        </button>
      </div>
      {message ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-[#5f776a]" role="status">{message}</p> : null}
    </section>
  );
}

function ImportDetailModule({ initialImport }: { initialImport: ImportStatusDto }) {
  const router = useRouter();
  const [importStatus, setImportStatus] = useState(initialImport);
  const [refreshing, setRefreshing] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [sessionIssue, setSessionIssue] = useState<"expired" | "forbidden" | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => Date.now());
  const [selectedInvalidRows, setSelectedInvalidRows] = useState<Set<string>>(new Set());
  const [skipBusy, setSkipBusy] = useState(false);
  const [skipMessage, setSkipMessage] = useState("");
  const [handoffMethod, setHandoffMethod] = useState<HandoffMethod>(initialImport.handoffMethod ?? "invite_link");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [cancelArmed, setCancelArmed] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const [pageVisible, setPageVisible] = useState(true);
  const pollAttemptRef = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const pollSequenceRef = useRef(0);
  const pageVisibleRef = useRef(true);
  const priorityRefreshRef = useRef<"manual" | "resume" | null>(null);
  const priorityRefreshWaitersRef = useRef(new Set<() => void>());
  const [activeSince, setActiveSince] = useState<number | null>(() => isImportPollingStatus(initialImport.status) ? Date.now() : null);

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
    setRefreshing(true);
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
        setSessionIssue(recovery);
        setPollError(false);
        return false;
      }
      if (!response.ok || !payload || typeof payload !== "object" || !("import" in payload)) {
        setPollError(true);
        return false;
      }
      const nextImport = (payload as { import: ImportStatusDto }).import;
      setActiveSince((current) => isImportPollingStatus(nextImport.status) ? current ?? Date.now() : null);
      setImportStatus(nextImport);
      setHandoffMethod((current) => nextImport.handoffMethod ?? current);
      setLastFetchedAt(Date.now());
      setPollError(false);
      setSessionIssue(null);
      return true;
    } catch (error) {
      if (controller.signal.aborted || sequence !== pollSequenceRef.current || (error instanceof DOMException && error.name === "AbortError")) {
        return false;
      }
      setPollError(true);
      return false;
    } finally {
      if (sequence === pollSequenceRef.current) {
        setRefreshing(false);
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

  const invalidRows = useMemo(() => importStatus.rows.filter((row) => row.status === "invalid"), [importStatus.rows]);
  const canConfirm = canConfirmImport(importStatus.status, importStatus.rowCount, importStatus.counts);
  const copy = statusCopy(importStatus.status);
  const readIsStale = isImportPollingStatus(importStatus.status) && pollError && clock - lastFetchedAt > 30_000;

  function toggleInvalidRow(rowId: string) {
    setSelectedInvalidRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function skipInvalidRows() {
    if (!selectedInvalidRows.size) return;
    setSkipBusy(true);
    setSkipMessage("Marking the selected invalid rows as skipped…");
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/rows/skip`, {
        body: JSON.stringify({ rowIds: [...selectedInvalidRows] }),
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
        setSkipMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The invalid rows could not be skipped."));
        return;
      }
      setSelectedInvalidRows(new Set());
      setSkipMessage("Selected invalid rows are now skipped. Review the counts before confirming.");
      await loadStatus();
    } catch {
      setSkipMessage("The skip action could not reach the server. Refresh and try again.");
    } finally {
      setSkipBusy(false);
    }
  }

  async function confirmImport() {
    if (!canConfirm) return;
    setConfirmBusy(true);
    setConfirmMessage("Saving the handoff method and queueing this import…");
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/confirm`, {
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
        setConfirmMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The import could not be confirmed."));
        return;
      }
      setConfirmMessage("Import queued. This page will poll the database status and stop on a terminal result.");
      await loadStatus();
    } catch {
      setConfirmMessage("The confirmation could not reach the server. Refresh before trying again.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function cancelImport() {
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setCancelBusy(true);
    setCancelMessage("Abandoning this draft…");
    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(importStatus.importId)}/cancel`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
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
        setCancelMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "The draft could not be abandoned."));
        return;
      }
      setCancelArmed(false);
      setCancelMessage("Draft abandoned. No account changes were made.");
      await loadStatus();
      router.refresh();
    } catch {
      setCancelMessage("The cancel action could not reach the server. Refresh and try again.");
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className="inline-flex min-h-11 w-fit items-center rounded-xl px-3 text-sm font-bold text-[#014c38] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href={`/admin/imports?focus=${encodeURIComponent(importStatus.importId)}#import-${encodeURIComponent(importStatus.importId)}`}>
          <ArrowLeft aria-hidden="true" size={15} />
          Back to imports
        </Link>
        <div className="flex items-center gap-2">
          <button aria-label="Refresh import status" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#b7ddc3] px-3 text-sm font-bold text-[#014c38] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a] disabled:cursor-not-allowed disabled:opacity-55" disabled={refreshing} onClick={() => void loadStatus()} type="button">
            <RefreshCw aria-hidden="true" size={15} />
            {refreshing ? "Refreshing…" : "Refresh status"}
          </button>
          <span className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${toneClasses(copy.tone)}`}><span aria-hidden="true">{statusIcon(importStatus.status)}</span>{copy.label}</span>
        </div>
      </div>

      {sessionIssue ? <ImportSessionRecoveryNotice importId={importStatus.importId} kind={sessionIssue} onRefresh={() => window.location.reload()} /> : null}
      {pollError && !sessionIssue && !readIsStale ? <div className="flex items-start gap-3 rounded-2xl border border-[#e3c2bb] bg-[#fff0ee] px-4 py-3 text-sm text-[#8b3f32]" role="alert"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div><p className="font-bold">Status refresh is unavailable</p><p className="mt-1 text-xs leading-5">The last database read was {formatDate(new Date(lastFetchedAt).toISOString())}. Refresh to recover; no success is inferred from a missing response.</p></div></div> : null}
      <WorkerHealthNotice importStatus={importStatus} lastFetchedAt={lastFetchedAt} heartbeatStale={heartbeatIsStale} statusReadStale={readIsStale} />

      <ImportStatusBanner importStatus={importStatus} />
      <ImportProgressPanel importStatus={importStatus} />

      <section aria-labelledby="import-summary-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.04em] text-[#173c2d]" id="import-summary-heading">{importStatus.sourceFilename}</h1>
            <p className="mt-1 text-sm text-[#5f776a]">{importStatus.role === "tutor" ? "Kapten" : "Students"} · {importStatus.templateVersion} · {importStatus.rowCount} rows</p>
          </div>
          <p className="text-xs text-[#5f776a]">Preview created {formatDate(importStatus.createdAt)}</p>
        </div>
        <div className="mt-5"><CountStrip counts={importStatus.counts} mode={importStatus.status === "draft" ? "preview" : "result"} /></div>
      </section>

      {importStatus.status === "draft" ? (
        <>
          <ImportRowTable importStatus={importStatus} onToggleInvalid={toggleInvalidRow} selectedInvalidRows={selectedInvalidRows} />
          <section aria-labelledby="confirm-import-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="confirm-import-heading">Choose one handoff method</h2>
                <p className="mt-1 max-w-[68ch] text-sm leading-6 text-[#5f776a]">The choice applies to every new account in this import. Existing accounts receive profile-only updates and never receive new credentials.</p>
              </div>
              <span className="rounded-full bg-[#f1f5f2] px-3 py-1.5 text-xs font-bold text-[#506a5d]">{importStatus.counts.invalid ? `${importStatus.counts.invalid} invalid rows unresolved` : "Ready to confirm"}</span>
            </div>

            {invalidRows.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-[#ead899] bg-[#fff9df] px-4 py-3 text-sm text-[#725400]">
                <p className="font-bold">Confirmation is blocked until invalid rows are skipped</p>
                <p className="mt-1 text-xs leading-5">Select the rows you intentionally want to leave out, then use “Skip selected invalid rows.” Duplicate, role-conflict, and malformed rows are never silently accepted.</p>
                <button className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#725400] px-4 text-sm font-bold text-white hover:bg-[#5b4300] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ad8d2c] disabled:cursor-not-allowed disabled:opacity-55" disabled={!selectedInvalidRows.size || skipBusy} onClick={() => void skipInvalidRows()} type="button"><SkipForward aria-hidden="true" size={16} />{skipBusy ? "Skipping…" : `Skip selected (${selectedInvalidRows.size})`}</button>
                {skipMessage ? <p aria-live="polite" className="mt-2 text-xs leading-5" role="status">{skipMessage}</p> : null}
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#73bc8a] ${handoffMethod === "invite_link" ? "border-[#73bc8a] bg-[#eef8f1]" : "border-[#d6e5db] bg-white hover:bg-[#f8fcf9]"}`}>
                <input checked={handoffMethod === "invite_link"} className="mt-1 size-4 accent-[#014c38]" name="handoff-method" onChange={() => setHandoffMethod("invite_link")} type="radio" value="invite_link" />
                <span><span className="block text-sm font-bold text-[#173c2d]">Invite link</span><span className="mt-1 block text-xs leading-5 text-[#5f776a]">Manual share · expires after 24 hours · recipient sets a password</span></span>
              </label>
              <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#73bc8a] ${handoffMethod === "temporary_password" ? "border-[#73bc8a] bg-[#eef8f1]" : "border-[#d6e5db] bg-white hover:bg-[#f8fcf9]"}`}>
                <input checked={handoffMethod === "temporary_password"} className="mt-1 size-4 accent-[#014c38]" name="handoff-method" onChange={() => setHandoffMethod("temporary_password")} type="radio" value="temporary_password" />
                <span><span className="block text-sm font-bold text-[#173c2d]">Temporary password</span><span className="mt-1 block text-xs leading-5 text-[#5f776a]">Manual share · shown once · recipient must change it on first login</span></span>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-[#d6e5db] bg-[#f8fcf9] px-4 py-4">
              <p className="text-sm font-bold text-[#173c2d]">Confirmation counts</p>
              <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-5"><span className="text-[#5f776a]">New <strong className="text-[#173c2d]">{importStatus.counts.create}</strong></span><span className="text-[#5f776a]">Updates <strong className="text-[#173c2d]">{importStatus.counts.update}</strong></span><span className="text-[#5f776a]">Failed <strong className={importStatus.counts.failed ? "text-[#8b3f32]" : "text-[#173c2d]"}>{importStatus.counts.failed}</strong></span><span className="text-[#5f776a]">Skipped <strong className="text-[#173c2d]">{importStatus.counts.skipped}</strong></span><span className="text-[#5f776a]">Unresolved <strong className={importStatus.counts.invalid ? "text-[#8b3f32]" : "text-[#173c2d]"}>{importStatus.counts.invalid}</strong></span></div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#e3c2bb] px-4 text-sm font-bold text-[#8b3f32] hover:bg-[#fff0ee] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c87868]" onClick={() => void cancelImport()} type="button"><X aria-hidden="true" size={16} />{cancelArmed ? "Confirm abandon draft" : "Abandon draft"}</button>
                {cancelArmed ? <button className="ml-2 inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-bold text-[#5f776a] hover:bg-[#f1f5f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={() => setCancelArmed(false)} type="button">Keep draft</button> : null}
                {cancelMessage ? <p aria-live="polite" className="mt-2 text-xs leading-5 text-[#5f776a]" role="status">{cancelBusy ? "Abandoning…" : cancelMessage}</p> : null}
              </div>
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#014c38] px-5 text-sm font-bold text-white hover:bg-[#176b4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a] disabled:cursor-not-allowed disabled:opacity-55" disabled={!canConfirm || confirmBusy || cancelBusy} onClick={() => void confirmImport()} type="button"><CheckCircle2 aria-hidden="true" size={17} />{confirmBusy ? "Confirming…" : "Confirm and queue import"}</button>
            </div>
            {confirmMessage ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-[#5f776a]" role="status">{confirmMessage}</p> : null}
          </section>
        </>
      ) : (
        <>
          <section aria-labelledby="result-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
            <div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${toneClasses(copy.tone)}`}>{statusIcon(importStatus.status)}</span><div><h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]" id="result-heading">Import result</h2><p className="mt-1 max-w-[68ch] text-sm leading-6 text-[#5f776a]">{copy.detail}</p></div></div>
            <div className="mt-5"><CountStrip counts={importStatus.counts} mode="result" /></div>
            {importStatus.lastErrorMessage ? <div className="mt-4 rounded-2xl border border-[#e3c2bb] bg-[#fff0ee] px-4 py-3 text-sm text-[#8b3f32]"><p className="font-bold">Operational note</p><p className="mt-1 text-xs leading-5">{importStatus.lastErrorMessage}</p></div> : null}
          </section>
          {importStatus.status === "completed" || importStatus.status === "partial" || importStatus.status === "failed" ? <HandoffDeliveryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={setSessionIssue} /> : null}
          <RetryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={setSessionIssue} />
          <ImportRowTable importStatus={importStatus} onToggleInvalid={() => undefined} selectedInvalidRows={new Set()} />
        </>
      )}
    </div>
  );
}

export { ImportDetailModule, actionErrorMessages, canConfirmImport, getImportPollDelayMs, isImportPollingStatus };
