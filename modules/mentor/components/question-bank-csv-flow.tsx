"use client";

import {
  CheckCircle2,
  CircleAlert,
  Download,
  Upload,
} from "@/lib/icons";
import { useEffect, useId, useRef, useState } from "react";

import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { CsvTemplateDownload } from "@/components/ui/csv-template-download";
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
import {
  toQuestionBankCsvDraftPayload,
  type QuestionBankCsvDraftQuestion,
  type QuestionBankCsvIssue,
  type QuestionBankCsvParseResult,
  type QuestionBankCsvSummary,
} from "@/lib/question-bank/csv";
import type { EditLeaseProof } from "@/lib/resource-edit-lock/types";
import { cn } from "@/lib/utils";

type CsvPreviewStatus = "idle" | "loading" | "valid" | "invalid" | "empty";
type QuestionBankCsvMode = "append" | "overwrite";

type QuestionBankCsvDraftSummary = {
  fileName: string;
  questions: QuestionBankCsvDraftQuestion[];
  rowCount: number;
  summary: QuestionBankCsvSummary;
};

type QuestionBankCsvDraftInfo = Pick<
  QuestionBankCsvDraftSummary,
  "fileName" | "rowCount"
>;

type QuestionBankCsvImportSummary = {
  fileName: string;
  mode: QuestionBankCsvMode;
  rowCount: number;
};

type QuestionBankCsvImportResult = {
  bankId: string;
  createdQuestionIds: string[];
  importedCount: number;
  mode: QuestionBankCsvMode;
  preservedQuestionIds: string[];
  retiredCount: number;
  revision: number;
};

type CsvPreview = {
  errors: string[];
  fileName: string;
  normalizedRows: QuestionBankCsvParseResult["normalizedRows"];
  rowCount: number;
  status: CsvPreviewStatus;
  summary: QuestionBankCsvSummary | null;
};

type CsvErrorCode =
  | "csv_media_type_required"
  | "csv_rows_invalid"
  | "csv_structure_invalid"
  | "csv_too_large"
  | "forbidden_origin"
  | "invalid_media_asset"
  | "resource_busy_retry"
  | "resource_inaccessible"
  | "resource_locked"
  | "lease_expired"
  | "lease_superseded"
  | "stale_revision"
  | "unauthenticated";

const CSV_ERROR_MESSAGES: Record<CsvErrorCode, string> = {
  csv_media_type_required:
    "Jenis file tidak dikenali. Pilih file soal yang sesuai.",
  csv_rows_invalid: "Ada soal yang perlu diperbaiki.",
  csv_structure_invalid: "Susunan isi file belum sesuai dengan templat soal.",
  csv_too_large: "File terlalu besar atau berisi lebih dari 500 soal.",
  forbidden_origin:
    "File tidak dapat diproses. Muat ulang halaman lalu coba lagi.",
  invalid_media_asset: "Ada gambar atau media soal yang tidak dapat digunakan.",
  resource_busy_retry: "Sistem sedang sibuk. Coba lagi sebentar.",
  resource_inaccessible: "Bank Soal tidak dapat diakses.",
  resource_locked: "Bank Soal sedang dipakai orang lain.",
  lease_expired:
    "Sesi pengeditan Anda berakhir. Muat ulang halaman lalu coba lagi.",
  lease_superseded:
    "Bank Soal sedang diperbarui di tempat lain. Muat ulang halaman lalu coba lagi.",
  stale_revision: "Bank Soal berubah. Muat ulang halaman lalu coba lagi.",
  unauthenticated: "Sesi Anda berakhir. Masuk lagi lalu coba lagi.",
};

function issueMessage(issue: QuestionBankCsvIssue) {
  const labels: Record<QuestionBankCsvIssue["code"], string> = {
    control_character: "ada karakter yang tidak bisa dibaca",
    csv_too_large: "file terlalu besar (maksimal 2 MB)",
    empty_file: "file kosong",
    header_only: "file hanya berisi judul kolom, belum ada soal",
    header_invalid: "susunan kolom belum sesuai dengan templat soal",
    invalid_correct_options:
      "kunci jawaban tidak sesuai dengan pilihan yang diisi",
    invalid_difficulty: "tingkat kesulitan belum dikenali",
    invalid_materi: "materi tidak sesuai daftar yang tersedia",
    invalid_media_asset_id: "ada media soal yang tidak bisa ditemukan",
    invalid_question_id: "nomor soal tidak bisa dikenali",
    invalid_question_type: "jenis soal belum dikenali",
    invalid_record_ending: "ada baris yang belum selesai",
    invalid_subject_code: "subjek belum dikenali",
    invalid_utf8: "file tidak bisa dibaca. Simpan ulang file lalu coba lagi",
    malformed_quotes: "tanda kutip di file belum lengkap",
    option_sequence_invalid: "pilihan jawaban harus berurutan mulai dari A",
    required_field: "kolom wajib belum diisi",
    row_limit_exceeded: "jumlah soal melebihi batas 500",
    row_width_invalid: "ada baris dengan isi yang belum lengkap",
    field_too_long: "ada bagian yang terlalu panjang",
  };
  const columnLabels: Record<string, string> = {
    correct_options: "kunci jawaban",
    difficulty: "tingkat kesulitan",
    explanation: "penjelasan",
    explanation_media_asset_id: "media penjelasan",
    materi: "materi",
    option_a: "pilihan A",
    option_a_media_asset_id: "media pilihan A",
    option_b: "pilihan B",
    option_b_media_asset_id: "media pilihan B",
    option_c: "pilihan C",
    option_c_media_asset_id: "media pilihan C",
    option_d: "pilihan D",
    option_d_media_asset_id: "media pilihan D",
    option_e: "pilihan E",
    option_e_media_asset_id: "media pilihan E",
    prompt: "pertanyaan",
    prompt_media_asset_id: "media pertanyaan",
    question_id: "nomor soal",
    question_type: "jenis soal",
    subject_code: "subjek",
  };
  const columnLabel = issue.column
    ? (columnLabels[issue.column] ?? "bagian soal")
    : null;
  const location = issue.row
    ? `Baris ${issue.row}${columnLabel ? `, ${columnLabel}` : ""}`
    : (columnLabel ?? "File");
  return `${location}: ${labels[issue.code] ?? "isi tidak valid"}.`;
}

function previewErrors(
  payload: Pick<QuestionBankCsvParseResult, "rowErrors" | "structuralErrors">,
) {
  return [...payload.structuralErrors, ...payload.rowErrors].map(issueMessage);
}

function previewFromPayload(
  file: File,
  payload: QuestionBankCsvParseResult,
): CsvPreview {
  const errors = previewErrors(payload);
  const hasErrors =
    payload.structuralErrors.length > 0 || payload.rowErrors.length > 0;
  const isEmpty =
    payload.summary.dataRowCount === 0 ||
    payload.structuralErrors.some(
      (issue) => issue.code === "empty_file" || issue.code === "header_only",
    );
  return {
    errors,
    fileName: file.name,
    normalizedRows: payload.normalizedRows,
    rowCount: payload.summary.acceptedRows,
    status: hasErrors
      ? isEmpty
        ? "empty"
        : "invalid"
      : payload.normalizedRows.length
        ? "valid"
        : "empty",
    summary: payload.summary,
  };
}

function serverPreviewError(
  file: File,
  error: CsvErrorCode | string,
): CsvPreview {
  return {
    errors: [
      CSV_ERROR_MESSAGES[error as CsvErrorCode] ??
        "File tidak dapat diperiksa saat ini.",
    ],
    fileName: file.name,
    normalizedRows: [],
    rowCount: 0,
    status: error === "csv_too_large" ? "invalid" : "empty",
    summary: null,
  };
}

function CsvFilePicker({
  disabled,
  file,
  inputId,
  onChange,
  onRemove,
  uploading = false,
}: {
  disabled: boolean;
  file: File | null;
  inputId: string;
  onChange: (file: File | null) => void;
  onRemove: () => void;
  uploading?: boolean;
}) {
  return (
    <FileUploadSlot
      accept=".csv,text/csv"
      disabled={disabled}
      file={file}
      id={inputId}
      maxSizeLabel="Maks. 2 MB · 500 soal"
      onChange={(nextFile) => {
        if (nextFile) onChange(nextFile);
        else onRemove();
      }}
      uploadLabel="Memeriksa file soal"
      uploading={uploading}
    />
  );
}

function CsvFileSummary({ preview }: { preview: CsvPreview }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return (
      <div
        aria-label="Memeriksa file soal"
        aria-live="polite"
        className="rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-3 text-sm text-primary-950"
        data-csv-preview-status="loading"
        role="status"
      >
        Memeriksa file dan menyiapkan ringkasan soal…
      </div>
    );
  }
  if (preview.status === "valid") {
    return (
      <div
        aria-live="polite"
        className="flex min-w-0 items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-950"
        data-csv-preview-status="valid"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">
            {preview.rowCount} soal siap ditinjau.
          </p>
          <p className="mt-1 break-words text-primary-900/80">
            {preview.fileName} · pratinjau tidak menyimpan atau mengubah Bank
            Soal.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      aria-live="assertive"
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
        preview.status === "empty"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
      )}
      data-csv-preview-status={preview.status}
      role="alert"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">
          {preview.status === "empty"
            ? "File belum berisi soal"
            : "File perlu diperbaiki"}
        </p>
        <ul className="mt-1 max-h-52 list-disc space-y-1 overflow-auto pl-5 text-current/85">
          {preview.errors.length ? (
            preview.errors.map((error) => <li key={error}>{error}</li>)
          ) : (
            <li>File tidak menghasilkan soal yang bisa digunakan.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function useQuestionBankCsvPreview(file: File | null) {
  const [resolvedPreview, setResolvedPreview] = useState<{
    file: File;
    preview: CsvPreview;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    let active = true;
    void fetch("/api/mentor/question-banks/csv/preview", {
      body: file,
      headers: { "Content-Type": "text/csv; charset=utf-8" },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        let payload: unknown = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok) {
          const code =
            payload &&
            typeof payload === "object" &&
            typeof (payload as { error?: unknown }).error === "string"
              ? (payload as { error: string }).error
              : `http_${response.status}`;
          throw new Error(code);
        }
        return payload as QuestionBankCsvParseResult;
      })
      .then((payload) => {
        if (!active) return;
        setResolvedPreview({
          file,
          preview: previewFromPayload(file, payload),
        });
      })
      .catch((error: unknown) => {
        if (
          !active ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return;
        setResolvedPreview({
          file,
          preview: serverPreviewError(
            file,
            error instanceof Error ? error.message : "preview_failed",
          ),
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [file]);

  if (!file)
    return {
      errors: [],
      fileName: "",
      normalizedRows: [],
      rowCount: 0,
      status: "idle" as const,
      summary: null,
    };
  if (!resolvedPreview || resolvedPreview.file !== file)
    return {
      errors: [],
      fileName: file.name,
      normalizedRows: [],
      rowCount: 0,
      status: "loading" as const,
      summary: null,
    };
  return resolvedPreview.preview;
}

function QuestionBankCsvDraftStatus({
  disabled = false,
  draft,
  onRemove,
}: {
  disabled?: boolean;
  draft: QuestionBankCsvDraftInfo | null;
  onRemove: () => void;
}) {
  if (!draft) return null;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-primary-100 py-3"
      data-question-bank-csv-draft-status="true"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-secondary-700">
        <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-student-status-success-fg" />
        <p>File siap disimpan bersama Bank Soal.</p>
      </div>
      <Button
        disabled={disabled}
        onClick={onRemove}
        size="sm"
        type="button"
        variant="brandOutline"
      >
        Hapus file
      </Button>
    </div>
  );
}

function QuestionBankCsvDraftImportControl({
  disabled = false,
  onDraftApplied,
}: {
  disabled?: boolean;
  onDraftApplied: (summary: QuestionBankCsvDraftSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const preview = useQuestionBankCsvPreview(file);
  const canApply = preview.status === "valid" && Boolean(file) && Boolean(preview.summary);

  function reset() {
    setFile(null);
    setPrepareError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  }

  function applyDraft() {
    if (!file || !preview.summary || preview.status !== "valid") return;
    try {
      const payload = toQuestionBankCsvDraftPayload(
        {
          normalizedRows: preview.normalizedRows,
          summary: preview.summary,
        },
        "",
      );
      const draft = {
        fileName: file.name,
        questions: payload.questions,
        rowCount: payload.questions.length,
        summary: payload.summary,
      } satisfies QuestionBankCsvDraftSummary;
      onDraftApplied(draft);
      showToast(`${draft.rowCount} soal siap disimpan bersama Bank Soal.`, {
        variant: "success",
      });
      handleOpenChange(false);
    } catch {
      setPrepareError("Soal belum dapat disiapkan. Periksa file lalu coba lagi.");
    }
  }

  return (
    <>
      <Button
        className="w-full sm:w-fit"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
        variant="brandOutline"
      >
        <Upload aria-hidden="true" data-icon="inline-start" />
        Impor dari CSV
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Unggah file soal CSV</DialogTitle>
            <DialogDescription>
              Periksa soal terlebih dahulu. Setelah dikonfirmasi, soal dari file ini akan menggantikan soal dari file impor sebelumnya. Soal yang Anda tulis sendiri tetap ada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <CsvTemplateDownload
                fileName="templat-bank-soal.csv"
                href="/api/mentor/question-banks/csv/template"
                title="Unduh templat soal"
              />
              <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>
                File soal
              </label>
              <CsvFilePicker
                disabled={disabled}
                file={file}
                inputId={inputId}
                onChange={(nextFile) => {
                  setPrepareError(null);
                  setFile(nextFile);
                }}
                onRemove={() => {
                  setPrepareError(null);
                  setFile(null);
                }}
                uploading={preview.status === "loading"}
              />
            </div>
            <CsvFileSummary preview={preview} />
            {prepareError ? (
              <div
                aria-live="assertive"
                className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm text-student-status-danger-fg"
                role="alert"
              >
                {prepareError}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="brandOutline"
            >
              Batal
            </Button>
            <Button
              disabled={disabled || !canApply}
              onClick={applyDraft}
              type="button"
              variant="brand"
            >
              Gunakan soal ini
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuestionBankCsvImportControl({
  bankId,
  disabled = false,
  editLease,
  expectedRevision,
  onApplied,
}: {
  bankId: string;
  disabled?: boolean;
  editLease: EditLeaseProof | null;
  expectedRevision: number;
  onApplied?: (result: QuestionBankCsvImportResult) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-label="Unggah file CSV"
        className="w-full"
        disabled={disabled || !editLease}
        onClick={() => setOpen(true)}
        type="button"
        variant="brandOutline"
      >
        <Upload aria-hidden="true" data-icon="inline-start" />
        Unggah file CSV
      </Button>
      <QuestionBankCsvImportDialog
        bankId={bankId}
        disabled={disabled}
        editLease={editLease}
        expectedRevision={expectedRevision}
        onApplied={onApplied}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

function QuestionBankCsvImportDialog({
  bankId,
  disabled = false,
  editLease,
  expectedRevision,
  initialFile = null,
  onBusyChange,
  onFileCleared,
  onApplied,
  onOpenChange,
  open,
  presentation = "dialog",
}: {
  bankId: string;
  disabled?: boolean;
  editLease: EditLeaseProof | null;
  expectedRevision: number;
  initialFile?: File | null;
  onBusyChange?: (busy: boolean) => void;
  onFileCleared?: () => void;
  onApplied?: (result: QuestionBankCsvImportResult) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  presentation?: "dialog" | "embedded";
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(initialFile);
  const [mode, setMode] = useState<QuestionBankCsvMode>("append");
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const applyControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const preview = useQuestionBankCsvPreview(file);
  const canApply =
    preview.status === "valid" &&
    Boolean(file) &&
    Boolean(editLease) &&
    !disabled &&
    !isApplying;

  useEffect(
    () => () => {
      mountedRef.current = false;
      applyControllerRef.current?.abort();
    },
    [],
  );

  function resetForm() {
    setFile(null);
    setMode("append");
    setApplyError(null);
    setIsApplying(false);
    onBusyChange?.(false);
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && isApplying) return;
    onOpenChange(nextOpen);
    if (!nextOpen && !isApplying) resetForm();
  }

  async function apply() {
    if (!file || !editLease || preview.status !== "valid" || isApplying) return;
    setIsApplying(true);
    onBusyChange?.(true);
    setApplyError(null);
    const controller = new AbortController();
    applyControllerRef.current = controller;
    try {
      const response = await fetch(
        `/api/mentor/question-banks/${encodeURIComponent(bankId)}/csv/import?mode=${mode}`,
        {
          body: file,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "x-edit-lease-generation": String(editLease.generation),
            "x-edit-lease-token": editLease.token,
            "x-question-bank-revision": String(expectedRevision),
          },
          method: "POST",
          signal: controller.signal,
        },
      );
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const code =
          payload &&
          typeof payload === "object" &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `http_${response.status}`;
        throw new Error(code);
      }
      const result = (
        payload as { result?: QuestionBankCsvImportResult } | null
      )?.result;
      if (!result || result.bankId !== bankId)
        throw new Error("resource_busy_retry");
      await onApplied?.(result);
      if (!mountedRef.current || controller.signal.aborted) return;
      showToast(
        `${result.importedCount} soal berhasil ditambahkan (${mode === "append" ? "ditambahkan" : "menggantikan soal lama"}).`,
        { variant: "success" },
      );
      closeDialog(false);
    } catch (error) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      const code =
        error instanceof Error ? error.message : "resource_busy_retry";
      const message =
        CSV_ERROR_MESSAGES[code as CsvErrorCode] ??
        "Soal belum berhasil ditambahkan. Periksa kembali file dan coba lagi.";
      setApplyError(message);
      showToast(
        "Soal belum berhasil ditambahkan. Rincian tersedia di dialog.",
        {
          variant: "error",
        },
      );
    } finally {
      if (applyControllerRef.current === controller)
        applyControllerRef.current = null;
      if (mountedRef.current) setIsApplying(false);
      onBusyChange?.(false);
    }
  }

  const content = (
    <>
      {presentation === "dialog" ? (
        <DialogHeader>
          <DialogTitle>Tambahkan soal dari file</DialogTitle>
          <DialogDescription id="question-bank-csv-import-description">
            File akan diperiksa terlebih dahulu. Perubahan baru disimpan setelah
            Anda memilih cara memasukkan soal dan menekan tombol Terapkan.
          </DialogDescription>
        </DialogHeader>
      ) : null}
        <div className="grid gap-5">
          <div className="grid gap-2">
            <CsvTemplateDownload
              fileName="templat-bank-soal.csv"
              href="/api/mentor/question-banks/csv/template"
              title="Unduh templat soal"
            />
            <label
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor={inputId}
            >
              File soal
            </label>
            <CsvFilePicker
              disabled={disabled || isApplying}
              file={file}
              inputId={inputId}
              onChange={(nextFile) => {
                setApplyError(null);
                setFile(nextFile);
              }}
              onRemove={() => {
                setApplyError(null);
                setFile(null);
                if (presentation === "embedded") onFileCleared?.();
              }}
              uploading={preview.status === "loading"}
            />
          </div>

          <CsvFileSummary preview={preview} />

          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
              Cara memasukkan soal
            </FieldLabel>
            <RadioGroup
              aria-label="Cara memasukkan soal"
              className="grid gap-3 sm:grid-cols-2"
              disabled={disabled || isApplying}
              onValueChange={(value) => setMode(value as QuestionBankCsvMode)}
              value={mode}
            >
              <label
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.choice,
                  "items-start",
                )}
                htmlFor="question-bank-csv-mode-append"
              >
                <RadioGroupItem
                  id="question-bank-csv-mode-append"
                  value="append"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-secondary-900">
                    Tambahkan
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-secondary-600">
                    Soal yang sudah ada tetap dipertahankan, lalu soal dari file
                    ditambahkan.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.choice,
                  "items-start",
                )}
                htmlFor="question-bank-csv-mode-overwrite"
              >
                <RadioGroupItem
                  id="question-bank-csv-mode-overwrite"
                  value="overwrite"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-secondary-900">
                    Timpa semua
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-secondary-600">
                    Isi Bank Soal akan mengikuti file. Judul dan deskripsi tetap
                    sama.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </Field>

          <div className="rounded-2xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm leading-6 text-secondary-700">
            <p className="font-semibold text-secondary-900">
              Sebelum menerapkan
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                File yang Anda pilih akan diperiksa lagi sebelum diterapkan.
              </li>
              <li>Kesalahan satu baris membatalkan seluruh tindakan.</li>
              <li>
                Saat memilih Timpa semua, soal yang tidak ada di file akan
                diarsipkan.
              </li>
            </ul>
          </div>

          {applyError ? (
            <div
              aria-live="assertive"
              className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm text-student-status-danger-fg"
              role="alert"
            >
              <p className="font-semibold">Impor belum diterapkan</p>
              <p className="mt-1 break-words">{applyError}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={isApplying}
            onClick={() => closeDialog(false)}
            type="button"
            variant="ghost"
          >
            Batal
          </Button>
          <Button
            aria-busy={isApplying}
            data-csv-import-apply="true"
            disabled={!canApply}
            onClick={() => void apply()}
            type="button"
            variant="brand"
          >
            {isApplying
              ? "Menerapkan…"
              : mode === "append"
                ? "Terapkan tambahan"
                : "Terapkan timpa"}
          </Button>
        </DialogFooter>
    </>
  );

  if (presentation === "embedded") return content;

  return (
    <Dialog onOpenChange={closeDialog} open={open}>
      <DialogContent
        aria-describedby="question-bank-csv-import-description"
        className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl"
        data-question-bank-csv-import="true"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}

function safeDownloadName(contentDisposition: string | null) {
  const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  const quoted = contentDisposition?.match(/filename="?([^";]+)"?/iu)?.[1];
  let raw = quoted ?? "bank-soal.csv";
  if (encoded) {
    try {
      raw = decodeURIComponent(encoded);
    } catch {
      // Fall back to the sanitized quoted filename when the header is malformed.
    }
  }
  raw = raw.split(/[\\/]/u).pop() ?? "bank-soal.csv";
  raw = raw.replace(/[^a-z0-9._ -]/giu, "_").trim();
  if (!raw.toLowerCase().endsWith(".csv")) raw = `${raw || "bank-soal"}.csv`;
  return raw || "bank-soal.csv";
}

function QuestionBankCsvExportAction({
  bankId,
  disabled = false,
}: {
  bankId: string;
  disabled?: boolean;
}) {
  const [isExporting, setIsExporting] = useState(false);
  const exportControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      exportControllerRef.current?.abort();
    },
    [],
  );

  async function exportCsv() {
    if (isExporting) return;
    setIsExporting(true);
    const controller = new AbortController();
    exportControllerRef.current = controller;
    try {
      const response = await fetch(
        `/api/mentor/question-banks/${encodeURIComponent(bankId)}/csv`,
        { method: "GET", signal: controller.signal },
      );
      if (!response.ok) {
        let code = "resource_busy_retry";
        try {
          const payload = (await response.json()) as { error?: unknown };
          if (typeof payload.error === "string") code = payload.error;
        } catch {
          // Keep the stable user-facing fallback when the response is not JSON.
        }
        throw new Error(code);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeDownloadName(
        response.headers.get("content-disposition"),
      );
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (!mountedRef.current || controller.signal.aborted) return;
      showToast("Bank Soal berhasil diunduh.", { variant: "success" });
    } catch (error) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return;
      const code =
        error instanceof Error ? error.message : "resource_busy_retry";
      showToast(
        CSV_ERROR_MESSAGES[code as CsvErrorCode] ??
          "Bank Soal belum dapat diunduh. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      if (exportControllerRef.current === controller)
        exportControllerRef.current = null;
      if (mountedRef.current) setIsExporting(false);
    }
  }

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-3"
      data-question-bank-csv-export="true"
    >
      <Button
        aria-busy={isExporting}
        disabled={disabled || isExporting}
        onClick={() => void exportCsv()}
        type="button"
        variant="brandOutline"
      >
        <Download data-icon="inline-start" />
        {isExporting ? "Menyiapkan file…" : "Unduh soal"}
      </Button>
    </div>
  );
}

export {
  QuestionBankCsvExportAction,
  QuestionBankCsvImportControl,
  QuestionBankCsvImportDialog,
  QuestionBankCsvDraftImportControl,
  QuestionBankCsvDraftStatus,
  useQuestionBankCsvPreview,
};
export type {
  CsvPreviewStatus,
  CsvPreview as QuestionBankCsvPreview,
  QuestionBankCsvDraftInfo,
  QuestionBankCsvDraftSummary,
  QuestionBankCsvImportResult,
  QuestionBankCsvImportSummary,
  QuestionBankCsvMode,
};
