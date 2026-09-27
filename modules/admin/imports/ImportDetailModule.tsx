"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from "react";
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
import { FieldRequiredMark } from "@/components/ui/field";
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
  active_claims: "Worker masih menyelesaikan import ini. Tunggu hingga claim kedaluwarsa, lalu coba lagi.",
  handoff_account_inactive: "Salah satu akun tidak aktif. Periksa akun sebelum merilis handoff-nya.",
  handoff_expired: "Salah satu undangan sudah kedaluwarsa dan tidak dapat dirilis lagi; gunakan preview baru untuk akun ini.",
  handoff_file_unavailable: "File handoff tidak dapat disiapkan. Status import tidak berubah; coba lagi.",
  handoff_not_releasable: "Salah satu handoff sudah dirilis atau ditutup. Segarkan untuk melihat status terbaru.",
  handoff_conflict: "Handoff ini berubah di tempat lain. Segarkan untuk melihat status terbaru.",
  handoff_reissue_unavailable: "Pengganti handoff tidak dapat dibuat. Segarkan lalu coba lagi.",
  import_confirmation_unavailable: "Import tidak dapat dikonfirmasi. Segarkan dan periksa jumlah baris terbaru.",
  import_not_draft: "Draft ini tidak lagi dapat diedit. Segarkan untuk melihat status terbaru.",
  import_not_found: "Import ini tidak lagi tersedia untuk akun admin Anda.",
  import_retry_unavailable: "Baris yang gagal tidak dapat dimasukkan kembali ke antrean. Segarkan lalu coba lagi.",
  invalid_import_state: "Import ini tidak berada dalam status yang menerima tindakan tersebut.",
  invalid_origin: "Tindakan ini kedaluwarsa. Segarkan halaman lalu coba lagi.",
  invalid_rows_pending_skip: "Import massal diblokir karena CSV berisi baris tidak valid. Perbaiki CSV dan unggah file baru; tidak ada baris yang akan diimport.",
  invalid_selection: "Baris yang dipilih tidak lagi tersedia untuk rilis handoff.",
  no_failed_rows: "Tidak ada baris gagal yang dapat dicoba ulang.",
  row_selection_invalid: "Pilih hanya baris gagal dari hasil ini.",
};

function apiErrorMessage(code: unknown, fallback: string) {
  return typeof code === "string" && actionErrorMessages[code] ? actionErrorMessages[code] : fallback;
}

function formatDate(value: string | null) {
   if (!value) return "Belum tersedia";
  const parsed = new Date(value);
   return Number.isNaN(parsed.getTime()) ? "Belum tersedia" : parsed.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function methodLabel(method: HandoffMethod | null) {
   return method === "temporary_password" ? "Password sementara" : "Link undangan";
}

function statusCopy(status: string) {
  switch (status) {
     case "draft": return { detail: "Preview tersimpan. Tidak ada akun yang berubah.", label: "Draft perlu ditinjau", tone: "warning" as const };
     case "queued": return { detail: "Import masuk ke antrean background worker.", label: "Dalam antrean", tone: "info" as const };
     case "processing": return { detail: "Baris sedang diproses berdasarkan status PostgreSQL.", label: "Sedang diproses", tone: "info" as const };
     case "completed": return { detail: "Semua baris yang memenuhi syarat selesai tanpa kegagalan.", label: "Selesai", tone: "success" as const };
     case "partial": return { detail: "Sebagian baris selesai; periksa baris yang gagal atau dilewati.", label: "Selesai sebagian", tone: "warning" as const };
     case "failed": return { detail: "Import berhenti sebelum semua baris selesai.", label: "Import gagal", tone: "danger" as const };
     case "cancelled": return { detail: "Draft ini dibatalkan sebelum perubahan akun dimulai.", label: "Dibatalkan", tone: "neutral" as const };
     default: return { detail: "Status import tidak tersedia.", label: status, tone: "neutral" as const };
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
     case "created": return { icon: <CheckCircle2 aria-hidden="true" size={14} />, label: "Dibuat", tone: "success" };
     case "updated": return { icon: <Check aria-hidden="true" size={14} />, label: "Diperbarui", tone: "success" };
     case "failed": return { icon: <CircleX aria-hidden="true" size={14} />, label: "Gagal", tone: "danger" };
     case "invalid": return { icon: <CircleAlert aria-hidden="true" size={14} />, label: "Perlu ditinjau", tone: "warning" };
     case "skipped": return { icon: <SkipForward aria-hidden="true" size={14} />, label: "Dilewati", tone: "neutral" };
     case "processing": return { icon: <RefreshCw aria-hidden="true" size={14} />, label: "Sedang diproses", tone: "info" };
     case "pending": return { icon: <FileClock aria-hidden="true" size={14} />, label: "Menunggu", tone: "warning" };
     default: return { icon: <FileClock aria-hidden="true" size={14} />, label: "Siap", tone: "info" };
  }
}

function rowBadgeTone(tone: RowStatusTone): "danger" | "info" | "neutral" | "success" | "attention" {
  return tone === "warning" ? "attention" : tone;
}

function rowIssueLabel(code: string | null) {
  if (!code) return null;
   if (code === "duplicate_email_in_file") return "Duplikat di file ini";
   if (["opposite_role", "role_conflict", "revoked_role", "soft_deleted_user", "inactive_account"].includes(code)) return "Konflik akun atau peran";
   if (code === "changed_since_preview") return "Berubah sejak preview";
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
                 <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 font-semibold text-primary-800 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300">Lihat bio lengkap ({value.trim().length} karakter)</summary>
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
         <p className="text-base font-semibold" id="import-session-recovery-heading">{kind === "expired" ? "Sesi admin kedaluwarsa" : "Izin admin diperlukan"}</p>
         <p className="mt-1 max-w-[68ch] text-sm leading-6">{kind === "expired" ? "Masuk lagi untuk kembali ke review import ini. ID import tetap berada di konteks halaman; kredensial tidak pernah dimasukkan ke link pemulihan." : "Akun admin ini tidak lagi dapat meninjau import. Masuk dengan akun admin aktif atau kembali ke halaman utama admin."}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<Link href={getImportLoginRecoveryHref(`/admin/imports/${encodeURIComponent(importId)}`)} />}
          size="default"
          variant="dangerOutline"
        >
           {kind === "expired" ? "Masuk lagi" : "Masuk sebagai admin"}
        </Button>
         <Button onClick={onRefresh} size="default" variant="dangerOutline">Segarkan halaman</Button>
      </div>
    </ReferenceSurface>
  );
}

function CountStrip({ counts, mode }: { counts: ImportStatusDto["counts"]; mode: "preview" | "result" }) {
  const items = mode === "preview"
    ? [
         ["Akun baru", counts.create],
         ["Profil diperbarui", counts.update],
         ["Gagal", counts.failed],
         ["Perlu ditinjau", counts.invalid],
         ["Dilewati", counts.skipped],
    ] as const
    : [
         ["Dibuat", counts.created],
         ["Diperbarui", counts.updated],
         ["Gagal", counts.failed],
         ["Dilewati", counts.skipped],
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
           <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="import-progress-heading">Progress import</h2>
           <p className="mt-1 text-sm leading-6 text-secondary-600">Worker melaporkan hasil baris yang tersimpan di PostgreSQL. Halaman ini akan terus melakukan polling sampai import mencapai status terminal.</p>
        </div>
        <p className="text-sm font-semibold tabular-nums text-primary-800">{progress.percent}% complete</p>
      </div>
       <div aria-label={`Progress import: ${progress.processed} dari ${progress.total} baris diproses`} aria-valuemax={progressMax} aria-valuemin={0} aria-valuenow={progress.processed} aria-valuetext={`${progress.processed} dari ${progress.total} baris diproses`} className="mt-5 h-3 overflow-hidden rounded-full bg-primary-100" role="progressbar">
        <div className="h-full rounded-full bg-primary-600 transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
      </div>
       <p className="mt-2 text-sm font-semibold tabular-nums text-secondary-900">Diproses {progress.processed} dari {progress.total} baris</p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
           ["Menunggu", progress.pending],
           ["Sedang diproses", progress.processing],
           ["Tersisa", progress.remaining],
           ["Baris dengan hasil", progress.processed],
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
           <p className="font-semibold">Terakhir disimpan</p>
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
           <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="import-rows-heading">Baris preview</h2>
           <p className="mt-1 text-sm leading-6 text-secondary-500">Setiap baris mempertahankan keputusan operasinya. Email yang sudah ada hanya memperbarui profil peran.</p>
        </div>
      </div>
      <Table className="min-w-[760px] text-left text-sm">
         <TableCaption className="sr-only">Baris preview import dan status operasinya.</TableCaption>
        <TableHeader>
          <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Row</TableHead>
            <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Email</TableHead>
             <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Operasi</TableHead>
             <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Status</TableHead>
             <TableHead className="h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5">Penjelasan</TableHead>
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
                   <span className="block truncate font-semibold text-secondary-900">{row.normalizedEmail || "Email tidak ada"}</span>
                  <ImportInputSummary input={row.input} />
                </TableCell>
                 <TableCell className="px-4 py-3.5 align-top text-secondary-600 sm:px-5">{row.operation === "create" ? "Buat" : row.operation === "update" ? "Perbarui profil" : "Tidak ada operasi"}</TableCell>
                <TableCell className="px-4 py-3.5 align-top sm:px-5">
                  <StudentBadge size="sm" tone={rowBadgeTone(copy.tone)}>
                    {copy.icon}
                    {copy.label}
                  </StudentBadge>
                </TableCell>
                <TableCell className="max-w-[270px] px-4 py-3.5 align-top text-xs leading-5 text-secondary-600 sm:px-5">
                   {row.errorMessage ? <><span className="font-semibold text-student-status-attention-fg">{rowIssueLabel(row.errorCode)}</span><span className="mt-0.5 block">{row.errorMessage}</span></> : row.status === "created" && row.handoffStatus ? `${methodLabel(row.handoffMethod)} handoff · ${row.handoffStatus.replaceAll("_", " ")}` : "Siap untuk langkah berikutnya."}
                </TableCell>
              </TableRow>
            );
          }) : (
            <TableRow className="hover:bg-transparent">
              <TableCell className="px-5 py-12 text-center" colSpan={5}>
                <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-primary-50 text-primary-800"><FileClock size={18} /></span>
                   <p className="font-semibold text-secondary-900">Tidak ada baris import</p>
                   <p className="text-sm leading-6 text-secondary-600">Preview tidak memiliki baris untuk ditinjau.</p>
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
             {statusReadOnly ? "Penyegaran status terlambat" : workerOnly ? "Worker atau antrean perlu diperhatikan" : "Status dan kesehatan worker perlu diperhatikan"}
        </p>
        {statusReadOnly ? (
           <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL tetap menjadi sumber kebenaran. Pembacaan database terakhir pada {formatDate(new Date(lastFetchedAt).toISOString())}; gangguan pembacaan ini tidak menunjukkan kegagalan heartbeat worker.</p>
        ) : workerOnly ? (
           <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL tetap menjadi sumber kebenaran. Heartbeat worker hilang atau kedaluwarsa setidaknya selama 45 detik, atau antrean melaporkan job yang tidak tersedia. Halaman ini akan memperpanjang jeda polling dan tidak mengklaim keberhasilan.</p>
        ) : (
          <>
             <p className="mt-1 max-w-[70ch] text-xs leading-5">PostgreSQL tetap menjadi sumber kebenaran, tetapi pembacaan database terakhir pada {formatDate(new Date(lastFetchedAt).toISOString())} dan heartbeat worker juga kedaluwarsa atau antrean melaporkan job yang tidak tersedia. Halaman ini akan memperpanjang jeda polling dan tidak mengklaim keberhasilan.</p>
          </>
        )}
         {!statusReadOnly ? <p className="mt-1 text-xs opacity-80">Heartbeat baris terakhir: {formatDate(importStatus.lastHeartbeatAt)}</p> : null}
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


type HandoffDeliveryHandlers = {
  acknowledgeTransfer: () => Promise<void>;
  downloadFile: () => Promise<void>;
  reissueHandoff: (handoffId: string) => Promise<void>;
  toggleRow: (rowId: string) => void;
};

function createHandoffDeliveryHandlers({
  acknowledgeIntent,
  dispatch,
  downloadedIds,
  importId,
  onRefresh,
  onSessionIssue,
  selectedIds,
  transferConfirmed,
}: {
  acknowledgeIntent: boolean;
  dispatch: Dispatch<HandoffDeliveryAction>;
  downloadedIds: Set<string>;
  importId: string;
  onRefresh: () => Promise<boolean>;
  onSessionIssue: (kind: "expired" | "forbidden") => void;
  selectedIds: string[];
  transferConfirmed: boolean;
}) {
  const toggleRow = (rowId: string) => dispatch({ rowId, type: "toggleRow" });

  async function downloadFile() {
    if (!selectedIds.length || !acknowledgeIntent) return;
    dispatch({ type: "downloadBusy", value: true });
    dispatch({ type: "message", value: "Preparing the one-time file in memory…" });
    try {
      const response = await fetch("/api/admin/imports/" + encodeURIComponent(importId) + "/handoff-file", {
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
        dispatch({ type: "message", value: apiErrorMessage(responseErrorCode(payload), "File sekali pakai tidak dapat dirilis. Segarkan dan periksa status handoff.") });
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
        message: selectedIds.length + " handoff berhasil diunduh. Pindahkan file sekarang; kredensial tidak akan dirilis lagi.",
        type: "downloadSuccess",
      });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "File sekali pakai tidak dapat diunduh. Segarkan sebelum mencoba lagi." });
    } finally {
      dispatch({ type: "downloadBusy", value: false });
    }
  }

  async function acknowledgeTransfer() {
    const ids = downloadedIds.size ? [...downloadedIds] : selectedIds;
    if (!ids.length || !transferConfirmed) return;
    dispatch({ type: "acknowledgeBusy", value: true });
    try {
      const response = await fetch("/api/admin/imports/" + encodeURIComponent(importId) + "/handoff-file/acknowledge", {
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
        dispatch({ type: "message", value: apiErrorMessage(responseErrorCode(payload), "Konfirmasi tidak dapat dicatat. Segarkan lalu coba lagi.") });
        return;
      }
      dispatch({ message: "Konfirmasi handoff tercatat. Kredensial sekali pakai tetap tidak masuk ke state aplikasi.", type: "acknowledgeSuccess" });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "Konfirmasi tidak dapat mencapai server. Segarkan lalu coba lagi." });
    } finally {
      dispatch({ type: "acknowledgeBusy", value: false });
    }
  }

  async function reissueHandoff(handoffId: string) {
    dispatch({ type: "reissueBusy", value: handoffId });
    dispatch({ type: "message", value: "Creating a sealed replacement handoff…" });
    try {
      const response = await fetch("/api/admin/imports/" + encodeURIComponent(importId) + "/handoff-file/reissue", {
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
        dispatch({ type: "message", value: apiErrorMessage(responseErrorCode(payload), "Pengganti handoff tidak dapat dibuat.") });
        return;
      }
      dispatch({ message: "Pengganti handoff siap. Pilih di bawah lalu unduh file sekali pakai yang baru.", type: "reissueSuccess" });
      await onRefresh();
    } catch {
      dispatch({ type: "message", value: "Permintaan pengganti tidak dapat mencapai server. Segarkan lalu coba lagi." });
    } finally {
      dispatch({ type: "reissueBusy", value: null });
    }
  }

  return { acknowledgeTransfer, downloadFile, reissueHandoff, toggleRow } satisfies HandoffDeliveryHandlers;
}

function HandoffTerminalState({ acknowledged }: { acknowledged: boolean }) {
  const title = acknowledged ? "Semua handoff sudah dikonfirmasi" : "Tidak ada tindakan handoff tersisa";
  const description = acknowledged
    ? "Semua file kredensial yang dirilis untuk import ini sudah dikonfirmasi telah dipindahkan. Tidak ada file handoff yang tersisa untuk diunduh."
    : "Semua handoff akun baru untuk import ini sudah terminal. Handoff yang selesai atau dicabut tidak dapat diunduh, dibuat ulang, atau dikonfirmasi di sini.";

  return (
    <ReferenceSurface as="section" aria-labelledby="handoff-file-heading" className={acknowledged ? "p-5 sm:p-6" : "bg-secondary-50 p-5 sm:p-6"} variant="inset">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl", acknowledged ? "bg-student-status-success-bg text-student-status-success-fg" : "bg-secondary-100 text-secondary-700")}>{acknowledged ? <CheckCircle2 size={19} /> : <FileClock size={19} />}</span>
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-file-heading">{title}</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">{description}</p>
        </div>
      </div>
    </ReferenceSurface>
  );
}

function HandoffMethodDescription({ method }: { method: HandoffMethod }) {
  const copy = method === "invite_link"
    ? "Link undangan kedaluwarsa setelah 24 jam dan hanya dapat digunakan sekali. Bagikan link secara manual; tidak ada pengiriman email otomatis. Penerima menggunakannya untuk membuat password."
    : "Password sementara hanya berlaku untuk login pertama dan harus diganti. Bagikan file melalui kanal yang aman; tidak ada pengiriman email otomatis.";

  return <ReferenceSurface as="div" className="mt-4 px-4 py-3 text-sm leading-6 text-secondary-600" variant="inset">{copy}</ReferenceSurface>;
}

function PendingHandoffRows({
  acknowledgeIntent,
  downloadBusy,
  onAcknowledgeIntentChange,
  onDownload,
  onSelectPending,
  onSelectRow,
  pendingRows,
  selectedRows,
}: {
  acknowledgeIntent: boolean;
  downloadBusy: boolean;
  onAcknowledgeIntentChange: (value: boolean) => void;
  onDownload: () => void;
  onSelectPending: (ids: string[]) => void;
  onSelectRow: (rowId: string) => void;
  pendingRows: ImportStatusDto["rows"];
  selectedRows: Set<string>;
}) {
  if (!pendingRows.length) return null;

  const pendingIds = pendingRows.map((row) => row.handoffId).filter((id): id is string => Boolean(id));
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-secondary-900">Handoff akun baru yang menunggu</p>
        <Button className="text-xs" onClick={() => onSelectPending(pendingIds)} size="default" variant="reference">{selectedRows.size === pendingRows.length ? "Hapus pilihan" : "Pilih semua yang menunggu"}</Button>
      </div>
      <div className="mt-2 divide-y divide-primary-100 rounded-2xl border border-primary-100">
        {pendingRows.map((row) => (
          <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
            <input aria-label={"Select handoff for row " + row.rowNumber} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-primary-700" onChange={() => row.handoffId && onSelectRow(row.handoffId)} type="checkbox" />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-secondary-900">Row {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs text-secondary-600">Expires {formatDate(row.handoffExpiresAt)}</span></span>
            <StudentBadge size="sm" tone="attention">Menunggu</StudentBadge>
          </label>
        ))}
      </div>
      <label className={cn(REFERENCE_SURFACE_CLASS_NAMES.inset, "mt-4 flex items-start gap-3 px-4 py-3 text-xs leading-5 text-secondary-600")}>
        <input checked={acknowledgeIntent} className="mt-1 size-4 accent-primary-700" onChange={(event) => onAcknowledgeIntentChange(event.target.checked)} type="checkbox" />
        <span>Saya akan membagikan file ini melalui kanal yang aman dan memahami bahwa kredensial yang dipilih tidak dapat dipulihkan setelah dirilis.<FieldRequiredMark /></span>
      </label>
      <Button className="mt-3" disabled={!pendingRows.length || !acknowledgeIntent || downloadBusy} onClick={onDownload} type="button" variant="brand">
        <Download aria-hidden="true" size={16} />
        {downloadBusy ? "Menyiapkan file…" : "Unduh pilihan (" + selectedRows.size + ")"}
      </Button>
    </div>
  );
}

function ReleasedHandoffRows({
  acknowledgeBusy,
  acknowledgementIds,
  onAcknowledge,
  onReissue,
  onSelectRow,
  onTransferConfirmedChange,
  reissueBusy,
  releasedRows,
  selectedRows,
  transferConfirmed,
}: {
  acknowledgeBusy: boolean;
  acknowledgementIds: string[];
  onAcknowledge: () => void;
  onReissue: (handoffId: string) => void;
  onSelectRow: (rowId: string) => void;
  onTransferConfirmedChange: (value: boolean) => void;
  reissueBusy: string | null;
  releasedRows: ImportStatusDto["rows"];
  selectedRows: Set<string>;
  transferConfirmed: boolean;
}) {
  if (!releasedRows.length) return null;

  return (
    <ReferenceSurface as="div" className={cn("mt-5", ADMIN_STATUS_CLASS_NAMES.warning)} variant="inset">
      <p className="font-semibold">Sebagian kredensial sudah dirilis</p>
      <p className="mt-1 text-xs leading-5">File tidak dapat diunduh lagi. Jika file hilang, mulai preview/import baru untuk akun tersebut; kredensial lama tidak akan muncul kembali. Setelah memindahkan file, konfirmasi baris yang sudah dirilis di bawah.</p>
      <div className="mt-3 space-y-2">
        {releasedRows.map((row) => (
          <div className="flex min-h-11 items-center gap-3 rounded-xl border border-student-status-attention-border bg-white/50 px-3 py-2 text-xs" key={row.rowId}>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <input aria-label={"Select released handoff for row " + row.rowNumber} checked={Boolean(row.handoffId && selectedRows.has(row.handoffId))} className="size-4 accent-student-status-attention-fg" onChange={() => row.handoffId && onSelectRow(row.handoffId)} type="checkbox" />
              <span className="truncate">Row {row.rowNumber} · {row.normalizedEmail}</span>
            </label>
            <span className="font-semibold">Sudah dirilis</span>
            {row.handoffId ? <Button className="shrink-0 text-xs" disabled={reissueBusy !== null} onClick={() => void onReissue(row.handoffId as string)} size="default" type="button" variant="attentionOutline">{reissueBusy === row.handoffId ? "Membuat ulang…" : "Buat ulang"}</Button> : null}
          </div>
        ))}
      </div>
      <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-student-status-attention-fg">
        <input checked={transferConfirmed} className="mt-1 size-4 accent-student-status-attention-fg" onChange={(event) => onTransferConfirmedChange(event.target.checked)} type="checkbox" />
        <span>Saya mengonfirmasi bahwa file yang dirilis sudah dipindahkan melalui kanal yang aman.<FieldRequiredMark /></span>
      </label>
      <Button className="mt-3" disabled={!acknowledgementIds.length || !transferConfirmed || acknowledgeBusy} onClick={onAcknowledge} type="button" variant="attentionOutline">
        <Check aria-hidden="true" size={16} />
        {acknowledgeBusy ? "Menyimpan…" : "Konfirmasi pemindahan"}
      </Button>
    </ReferenceSurface>
  );
}

function ExpiredHandoffRows({ onReissue, expiredRows, reissueBusy }: { onReissue: (handoffId: string) => void; expiredRows: ImportStatusDto["rows"]; reissueBusy: string | null }) {
  if (!expiredRows.length) return null;

  return (
    <ReferenceSurface as="div" className={cn("mt-4", ADMIN_STATUS_CLASS_NAMES.danger)} variant="inset">
      <p className="font-semibold">Handoff kedaluwarsa perlu preview baru</p>
      <p className="mt-1">Secret undangan yang kedaluwarsa tidak dapat dirilis lagi. Buat ulang pengganti yang tersegel di sini, lalu pilih baris baru yang menunggu untuk diunduh. Jika data sumber salah, buat preview baru.</p>
      <div className="mt-3 space-y-2">
        {expiredRows.map((row) => (
          <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-student-status-danger-border bg-white/50 px-3 py-2" key={row.rowId}>
            <span className="truncate text-xs">Row {row.rowNumber} · {row.normalizedEmail}</span>
            {row.handoffId ? <Button className="shrink-0 text-xs" disabled={reissueBusy !== null} onClick={() => void onReissue(row.handoffId as string)} size="default" type="button" variant="dangerOutline">{reissueBusy === row.handoffId ? "Membuat ulang…" : "Buat ulang"}</Button> : null}
          </div>
        ))}
      </div>
    </ReferenceSurface>
  );
}

function DownloadedHandoffNotice({
  acknowledgeBusy,
  downloadedIds,
  onAcknowledge,
  onTransferConfirmedChange,
  releasedRows,
  transferConfirmed,
}: {
  acknowledgeBusy: boolean;
  downloadedIds: Set<string>;
  onAcknowledge: () => void;
  onTransferConfirmedChange: (value: boolean) => void;
  releasedRows: ImportStatusDto["rows"];
  transferConfirmed: boolean;
}) {
  if (!downloadedIds.size || releasedRows.length > 0) return null;

  return (
    <ReferenceSurface as="div" className={cn("mt-4", ADMIN_STATUS_CLASS_NAMES.success)} variant="inset">
      <p className="font-semibold">File berhasil diunduh</p>
      <p className="mt-1 text-xs leading-5">Konfirmasi bahwa file sudah sampai ke penerima. Konfirmasi ini mencatat handoff dan tidak menampilkan kredensial lagi.</p>
      <label className="mt-3 flex items-start gap-3 text-xs leading-5 text-student-status-success-fg">
        <input checked={transferConfirmed} className="mt-1 size-4 accent-primary-700" onChange={(event) => onTransferConfirmedChange(event.target.checked)} type="checkbox" />
        <span>Saya mengonfirmasi bahwa file yang dirilis sudah dipindahkan melalui kanal yang aman.<FieldRequiredMark /></span>
      </label>
      <Button className="mt-3" disabled={!transferConfirmed || acknowledgeBusy} onClick={onAcknowledge} type="button" variant="brandOutline">
        <Check aria-hidden="true" size={16} />
        {acknowledgeBusy ? "Menyimpan…" : "Konfirmasi pemindahan"}
      </Button>
    </ReferenceSurface>
  );
}

function HandoffDeliveryActive({
  acknowledgeBusy,
  acknowledgeIntent,
  acknowledgementIds,
  downloadBusy,
  downloadedIds,
  expiredRows,
  message,
  method,
  onAcknowledge,
  onAcknowledgeIntentChange,
  onDownload,
  onReissue,
  onSelectPending,
  onSelectRow,
  onTransferConfirmedChange,
  pendingRows,
  reissueBusy,
  releasedRows,
  selectedRows,
  transferConfirmed,
}: {
  acknowledgeBusy: boolean;
  acknowledgeIntent: boolean;
  acknowledgementIds: string[];
  downloadBusy: boolean;
  downloadedIds: Set<string>;
  expiredRows: ImportStatusDto["rows"];
  message: string;
  method: HandoffMethod;
  onAcknowledge: () => void;
  onAcknowledgeIntentChange: (value: boolean) => void;
  onDownload: () => void;
  onReissue: (handoffId: string) => void;
  onSelectPending: (ids: string[]) => void;
  onSelectRow: (rowId: string) => void;
  onTransferConfirmedChange: (value: boolean) => void;
  pendingRows: ImportStatusDto["rows"];
  reissueBusy: string | null;
  releasedRows: ImportStatusDto["rows"];
  selectedRows: Set<string>;
  transferConfirmed: boolean;
}) {
  return (
    <ReferenceSurface as="section" aria-labelledby="handoff-file-heading" className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="handoff-file-heading">File handoff sekali pakai</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">Import ini menggunakan satu metode untuk semua akun baru: <span className="font-semibold text-secondary-900">{methodLabel(method)}</span>. File dibuat di memori dan tidak pernah disimpan.</p>
        </div>
        <p className="flex max-w-[18rem] items-start gap-2 text-xs leading-5 text-student-status-info-fg"><Info aria-hidden="true" className="mt-0.5 shrink-0" size={14} /><span>Kredensial hanya ditampilkan sekali.</span></p>
      </div>
      <HandoffMethodDescription method={method} />
      <PendingHandoffRows
        acknowledgeIntent={acknowledgeIntent}
        downloadBusy={downloadBusy}
        onAcknowledgeIntentChange={onAcknowledgeIntentChange}
        onDownload={onDownload}
        onSelectPending={onSelectPending}
        onSelectRow={onSelectRow}
        pendingRows={pendingRows}
        selectedRows={selectedRows}
      />
      <ReleasedHandoffRows
        acknowledgeBusy={acknowledgeBusy}
        acknowledgementIds={acknowledgementIds}
        onAcknowledge={onAcknowledge}
        onReissue={onReissue}
        onSelectRow={onSelectRow}
        onTransferConfirmedChange={onTransferConfirmedChange}
        reissueBusy={reissueBusy}
        releasedRows={releasedRows}
        selectedRows={selectedRows}
        transferConfirmed={transferConfirmed}
      />
      <ExpiredHandoffRows expiredRows={expiredRows} onReissue={onReissue} reissueBusy={reissueBusy} />
      <DownloadedHandoffNotice
        acknowledgeBusy={acknowledgeBusy}
        downloadedIds={downloadedIds}
        onAcknowledge={onAcknowledge}
        onTransferConfirmedChange={onTransferConfirmedChange}
        releasedRows={releasedRows}
        transferConfirmed={transferConfirmed}
      />
      {message ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-secondary-600" role="status">{message}</p> : null}
    </ReferenceSurface>
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
  const [state, dispatch] = useReducer(handoffDeliveryReducer, INITIAL_HANDOFF_DELIVERY_STATE);
  const pendingRows = importStatus.rows.filter((row) => isPendingHandoffRow(row));
  const releasedRows = importStatus.rows.filter((row) => row.handoffId && row.handoffStatus === "released" && !row.handoffAcknowledgedAt);
  const expiredRows = importStatus.rows.filter((row) => getHandoffSelectionState(row) === "expired");
  const handoffState = getHandoffDeliveryState(importStatus.rows);
  const selectedIds = [...state.selectedRows];
  const acknowledgementIds = state.downloadedIds.size ? [...state.downloadedIds] : selectedIds;
  const method = importStatus.handoffMethod;
  const handlers = createHandoffDeliveryHandlers({
    acknowledgeIntent: state.acknowledgeIntent,
    dispatch,
    downloadedIds: state.downloadedIds,
    importId: importStatus.importId,
    onRefresh,
    onSessionIssue,
    selectedIds,
    transferConfirmed: state.transferConfirmed,
  });

  if (!method || handoffState === "not_applicable") return null;
  if (handoffState === "all_acknowledged") return <HandoffTerminalState acknowledged />;
  if (handoffState === "terminal") return <HandoffTerminalState acknowledged={false} />;

  return (
    <HandoffDeliveryActive
      acknowledgeBusy={state.acknowledgeBusy}
      acknowledgeIntent={state.acknowledgeIntent}
      acknowledgementIds={acknowledgementIds}
      downloadBusy={state.downloadBusy}
      downloadedIds={state.downloadedIds}
      expiredRows={expiredRows}
      message={state.message}
      method={method}
      onAcknowledge={handlers.acknowledgeTransfer}
      onAcknowledgeIntentChange={(value) => dispatch({ type: "acknowledgeIntent", value })}
      onDownload={handlers.downloadFile}
      onReissue={handlers.reissueHandoff}
      onSelectPending={(ids) => dispatch({ ids, type: "selectPending" })}
      onSelectRow={handlers.toggleRow}
      onTransferConfirmedChange={(value) => dispatch({ type: "transferConfirmed", value })}
      pendingRows={pendingRows}
      reissueBusy={state.reissueBusy}
      releasedRows={releasedRows}
      selectedRows={state.selectedRows}
      transferConfirmed={state.transferConfirmed}
    />
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
     setMessage("Memasukkan baris gagal yang dipilih ke antrean…");
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
         setMessage(apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "Baris gagal tidak dapat dimasukkan ke antrean."));
        return;
      }
      setSelectedRows(new Set());
      setRetryAll(false);
      await onRefresh();
       setMessage("Percobaan ulang masuk ke antrean. Status akan diperbarui berdasarkan hasil worker di database.");
    } catch {
       setMessage("Percobaan ulang tidak dapat mencapai server. Segarkan lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ReferenceSurface as="section" aria-labelledby="retry-heading" className={`p-5 sm:p-6 ${ADMIN_STATUS_CLASS_NAMES.danger}`} variant="inset">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
           <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900" id="retry-heading">Tinjau baris gagal</h2>
           <p className="mt-1 text-sm leading-6 text-secondary-600">Percobaan ulang ditujukan untuk kegagalan sementara atau operasional. Perbaikan data memerlukan preview/import baru.</p>
        </div>
         <StudentBadge size="sm" tone="danger">{failedRows.length} gagal</StudentBadge>
      </div>
      <div className="mt-4 divide-y divide-student-status-danger-border rounded-2xl border border-student-status-danger-border bg-white">
        {failedRows.map((row) => (
          <label className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm" key={row.rowId}>
            <input aria-label={`Select failed row ${row.rowNumber} for retry`} checked={selectedRows.has(row.rowId)} className="size-4 accent-student-status-danger-solid-bg" onChange={() => toggleRow(row.rowId)} type="checkbox" />
           <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-secondary-900">Baris {row.rowNumber} · {row.normalizedEmail}</span><span className="mt-0.5 block text-xs leading-5 text-student-status-danger-fg">{row.errorMessage ?? row.errorCode?.replaceAll("_", " ") ?? "Kegagalan operasional"}</span></span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
         <label className="flex min-h-11 items-center gap-2 text-xs text-secondary-600"><input checked={retryAll} className="size-4 accent-student-status-danger-solid-bg" onChange={(event) => setRetryAll(event.target.checked)} type="checkbox" /> Coba ulang semua baris gagal</label>
        <Button disabled={busy || (!retryAll && !selectedRows.size)} onClick={retryRows} type="button" variant="destructive">
          <RotateCcw aria-hidden="true" size={16} />
           {busy ? "Memasukkan ke antrean…" : retryAll ? "Coba ulang semua yang gagal" : `Coba ulang pilihan (${selectedRows.size})`}
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


function ImportDetailHeader({ copy, loadStatus, refreshing, status }: { copy: ReturnType<typeof statusCopy>; loadStatus: ImportStatusLoader; refreshing: boolean; status: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Button aria-label="Kembali ke enrollment" className="mt-1 shrink-0" nativeButton={false} render={<Link href="/admin/enrollment" />} size="icon" title="Kembali ke enrollment" variant="ghost">
        <ChevronLeft aria-hidden="true" size={18} />
      </Button>
      <ReferencePageHeader
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button aria-label="Segarkan status import" disabled={refreshing} onClick={() => void loadStatus()} size="sm" variant="reference">
              <RefreshCw aria-hidden="true" size={15} />
              {refreshing ? "Menyegarkan…" : "Segarkan status"}
            </Button>
            <ReferenceStatusBadge label={copy.label} status={status} tone={referenceBadgeTone(copy.tone)} />
          </div>
        )}
        className="min-w-0 flex-1"
        title="Review import"
      />
    </div>
  );
}

function ImportDetailAlerts({ heartbeatIsStale, importStatus, lastFetchedAt, pollError, readIsStale, sessionIssue }: Pick<ImportDetailViewProps, "heartbeatIsStale" | "importStatus" | "lastFetchedAt" | "pollError" | "readIsStale" | "sessionIssue">) {
  return (
    <>
      {sessionIssue ? <ImportSessionRecoveryNotice importId={importStatus.importId} kind={sessionIssue} onRefresh={() => window.location.reload()} /> : null}
      {pollError && !sessionIssue && !readIsStale ? <ReferenceSurface as="div" className={`flex items-start gap-3 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.danger}`} role="alert" variant="inset"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={17} /><div><p className="font-semibold">Status tidak dapat disegarkan</p><p className="mt-1 text-xs leading-5">Pembacaan database terakhir pada {formatDate(new Date(lastFetchedAt).toISOString())}. Segarkan untuk memulihkan; respons yang hilang tidak dianggap sebagai keberhasilan.</p></div></ReferenceSurface> : null}
      <WorkerHealthNotice importStatus={importStatus} lastFetchedAt={lastFetchedAt} heartbeatStale={heartbeatIsStale} statusReadStale={readIsStale} />
    </>
  );
}

function ImportSummaryCard({ importStatus }: { importStatus: ImportStatusDto }) {
  return (
    <ReferenceSurface as="section" aria-labelledby="import-summary-heading" className="p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="import-summary-heading">Detail import</h2>
          <p className="mt-2 text-base font-semibold text-secondary-900">{importStatus.sourceFilename}</p>
          <p className="mt-1 text-sm text-secondary-500">{importStatus.role === "tutor" ? "Kapten" : "Siswa"} · {importStatus.templateVersion} · {importStatus.rowCount} baris</p>
        </div>
        <p className="text-xs text-secondary-500">Preview dibuat {formatDate(importStatus.createdAt)}</p>
      </div>
      <div className="mt-5"><CountStrip counts={importStatus.counts} mode={importStatus.status === "draft" ? "preview" : "result"} /></div>
    </ReferenceSurface>
  );
}

function ImportInvalidRowsNotice({ count }: { count: number }) {
  if (!count) return null;

  return <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.warning}`} role="alert" variant="inset"><p className="font-semibold">Import massal diblokir</p><p className="mt-1 text-xs leading-5">CSV ini berisi {count} baris tidak valid. Tidak ada baris yang akan diimport. Perbaiki data yang ditandai, unggah CSV baru, lalu mulai preview baru.</p></ReferenceSurface>;
}

const handoffMethodOptions: Array<{ description: string; label: string; value: HandoffMethod }> = [
  { description: "Bagikan manual · kedaluwarsa setelah 24 jam · penerima membuat password", label: "Link undangan", value: "invite_link" },
  { description: "Bagikan manual · hanya ditampilkan sekali · penerima harus menggantinya saat login pertama", label: "Password sementara", value: "temporary_password" },
];

function ImportHandoffMethodOptions({ handoffMethod, onHandoffMethodChange }: Pick<ImportDetailViewProps, "handoffMethod" | "onHandoffMethodChange">) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {handoffMethodOptions.map((option) => (
        <label className={cn(
          REFERENCE_SURFACE_CLASS_NAMES.inset,
          "flex min-h-20 cursor-pointer items-start gap-3 px-4 py-3 transition-[background-color,border-color,box-shadow] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary-300",
          handoffMethod === option.value ? "border-primary-500 bg-white shadow-[0_12px_28px_-24px_color-mix(in_oklab,var(--voyage-deep)_80%,transparent)]" : "hover:bg-primary-50/90",
        )} key={option.value}>
          <input checked={handoffMethod === option.value} className="mt-1 size-4 accent-primary-700" name="handoff-method" onChange={() => onHandoffMethodChange(option.value)} type="radio" value={option.value} />
          <span><span className="block text-sm font-semibold text-secondary-900">{option.label}</span><span className="mt-1 block text-xs leading-5 text-secondary-600">{option.description}</span></span>
        </label>
      ))}
    </div>
  );
}

function ImportConfirmationCounts({ counts }: { counts: ImportStatusDto["counts"] }) {
  return (
    <ReferenceSurface as="div" className="mt-5 px-4 py-4" variant="inset">
      <p className="text-sm font-semibold text-secondary-900">Jumlah untuk konfirmasi</p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 text-sm sm:grid-cols-5">
        <span className="text-secondary-600">Baru <strong className="text-secondary-900">{counts.create}</strong></span>
        <span className="text-secondary-600">Diperbarui <strong className="text-secondary-900">{counts.update}</strong></span>
        <span className="text-secondary-600">Gagal <strong className={counts.failed ? "text-student-status-danger-fg" : "text-secondary-900"}>{counts.failed}</strong></span>
        <span className="text-secondary-600">Dilewati <strong className="text-secondary-900">{counts.skipped}</strong></span>
        <span className="text-secondary-600">Belum selesai <strong className={counts.invalid ? "text-student-status-danger-fg" : "text-secondary-900"}>{counts.invalid}</strong></span>
      </div>
    </ReferenceSurface>
  );
}

function ImportDraftActions({ canConfirm, cancelArmed, cancelBusy, cancelImport, cancelMessage, confirmBusy, confirmImport, confirmMessage, onCancelArmedChange }: { canConfirm: boolean } & Pick<ImportDetailViewProps, "cancelArmed" | "cancelBusy" | "cancelImport" | "cancelMessage" | "confirmBusy" | "confirmImport" | "confirmMessage" | "onCancelArmedChange">) {
  return (
    <>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button onClick={() => void cancelImport()} type="button" variant="dangerOutline"><X aria-hidden="true" size={16} />{cancelArmed ? "Konfirmasi batalkan draft" : "Batalkan draft"}</Button>
          {cancelArmed ? <Button className="ml-2 text-xs" onClick={() => onCancelArmedChange(false)} size="default" type="button" variant="ghost">Pertahankan draft</Button> : null}
          {cancelMessage ? <p aria-live="polite" className="mt-2 text-xs leading-5 text-secondary-600" role="status">{cancelBusy ? "Membatalkan…" : cancelMessage}</p> : null}
        </div>
        <Button disabled={!canConfirm || confirmBusy || cancelBusy} onClick={() => void confirmImport()} size="lg" type="button" variant="brand"><CheckCircle2 aria-hidden="true" size={17} />{confirmBusy ? "Mengonfirmasi…" : "Konfirmasi dan masukkan import ke antrean"}</Button>
      </div>
      {confirmMessage ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-secondary-600" role="status">{confirmMessage}</p> : null}
    </>
  );
}

function ImportDraftContent({ canConfirm, cancelArmed, cancelBusy, cancelImport, cancelMessage, confirmBusy, confirmImport, confirmMessage, handoffMethod, importStatus, invalidRows, onCancelArmedChange, onHandoffMethodChange }: { canConfirm: boolean; invalidRows: ImportStatusDto["rows"] } & Pick<ImportDetailViewProps, "cancelArmed" | "cancelBusy" | "cancelImport" | "cancelMessage" | "confirmBusy" | "confirmImport" | "confirmMessage" | "handoffMethod" | "importStatus" | "onCancelArmedChange" | "onHandoffMethodChange">) {
  return (
    <>
      <ImportRowTable importStatus={importStatus} />
      <ReferenceSurface as="section" aria-labelledby="confirm-import-heading" className="p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="confirm-import-heading">Pilih satu metode handoff<FieldRequiredMark /></h2>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-500">Pilihan ini berlaku untuk setiap akun baru dalam import. Akun yang sudah ada hanya menerima pembaruan profil dan tidak pernah menerima kredensial baru.</p>
          </div>
          <ImportDraftReadiness invalidCount={importStatus.counts.invalid} />
        </div>
        <ImportInvalidRowsNotice count={invalidRows.length} />
        <ImportHandoffMethodOptions handoffMethod={handoffMethod} onHandoffMethodChange={onHandoffMethodChange} />
        <ImportConfirmationCounts counts={importStatus.counts} />
        <ImportDraftActions canConfirm={canConfirm} cancelArmed={cancelArmed} cancelBusy={cancelBusy} cancelImport={cancelImport} cancelMessage={cancelMessage} confirmBusy={confirmBusy} confirmImport={confirmImport} confirmMessage={confirmMessage} onCancelArmedChange={onCancelArmedChange} />
      </ReferenceSurface>
    </>
  );
}

function ImportDraftReadiness({ invalidCount }: { invalidCount: number }) {
  const ready = invalidCount === 0;
  return (
    <div className={cn("flex max-w-sm items-start gap-2 text-sm leading-5", ready ? "text-student-status-success-fg" : "text-student-status-attention-fg")} role="status">
      {ready ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
      <span><strong className="block font-semibold">{ready ? "Siap dikonfirmasi" : invalidCount + " baris tidak valid memblokir batch ini"}</strong>{ready ? null : <span className="block text-xs leading-5 text-secondary-600">Tidak ada baris yang diimport sampai Anda mengunggah CSV yang sudah diperbaiki.</span>}</span>
    </div>
  );
}

function ImportOperationalNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <ReferenceSurface as="div" className={`mt-4 px-4 py-3 text-sm ${ADMIN_STATUS_CLASS_NAMES.danger}`} variant="inset"><p className="font-semibold">Catatan operasional</p><p className="mt-1 text-xs leading-5">{message}</p></ReferenceSurface>;
}

function ImportResultContent({ copy, importStatus, loadStatus, onSessionIssueChange }: { copy: ReturnType<typeof statusCopy>; importStatus: ImportStatusDto; loadStatus: ImportStatusLoader; onSessionIssueChange: (kind: "expired" | "forbidden" | null) => void }) {
  const canShowHandoff = importStatus.status === "completed" || importStatus.status === "partial" || importStatus.status === "failed";
  return (
    <>
      <ReferenceSurface as="section" aria-labelledby="result-heading" className="p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${toneClasses(copy.tone)}`}>{statusIcon(importStatus.status)}</span><div><h2 className="font-heading text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="result-heading">Hasil import</h2><p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-500">{copy.detail}</p></div></div>
        <div className="mt-5"><CountStrip counts={importStatus.counts} mode="result" /></div>
        <ImportOperationalNote message={importStatus.lastErrorMessage} />
      </ReferenceSurface>
      {canShowHandoff ? <HandoffDeliveryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={onSessionIssueChange} /> : null}
      <RetryPanel importStatus={importStatus} onRefresh={loadStatus} onSessionIssue={onSessionIssueChange} />
      <ImportRowTable importStatus={importStatus} />
    </>
  );
}

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
      <ImportDetailHeader copy={copy} loadStatus={loadStatus} refreshing={refreshing} status={importStatus.status} />
      <ImportDetailAlerts heartbeatIsStale={heartbeatIsStale} importStatus={importStatus} lastFetchedAt={lastFetchedAt} pollError={pollError} readIsStale={readIsStale} sessionIssue={sessionIssue} />
      <ImportStatusBanner importStatus={importStatus} />
      <ImportProgressPanel importStatus={importStatus} />
      <ImportSummaryCard importStatus={importStatus} />
      {importStatus.status === "draft" ? <ImportDraftContent canConfirm={canConfirm} cancelArmed={cancelArmed} cancelBusy={cancelBusy} cancelImport={cancelImport} cancelMessage={cancelMessage} confirmBusy={confirmBusy} confirmImport={confirmImport} confirmMessage={confirmMessage} handoffMethod={handoffMethod} importStatus={importStatus} invalidRows={invalidRows} onCancelArmedChange={onCancelArmedChange} onHandoffMethodChange={onHandoffMethodChange} /> : <ImportResultContent copy={copy} importStatus={importStatus} loadStatus={loadStatus} onSessionIssueChange={onSessionIssueChange} />}
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
     setConfirmMessage("Menyimpan metode handoff dan memasukkan import ke antrean…");
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
         const message = apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "Import tidak dapat dikonfirmasi.");
        setConfirmMessage(message);
         toast.error("Import massal diblokir", { description: message });
        return;
      }
       setConfirmMessage("Import masuk ke antrean. Halaman ini akan melakukan polling status database dan berhenti saat mencapai hasil terminal.");
      await loadStatus();
    } catch {
       const message = "Konfirmasi tidak dapat mencapai server. Segarkan sebelum mencoba lagi.";
      setConfirmMessage(message);
       toast.error("Konfirmasi import tidak tersedia", { description: message });
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
     dispatch({ type: "cancelMessage", value: "Membatalkan draft…" });
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
         dispatch({ type: "cancelMessage", value: apiErrorMessage(payload && typeof payload === "object" && "error" in payload ? (payload as { error?: unknown }).error : null, "Draft tidak dapat dibatalkan.") });
        return;
      }
      dispatch({ type: "cancelArmed", value: false });
       dispatch({ type: "cancelMessage", value: "Draft dibatalkan. Tidak ada akun yang berubah." });
      await loadStatus();
      router.refresh();
    } catch {
       dispatch({ type: "cancelMessage", value: "Tindakan pembatalan tidak dapat mencapai server. Segarkan lalu coba lagi." });
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
