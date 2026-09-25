"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { showToast } from "@/components/ui/toast";
import { ArrowDownToLine, CircleAlert, FileText, Upload } from "@/lib/icons";
import {
  toQuestionBankCsvDraftPayload,
  type QuestionBankCsvDraftQuestion,
  type QuestionBankCsvParseResult,
} from "@/lib/question-bank/csv";
import type {
  QuestionBankXlsxIssue,
  QuestionBankXlsxPreviewSummary,
  QuestionBankXlsxThumbnail,
} from "@/lib/question-bank/xlsx-contract";
import {
  QUESTION_BANK_XLSX_LIMITS,
  QUESTION_BANK_XLSX_MIME_TYPE,
} from "@/lib/question-bank/xlsx-limits";
import type { EditLeaseProof } from "@/lib/resource-edit-lock/types";
import { cn } from "@/lib/utils";

import type { QuestionBankCsvImportResult } from "./question-bank-csv-flow";

type XlsxMode = "append" | "overwrite";
type FlowPhase =
  | "idle"
  | "granting"
  | "uploading"
  | "completing"
  | "previewing"
  | "ready"
  | "invalid"
  | "applying"
  | "complete";

type XlsxThumbnail = Omit<QuestionBankXlsxThumbnail, "objectKey">;
type XlsxPreview = {
  issues: QuestionBankXlsxIssue[];
  normalizedRows: QuestionBankCsvParseResult["normalizedRows"];
  previewId: string;
  summary: QuestionBankXlsxPreviewSummary;
  thumbnailPage: { nextOffset: number | null; offset: number };
  thumbnails: XlsxThumbnail[];
};

type DraftApplied = {
  fileName: string;
  imageCount: number;
  mediaFolderReservationId: string;
  questions: QuestionBankCsvDraftQuestion[];
  rowCount: number;
};

type DraftImportProps = {
  disabled?: boolean;
  draft: Pick<DraftApplied, "fileName" | "imageCount" | "rowCount"> | null;
  mediaFolderReservationId?: string;
  onDraftApplied: (draft: DraftApplied) => void;
  onRemove: () => void;
};

type ExistingImportResult = QuestionBankCsvImportResult & {
  imageAssetIds: string[];
  previewId: string;
};

type ExistingImportProps = {
  bankId: string;
  currentQuestionCount: number;
  disabled?: boolean;
  editLease: EditLeaseProof | null;
  expectedRevision: number;
  onApplied?: (result: ExistingImportResult) => Promise<void> | void;
};

type XlsxUploadGrant = {
  contentType: string;
  expectedWorkbookSizeBytes: number;
  expiresAt: string;
  partSizeBytes: number;
  parts: Array<{
    contentLength: number;
    partNumber: number;
    uploadUrl: string;
  }>;
  uploadId: string;
};

type XlsxDraftApplyResult = {
  imageAssetIds: string[];
  mediaFolderReservationId: string;
  normalizedRows: QuestionBankCsvParseResult["normalizedRows"];
  previewId: string;
};

type XlsxBankApplyResult = ExistingImportResult;

const XLSX_MIME_TYPE = QUESTION_BANK_XLSX_MIME_TYPE;
const XLSX_MAX_BYTES = QUESTION_BANK_XLSX_LIMITS.workbookBytes;
const XLSX_PART_UPLOAD_CONCURRENCY = 2;
const XLSX_API_ROOT = "/api/mentor/question-banks/xlsx";

const fieldLabels: Record<string, string> = {
  correct_options: "kunci jawaban",
  difficulty: "tingkat kesulitan",
  explanation: "pembahasan",
  explanation_image: "gambar pembahasan",
  materi: "materi",
  option_a: "pilihan A",
  option_a_image: "gambar pilihan A",
  option_b: "pilihan B",
  option_b_image: "gambar pilihan B",
  option_c: "pilihan C",
  option_c_image: "gambar pilihan C",
  option_d: "pilihan D",
  option_d_image: "gambar pilihan D",
  option_e: "pilihan E",
  option_e_image: "gambar pilihan E",
  prompt: "pertanyaan",
  prompt_image: "gambar pertanyaan",
  question_id: "nomor soal",
  question_type: "jenis soal",
  subject_code: "subjek",
};

const csvIssueMessages: Record<string, string> = {
  xlsx_control_character: "Ada karakter yang tidak bisa dibaca.",
  xlsx_empty_file: "File kosong. Isi sheet Soal lalu unggah kembali.",
  xlsx_field_too_long: "Isi bagian ini terlalu panjang.",
  xlsx_header_invalid: "Susunan kolom belum sesuai dengan templat.",
  xlsx_header_only: "Belum ada soal di bawah judul kolom.",
  xlsx_invalid_correct_options: "Kunci jawaban tidak sesuai dengan pilihan yang diisi.",
  xlsx_invalid_difficulty: "Tingkat kesulitan belum dikenali.",
  xlsx_invalid_materi: "Materi tidak sesuai dengan daftar yang tersedia.",
  xlsx_invalid_question_id: "Nomor soal belum dapat dikenali.",
  xlsx_invalid_question_type: "Jenis soal belum dikenali.",
  xlsx_invalid_subject_code: "Subjek belum dikenali.",
  xlsx_invalid_utf8: "File belum dapat dibaca. Simpan ulang lalu unggah kembali.",
  xlsx_option_sequence_invalid: "Pilihan jawaban harus berurutan mulai dari A.",
  xlsx_required_field: "Bagian ini wajib diisi.",
  xlsx_row_limit_exceeded: "File memuat lebih dari 500 soal.",
};

const xlsxIssueMessages: Record<string, string> = {
  xlsx_cell_value_invalid: "Isi sel belum dapat dibaca. Periksa kembali nilainya.",
  xlsx_column_limit_exceeded: "Sheet Soal memiliki kolom di luar batas templat.",
  xlsx_formula_disallowed: "Rumus belum didukung. Ganti rumus dengan nilainya.",
  xlsx_header_invalid: "Urutan atau nama kolom belum sesuai dengan templat.",
  xlsx_image_anchor_invalid: "Letakkan gambar di satu sel pada kolom gambar yang sesuai.",
  xlsx_image_outside_question_sheet: "Letakkan gambar pada sheet Soal.",
  xlsx_image_placement_limit_exceeded: "Jumlah gambar melebihi batas file.",
  xlsx_image_slot_conflict: "Satu sel gambar berisi tautan dan gambar. Pilih salah satu.",
  xlsx_image_source_invalid: "Gambar tidak dapat dibuka atau formatnya belum didukung.",
  xlsx_image_url_invalid: "Gunakan tautan langsung yang dapat dibuka ke gambar.",
  xlsx_image_url_limit_exceeded: "Jumlah tautan gambar melebihi batas file.",
  xlsx_image_url_too_long: "Tautan gambar terlalu panjang.",
  xlsx_image_url_unsafe: "Gunakan tautan HTTPS langsung ke gambar.",
  xlsx_multiple_images_in_slot: "Satu sel gambar hanya boleh berisi satu gambar.",
  xlsx_question_sheet_missing: "Sheet Soal tidak ditemukan. Unduh templat lalu isi sheet Soal.",
  xlsx_row_index_limit_exceeded: "Sheet Soal memiliki terlalu banyak baris kosong.",
  xlsx_too_large: "Ukuran file melebihi batas 24 MB.",
  xlsx_total_image_bytes_exceeded: "Total ukuran gambar melebihi batas file.",
  xlsx_total_image_source_bytes_exceeded: "Total ukuran sumber gambar melebihi batas file.",
  xlsx_unique_image_limit_exceeded: "Jumlah gambar melebihi batas file.",
  xlsx_unknown_sheet: "File memiliki sheet tambahan. Hapus sheet yang tidak digunakan lalu unggah kembali.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseErrorCode(payload: unknown, status: number) {
  return isRecord(payload) && typeof payload.error === "string"
    ? payload.error
    : `http_${status}`;
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    attempt_busy: "Sistem sedang sibuk. Coba lagi sebentar.",
    attempt_cancelled: "Proses file dibatalkan. Pilih file untuk memulai lagi.",
    attempt_expired: "Waktu untuk mengunggah file sudah habis. Pilih file kembali.",
    attempt_not_found: "File sudah tidak tersedia. Pilih file kembali.",
    attempt_target_mismatch: "Pratinjau ini sudah tidak cocok. Unggah file kembali.",
    attempt_unavailable: "File belum dapat diproses saat ini. Coba lagi sebentar.",
    forbidden_origin: "File belum dapat diproses. Muat ulang halaman lalu coba lagi.",
    http_400: "File belum dapat diproses. Periksa file lalu coba lagi.",
    http_413: "Ukuran file melebihi batas 24 MB.",
    http_503: "Sistem sedang sibuk. Coba lagi sebentar.",
    invalid_media_asset: "Ada gambar yang tidak dapat digunakan. Periksa gambar lalu coba lagi.",
    invalid_request: "File belum dapat diproses. Pilih file kembali.",
    lease_expired: "Sesi pengeditan berakhir. Muat ulang halaman lalu coba lagi.",
    lease_superseded: "Bank Soal berubah di tempat lain. Muat ulang halaman lalu coba lagi.",
    multipart_incomplete: "File belum terkirim lengkap. Pilih file kembali untuk mengulang unggahan.",
    resource_busy_retry: "Sistem sedang sibuk. Coba lagi sebentar.",
    resource_inaccessible: "Bank Soal tidak dapat diakses.",
    resource_locked: "Bank Soal sedang dipakai orang lain.",
    stale_revision: "Bank Soal berubah sejak halaman dibuka. Muat ulang halaman lalu coba lagi.",
    unauthenticated: "Sesi Anda berakhir. Masuk lagi lalu coba.",
    upload_failed: "File belum berhasil diunggah. Periksa koneksi lalu coba lagi.",
  };
  return messages[code] ?? "File belum berhasil diproses. Periksa file lalu coba lagi.";
}

function issueMessage(issue: QuestionBankXlsxIssue) {
  const code = issue.code;
  let message = xlsxIssueMessages[code] ?? csvIssueMessages[code];
  if (!message && (issue.field?.endsWith("_image") || /image|picture|drawing|url/iu.test(code))) {
    message = "Gambar tidak dapat digunakan. Ganti gambar atau periksa tautannya.";
  }
  if (!message && code === "xlsx_header_invalid" && issue.reason === "missing") {
    message = "Kolom ini belum ada. Gunakan templat soal yang tersedia.";
  }
  if (!message && code === "xlsx_header_invalid" && issue.reason === "reordered") {
    message = "Urutan kolom belum sesuai dengan templat.";
  }
  if (!message && code === "xlsx_header_invalid" && issue.reason === "unknown") {
    message = "Kolom ini tidak dikenali. Hapus kolom tambahan dari file.";
  }
  if (!message) message = "Periksa isi bagian ini dan ikuti petunjuk pada templat.";

  const location = [
    issue.row ? `Baris ${issue.row}` : null,
    issue.field ? fieldLabels[issue.field] ?? "bagian soal" : null,
  ].filter(Boolean).join(" · ");
  return location ? `${location}: ${message}` : message;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatFileSize(value: number) {
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/u, "")} MB`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function parseUploadGrant(value: unknown): XlsxUploadGrant | null {
  if (!isRecord(value) || !Array.isArray(value.parts)) return null;
  if (
    typeof value.uploadId !== "string"
    || typeof value.expiresAt !== "string"
    || typeof value.partSizeBytes !== "number"
    || typeof value.expectedWorkbookSizeBytes !== "number"
    || typeof value.contentType !== "string"
  ) return null;
  const parts = value.parts.filter((part): part is XlsxUploadGrant["parts"][number] =>
    isRecord(part)
    && typeof part.partNumber === "number"
    && typeof part.contentLength === "number"
    && typeof part.uploadUrl === "string",
  );
  if (parts.length !== value.parts.length) return null;
  return {
    contentType: value.contentType,
    expectedWorkbookSizeBytes: value.expectedWorkbookSizeBytes,
    expiresAt: value.expiresAt,
    partSizeBytes: value.partSizeBytes,
    parts,
    uploadId: value.uploadId,
  };
}

function parsePreview(value: unknown): XlsxPreview | null {
  if (!isRecord(value)
    || !Array.isArray(value.issues)
    || !Array.isArray(value.normalizedRows)
    || !Array.isArray(value.thumbnails)
    || typeof value.previewId !== "string"
    || !isRecord(value.summary)
    || !isRecord(value.thumbnailPage)
    || typeof value.thumbnailPage.offset !== "number"
    || (value.thumbnailPage.nextOffset !== null && typeof value.thumbnailPage.nextOffset !== "number")) {
    return null;
  }
  const thumbnails = value.thumbnails.filter((item): item is XlsxThumbnail =>
    isRecord(item)
    && typeof item.contentSha256 === "string"
    && typeof item.height === "number"
    && typeof item.mimeType === "string"
    && typeof item.sizeBytes === "number"
    && typeof item.thumbnailBase64 === "string"
    && typeof item.width === "number"
    && Array.isArray(item.placements),
  );
  if (thumbnails.length !== value.thumbnails.length) return null;
  return {
    issues: value.issues as QuestionBankXlsxIssue[],
    normalizedRows: value.normalizedRows as QuestionBankCsvParseResult["normalizedRows"],
    previewId: value.previewId,
    summary: value.summary as QuestionBankXlsxPreviewSummary,
    thumbnailPage: {
      nextOffset: value.thumbnailPage.nextOffset as number | null,
      offset: value.thumbnailPage.offset,
    },
    thumbnails,
  };
}

function discardAttempt(uploadId: string) {
  return fetch(`${XLSX_API_ROOT}/preview/${encodeURIComponent(uploadId)}`, {
    cache: "no-store",
    credentials: "same-origin",
    keepalive: true,
    method: "DELETE",
  }).catch(() => undefined);
}

function validateGrant(grant: XlsxUploadGrant, file: File) {
  const deadline = Date.parse(grant.expiresAt);
  const expectedParts = Math.ceil(file.size / grant.partSizeBytes);
  if (
    grant.expectedWorkbookSizeBytes !== file.size
    || !Number.isSafeInteger(grant.partSizeBytes)
    || grant.partSizeBytes !== QUESTION_BANK_XLSX_LIMITS.multipartPartBytes
    || grant.contentType !== XLSX_MIME_TYPE
    || !Number.isFinite(deadline)
    || deadline <= Date.now()
    || grant.parts.length !== expectedParts
    || grant.parts.some((part, index) => {
      const expectedLength = Math.min(
        grant.partSizeBytes,
        file.size - index * grant.partSizeBytes,
      );
      let validUrl = false;
      try {
        validUrl = new URL(part.uploadUrl).protocol === "https:";
      } catch {
        validUrl = false;
      }
      return part.partNumber !== index + 1
        || part.contentLength !== expectedLength
        || !validUrl;
    })
  ) {
    throw new Error("attempt_unavailable");
  }
  return deadline;
}

async function uploadExactParts(
  file: File,
  grant: XlsxUploadGrant,
  deadline: number,
  controller: AbortController,
  onProgress: (completed: number, total: number) => void,
) {
  let nextPart = 0;
  let completedParts = 0;
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  const abortAtDeadline = () => {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      if (!controller.signal.aborted) {
        controller.abort(new Error("attempt_expired"));
      }
      return;
    }
    deadlineTimer = setTimeout(abortAtDeadline, remainingMs);
  };
  abortAtDeadline();
  const uploadNextPart = async () => {
    while (nextPart < grant.parts.length) {
      if (controller.signal.aborted) throw controller.signal.reason ?? new DOMException("Upload dibatalkan.", "AbortError");
      if (Date.now() >= deadline) throw new Error("attempt_expired");
      const partIndex = nextPart;
      nextPart += 1;
      const part = grant.parts[partIndex]!;
      const start = (part.partNumber - 1) * grant.partSizeBytes;
      const body = file.slice(start, start + part.contentLength);
      if (body.size !== part.contentLength) throw new Error("attempt_unavailable");
      const response = await fetch(part.uploadUrl, {
        body,
        cache: "no-store",
        credentials: "omit",
        method: "PUT",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("upload_failed");
      completedParts += 1;
      onProgress(completedParts, grant.parts.length);
    }
  };

  const workers = Array.from(
    { length: Math.min(XLSX_PART_UPLOAD_CONCURRENCY, grant.parts.length) },
    () => uploadNextPart(),
  );
  try {
    await Promise.all(workers);
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    await Promise.allSettled(workers);
    const reason = controller.signal.reason;
    if (reason instanceof Error && reason.message === "attempt_expired") {
      throw reason;
    }
    throw error;
  } finally {
    if (deadlineTimer !== null) clearTimeout(deadlineTimer);
  }
  if (Date.now() >= deadline) throw new Error("attempt_expired");
}

function XlsxTemplateDownload() {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary-800 shadow-sm">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">Templat soal Excel</p>
          <p className="mt-0.5 text-xs leading-5 text-secondary-600">
            Isi sheet Soal dan letakkan gambar pada kolom gambar.
          </p>
        </div>
      </div>
      <Button
        aria-label="Unduh templat soal Excel"
        className="shrink-0"
        nativeButton={false}
        render={<a download="templat-bank-soal.xlsx" href={`${XLSX_API_ROOT}/template`} />}
        size="sm"
        variant="reference"
      >
        <ArrowDownToLine aria-hidden="true" size={16} />
        Unduh templat
      </Button>
    </div>
  );
}

function ThumbnailLabel({ image }: { image: XlsxThumbnail }) {
  return (
    <div className="mt-2 grid gap-1 text-xs leading-5 text-secondary-700">
      {image.placements.map((placement, index) => (
        <p key={`${placement.row}-${placement.field}-${index}`}>
          Baris {placement.row} · {fieldLabels[placement.field] ?? "gambar soal"}
        </p>
      ))}
    </div>
  );
}

function ThumbnailGrid({ images }: { images: XlsxThumbnail[] }) {
  if (!images.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image, index) => (
        <figure
          className="min-w-0 rounded-2xl border border-primary-100 bg-white p-3"
          key={`${image.contentSha256}-${index}`}
        >
          <div className="grid min-h-32 place-items-center overflow-hidden rounded-xl bg-primary-50/50">
            <Image
              alt={image.placements.map((placement) => `Baris ${placement.row}, ${fieldLabels[placement.field] ?? "gambar soal"}`).join("; ")}
              className="max-h-36 w-auto object-contain"
              height={image.height}
              src={`data:${image.mimeType};base64,${image.thumbnailBase64}`}
              unoptimized
              width={image.width}
            />
          </div>
          <figcaption>
            <ThumbnailLabel image={image} />
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function PreviewSummary({
  mode,
  preview,
  target,
}: {
  mode: XlsxMode;
  preview: XlsxPreview;
  target: { kind: "draft" } | { currentQuestionCount: number; kind: "bank" };
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 p-4 sm:grid-cols-2">
      <div>
        <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Isi file</p>
        <p className="mt-1 text-sm font-semibold text-secondary-900">
          {formatCount(preview.summary.acceptedRows)} soal · {formatCount(preview.summary.imageCount)} gambar
        </p>
      </div>
      {target.kind === "bank" ? (
        <div>
          <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Dampak</p>
          <p className="mt-1 text-sm leading-6 text-secondary-700">
            {mode === "append"
              ? `${formatCount(preview.summary.acceptedRows)} soal akan ditambahkan. Soal yang sudah ada tetap dipertahankan.`
              : `Isi Bank Soal akan mengikuti ${formatCount(preview.summary.acceptedRows)} soal di file. Soal aktif yang tidak tercantum akan dinonaktifkan; judul dan deskripsi tetap.`}
          </p>
          {mode === "overwrite" ? (
            <p className="mt-1 text-xs leading-5 text-secondary-600">
              Saat ini ada {formatCount(target.currentQuestionCount)} soal di Bank Soal.
            </p>
          ) : null}
        </div>
      ) : (
        <div>
          <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Bank baru</p>
          <p className="mt-1 text-sm leading-6 text-secondary-700">
            File ini akan menggantikan soal dari file impor sebelumnya. Soal yang Anda tulis sendiri tetap ada.
          </p>
        </div>
      )}
    </div>
  );
}

function CompletionSummary({ text }: { text: string }) {
  return (
    <ReferenceSurface
      as="section"
      className="border-student-status-success-border bg-student-status-success-bg p-5"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-white text-student-status-success-fg">
          <Upload aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-secondary-900">Impor selesai</h3>
          <p className="mt-1 text-sm leading-6 text-secondary-700">{text}</p>
        </div>
      </div>
    </ReferenceSurface>
  );
}

function QuestionBankXlsxImportDialog({
  onOpenChange,
  open,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target: { kind: "draft"; mediaFolderReservationId?: string; onDraftApplied: (draft: DraftApplied) => void }
    | { kind: "bank"; bankId: string; currentQuestionCount: number; disabled?: boolean; editLease: EditLeaseProof | null; expectedRevision: number; onApplied?: (result: XlsxBankApplyResult) => Promise<void> | void };
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [mode, setMode] = useState<XlsxMode>("append");
  const [preview, setPreview] = useState<XlsxPreview | null>(null);
  const [issues, setIssues] = useState<QuestionBankXlsxIssue[]>([]);
  const [partProgress, setPartProgress] = useState({ completed: 0, total: 0 });
  const [formError, setFormError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [completionText, setCompletionText] = useState<string | null>(null);
  const workflowPhaseRef = useRef<FlowPhase>("idle");
  const uploadIdRef = useRef<string | null>(null);
  const workflowControllerRef = useRef<AbortController | null>(null);
  const thumbnailControllerRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const [claimedMode, setClaimedMode] = useState<XlsxMode | null>(null);
  const discardedAttemptIdsRef = useRef(new Set<string>());

  function updatePhase(next: FlowPhase) {
    workflowPhaseRef.current = next;
    setPhase(next);
  }

  function clearPreviewState() {
    setPreview(null);
    setIssues([]);
    setApplyError(null);
    setThumbnailError(null);
    setIsLoadingThumbnails(false);
    setCompletionText(null);
    setClaimedMode(null);
    setPartProgress({ completed: 0, total: 0 });
  }

  function requestDiscard(uploadId: string | null) {
    if (!uploadId || discardedAttemptIdsRef.current.has(uploadId)) return;
    discardedAttemptIdsRef.current.add(uploadId);
    void discardAttempt(uploadId);
  }

  function resetForm() {
    setFile(null);
    setMode("append");
    setFormError(null);
    clearPreviewState();
    uploadIdRef.current = null;
    cancelRequestedRef.current = false;
    updatePhase("idle");
  }

  function cancelFlow(closeDialog: boolean) {
    const currentPhase = workflowPhaseRef.current;
    if (currentPhase === "applying") return;
    generationRef.current += 1;
    cancelRequestedRef.current = true;
    if (currentPhase !== "granting") workflowControllerRef.current?.abort();
    thumbnailControllerRef.current?.abort();
    requestDiscard(uploadIdRef.current);
    uploadIdRef.current = null;
    resetForm();
    if (closeDialog) onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (workflowPhaseRef.current === "applying") return;
    if (workflowPhaseRef.current !== "complete") cancelFlow(false);
    else resetForm();
    onOpenChange(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    const discardedAttemptIds = discardedAttemptIdsRef.current;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      thumbnailControllerRef.current?.abort();
      if (workflowPhaseRef.current !== "applying") {
        workflowControllerRef.current?.abort();
        const uploadId = uploadIdRef.current;
        if (uploadId && !discardedAttemptIds.has(uploadId)) {
          discardedAttemptIds.add(uploadId);
          void discardAttempt(uploadId);
        }
      }
    };
  }, []);

  async function startFileWorkflow(selectedFile: File) {
    const generation = ++generationRef.current;
    cancelRequestedRef.current = false;
    clearPreviewState();
    setFormError(null);
    setFile(selectedFile);

    if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
      setFormError("Pilih file Excel dengan format .xlsx.");
      updatePhase("invalid");
      return;
    }
    if (selectedFile.size <= 0) {
      setFormError("File kosong. Pilih file yang berisi soal.");
      updatePhase("invalid");
      return;
    }
    if (selectedFile.size > XLSX_MAX_BYTES) {
      setFormError("Ukuran file melebihi batas 24 MB.");
      updatePhase("invalid");
      return;
    }

    const controller = new AbortController();
    let workflowUploadId: string | null = null;
    workflowControllerRef.current = controller;
    setPartProgress({ completed: 0, total: 0 });
    updatePhase("granting");
    try {
      const grantResponse = await fetch(`${XLSX_API_ROOT}/upload`, {
        body: JSON.stringify({
          expectedWorkbookSizeBytes: selectedFile.size,
          fileName: selectedFile.name,
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const grantPayload = await readJson(grantResponse);
      if (!grantResponse.ok) throw new Error(responseErrorCode(grantPayload, grantResponse.status));
      const grant = parseUploadGrant(grantPayload);
      if (!grant) throw new Error("attempt_unavailable");
      workflowUploadId = grant.uploadId;

      if (generation !== generationRef.current || cancelRequestedRef.current) {
        requestDiscard(workflowUploadId);
        return;
      }
      uploadIdRef.current = workflowUploadId;
      const deadline = validateGrant(grant, selectedFile);
      setPartProgress({ completed: 0, total: grant.parts.length });
      updatePhase("uploading");
      await uploadExactParts(
        selectedFile,
        grant,
        deadline,
        controller,
        (completed, total) => {
          if (mountedRef.current && generation === generationRef.current) {
            setPartProgress({ completed, total });
          }
        },
      );
      if (generation !== generationRef.current || cancelRequestedRef.current) {
        requestDiscard(grant.uploadId);
        return;
      }

      updatePhase("completing");
      const completeResponse = await fetch(
        `${XLSX_API_ROOT}/upload/${encodeURIComponent(grant.uploadId)}/complete`,
        {
          cache: "no-store",
          credentials: "same-origin",
          method: "POST",
          signal: controller.signal,
        },
      );
      const completePayload = await readJson(completeResponse);
      if (!completeResponse.ok) throw new Error(responseErrorCode(completePayload, completeResponse.status));
      if (generation !== generationRef.current || cancelRequestedRef.current) {
        requestDiscard(grant.uploadId);
        return;
      }

      updatePhase("previewing");
      const previewResponse = await fetch(`${XLSX_API_ROOT}/preview`, {
        body: JSON.stringify({ uploadId: grant.uploadId }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
      const previewPayload = await readJson(previewResponse);
      if (!previewResponse.ok) {
        if (
          previewResponse.status === 422
          && isRecord(previewPayload)
          && Array.isArray(previewPayload.issues)
          && isRecord(previewPayload.summary)
        ) {
          const previewIssues = previewPayload.issues as QuestionBankXlsxIssue[];
          if (mountedRef.current && generation === generationRef.current) {
            setIssues(previewIssues);
            setFormError(null);
            setPreview({
              issues: previewIssues,
              normalizedRows: [],
              previewId: grant.uploadId,
              summary: previewPayload.summary as QuestionBankXlsxPreviewSummary,
              thumbnailPage: { nextOffset: null, offset: 0 },
              thumbnails: [],
            });
            updatePhase("invalid");
          }
          return;
        }
        throw new Error(responseErrorCode(previewPayload, previewResponse.status));
      }
      const parsedPreview = parsePreview(previewPayload);
      if (!parsedPreview) throw new Error("attempt_unavailable");
      if (generation !== generationRef.current || cancelRequestedRef.current) {
        requestDiscard(grant.uploadId);
        return;
      }
      setPreview(parsedPreview);
      setIssues(parsedPreview.issues);
      updatePhase(parsedPreview.issues.length ? "invalid" : "ready");
    } catch (error) {
      if (generation !== generationRef.current || cancelRequestedRef.current || isAbortError(error)) {
        requestDiscard(workflowUploadId);
        return;
      }
      requestDiscard(workflowUploadId);
      if (uploadIdRef.current === workflowUploadId) uploadIdRef.current = null;
      if (mountedRef.current) {
        setFormError(errorMessage(error instanceof Error ? error.message : "upload_failed"));
        updatePhase("invalid");
      }
    } finally {
      if (workflowControllerRef.current === controller) workflowControllerRef.current = null;
    }
  }

  function handleFileChange(nextFile: File | null) {
    if (workflowPhaseRef.current === "applying") return;
    if (!nextFile) {
      cancelFlow(false);
      return;
    }
    generationRef.current += 1;
    workflowControllerRef.current?.abort();
    thumbnailControllerRef.current?.abort();
    requestDiscard(uploadIdRef.current);
    uploadIdRef.current = null;
    void startFileWorkflow(nextFile);
  }

  async function loadNextThumbnailPage() {
    if (!preview || preview.thumbnailPage.nextOffset === null || isLoadingThumbnails) return;
    const controller = new AbortController();
    thumbnailControllerRef.current = controller;
    setIsLoadingThumbnails(true);
    setThumbnailError(null);
    try {
      const response = await fetch(
        `${XLSX_API_ROOT}/preview/${encodeURIComponent(preview.previewId)}/thumbnails?offset=${preview.thumbnailPage.nextOffset}`,
        { cache: "no-store", credentials: "same-origin", signal: controller.signal },
      );
      const payload = await readJson(response);
      if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
      if (!isRecord(payload) || !Array.isArray(payload.images)
        || typeof payload.offset !== "number"
        || (payload.nextOffset !== null && typeof payload.nextOffset !== "number")) {
        throw new Error("attempt_unavailable");
      }
      const images = payload.images.filter((item): item is XlsxThumbnail =>
        isRecord(item)
        && typeof item.contentSha256 === "string"
        && typeof item.height === "number"
        && typeof item.mimeType === "string"
        && typeof item.sizeBytes === "number"
        && typeof item.thumbnailBase64 === "string"
        && typeof item.width === "number"
        && Array.isArray(item.placements),
      );
      if (images.length !== payload.images.length) throw new Error("attempt_unavailable");
      setPreview((current) => current ? {
        ...current,
        thumbnailPage: { nextOffset: payload.nextOffset as number | null, offset: payload.offset as number },
        thumbnails: [...current.thumbnails, ...images],
      } : current);
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        setThumbnailError(errorMessage(error instanceof Error ? error.message : "attempt_unavailable"));
      }
    } finally {
      if (thumbnailControllerRef.current === controller) thumbnailControllerRef.current = null;
      if (mountedRef.current) setIsLoadingThumbnails(false);
    }
  }

  function buildBankResultSummary(result: XlsxBankApplyResult) {
    const questionSummary = result.mode === "append"
      ? `${formatCount(result.importedCount)} soal ditambahkan.`
      : `${formatCount(result.importedCount)} soal diproses; ${formatCount(result.preservedQuestionIds.length)} cocok dengan soal yang sudah ada, dan ${formatCount(result.retiredCount)} soal lama yang tidak tercantum dinonaktifkan.`;
    return `${questionSummary} ${formatCount(result.imageAssetIds.length)} gambar disimpan di Media Kapten.`;
  }

  async function applyImport() {
    if (!preview || issues.length || !preview.summary.acceptedRows || phase === "applying" || phase === "complete") return;
    if (target.kind === "bank" && !target.editLease) return;
    const controller = new AbortController();
    workflowControllerRef.current = controller;
    setApplyError(null);
    setClaimedMode(target.kind === "bank" ? mode : null);
    updatePhase("applying");
    try {
      let endpoint: string;
      let body: Record<string, string>;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (target.kind === "draft") {
        endpoint = `${XLSX_API_ROOT}/draft`;
        body = { previewId: preview.previewId };
        if (target.mediaFolderReservationId) {
          body.mediaFolderReservationId = target.mediaFolderReservationId;
        }
      } else {
        endpoint = `/api/mentor/question-banks/${encodeURIComponent(target.bankId)}/xlsx/import?mode=${mode}`;
        body = { previewId: preview.previewId };
        headers["x-edit-lease-generation"] = String(target.editLease!.generation);
        headers["x-edit-lease-token"] = target.editLease!.token;
        headers["x-question-bank-revision"] = String(target.expectedRevision);
      }
      const response = await fetch(endpoint, {
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        headers,
        method: "POST",
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
      if (!isRecord(payload) || !isRecord(payload.result)) throw new Error("attempt_unavailable");

      let completionMessage: string;
      if (target.kind === "draft") {
        const result = payload.result as unknown as XlsxDraftApplyResult;
        if (!Array.isArray(result.normalizedRows)
          || typeof result.mediaFolderReservationId !== "string"
          || !Array.isArray(result.imageAssetIds)) {
          throw new Error("attempt_unavailable");
        }
        const draftPayload = toQuestionBankCsvDraftPayload({
          normalizedRows: result.normalizedRows,
          summary: preview.summary,
        }, "question-bank-draft");
        const applied: DraftApplied = {
          fileName: file?.name ?? "templat-bank-soal.xlsx",
          imageCount: result.imageAssetIds.length,
          mediaFolderReservationId: result.mediaFolderReservationId,
          questions: draftPayload.questions,
          rowCount: draftPayload.questions.length,
        };
        target.onDraftApplied(applied);
        completionMessage = `${formatCount(applied.rowCount)} soal siap disimpan bersama Bank Soal. ${formatCount(applied.imageCount)} gambar sudah disimpan di Media Kapten. Jika Bank Soal tidak jadi dibuat, gambar tetap ada di sana.`;
        showToast(`${formatCount(applied.rowCount)} soal siap disimpan bersama Bank Soal.`, { variant: "success" });
      } else {
        const result = payload.result as unknown as XlsxBankApplyResult;
        if (result.bankId !== target.bankId
          || !Array.isArray(result.imageAssetIds)
          || !Array.isArray(result.createdQuestionIds)
          || !Array.isArray(result.preservedQuestionIds)
          || typeof result.importedCount !== "number"
          || typeof result.retiredCount !== "number") {
          throw new Error("attempt_unavailable");
        }
        await target.onApplied?.(result);
        completionMessage = buildBankResultSummary(result);
        showToast(`${formatCount(result.importedCount)} soal berhasil dimuat ke Bank Soal.`, { variant: "success" });
      }
      uploadIdRef.current = null;
      clearPreviewState();
      setCompletionText(completionMessage);
      updatePhase("complete");
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        const message = errorMessage(error instanceof Error ? error.message : "attempt_unavailable");
        setApplyError(message);
        showToast("Impor belum berhasil. Rincian tersedia di dialog.", { variant: "error" });
        updatePhase("ready");
      }
    } finally {
      if (workflowControllerRef.current === controller) workflowControllerRef.current = null;
    }
  }

  const isBusy = phase === "granting" || phase === "uploading" || phase === "completing" || phase === "previewing";
  const disabled = target.kind === "bank" ? Boolean(target.disabled) : false;
  const progress = phase === "uploading"
    ? partProgress.total ? (partProgress.completed / partProgress.total) * 100 : 0
    : phase === "completing" || phase === "previewing" ? 100 : null;
  const uploadLabel = phase === "previewing"
    ? "Memeriksa isi file"
    : phase === "completing"
      ? "Menyelesaikan unggahan"
      : "Mengunggah file soal";
  const canApply = Boolean(
    preview
    && preview.summary.acceptedRows > 0
    && issues.length === 0
    && phase === "ready"
    && !disabled
    && (target.kind !== "bank" || target.editLease),
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent
        aria-describedby="question-bank-xlsx-import-description"
        className="max-h-[min(90vh,820px)] overflow-y-auto sm:max-w-3xl"
        data-question-bank-xlsx-import="true"
      >
        <DialogHeader>
          <DialogTitle>{target.kind === "draft" ? "Impor soal dari Excel" : "Tambahkan soal dari Excel"}</DialogTitle>
          <DialogDescription id="question-bank-xlsx-import-description">
            {target.kind === "draft"
              ? "File diperiksa sebelum soalnya dimasukkan ke Bank baru. Isi nama dan deskripsi, lalu buat Bank Soal untuk menyimpan semuanya sekaligus."
              : "File diperiksa terlebih dahulu. Pastikan ringkasan sesuai sebelum Anda mengonfirmasi impor."}
          </DialogDescription>
        </DialogHeader>

        {phase === "complete" ? (
          <CompletionSummary text={completionText ?? "Impor selesai."} />
        ) : (
          <div className="grid gap-5">
            <XlsxTemplateDownload />
            <div className="grid gap-2">
              <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>
                File soal
              </label>
              <FileUploadSlot
                accept={`.xlsx,${XLSX_MIME_TYPE}`}
                disabled={disabled || isBusy || phase === "applying"}
                file={file}
                id={inputId}
                maxSizeLabel="Maks. 24 MB · 500 soal"
                onCancelUpload={() => cancelFlow(true)}
                onChange={handleFileChange}
                progress={progress}
                uploadLabel={uploadLabel}
                uploading={isBusy}
                uploadMeta={file ? formatFileSize(file.size) : undefined}
              />
              {isBusy ? (
                <p aria-live="polite" className="text-sm text-secondary-600" role="status">
                  {phase === "uploading"
                    ? "File sedang diunggah. Tunggu sampai pemeriksaan selesai."
                    : phase === "previewing"
                      ? "Soal dan gambar sedang diperiksa."
                      : "Unggahan sedang disiapkan."}
                </p>
              ) : null}
            </div>

            {target.kind === "bank" ? (
              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
                  Cara memasukkan soal
                </FieldLabel>
                <RadioGroup
                  aria-label="Cara memasukkan soal"
                  className="grid gap-3 sm:grid-cols-2"
                  disabled={disabled || isBusy || phase === "applying" || claimedMode !== null}
                  onValueChange={(value) => setMode(value as XlsxMode)}
                  value={mode}
                >
                  {(["append", "overwrite"] as const).map((value) => (
                    <label
                      className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "items-start")}
                      htmlFor={`${inputId}-mode-${value}`}
                      key={value}
                    >
                      <RadioGroupItem id={`${inputId}-mode-${value}`} value={value} />
                      <span className="min-w-0">
                        <span className="block font-semibold text-secondary-900">
                          {value === "append" ? "Tambahkan" : "Timpa semua"}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-secondary-600">
                          {value === "append"
                            ? "Pertahankan soal yang ada, lalu tambahkan soal dari file."
                            : "Ganti isi Bank Soal dengan file. Soal yang tidak tercantum akan dinonaktifkan."}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              </Field>
            ) : null}

            {preview ? (
              <section className="grid gap-4" aria-label="Pratinjau file soal">
                <div>
                  <h3 className="font-semibold text-secondary-900">Ringkasan file</h3>
                  <p className="mt-1 text-sm text-secondary-600">
                    {formatCount(preview.summary.acceptedRows)} soal · {formatCount(preview.summary.imageCount)} gambar
                  </p>
                </div>
                {preview.summary.rejectedRows > 0 || issues.length > 0 ? (
                  <div
                    aria-live="assertive"
                    className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3"
                    role="alert"
                  >
                    <div className="flex items-start gap-2 text-sm font-semibold text-student-status-danger-fg">
                      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <p>Ada bagian yang perlu diperbaiki sebelum soal bisa dimuat.</p>
                    </div>
                    <ul className="mt-2 grid gap-1 pl-6 text-sm leading-6 text-secondary-800">
                      {issues.map((issue, index) => <li key={`${issue.code}-${issue.row ?? "file"}-${index}`}>{issueMessage(issue)}</li>)}
                    </ul>
                  </div>
                ) : null}
                {target.kind === "bank" && !issues.length ? (
                  <PreviewSummary mode={mode} preview={preview} target={target} />
                ) : null}
                {target.kind === "draft" && !issues.length ? (
                  <PreviewSummary mode={mode} preview={preview} target={target} />
                ) : null}
                {preview.thumbnails.length ? (
                  <div className="grid gap-3">
                    <h3 className="font-semibold text-secondary-900">Gambar dalam file</h3>
                    <ThumbnailGrid images={preview.thumbnails} />
                    {thumbnailError ? (
                      <p className="text-sm text-student-status-danger-fg" role="alert">{thumbnailError}</p>
                    ) : null}
                    {preview.thumbnailPage.nextOffset !== null ? (
                      <div>
                        <Button
                          disabled={isLoadingThumbnails || phase === "applying"}
                          onClick={() => void loadNextThumbnailPage()}
                          type="button"
                          variant="brandOutline"
                        >
                          {isLoadingThumbnails ? "Memuat gambar…" : "Lihat gambar berikutnya"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {formError ? (
              <div
                aria-live="assertive"
                className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
                role="alert"
              >
                {formError}
              </div>
            ) : null}
            {applyError ? (
              <div
                aria-live="assertive"
                className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
                role="alert"
              >
                {applyError}
              </div>
            ) : null}
            {preview && target.kind === "draft" && !issues.length ? (
              <p className="rounded-2xl border border-primary-100 bg-primary-50/45 px-4 py-3 text-sm leading-6 text-secondary-700">
                Setelah dikonfirmasi, gambar disimpan di Media Kapten. Soal dan gambar akan ikut tersimpan saat Anda membuat Bank Soal. Jika Bank Soal tidak jadi dibuat, gambar tetap ada di Media Kapten.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {phase === "complete" ? (
            <Button onClick={() => handleOpenChange(false)} type="button" variant="brand">
              Selesai
            </Button>
          ) : (
            <>
              <Button
                disabled={phase === "applying"}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="brandOutline"
              >
                {isBusy ? "Batalkan" : "Batal"}
              </Button>
              <Button
                disabled={!canApply || phase === "applying"}
                onClick={() => void applyImport()}
                type="button"
                variant="brand"
              >
                {phase === "applying"
                  ? target.kind === "draft" ? "Menyiapkan soal…" : "Menerapkan impor…"
                  : target.kind === "draft"
                    ? "Gunakan soal ini"
                    : mode === "append"
                      ? "Tambahkan ke Bank Soal"
                      : "Timpa isi Bank Soal"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankXlsxDraftImportControl({
  disabled = false,
  draft,
  mediaFolderReservationId,
  onDraftApplied,
  onRemove,
}: DraftImportProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-3">
      {draft ? (
        <ReferenceSurface
          as="section"
          className="grid gap-3 border-primary-200 bg-primary-50/60 p-5"
          data-question-bank-xlsx-draft-status="true"
        >
          <div>
            <h3 className="font-semibold text-secondary-900">Soal dari Excel siap disimpan</h3>
            <p className="mt-1 text-sm leading-6 text-secondary-700">
              {formatCount(draft.rowCount)} soal dari {draft.fileName} akan ikut disimpan saat Bank Soal dibuat, bersama nama dan deskripsi yang Anda isi.
            </p>
            <p className="mt-1 text-sm leading-6 text-secondary-700">
              {formatCount(draft.imageCount)} gambar sudah disimpan di Media Kapten. Jika Bank Soal tidak jadi dibuat, gambar tetap ada di sana.
            </p>
          </div>
          <Button
            disabled={disabled}
            onClick={onRemove}
            size="sm"
            type="button"
            variant="brandOutline"
          >
            Hapus soal dari file
          </Button>
        </ReferenceSurface>
      ) : null}
      <Button
        className="w-full sm:w-fit"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
        variant="brandOutline"
      >
        <Upload aria-hidden="true" data-icon="inline-start" />
        Impor dari Excel
      </Button>
      <QuestionBankXlsxImportDialog
        onOpenChange={setOpen}
        open={open}
        target={{
          kind: "draft",
          mediaFolderReservationId,
          onDraftApplied,
        }}
      />
    </div>
  );
}

function QuestionBankXlsxImportControl({
  bankId,
  currentQuestionCount,
  disabled = false,
  editLease,
  expectedRevision,
  onApplied,
}: ExistingImportProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className="w-full"
        disabled={disabled || !editLease}
        onClick={() => setOpen(true)}
        type="button"
        variant="brandOutline"
      >
        <Upload aria-hidden="true" data-icon="inline-start" />
        Impor Excel
      </Button>
      <QuestionBankXlsxImportDialog
        onOpenChange={setOpen}
        open={open}
        target={{
          bankId,
          currentQuestionCount,
          disabled,
          editLease,
          expectedRevision,
          kind: "bank",
          onApplied,
        }}
      />
    </>
  );
}

export { QuestionBankXlsxDraftImportControl, QuestionBankXlsxImportControl };
export type { DraftApplied as QuestionBankXlsxDraftApplied, ExistingImportResult as QuestionBankXlsxImportResult };
