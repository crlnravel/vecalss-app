"use client";

import Image from "next/image";
import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
import { CircleAlert, FileText, Upload } from "@/lib/icons";
import {
  toQuestionBankCsvDraftPayload,
  type QuestionBankCsvDraftQuestion,
  type QuestionBankCsvParseResult,
} from "@/lib/question-bank/csv";
import type {
  QuestionBankXlsxIssue,
  QuestionBankXlsxPreviewSummary,
  QuestionBankXlsxThumbnail,
  QuestionBankXlsxWorksheetRowRef,
} from "@/lib/question-bank/xlsx-contract";
import {
  QUESTION_BANK_XLSX_LIMITS,
  QUESTION_BANK_XLSX_MIME_TYPE,
} from "@/lib/question-bank/xlsx-limits";
import type { EditLeaseProof } from "@/lib/resource-edit-lock/types";
import { cn } from "@/lib/utils";

import type { QuestionBankCsvImportResult } from "./question-bank-csv-flow";

const COUNT_FORMATTER = new Intl.NumberFormat("id-ID");

type XlsxMode = "append" | "overwrite";
type XlsxOverwriteImpact = {
  addedImageCount: number;
  addedQuestionCount: number;
  clearedImageCount: number;
  matchedQuestionCount: number;
  replacedImageCount: number;
  retiredQuestionCount: number;
  updatedQuestionCount: number;
};
type XlsxOverwriteImpactSnapshot = XlsxOverwriteImpact & { bankRevision: number };
type XlsxOverwriteImpactResult = {
  error: string | null;
  impact: XlsxOverwriteImpactSnapshot | null;
  key: string;
} | null;
type XlsxOverwriteImpactPhase = "idle" | "loading" | "ready" | "error";
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

type QuestionBankXlsxImportFlowProps = {
  initialFile?: File | null;
  onBusyChange?: (busy: boolean) => void;
  onFileCleared?: () => void;
  onOpenChange: (open: boolean) => void;
  onUploadStatusChange?: (status: XlsxDraftUploadStatus | null) => void;
  open: boolean;
  presentation?: "dialog" | "embedded" | "inline";
  target:
    | { kind: "draft"; onDraftApplied: (draft: DraftApplied) => void }
    | {
        kind: "bank";
        bankId: string;
        currentQuestionCount: number;
        disabled?: boolean;
        editLease: EditLeaseProof | null;
        expectedRevision: number;
        onApplied?: (result: XlsxBankApplyResult) => Promise<void> | void;
      };
};

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
  previewId: string;
  rowCount: number;
  sheets: Array<{
    key: string;
    questions: QuestionBankCsvDraftQuestion[];
    title: string;
  }>;
};

type XlsxDraftUploadStatus = {
  completed: boolean;
  label: string;
  meta: string;
  progress: number | null;
};

type ExistingImportResult = QuestionBankCsvImportResult & {
  imageAssetIds: string[];
  overwriteImpact: XlsxOverwriteImpact | null;
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
  normalizedRows: QuestionBankCsvParseResult["normalizedRows"];
  normalizedRowWorksheetRefs: QuestionBankXlsxWorksheetRowRef[];
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
  xlsx_empty_file: "File kosong. Isi lembar soal lalu unggah kembali.",
  xlsx_field_too_long: "Isi bagian ini terlalu panjang.",
  xlsx_header_invalid: "Susunan kolom belum dikenali.",
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
  xlsx_row_limit_exceeded: "File memuat lebih dari 1.000 soal.",
};

const xlsxIssueMessages: Record<string, string> = {
  xlsx_cell_value_invalid: "Isi sel belum dapat dibaca. Periksa kembali nilainya.",
  xlsx_column_limit_exceeded: "Salah satu lembar memiliki terlalu banyak kolom.",
  xlsx_formula_disallowed: "Rumus belum didukung. Ganti rumus dengan nilainya.",
  xlsx_header_invalid: "Nama kolom pada lembar soal belum dikenali.",
  xlsx_image_anchor_invalid: "Letakkan gambar di satu sel pada kolom gambar yang sesuai.",
  xlsx_image_outside_question_sheet: "Letakkan gambar pada lembar soal yang dikenali.",
  xlsx_image_placement_limit_exceeded: "Jumlah gambar melebihi batas file.",
  xlsx_image_slot_conflict: "Satu sel gambar berisi tautan dan gambar. Pilih salah satu.",
  xlsx_image_source_invalid: "Gambar tidak dapat dibuka atau formatnya belum didukung.",
  xlsx_image_url_invalid: "Gunakan tautan langsung yang dapat dibuka ke gambar.",
  xlsx_image_url_limit_exceeded: "Jumlah tautan gambar melebihi batas file.",
  xlsx_image_url_too_long: "Tautan gambar terlalu panjang.",
  xlsx_image_url_unsafe: "Gunakan tautan HTTPS langsung ke gambar.",
  xlsx_multiple_images_in_slot: "Satu sel gambar hanya boleh berisi satu gambar.",
  xlsx_question_sheet_missing: "Lembar soal belum ditemukan. Periksa nama kolom pada workbook.",
  xlsx_row_index_limit_exceeded: "Salah satu lembar memiliki terlalu banyak baris.",
  xlsx_too_large: "Ukuran file melebihi batas 24 MB.",
  xlsx_total_image_bytes_exceeded: "Total ukuran gambar melebihi batas file.",
  xlsx_total_image_source_bytes_exceeded: "Total ukuran sumber gambar melebihi batas file.",
  xlsx_unique_image_limit_exceeded: "Jumlah gambar melebihi batas file.",
  xlsx_worksheet_limit_exceeded: "Workbook memiliki terlalu banyak lembar.",
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
    attempt_expired: "Waktu untuk memproses file ini sudah habis. Hapus file lalu unggah kembali.",
    attempt_not_found: "File sudah tidak tersedia. Pilih file kembali.",
    attempt_target_mismatch: "Pratinjau ini sudah tidak cocok. Unggah file kembali.",
    attempt_unavailable: "File belum dapat diproses saat ini. Coba lagi sebentar.",
    csv_rows_invalid: "Pastikan nomor soal pada file sesuai dengan soal di Bank ini, lalu pilih file kembali.",
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
    message = "Kolom wajib belum ada pada lembar soal.";
  }
  if (!message && code === "xlsx_header_invalid" && issue.reason === "reordered") {
    message = "Periksa kembali urutan kolom pada lembar soal.";
  }
  if (!message && code === "xlsx_header_invalid" && issue.reason === "unknown") {
    message = "Kolom ini tidak dikenali. Hapus kolom tambahan dari file.";
  }
  if (!message) message = "Periksa isi bagian ini pada workbook lalu unggah kembali.";

  const location = [
    issue.sheetName ? `Tab ${issue.sheetName}` : null,
    issue.row ? `Baris ${issue.row}` : null,
    issue.field ? fieldLabels[issue.field] ?? "bagian soal" : null,
  ].filter(Boolean).join(" · ");
  return location ? `${location}: ${message}` : message;
}

function formatCount(value: number) {
  return COUNT_FORMATTER.format(value);
}

function formatFileSize(value: number) {
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} KB`
    : `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/u, "")} MB`;
}

function worksheetDraftTitle(
  sheetName: string,
  rows: QuestionBankCsvParseResult["normalizedRows"],
) {
  const materiValues = [...new Set(
    rows
      .map((row) => row.materi?.trim())
      .filter((value): value is string => Boolean(value)),
  )];
  if (materiValues.length === 1) return materiValues[0]!;

  const cleanedSheetName = sheetName
    .replace(/^[^\p{L}\p{N}]*/u, "")
    .replace(/\bLBE\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tryoutName = cleanedSheetName.match(/\bTO\s*(\d+)\b(?:\s+(.+))?/i);
  if (tryoutName) {
    const detail = tryoutName[2]?.trim();
    return `TO ${tryoutName[1]}${detail ? ` ${detail}` : ""}`;
  }
  return cleanedSheetName || sheetName;
}

function groupDraftWorksheets(
  normalizedRows: QuestionBankCsvParseResult["normalizedRows"],
  worksheetRefs: QuestionBankXlsxWorksheetRowRef[],
) {
  if (normalizedRows.length !== worksheetRefs.length) return null;
  const rowsBySheet = new Map<string, QuestionBankCsvParseResult["normalizedRows"]>();
  let invalidReference = false;
  normalizedRows.forEach((row, index) => {
    const sheetName = worksheetRefs[index]?.sheetName;
    if (typeof sheetName !== "string" || !sheetName.trim()) {
      invalidReference = true;
      return;
    }
    const rows = rowsBySheet.get(sheetName) ?? [];
    rows.push(row);
    rowsBySheet.set(sheetName, rows);
  });
  if (invalidReference || rowsBySheet.size === 0 || [...rowsBySheet.values()].some((rows) => rows.length === 0)) return null;

  return [...rowsBySheet.entries()].map(([sheetName, rows]) => {
    const payload = toQuestionBankCsvDraftPayload({
      normalizedRows: rows,
      summary: {
        acceptedRows: rows.length,
        dataRowCount: rows.length,
        rejectedRows: 0,
        rowErrorCount: 0,
        structuralErrorCount: 0,
      },
    }, "question-bank-draft");
    return {
      key: sheetName,
      questions: payload.questions,
      title: worksheetDraftTitle(sheetName, rows),
    };
  });
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

function parseXlsxOverwriteImpact(value: unknown): XlsxOverwriteImpact | null {
  if (!isRecord(value)) return null;
  const countKeys = [
    "addedImageCount",
    "addedQuestionCount",
    "clearedImageCount",
    "matchedQuestionCount",
    "replacedImageCount",
    "retiredQuestionCount",
    "updatedQuestionCount",
  ] as const;
  if (countKeys.some((key) =>
    !Number.isSafeInteger(value[key]) || (value[key] as number) < 0,
  )) {
    return null;
  }
  return Object.fromEntries(countKeys.map((key) => [key, value[key]])) as unknown as XlsxOverwriteImpact;
}

function parseXlsxOverwriteImpactSnapshot(value: unknown): XlsxOverwriteImpactSnapshot | null {
  if (!isRecord(value) || !Number.isSafeInteger(value.bankRevision) || (value.bankRevision as number) < 1) {
    return null;
  }
  const impact = parseXlsxOverwriteImpact(value);
  return impact ? { ...impact, bankRevision: value.bankRevision as number } : null;
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
  onProgress: (uploadedBytes: number, totalBytes: number) => void,
) {
  let nextPart = 0;
  const uploadedBytesByPart = new Map<number, number>();
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
  const reportProgress = () => {
    onProgress(
      [...uploadedBytesByPart.values()].reduce((sum, value) => sum + value, 0),
      file.size,
    );
  };
  const uploadPart = (
    part: XlsxUploadGrant["parts"][number],
    body: Blob,
  ) => new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const abortRequest = () => {
      request.abort();
      finish(controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new DOMException("Upload dibatalkan.", "AbortError"));
    };
    const cleanup = () => controller.signal.removeEventListener("abort", abortRequest);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      uploadedBytesByPart.set(part.partNumber, Math.min(part.contentLength, event.loaded));
      reportProgress();
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        finish(new Error("upload_failed"));
        return;
      }
      uploadedBytesByPart.set(part.partNumber, part.contentLength);
      reportProgress();
      finish();
    });
    request.addEventListener("error", () => finish(new Error("upload_failed")));
    request.addEventListener("abort", () => {
      if (!settled) {
        finish(controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new DOMException("Upload dibatalkan.", "AbortError"));
      }
    });
    controller.signal.addEventListener("abort", abortRequest, { once: true });
    request.open("PUT", part.uploadUrl);
    request.withCredentials = false;
    request.send(body);
  });

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
      await uploadPart(part, body);
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

function StakeholderWorkbookNotice() {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-primary-800 shadow-sm">
          <FileText aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">Gunakan berkas Excel LBE dari tim Anda</p>
          <p className="mt-0.5 text-xs leading-5 text-secondary-600">
            Semua tab soal yang dikenali akan dimuat bersama. Tab indeks dan dasbor dilewati. Letakkan gambar pada sel pertanyaan atau pilihan jawaban.
          </p>
        </div>
      </div>
    </div>
  );
}

function ThumbnailLabel({ image }: { image: XlsxThumbnail }) {
  return (
    <div className="mt-2 grid gap-1 text-xs leading-5 text-secondary-700">
      {image.placements.map((placement) => (
        <p key={`${image.contentSha256}-${placement.sheetName}-${placement.row}-${placement.field}`}>
          Tab {placement.sheetName} · Baris {placement.row} · {fieldLabels[placement.field] ?? "gambar soal"}
        </p>
      ))}
    </div>
  );
}

function ThumbnailGrid({ images }: { images: XlsxThumbnail[] }) {
  if (!images.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => (
        <figure
          className="min-w-0 rounded-2xl border border-primary-100 bg-white p-3"
          key={`${image.contentSha256}-${image.placements.map((placement) => `${placement.sheetName}-${placement.row}-${placement.field}`).join("|")}`}
        >
          <div className="grid min-h-32 place-items-center overflow-hidden rounded-xl bg-primary-50/50">
            <Image
              alt={image.placements.map((placement) => `Tab ${placement.sheetName}, baris ${placement.row}, ${fieldLabels[placement.field] ?? "gambar soal"}`).join("; ")}
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
  overwriteImpact,
  overwriteImpactError,
  overwriteImpactPhase,
}: {
  mode: XlsxMode;
  preview: XlsxPreview;
  target: { kind: "draft" } | { currentQuestionCount: number; kind: "bank" };
  overwriteImpact: XlsxOverwriteImpactSnapshot | null;
  overwriteImpactError: string | null;
  overwriteImpactPhase: XlsxOverwriteImpactPhase;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-primary-100 bg-primary-50/45 p-4 sm:grid-cols-2">
      <XlsxFileContentSummary preview={preview} target={target} />
      <XlsxTargetSummary
        mode={mode}
        overwriteImpact={overwriteImpact}
        overwriteImpactError={overwriteImpactError}
        overwriteImpactPhase={overwriteImpactPhase}
        preview={preview}
        target={target}
      />
    </div>
  );
}

function XlsxFileContentSummary({
  preview,
  target,
}: {
  preview: XlsxPreview;
  target: { kind: "draft" } | { currentQuestionCount: number; kind: "bank" };
}) {
  const acceptedRows = formatCount(preview.summary.acceptedRows);
  const questionSheets = formatCount(preview.summary.questionSheetCount);
  const imageSummary =
    target.kind === "bank"
      ? ` · ${formatCount(preview.summary.imageCount)} gambar`
      : "";

  return (
    <div>
      <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Isi file</p>
      <p className="mt-1 text-sm font-semibold text-secondary-900">
        {acceptedRows} soal dari {questionSheets} tab{imageSummary}
      </p>
    </div>
  );
}

function XlsxTargetSummary({
  mode,
  overwriteImpact,
  overwriteImpactError,
  overwriteImpactPhase,
  preview,
  target,
}: {
  mode: XlsxMode;
  overwriteImpact: XlsxOverwriteImpactSnapshot | null;
  overwriteImpactError: string | null;
  overwriteImpactPhase: XlsxOverwriteImpactPhase;
  preview: XlsxPreview;
  target: { kind: "draft" } | { currentQuestionCount: number; kind: "bank" };
}) {
  if (target.kind === "draft") {
    return (
      <div>
        <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Bank baru</p>
        <p className="mt-1 text-sm leading-6 text-secondary-700">
          File ini akan menggantikan soal dari file impor sebelumnya. Soal yang
          Anda tulis sendiri tetap ada.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Dampak</p>
      <p className="mt-1 text-sm leading-6 text-secondary-700">
        {mode === "append"
          ? `${formatCount(preview.summary.acceptedRows)} soal akan ditambahkan. Soal yang sudah ada tetap dipertahankan.`
          : "Soal di Bank akan disesuaikan dengan file. Soal aktif yang tidak tercantum akan dinonaktifkan; judul dan deskripsi tetap."}
      </p>
      {mode === "overwrite" ? (
        <XlsxOverwriteImpactSummary
          currentQuestionCount={target.currentQuestionCount}
          error={overwriteImpactError}
          impact={overwriteImpact}
          phase={overwriteImpactPhase}
        />
      ) : null}
    </div>
  );
}

function XlsxOverwriteImpactSummary({
  currentQuestionCount,
  error,
  impact,
  phase,
}: {
  currentQuestionCount: number;
  error: string | null;
  impact: XlsxOverwriteImpactSnapshot | null;
  phase: XlsxOverwriteImpactPhase;
}) {
  let result: ReactNode = null;
  if (phase === "loading" || phase === "idle") {
    result = (
      <p aria-live="polite" className="text-sm text-secondary-600" role="status">
        Menghitung perubahan pada Bank Soal…
      </p>
    );
  } else if (phase === "error") {
    result = (
      <p className="text-sm leading-6 text-student-status-danger-fg" role="alert">
        {error ?? "Dampak impor belum dapat dihitung. Muat ulang halaman lalu coba lagi."}
      </p>
    );
  } else if (impact) {
    result = <XlsxOverwriteImpactDetails impact={impact} />;
  }

  return (
    <div className="mt-3 grid gap-3">
      {result}
      <p className="text-xs leading-5 text-secondary-600">
        Saat halaman ini dibuka ada {formatCount(currentQuestionCount)} soal di Bank.
      </p>
    </div>
  );
}

function XlsxOverwriteImpactDetails({
  impact,
}: {
  impact: XlsxOverwriteImpactSnapshot;
}) {
  return (
    <>
      <div className="grid gap-3">
        <div>
          <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Soal</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
            <XlsxImpactCount label="Soal baru" value={impact.addedQuestionCount} />
            <XlsxImpactCount label="Cocok dengan Bank" value={impact.matchedQuestionCount} />
            <XlsxImpactCount label="Akan diperbarui" value={impact.updatedQuestionCount} />
            <XlsxImpactCount label="Akan dinonaktifkan" value={impact.retiredQuestionCount} />
          </dl>
        </div>
        <div>
          <p className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Gambar pada soal</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
            <XlsxImpactCount label="Ditambahkan" value={impact.addedImageCount} />
            <XlsxImpactCount label="Diganti" value={impact.replacedImageCount} />
            <XlsxImpactCount label="Dihapus" value={impact.clearedImageCount} />
          </dl>
        </div>
      </div>
      <p className="text-xs leading-5 text-secondary-600">
        Perhitungan memakai isi Bank saat halaman dibuka. Jika Bank berubah
        sebelum impor, proses ditolak. Muat ulang halaman untuk menghitung ulang.
      </p>
    </>
  );
}

function XlsxImpactCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs leading-5 text-secondary-600">{label}</dt>
      <dd className="text-sm font-semibold text-secondary-900">
        {formatCount(value)}
      </dd>
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

type MutableCurrent<T> = { current: T };

type XlsxFileWorkflowContext = {
  cancelRequestedRef: MutableCurrent<boolean>;
  clearPreviewState: () => void;
  generationRef: MutableCurrent<number>;
  mountedRef: MutableCurrent<boolean>;
  requestDiscard: (uploadId: string | null) => void;
  setFile: (file: File | null) => void;
  setIssues: (issues: QuestionBankXlsxIssue[]) => void;
  setPartProgress: (progress: { completed: number; total: number }) => void;
  setPreview: (preview: XlsxPreview | null) => void;
  setSmoothUploadProgress: (progress: number) => void;
  smoothUploadProgressRef: MutableCurrent<number>;
  updatePhase: (phase: FlowPhase) => void;
  uploadIdRef: MutableCurrent<string | null>;
  workflowControllerRef: MutableCurrent<AbortController | null>;
};

async function runXlsxFileWorkflow(
  selectedFile: File,
  context: XlsxFileWorkflowContext,
) {
  const {
    cancelRequestedRef,
    clearPreviewState,
    generationRef,
    mountedRef,
    requestDiscard,
    setFile,
    setIssues,
    setPartProgress,
    setPreview,
    setSmoothUploadProgress,
    smoothUploadProgressRef,
    updatePhase,
    uploadIdRef,
    workflowControllerRef,
  } = context;
  const generation = ++generationRef.current;
  cancelRequestedRef.current = false;
  clearPreviewState();
  smoothUploadProgressRef.current = 0;
  setSmoothUploadProgress(0);
  setFile(selectedFile);

  if (!selectedFile.name.toLowerCase().endsWith(".xlsx")) {
    showToast("Pilih file Excel dengan format .xlsx.", { duration: 6_500, variant: "error" });
    updatePhase("invalid");
    return;
  }
  if (selectedFile.size <= 0) {
    showToast("File kosong. Pilih file yang berisi soal.", { duration: 6_500, variant: "error" });
    updatePhase("invalid");
    return;
  }
  if (selectedFile.size > XLSX_MAX_BYTES) {
    showToast("Ukuran file melebihi batas 24 MB.", { duration: 6_500, variant: "error" });
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
    setPartProgress({ completed: 0, total: selectedFile.size });
    updatePhase("uploading");
    await uploadExactParts(
      selectedFile,
      grant,
      deadline,
      controller,
      (uploadedBytes, totalBytes) => {
        if (mountedRef.current && generation === generationRef.current) {
          setPartProgress({ completed: uploadedBytes, total: totalBytes });
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
      showToast(errorMessage(error instanceof Error ? error.message : "upload_failed"), {
        duration: 6_500,
        variant: "error",
      });
      updatePhase("invalid");
    }
  } finally {
    if (workflowControllerRef.current === controller) workflowControllerRef.current = null;
  }
}

function buildBankResultSummary(result: XlsxBankApplyResult) {
  if (result.mode === "append") {
    return `${formatCount(result.importedCount)} soal ditambahkan. ${formatCount(result.imageAssetIds.length)} gambar disimpan di Media Kapten.`;
  }
  const impact = result.overwriteImpact;
  if (!impact) {
    return `Impor tersimpan untuk ${formatCount(result.importedCount)} soal. Rincian jumlah soal yang diperbarui untuk impor lama ini tidak tersedia. ${formatCount(result.imageAssetIds.length)} gambar disimpan di Media Kapten.`;
  }
  const questionSummary = `Soal: ${formatCount(impact.addedQuestionCount)} baru, ${formatCount(impact.matchedQuestionCount)} cocok dengan Bank, ${formatCount(impact.updatedQuestionCount)} diperbarui, ${formatCount(impact.retiredQuestionCount)} dinonaktifkan.`;
  const imageSummary = `Gambar pada soal: ${formatCount(impact.addedImageCount)} ditambahkan, ${formatCount(impact.replacedImageCount)} diganti, ${formatCount(impact.clearedImageCount)} dihapus.`;
  return `${questionSummary} ${imageSummary} ${formatCount(result.imageAssetIds.length)} gambar disimpan di Media Kapten.`;
}

type XlsxImportApplyContext = {
  clearPreviewState: () => void;
  file: File | null;
  impactRequestKey: string | null;
  invalidatedImpactKeyRef: MutableCurrent<string | null>;
  issues: QuestionBankXlsxIssue[];
  mode: XlsxMode;
  mountedRef: MutableCurrent<boolean>;
  onAppliedBusyChange?: (busy: boolean) => void;
  onOpenChange: (open: boolean) => void;
  phase: FlowPhase;
  presentation: "dialog" | "embedded" | "inline";
  preview: XlsxPreview | null;
  setApplyError: (message: string | null) => void;
  setClaimedMode: (mode: XlsxMode | null) => void;
  setCompletionText: (text: string | null) => void;
  setOverwriteImpactResult: (result: XlsxOverwriteImpactResult) => void;
  target: QuestionBankXlsxImportFlowProps["target"];
  updatePhase: (phase: FlowPhase) => void;
  uploadIdRef: MutableCurrent<string | null>;
  workflowControllerRef: MutableCurrent<AbortController | null>;
};

async function runXlsxImportApply(context: XlsxImportApplyContext) {
  const {
    clearPreviewState,
    file,
    impactRequestKey,
    invalidatedImpactKeyRef,
    issues,
    mode,
    mountedRef,
    onAppliedBusyChange,
    onOpenChange,
    phase,
    presentation,
    preview,
    setApplyError,
    setClaimedMode,
    setCompletionText,
    setOverwriteImpactResult,
    target,
    updatePhase,
    uploadIdRef,
    workflowControllerRef,
  } = context;
  if (!preview || issues.length || !preview.summary.acceptedRows || phase === "applying" || phase === "complete") return;
  if (target.kind === "bank" && !target.editLease) return;
  const controller = new AbortController();
  workflowControllerRef.current = controller;
  setApplyError(null);
  setClaimedMode(target.kind === "bank" ? mode : null);
  updatePhase("applying");
  onAppliedBusyChange?.(true);
  try {
    let endpoint: string;
    let body: Record<string, string>;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (target.kind === "draft") {
      endpoint = `${XLSX_API_ROOT}/draft`;
      body = { previewId: preview.previewId };
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
        || !Array.isArray(result.normalizedRowWorksheetRefs)) {
        throw new Error("attempt_unavailable");
      }
      const sheets = groupDraftWorksheets(
        result.normalizedRows,
        result.normalizedRowWorksheetRefs,
      );
      if (!sheets || sheets.some((sheet) => !sheet.title.trim() || !sheet.questions.length)) {
        throw new Error("attempt_unavailable");
      }
      const applied: DraftApplied = {
        fileName: file?.name ?? "workbook-bank-soal.xlsx",
        previewId: result.previewId,
        rowCount: result.normalizedRows.length,
        sheets,
      };
      target.onDraftApplied(applied);
      completionMessage = `${formatCount(applied.rowCount)} soal siap dibagi menjadi ${formatCount(applied.sheets.length)} Bank Soal.`;
      showToast(`${formatCount(applied.rowCount)} soal dari ${formatCount(applied.sheets.length)} lembar siap dipilih.`, { variant: "success" });
    } else {
      const result = payload.result as unknown as XlsxBankApplyResult;
      if (result.bankId !== target.bankId
        || !Array.isArray(result.imageAssetIds)
        || !Array.isArray(result.createdQuestionIds)
        || !Array.isArray(result.preservedQuestionIds)
        || (result.mode !== "append" && result.mode !== "overwrite")
        || typeof result.importedCount !== "number"
        || typeof result.retiredCount !== "number") {
        throw new Error("attempt_unavailable");
      }
      const overwriteImpact = result.overwriteImpact == null
        ? null
        : parseXlsxOverwriteImpact(result.overwriteImpact);
      if (result.overwriteImpact != null && !overwriteImpact) throw new Error("attempt_unavailable");
      const normalizedResult = { ...result, overwriteImpact };
      await target.onApplied?.(normalizedResult);
      completionMessage = buildBankResultSummary(normalizedResult);
      showToast(`${formatCount(result.importedCount)} soal berhasil dimuat ke Bank Soal.`, { variant: "success" });
    }
    uploadIdRef.current = null;
    clearPreviewState();
    setCompletionText(completionMessage);
    updatePhase("complete");
    if (presentation === "inline" && target.kind === "draft") onOpenChange(false);
  } catch (error) {
    if (!isAbortError(error) && mountedRef.current) {
      const code = error instanceof Error ? error.message : "attempt_unavailable";
      const message = errorMessage(code);
      if (target.kind === "bank" && mode === "overwrite" && code === "stale_revision" && impactRequestKey) {
        invalidatedImpactKeyRef.current = impactRequestKey;
        setOverwriteImpactResult({ error: message, impact: null, key: impactRequestKey });
      } else {
        setApplyError(message);
      }
      showToast(message, { duration: 6_500, variant: "error" });
      updatePhase("ready");
    }
  } finally {
    if (workflowControllerRef.current === controller) workflowControllerRef.current = null;
    onAppliedBusyChange?.(false);
  }
}

type XlsxOverwriteImpactControllerOptions = {
  issues: QuestionBankXlsxIssue[];
  mode: XlsxMode;
  phase: FlowPhase;
  preview: XlsxPreview | null;
  target: QuestionBankXlsxImportFlowProps["target"];
};

function getXlsxImpactRequestKey({ issues, mode, phase, preview, target }: XlsxOverwriteImpactControllerOptions) {
  if (
    target.kind !== "bank"
    || mode !== "overwrite"
    || phase !== "ready"
    || issues.length > 0
    || !preview?.previewId
    || !preview.summary.acceptedRows
    || target.disabled
  ) return null;
  return [target.bankId, String(target.expectedRevision), preview.previewId].join(":");
}

function getXlsxOverwriteImpactView(
  result: XlsxOverwriteImpactResult,
  requestKey: string | null,
) {
  const currentResult = result?.key === requestKey ? result : null;
  return {
    error: currentResult?.error ?? null,
    impact: currentResult?.impact ?? null,
    impactPhase: !requestKey
      ? "idle" as const
      : !currentResult
        ? "loading" as const
        : currentResult.error
          ? "error" as const
          : "ready" as const,
  };
}

type XlsxOverwriteImpactRequest = {
  bankId: string;
  expectedRevision: number;
  previewId: string;
  requestKey: string;
  setResult: (result: XlsxOverwriteImpactResult) => void;
  signal: AbortSignal;
};

async function requestXlsxOverwriteImpact({
  bankId,
  expectedRevision,
  previewId,
  requestKey,
  setResult,
  signal,
}: XlsxOverwriteImpactRequest) {
  try {
    const response = await fetch(
      "/api/mentor/question-banks/" + encodeURIComponent(bankId) + "/xlsx/impact",
      {
        body: JSON.stringify({ expectedRevision, previewId }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal,
      },
    );
    const payload = await readJson(response);
    if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
    const impact = isRecord(payload)
      ? parseXlsxOverwriteImpactSnapshot(payload.impact)
      : null;
    if (!impact || impact.bankRevision !== expectedRevision) {
      throw new Error("stale_revision");
    }
    if (!signal.aborted) setResult({ error: null, impact, key: requestKey });
  } catch (error) {
    if (signal.aborted || isAbortError(error)) return;
    setResult({
      error: errorMessage(error instanceof Error ? error.message : "attempt_unavailable"),
      impact: null,
      key: requestKey,
    });
  }
}

function useXlsxOverwriteImpactController(options: XlsxOverwriteImpactControllerOptions) {
  const [result, setResult] = useState<XlsxOverwriteImpactResult>(null);
  const invalidatedImpactKeyRef = useRef<string | null>(null);
  const bankId = options.target.kind === "bank" ? options.target.bankId : null;
  const expectedRevision = options.target.kind === "bank"
    ? options.target.expectedRevision
    : null;
  const previewId = options.preview?.previewId ?? null;
  const requestKey = getXlsxImpactRequestKey(options);
  const view = getXlsxOverwriteImpactView(result, requestKey);

  function reset() {
    setResult(null);
    invalidatedImpactKeyRef.current = null;
  }

  // react-doctor-disable-next-line no-fetch-in-effect -- overwrite impact is remote data keyed by the current preview and revision; this effect aborts obsolete requests before updating the view.
  useEffect(() => {
    if (
      !requestKey
      || !bankId
      || expectedRevision === null
      || !previewId
      || invalidatedImpactKeyRef.current === requestKey
    ) return;
    const controller = new AbortController();
    void requestXlsxOverwriteImpact({
      bankId,
      expectedRevision,
      previewId,
      requestKey,
      setResult,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [bankId, expectedRevision, previewId, requestKey]);

  return {
    ...view,
    invalidatedImpactKeyRef,
    requestKey,
    reset,
    setResult,
  };
}

function isXlsxThumbnail(value: unknown): value is XlsxThumbnail {
  return isRecord(value)
    && typeof value.contentSha256 === "string"
    && typeof value.height === "number"
    && typeof value.mimeType === "string"
    && typeof value.sizeBytes === "number"
    && typeof value.thumbnailBase64 === "string"
    && typeof value.width === "number"
    && Array.isArray(value.placements);
}

function parseXlsxThumbnailPage(value: unknown) {
  if (
    !isRecord(value)
    || !Array.isArray(value.images)
    || typeof value.offset !== "number"
    || (value.nextOffset !== null && typeof value.nextOffset !== "number")
  ) return null;
  const images = value.images.filter(isXlsxThumbnail);
  if (images.length !== value.images.length) return null;
  return {
    images,
    nextOffset: value.nextOffset as number | null,
    offset: value.offset,
  };
}

type XlsxThumbnailControllerOptions = {
  controllerRef: MutableCurrent<AbortController | null>;
  mountedRef: MutableCurrent<boolean>;
  preview: XlsxPreview | null;
  setPreview: (preview: XlsxPreview | null | ((current: XlsxPreview | null) => XlsxPreview | null)) => void;
};

function useXlsxThumbnailController({
  controllerRef,
  mountedRef,
  preview,
  setPreview,
}: XlsxThumbnailControllerOptions) {
  const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  function reset() {
    setIsLoadingThumbnails(false);
    setThumbnailError(null);
  }

  async function loadNextThumbnailPage() {
    const nextOffset = preview?.thumbnailPage.nextOffset;
    if (!preview || nextOffset === null || nextOffset === undefined || isLoadingThumbnails) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoadingThumbnails(true);
    setThumbnailError(null);
    try {
      const response = await fetch(
        `${XLSX_API_ROOT}/preview/${encodeURIComponent(preview.previewId)}/thumbnails?offset=${nextOffset}`,
        { cache: "no-store", credentials: "same-origin", signal: controller.signal },
      );
      const payload = await readJson(response);
      if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
      const page = parseXlsxThumbnailPage(payload);
      if (!page) throw new Error("attempt_unavailable");
      setPreview((current) => current ? {
        ...current,
        thumbnailPage: { nextOffset: page.nextOffset, offset: page.offset },
        thumbnails: [...current.thumbnails, ...page.images],
      } : current);
    } catch (error) {
      if (!isAbortError(error) && mountedRef.current) {
        setThumbnailError(
          errorMessage(error instanceof Error ? error.message : "attempt_unavailable"),
        );
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setIsLoadingThumbnails(false); // react-doctor-disable-line no-loading-flag-reset-outside-finally -- an obsolete request must not clear the active request's loading state.
    }
  }

  return { isLoadingThumbnails, loadNextThumbnailPage, reset, thumbnailError };
}

type XlsxUploadProgressOptions = {
  applyError: string | null;
  file: File | null;
  issues: QuestionBankXlsxIssue[];
  onUploadStatusChange?: (status: XlsxDraftUploadStatus | null) => void;
  open: boolean;
  partProgress: { completed: number; total: number };
  phase: FlowPhase;
  presentation: "dialog" | "embedded" | "inline";
  preview: XlsxPreview | null;
  smoothUploadProgress: number;
  smoothUploadProgressRef: MutableCurrent<number>;
  setSmoothUploadProgress: (progress: number) => void;
  target: QuestionBankXlsxImportFlowProps["target"];
};

type XlsxUploadProgressView = {
  inlineDraftApplying: boolean;
  inlineDraftWaitingToApply: boolean;
  isBusy: boolean;
  progress: number | null;
  uploadLabel: string;
  uploadProgressTarget: number | null;
  uploadStatusBusy: boolean;
  uploadStatusProgress: number | null;
};

function getXlsxUploadProgressView({
  applyError,
  partProgress,
  phase,
  presentation,
  preview,
  smoothUploadProgress,
  target,
}: Pick<
  XlsxUploadProgressOptions,
  "applyError" | "partProgress" | "phase" | "presentation" | "preview" | "smoothUploadProgress" | "target"
>): XlsxUploadProgressView {
  const isBusy = ["granting", "uploading", "completing", "previewing"].includes(phase);
  const isInlineDraft = presentation === "inline" && target.kind === "draft";
  const inlineDraftWaitingToApply = isInlineDraft
    && phase === "ready"
    && Boolean(preview?.summary.acceptedRows)
    && !applyError;
  const inlineDraftApplying = isInlineDraft && phase === "applying";
  const uploadStatusBusy = isBusy || inlineDraftWaitingToApply || inlineDraftApplying;
  const uploadProgressTarget = phase === "uploading" && partProgress.total > 0
    ? (partProgress.completed / partProgress.total) * 100
    : null;
  const progress = phase === "uploading"
    ? Math.round(smoothUploadProgress * 10) / 10
    : null;

  return {
    inlineDraftApplying,
    inlineDraftWaitingToApply,
    isBusy,
    progress,
    uploadLabel: inlineDraftWaitingToApply || inlineDraftApplying
      ? "Menyiapkan soal dari file"
      : phase === "previewing"
        ? "Memeriksa isi file"
        : phase === "completing"
          ? "Menyelesaikan unggahan"
          : "Mengunggah file soal",
    uploadProgressTarget,
    uploadStatusBusy,
    uploadStatusProgress: inlineDraftWaitingToApply || inlineDraftApplying
      ? 100
      : progress,
  };
}

function useXlsxUploadProgressAnimation({
  phase,
  setSmoothUploadProgress,
  smoothUploadProgressRef,
  uploadProgressTarget,
}: Pick<XlsxUploadProgressOptions, "phase" | "setSmoothUploadProgress" | "smoothUploadProgressRef"> & {
  uploadProgressTarget: number | null;
}) {
  const uploadProgressTargetRef = useRef<number | null>(null);

  useEffect(() => {
    uploadProgressTargetRef.current = uploadProgressTarget;
  }, [uploadProgressTarget]);

  useEffect(() => {
    if (phase !== "uploading") {
      smoothUploadProgressRef.current = 0;
      return;
    }

    let frame = 0;
    const animate = () => {
      const desired = uploadProgressTargetRef.current ?? 0;
      const current = smoothUploadProgressRef.current;
      const distance = desired - current;
      const next = Math.abs(distance) <= 0.1 ? desired : current + distance * 0.2;
      if (next !== current) {
        smoothUploadProgressRef.current = next;
        setSmoothUploadProgress(next);
      }
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [phase, setSmoothUploadProgress, smoothUploadProgressRef]);
}

function getInlineXlsxErrorMessage(issues: QuestionBankXlsxIssue[]) {
  if (!issues.length) return "File belum berisi soal yang bisa digunakan.";
  const details = issues.slice(0, 2).map(issueMessage).join(" · ");
  const remaining = issues.length > 2
    ? ` +${formatCount(issues.length - 2)} masalah lainnya`
    : "";
  return `File perlu diperbaiki sebelum dapat digunakan. ${details}${remaining}`;
}

function useXlsxUploadStatusSync({
  file,
  onUploadStatusChange,
  open,
  phase,
  presentation,
  target,
  uploadLabel,
  uploadStatusBusy,
  uploadStatusProgress,
}: Pick<
  XlsxUploadProgressOptions,
  "file" | "onUploadStatusChange" | "open" | "phase" | "presentation" | "target"
> & Pick<XlsxUploadProgressView, "uploadLabel" | "uploadStatusBusy" | "uploadStatusProgress">) {
  useEffect(() => {
    if (!onUploadStatusChange || presentation !== "inline" || target.kind !== "draft" || !open) {
      // react-doctor-disable-next-line no-prop-callback-in-effect -- clear the parent status when the inline workflow closes.
      onUploadStatusChange?.(null);
      return;
    }
    if (!uploadStatusBusy && phase !== "ready") {
      // react-doctor-disable-next-line no-prop-callback-in-effect -- clear the parent status when the inline workflow is idle.
      onUploadStatusChange(null);
      return;
    }
    // react-doctor-disable-next-line no-prop-callback-in-effect, no-pass-data-to-parent, no-pass-live-state-to-parent -- the outer page renders progress while this isolated importer owns the upload state.
    onUploadStatusChange({
      completed: !uploadStatusBusy,
      label: uploadStatusBusy ? uploadLabel : "Unggahan selesai",
      meta: file ? formatFileSize(file.size) : "",
      progress: uploadStatusBusy ? uploadStatusProgress : 100,
    });
  }, [file, onUploadStatusChange, open, phase, presentation, target.kind, uploadLabel, uploadStatusBusy, uploadStatusProgress]);

  useEffect(() => () => onUploadStatusChange?.(null), [onUploadStatusChange]);
}

function useXlsxInlineErrorNotice({
  issues,
  open,
  phase,
  presentation,
  preview,
  target,
}: Pick<XlsxUploadProgressOptions, "issues" | "open" | "phase" | "presentation" | "preview" | "target">) {
  const notifiedPreviewIdRef = useRef<string | null>(null);

  useEffect(() => {
    const previewId = preview?.previewId;
    if (
      presentation !== "inline"
      || target.kind !== "draft"
      || !open
      || phase !== "invalid"
      || !previewId
      || notifiedPreviewIdRef.current === previewId
    ) return;

    notifiedPreviewIdRef.current = previewId;
    showToast(getInlineXlsxErrorMessage(issues), { duration: 7_000, variant: "error" });
  }, [issues, open, phase, presentation, preview, target.kind]);
}

function useXlsxUploadProgress(options: XlsxUploadProgressOptions) {
  const view = getXlsxUploadProgressView(options);
  useXlsxUploadProgressAnimation({
    phase: options.phase,
    setSmoothUploadProgress: options.setSmoothUploadProgress,
    smoothUploadProgressRef: options.smoothUploadProgressRef,
    uploadProgressTarget: view.uploadProgressTarget,
  });
  useXlsxUploadStatusSync({
    file: options.file,
    onUploadStatusChange: options.onUploadStatusChange,
    open: options.open,
    phase: options.phase,
    presentation: options.presentation,
    target: options.target,
    uploadLabel: view.uploadLabel,
    uploadStatusBusy: view.uploadStatusBusy,
    uploadStatusProgress: view.uploadStatusProgress,
  });
  useXlsxInlineErrorNotice(options);

  return view;
}

function canApplyXlsxImport({
  disabled,
  issues,
  mode,
  overwriteImpact,
  overwriteImpactPhase,
  phase,
  preview,
  target,
}: {
  disabled: boolean;
  issues: QuestionBankXlsxIssue[];
  mode: XlsxMode;
  overwriteImpact: XlsxOverwriteImpactSnapshot | null;
  overwriteImpactPhase: XlsxOverwriteImpactPhase;
  phase: FlowPhase;
  preview: XlsxPreview | null;
  target: QuestionBankXlsxImportFlowProps["target"];
}) {
  return Boolean(
    preview
    && preview.summary.acceptedRows > 0
    && issues.length === 0
    && phase === "ready"
    && !disabled
    && (
      target.kind !== "bank"
      || (
        target.editLease
        && (
          mode !== "overwrite"
          || (
            overwriteImpactPhase === "ready"
            && overwriteImpact?.bankRevision === target.expectedRevision
          )
        )
      )
    ),
  );
}

type XlsxFlowCommandOptions = XlsxFileWorkflowContext & {
  autoStartedFileRef: MutableCurrent<File | null>;
  file: File | null;
  initialFile: File | null;
  onFileCleared?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  phase: FlowPhase;
  presentation: "dialog" | "embedded" | "inline";
  setMode: (mode: XlsxMode) => void;
  target: QuestionBankXlsxImportFlowProps["target"];
  thumbnailControllerRef: MutableCurrent<AbortController | null>;
  workflowPhaseRef: MutableCurrent<FlowPhase>;
};

function resetXlsxFlowForm(options: XlsxFlowCommandOptions) {
  options.setFile(null);
  options.setMode("append");
  options.clearPreviewState();
  options.uploadIdRef.current = null;
  options.cancelRequestedRef.current = false;
  options.updatePhase("idle");
}

function cancelXlsxFlow(options: XlsxFlowCommandOptions, closeDialog: boolean) {
  const currentPhase = options.workflowPhaseRef.current;
  if (currentPhase === "applying") return;
  options.generationRef.current += 1;
  options.cancelRequestedRef.current = true;
  if (currentPhase !== "granting") options.workflowControllerRef.current?.abort();
  options.thumbnailControllerRef.current?.abort();
  options.requestDiscard(options.uploadIdRef.current);
  options.uploadIdRef.current = null;
  resetXlsxFlowForm(options);
  if (closeDialog) options.onOpenChange(false);
}

function handleXlsxFlowOpenChange(options: XlsxFlowCommandOptions, nextOpen: boolean) {
  if (nextOpen) {
    options.onOpenChange(true);
    return;
  }
  if (options.workflowPhaseRef.current === "applying") return;
  if (options.workflowPhaseRef.current !== "complete") cancelXlsxFlow(options, false);
  else resetXlsxFlowForm(options);
  options.onOpenChange(false);
}

function handleXlsxFileChange(options: XlsxFlowCommandOptions, nextFile: File | null) {
  if (options.workflowPhaseRef.current === "applying") return;
  if (!nextFile) {
    cancelXlsxFlow(options, false);
    if (options.presentation === "embedded") options.onFileCleared?.();
    return;
  }
  options.generationRef.current += 1;
  options.workflowControllerRef.current?.abort();
  options.thumbnailControllerRef.current?.abort();
  options.requestDiscard(options.uploadIdRef.current);
  options.uploadIdRef.current = null;
  void runXlsxFileWorkflow(nextFile, options);
}

function shouldStartInitialXlsxUpload(options: XlsxFlowCommandOptions) {
  return Boolean(
    options.open
    && (options.target.kind === "draft" || options.presentation === "embedded")
    && options.initialFile
    && options.file !== options.initialFile
    && options.autoStartedFileRef.current !== options.initialFile,
  );
}

function shouldCancelInlineXlsxFlow(
  presentation: XlsxFlowCommandOptions["presentation"],
  open: boolean,
  phase: FlowPhase,
) {
  return presentation === "inline"
    && !open
    && phase !== "idle"
    && phase !== "applying"
    && phase !== "complete";
}

function cleanupXlsxFlowCommands(options: XlsxFlowCommandOptions) {
  options.mountedRef.current = false;
  options.generationRef.current += 1;
  options.thumbnailControllerRef.current?.abort();
  if (options.workflowPhaseRef.current === "applying") return;
  options.workflowControllerRef.current?.abort();
  const uploadId = options.uploadIdRef.current;
  if (!uploadId) return;
  options.requestDiscard(uploadId);
  options.uploadIdRef.current = null;
}

function useXlsxFlowCommands(options: XlsxFlowCommandOptions) {
  const { autoStartedFileRef, file, initialFile, mountedRef, open, phase, presentation, target } = options;
  const cleanupEvent = useEffectEvent(() => cleanupXlsxFlowCommands(options));

  useEffect(() => {
    mountedRef.current = true;
    return () => cleanupEvent();
  }, [mountedRef]);

  const startInitialUploadEvent = useEffectEvent(() => {
    if (!shouldStartInitialXlsxUpload(options) || !options.initialFile) return;
    options.autoStartedFileRef.current = options.initialFile;
    // react-doctor-disable-next-line no-adjust-state-on-prop-change, no-derived-state -- initialFile is an imperative upload command; file state retains the selected File for preview, status, and apply.
    handleXlsxFileChange(options, options.initialFile);
  });
  useEffect(() => {
    startInitialUploadEvent();
  }, [autoStartedFileRef, file, initialFile, open, presentation, target.kind]);

  const cancelInlineFlowEvent = useEffectEvent(() => cancelXlsxFlow(options, false));
  useEffect(() => {
    if (!shouldCancelInlineXlsxFlow(presentation, open, phase)) return;
    cancelInlineFlowEvent();
  }, [open, phase, presentation]);

  function cancelFlow(closeDialog: boolean) {
    cancelXlsxFlow(options, closeDialog);
  }

  function handleFileChange(nextFile: File | null) {
    handleXlsxFileChange(options, nextFile);
  }

  function handleOpenChange(nextOpen: boolean) {
    handleXlsxFlowOpenChange(options, nextOpen);
  }

  return { cancelFlow, handleFileChange, handleOpenChange };
}

type XlsxAutoApplyOptions = {
  autoAppliedPreviewIdRef: MutableCurrent<string | null>;
  issues: QuestionBankXlsxIssue[];
  open: boolean;
  phase: FlowPhase;
  presentation: "dialog" | "embedded" | "inline";
  preview: XlsxPreview | null;
  target: QuestionBankXlsxImportFlowProps["target"];
};

function shouldAutoApplyInlineXlsxDraft(
  presentation: XlsxAutoApplyOptions["presentation"],
  open: boolean,
  targetKind: QuestionBankXlsxImportFlowProps["target"]["kind"],
  phase: FlowPhase,
  issueCount: number,
  preview: XlsxPreview | null,
) {
  return presentation === "inline"
    && open
    && targetKind === "draft"
    && phase === "ready"
    && Boolean(preview?.previewId)
    && issueCount === 0
    && Boolean(preview?.summary.acceptedRows);
}

function useXlsxImportApplyController(
  context: XlsxImportApplyContext,
  autoApplyOptions: XlsxAutoApplyOptions,
) {
  const { autoAppliedPreviewIdRef, issues, open, phase, presentation, preview, target } = autoApplyOptions;
  const targetKind = target.kind;

  function applyImport() {
    return runXlsxImportApply(context);
  }

  const applyInlineDraftImportEvent = useEffectEvent(() => {
    void applyImport();
  });
  useEffect(() => {
    if (!shouldAutoApplyInlineXlsxDraft(presentation, open, targetKind, phase, issues.length, preview) || !preview) return;
    const previewId = preview.previewId;
    if (autoAppliedPreviewIdRef.current === previewId) return;
    autoAppliedPreviewIdRef.current = previewId;
    // react-doctor-disable-next-line no-pass-live-state-to-parent -- inline draft mode sends a completed import result to its owning form after preview validation.
    applyInlineDraftImportEvent();
  }, [autoAppliedPreviewIdRef, issues.length, open, phase, presentation, preview, targetKind]);

  return applyImport;
}

function QuestionBankXlsxImportFlow(props: QuestionBankXlsxImportFlowProps) {
  const flow = useQuestionBankXlsxFlowController(props);
  return <QuestionBankXlsxImportView flow={flow} />;
}

function useQuestionBankXlsxFlowController({
  initialFile = null,
  onBusyChange,
  onFileCleared,
  onOpenChange,
  onUploadStatusChange,
  open,
  presentation = "dialog",
  target,
}: QuestionBankXlsxImportFlowProps) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [mode, setMode] = useState<XlsxMode>("append");
  const [preview, setPreview] = useState<XlsxPreview | null>(null);
  const [issues, setIssues] = useState<QuestionBankXlsxIssue[]>([]);
  const [partProgress, setPartProgress] = useState({ completed: 0, total: 0 });
  const [smoothUploadProgress, setSmoothUploadProgress] = useState(0);
  const smoothUploadProgressRef = useRef(0);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [completionText, setCompletionText] = useState<string | null>(null);
  const [claimedMode, setClaimedMode] = useState<XlsxMode | null>(null);
  const workflowPhaseRef = useRef<FlowPhase>("idle");
  const uploadIdRef = useRef<string | null>(null);
  const workflowControllerRef = useRef<AbortController | null>(null);
  const thumbnailControllerRef = useRef<AbortController | null>(null);
  const autoStartedFileRef = useRef<File | null>(null);
  const autoAppliedPreviewIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const discardedAttemptIdsRef = useRef(new Set<string>());
  const overwriteImpact = useXlsxOverwriteImpactController({
    issues,
    mode,
    phase,
    preview,
    target,
  });
  const thumbnails = useXlsxThumbnailController({
    controllerRef: thumbnailControllerRef,
    mountedRef,
    preview,
    setPreview,
  });

  function updatePhase(next: FlowPhase) {
    workflowPhaseRef.current = next;
    setPhase(next);
  }

  function clearPreviewState() {
    setPreview(null);
    overwriteImpact.reset();
    setIssues([]);
    setApplyError(null);
    thumbnails.reset();
    setCompletionText(null);
    setClaimedMode(null);
    setPartProgress({ completed: 0, total: 0 });
  }

  function requestDiscard(uploadId: string | null) {
    if (!uploadId || discardedAttemptIdsRef.current.has(uploadId)) return;
    discardedAttemptIdsRef.current.add(uploadId);
    void discardAttempt(uploadId);
  }

  const commands = useXlsxFlowCommands({
    autoStartedFileRef,
    cancelRequestedRef,
    clearPreviewState,
    file,
    generationRef,
    initialFile,
    mountedRef,
    onFileCleared,
    onOpenChange,
    open,
    phase,
    presentation,
    requestDiscard,
    setFile,
    setIssues,
    setMode,
    setPartProgress,
    setPreview,
    setSmoothUploadProgress,
    smoothUploadProgressRef,
    target,
    thumbnailControllerRef,
    updatePhase,
    uploadIdRef,
    workflowControllerRef,
    workflowPhaseRef,
  });
  const uploadProgress = useXlsxUploadProgress({
    applyError,
    file,
    issues,
    onUploadStatusChange,
    open,
    partProgress,
    phase,
    presentation,
    preview,
    smoothUploadProgress,
    smoothUploadProgressRef,
    setSmoothUploadProgress,
    target,
  });
  const applyImport = useXlsxImportApplyController({
    clearPreviewState,
    file,
    impactRequestKey: overwriteImpact.requestKey,
    invalidatedImpactKeyRef: overwriteImpact.invalidatedImpactKeyRef,
    issues,
    mode,
    mountedRef,
    onAppliedBusyChange: onBusyChange,
    onOpenChange,
    phase,
    presentation,
    preview,
    setApplyError,
    setClaimedMode,
    setCompletionText,
    setOverwriteImpactResult: overwriteImpact.setResult,
    target,
    updatePhase,
    uploadIdRef,
    workflowControllerRef,
  }, {
    autoAppliedPreviewIdRef,
    issues,
    open,
    phase,
    presentation,
    preview,
    target,
  });
  const disabled = target.kind === "bank" ? Boolean(target.disabled) : false;
  const canApply = canApplyXlsxImport({
    disabled,
    issues,
    mode,
    overwriteImpact: overwriteImpact.impact,
    overwriteImpactPhase: overwriteImpact.impactPhase,
    phase,
    preview,
    target,
  });

  function handleModeChange(value: string) {
    setMode(value as XlsxMode);
    overwriteImpact.setResult(null);
  }

  return {
    applyError,
    applyImport,
    canApply,
    cancelFlow: commands.cancelFlow,
    completionText,
    disabled,
    file,
    handleFileChange: commands.handleFileChange,
    handleModeChange,
    handleOpenChange: commands.handleOpenChange,
    inputId,
    isBusy: uploadProgress.isBusy,
    isLoadingThumbnails: thumbnails.isLoadingThumbnails,
    issues,
    loadNextThumbnailPage: thumbnails.loadNextThumbnailPage,
    mode,
    modeSelectionDisabled:
      disabled || uploadProgress.isBusy || phase === "applying" || claimedMode !== null,
    onOpenChange,
    open,
    overwriteImpact: overwriteImpact.impact,
    overwriteImpactError: overwriteImpact.error,
    overwriteImpactPhase: overwriteImpact.impactPhase,
    phase,
    presentation,
    preview,
    progress: uploadProgress.progress,
    target,
    thumbnailError: thumbnails.thumbnailError,
    uploadLabel: uploadProgress.uploadLabel,
  };
}


type QuestionBankXlsxFlowViewModel = ReturnType<
  typeof useQuestionBankXlsxFlowController
>;

function QuestionBankXlsxImportView({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  if (flow.presentation === "inline") return null;

  const content = (
    <>
      {flow.presentation === "dialog" ? (
        <XlsxImportDialogHeader target={flow.target} />
      ) : null}
      {flow.phase === "complete" ? (
        <CompletionSummary text={flow.completionText ?? "Impor selesai."} />
      ) : (
        <div className="grid gap-5">
          <XlsxImportFileSection flow={flow} />
          <XlsxImportModeField flow={flow} />
          <XlsxPreviewSection flow={flow} />
        </div>
      )}
      <XlsxImportFooter flow={flow} />
    </>
  );

  if (flow.presentation === "embedded") return content;

  return (
    <Dialog onOpenChange={flow.handleOpenChange} open={flow.open}>
      <DialogContent
        aria-describedby="question-bank-xlsx-import-description"
        className="max-h-[min(90vh,820px)] overflow-y-auto sm:max-w-3xl"
        data-question-bank-xlsx-import="true"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

function XlsxImportDialogHeader({
  target,
}: {
  target: QuestionBankXlsxImportFlowProps["target"];
}) {
  const isDraft = target.kind === "draft";
  return (
    <DialogHeader>
      <DialogTitle>
        {isDraft ? "Impor soal dari Excel" : "Tambahkan soal dari Excel"}
      </DialogTitle>
      <DialogDescription id="question-bank-xlsx-import-description">
        {isDraft
          ? "File diperiksa sebelum soalnya dimasukkan ke Bank baru. Isi nama dan deskripsi, lalu buat Bank Soal untuk menyimpan semuanya sekaligus."
          : "File diperiksa terlebih dahulu. Pastikan ringkasan sesuai sebelum Anda mengonfirmasi impor."}
      </DialogDescription>
    </DialogHeader>
  );
}

function XlsxImportFileSection({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  const { disabled, file, handleFileChange, inputId, isBusy, phase, presentation } = flow;
  return (
    <>
      {presentation === "dialog" ? <StakeholderWorkbookNotice /> : null}
      <div className="grid gap-2">
        <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>
          File soal
        </label>
        <FileUploadSlot
          accept={`.xlsx,${XLSX_MIME_TYPE}`}
          disabled={disabled || isBusy || phase === "applying"}
          file={file}
          id={inputId}
          maxSizeLabel="Maks. 24 MB · 1.000 soal"
          onCancelUpload={() => flow.cancelFlow(true)}
          onChange={handleFileChange}
          progress={flow.progress}
          uploadLabel={flow.uploadLabel}
          uploading={isBusy}
          uploadMeta={file ? formatFileSize(file.size) : undefined}
        />
        {isBusy ? (
          <p aria-live="polite" className="text-sm text-secondary-600" role="status">
            {xlsxUploadStatusMessage(phase)}
          </p>
        ) : null}
      </div>
    </>
  );
}

function xlsxUploadStatusMessage(phase: FlowPhase) {
  if (phase === "uploading") {
    return "File sedang diunggah. Tunggu sampai pemeriksaan selesai.";
  }
  if (phase === "previewing") return "Soal dan gambar sedang diperiksa.";
  return "Unggahan sedang disiapkan.";
}

function XlsxImportModeField({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  if (flow.target.kind !== "bank") return null;
  return (
    <Field>
      <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
        Cara memasukkan soal
      </FieldLabel>
      <RadioGroup
        aria-label="Cara memasukkan soal"
        className="grid gap-3 sm:grid-cols-2"
        disabled={flow.modeSelectionDisabled}
        onValueChange={flow.handleModeChange}
        value={flow.mode}
      >
        {(["append", "overwrite"] as const).map((value) => (
          <label
            className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "items-start")}
            htmlFor={`${flow.inputId}-mode-${value}`}
            key={value}
          >
            <RadioGroupItem id={`${flow.inputId}-mode-${value}`} value={value} />
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
  );
}

function XlsxPreviewSection({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  const { issues, preview, target } = flow;
  if (!preview) return null;

  return (
    <section aria-label="Pratinjau file soal" className="grid gap-4">
      <div>
        <h3 className="font-semibold text-secondary-900">Ringkasan file</h3>
        <p className="mt-1 text-sm text-secondary-600">
          {xlsxPreviewFileLabel(preview, target)}
        </p>
      </div>
      {preview.summary.rejectedRows > 0 || issues.length > 0 ? (
        <XlsxPreviewIssues issues={issues} />
      ) : null}
      {!issues.length ? (
        <PreviewSummary
          mode={flow.mode}
          overwriteImpact={target.kind === "bank" ? flow.overwriteImpact : null}
          overwriteImpactError={target.kind === "bank" ? flow.overwriteImpactError : null}
          overwriteImpactPhase={target.kind === "bank" ? flow.overwriteImpactPhase : "idle"}
          preview={preview}
          target={target}
        />
      ) : null}
      {preview.thumbnails.length ? <XlsxThumbnailSection flow={flow} /> : null}
      {target.kind === "draft" && !issues.length ? (
        <p className="text-sm leading-6 text-secondary-600">
          Setelah diperiksa, pilih lembar yang akan dibuat menjadi Bank Soal.
          Gambar di workbook belum ditambahkan ke Media.
        </p>
      ) : null}
    </section>
  );
}

function xlsxPreviewFileLabel(
  preview: XlsxPreview,
  target: QuestionBankXlsxImportFlowProps["target"],
) {
  const questions = formatCount(preview.summary.acceptedRows);
  const sheets = formatCount(preview.summary.questionSheetCount);
  const images =
    target.kind === "bank"
      ? ` · ${formatCount(preview.summary.imageCount)} gambar`
      : "";
  return `${questions} soal dari ${sheets} tab${images}`;
}

function XlsxPreviewIssues({ issues }: { issues: QuestionBankXlsxIssue[] }) {
  return (
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
        {issues.map((issue) => (
          <li
            key={`${issue.code}-${issue.row ?? "file"}-${issue.field ?? "general"}-${issue.reason ?? ""}-${issueMessage(issue)}`}
          >
            {issueMessage(issue)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function XlsxThumbnailSection({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  const { isLoadingThumbnails, phase, preview, thumbnailError } = flow;
  if (!preview) return null;
  return (
    <div className="grid gap-3">
      <h3 className="font-semibold text-secondary-900">Gambar dalam file</h3>
      <ThumbnailGrid images={preview.thumbnails} />
      {thumbnailError ? (
        <p className="text-sm text-student-status-danger-fg" role="alert">
          {thumbnailError}
        </p>
      ) : null}
      {preview.thumbnailPage.nextOffset !== null ? (
        <Button
          disabled={isLoadingThumbnails || phase === "applying"}
          onClick={() => void flow.loadNextThumbnailPage()}
          type="button"
          variant="outline"
        >
          {isLoadingThumbnails ? "Memuat gambar…" : "Lihat gambar berikutnya"}
        </Button>
      ) : null}
    </div>
  );
}

function XlsxImportFooter({
  flow,
}: {
  flow: QuestionBankXlsxFlowViewModel;
}) {
  const { canApply, handleOpenChange, isBusy, mode, phase, target } = flow;
  if (phase === "complete") {
    return (
      <DialogFooter>
        <Button onClick={() => handleOpenChange(false)} type="button" variant="default">
          Selesai
        </Button>
      </DialogFooter>
    );
  }

  return (
    <DialogFooter>
      <Button
        disabled={phase === "applying"}
        onClick={() => handleOpenChange(false)}
        type="button"
        variant="outline"
      >
        {isBusy ? "Batalkan" : "Batal"}
      </Button>
      <Button
        disabled={!canApply || phase === "applying"}
        onClick={() => void flow.applyImport()}
        type="button"
        variant="default"
      >
        {xlsxApplyButtonLabel(phase, target, mode)}
      </Button>
    </DialogFooter>
  );
}

function xlsxApplyButtonLabel(
  phase: FlowPhase,
  target: QuestionBankXlsxImportFlowProps["target"],
  mode: XlsxMode,
) {
  if (phase === "applying") {
    return target.kind === "draft" ? "Menyiapkan soal…" : "Menerapkan impor…";
  }
  if (target.kind === "draft") return "Gunakan soal ini";
  return mode === "append" ? "Tambahkan ke Bank Soal" : "Timpa isi Bank Soal";
}

function QuestionBankXlsxDraftPreviewPanel({
  file,
  onDraftApplied,
  onOpenChange,
  onUploadStatusChange,
  open,
}: {
  file: File | null;
  onDraftApplied: (draft: DraftApplied) => void;
  onOpenChange: (open: boolean) => void;
  onUploadStatusChange: (status: XlsxDraftUploadStatus | null) => void;
  open: boolean;
}) {
  return (
    <QuestionBankXlsxImportFlow
      initialFile={file}
      onOpenChange={onOpenChange}
      onUploadStatusChange={onUploadStatusChange}
      open={open}
      presentation="inline"
      target={{ kind: "draft", onDraftApplied }}
    />
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
        variant="outline"
      >
        <Upload aria-hidden="true" data-icon="inline-start" />
        Impor Excel
      </Button>
      <QuestionBankXlsxImportFlow
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

function QuestionBankXlsxImportContent({
  bankId,
  currentQuestionCount,
  disabled,
  editLease,
  expectedRevision,
  file,
  onApplied,
  onBusyChange,
  onFileCleared,
  onOpenChange,
  open,
}: ExistingImportProps & {
  file: File;
  onBusyChange?: (busy: boolean) => void;
  onFileCleared?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <QuestionBankXlsxImportFlow
      initialFile={file}
      onBusyChange={onBusyChange}
      onFileCleared={onFileCleared}
      onOpenChange={onOpenChange}
      open={open}
      presentation="embedded"
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
  );
}

export {
  QuestionBankXlsxDraftPreviewPanel,
  QuestionBankXlsxImportContent,
  QuestionBankXlsxImportControl,
};
export type {
  DraftApplied as QuestionBankXlsxDraftApplied,
  ExistingImportResult as QuestionBankXlsxImportResult,
  XlsxDraftUploadStatus as QuestionBankXlsxDraftUploadStatus,
};
