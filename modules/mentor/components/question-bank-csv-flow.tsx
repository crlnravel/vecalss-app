"use client";

import {
  CheckCircle2,
  CircleAlert,
  Download,
  FileText,
  Upload,
  X,
} from "@/lib/icons";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { showToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  csv_media_type_required: "Format permintaan CSV tidak dikenali.",
  csv_rows_invalid: "Ada baris CSV yang perlu diperbaiki.",
  csv_structure_invalid: "Struktur CSV tidak sesuai format Bank Soal v1.",
  csv_too_large: "Ukuran CSV melebihi batas 2 MiB atau 500 baris.",
  forbidden_origin: "Permintaan tidak berasal dari aplikasi Vecalss.",
  invalid_media_asset: "Ada media soal yang tidak dapat digunakan.",
  resource_busy_retry: "Server sedang sibuk. Coba terapkan kembali.",
  resource_inaccessible: "Bank Soal tidak dapat diakses oleh akun ini.",
  resource_locked: "Bank Soal sedang dikunci untuk perubahan.",
  lease_expired: "Izin edit sudah berakhir. Ambil izin lagi lalu ulangi.",
  lease_superseded: "Izin edit digantikan oleh sesi lain. Ambil izin lagi lalu ulangi.",
  stale_revision: "Bank Soal berubah. Muat ulang data terbaru lalu ulangi.",
  unauthenticated: "Sesi Kapten berakhir. Masuk lagi lalu ulangi.",
};

function issueMessage(issue: QuestionBankCsvIssue) {
  const labels: Record<QuestionBankCsvIssue["code"], string> = {
    control_character: "karakter kontrol tidak diperbolehkan",
    csv_too_large: "ukuran file melebihi 2 MiB",
    empty_file: "file CSV kosong",
    header_only: "CSV hanya berisi header tanpa data soal",
    header_invalid: "header CSV tidak sesuai urutan dan nama kolom Bank Soal v1",
    invalid_correct_options: "kunci jawaban tidak sesuai dengan opsi yang terisi",
    invalid_difficulty: "tingkat kesulitan tidak dikenal",
    invalid_materi: "materi tidak sesuai taxonomy Subtest",
    invalid_media_asset_id: "ID media tidak valid",
    invalid_question_id: "ID soal harus berupa UUID",
    invalid_question_type: "jenis soal tidak dikenal",
    invalid_record_ending: "akhiran baris CSV tidak valid",
    invalid_subject_code: "kode Subtest tidak dikenal",
    invalid_utf8: "file bukan UTF-8 yang valid",
    malformed_quotes: "tanda kutip CSV tidak berpasangan",
    option_sequence_invalid: "opsi harus berurutan dari A dan tidak boleh berlubang",
    required_field: "kolom wajib belum diisi",
    row_limit_exceeded: "jumlah baris melebihi batas 500",
    row_width_invalid: "jumlah kolom pada baris tidak sesuai",
    field_too_long: "isi kolom terlalu panjang",
  };
  const location = issue.row
    ? `Baris ${issue.row}${issue.column ? `, ${issue.column}` : ""}`
    : issue.column
      ? issue.column
      : "CSV";
  return `${location}: ${labels[issue.code] ?? "isi tidak valid"}.`;
}

function previewErrors(payload: Pick<QuestionBankCsvParseResult, "rowErrors" | "structuralErrors">) {
  return [...payload.structuralErrors, ...payload.rowErrors].map(issueMessage);
}

function previewFromPayload(file: File, payload: QuestionBankCsvParseResult): CsvPreview {
  const errors = previewErrors(payload);
  const hasErrors = payload.structuralErrors.length > 0 || payload.rowErrors.length > 0;
  const isEmpty = payload.summary.dataRowCount === 0 || payload.structuralErrors.some((issue) => issue.code === "empty_file" || issue.code === "header_only");
  return {
    errors,
    fileName: file.name,
    normalizedRows: payload.normalizedRows,
    rowCount: payload.summary.acceptedRows,
    status: hasErrors ? (isEmpty ? "empty" : "invalid") : payload.normalizedRows.length ? "valid" : "empty",
    summary: payload.summary,
  };
}

function serverPreviewError(file: File, error: CsvErrorCode | string): CsvPreview {
  return {
    errors: [CSV_ERROR_MESSAGES[error as CsvErrorCode] ?? "CSV tidak dapat diperiksa saat ini."],
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
}: {
  disabled: boolean;
  file: File | null;
  inputId: string;
  onChange: (file: File | null) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        accept=".csv,text/csv"
        aria-label="File CSV"
        className="sr-only"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="brandOutline"
      >
        <Upload data-icon="inline-start" />
        {file ? "Ganti file CSV" : "Pilih file CSV"}
      </Button>
      {file ? (
        <Button
          aria-label={`Hapus file ${file.name}`}
          disabled={disabled}
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onRemove();
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      ) : null}
      {file ? (
        <span className="min-w-0 max-w-full truncate text-sm text-secondary-700" title={file.name}>
          {file.name}
        </span>
      ) : null}
    </div>
  );
}

function CsvFileSummary({ preview }: { preview: CsvPreview }) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return (
      <div
        aria-label="Memeriksa CSV"
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
          <p className="font-semibold">{preview.rowCount} soal siap ditinjau.</p>
          <p className="mt-1 break-words text-primary-900/80">
            {preview.fileName} · pratinjau tidak menyimpan atau mengubah Bank Soal.
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
          {preview.status === "empty" ? "CSV belum berisi soal" : "CSV perlu diperbaiki"}
        </p>
        <ul className="mt-1 max-h-52 list-disc space-y-1 overflow-auto pl-5 text-current/85">
          {preview.errors.length ? preview.errors.map((error) => <li key={error}>{error}</li>) : <li>CSV tidak menghasilkan baris soal yang dapat digunakan.</li>}
        </ul>
      </div>
    </div>
  );
}

function useCsvPreview(file: File | null) {
  const [resolvedPreview, setResolvedPreview] = useState<{ file: File; preview: CsvPreview } | null>(null);

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
          const code = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `http_${response.status}`;
          throw new Error(code);
        }
        return payload as QuestionBankCsvParseResult;
      })
      .then((payload) => {
        if (!active) return;
        setResolvedPreview({ file, preview: previewFromPayload(file, payload) });
      })
      .catch((error: unknown) => {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        setResolvedPreview({ file, preview: serverPreviewError(file, error instanceof Error ? error.message : "preview_failed") });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [file]);

  if (!file) return { errors: [], fileName: "", normalizedRows: [], rowCount: 0, status: "idle" as const, summary: null };
  if (!resolvedPreview || resolvedPreview.file !== file) return { errors: [], fileName: file.name, normalizedRows: [], rowCount: 0, status: "loading" as const, summary: null };
  return resolvedPreview.preview;
}

function QuestionBankCsvCreateInput({
  disabled = false,
  onApply,
  onRemove,
}: {
  disabled?: boolean;
  onApply?: (summary: QuestionBankCsvDraftSummary) => void;
  onRemove?: () => void;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const preview = useCsvPreview(file);
  const canApply = preview.status === "valid" && Boolean(file) && Boolean(preview.summary);

  return (
    <ReferenceSurface as="section" className="grid gap-4 p-5 md:p-7" data-question-bank-csv-create="true">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900">Isi soal dari CSV</h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">
            Pilih CSV UTF-8 dengan maksimal 500 baris untuk menyiapkan draf soal. Pratinjau memeriksa file melalui layanan CSV tanpa menyimpan perubahan.
          </p>
        </div>
      </div>
      <CsvFilePicker
        disabled={disabled}
        file={file}
        inputId={inputId}
        onChange={setFile}
        onRemove={() => {
          setFile(null);
          onRemove?.();
        }}
      />
      <CsvFileSummary preview={preview} />
      {canApply ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4">
          <p className="text-sm text-secondary-700">Menerapkan file akan mengganti hanya bagian soal yang berasal dari CSV pada draf lokal.</p>
          <Button
            disabled={disabled}
            onClick={() => {
              if (!file || !preview.summary) return;
              const payload = toQuestionBankCsvDraftPayload({ normalizedRows: preview.normalizedRows, summary: preview.summary }, "");
              onApply?.({ fileName: file.name, questions: payload.questions, rowCount: payload.questions.length, summary: payload.summary });
            }}
            type="button"
            variant="brand"
          >
            <Upload data-icon="inline-start" />
            Gunakan CSV untuk draf
          </Button>
        </div>
      ) : null}
    </ReferenceSurface>
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Impor CSV ke Bank Soal"
                className="size-11"
                disabled={disabled || !editLease}
                onClick={() => setOpen(true)}
                type="button"
                variant="brandOutline"
              />
            }
          >
            <Upload aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>Impor soal dari CSV</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  onApplied,
  onOpenChange,
  open,
}: {
  bankId: string;
  disabled?: boolean;
  editLease: EditLeaseProof | null;
  expectedRevision: number;
  onApplied?: (result: QuestionBankCsvImportResult) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<QuestionBankCsvMode>("append");
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const applyControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const preview = useCsvPreview(file);
  const canApply = preview.status === "valid" && Boolean(file) && Boolean(editLease) && !disabled && !isApplying;

  useEffect(() => () => {
    mountedRef.current = false;
    applyControllerRef.current?.abort();
  }, []);

  function resetForm() {
    setFile(null);
    setMode("append");
    setApplyError(null);
    setIsApplying(false);
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && isApplying) return;
    onOpenChange(nextOpen);
    if (!nextOpen && !isApplying) resetForm();
  }

  async function apply() {
    if (!file || !editLease || preview.status !== "valid" || isApplying) return;
    setIsApplying(true);
    setApplyError(null);
    const controller = new AbortController();
    applyControllerRef.current = controller;
    try {
      const response = await fetch(`/api/mentor/question-banks/${encodeURIComponent(bankId)}/csv/import?mode=${mode}`, {
        body: file,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "x-edit-lease-generation": String(editLease.generation),
          "x-edit-lease-token": editLease.token,
          "x-question-bank-revision": String(expectedRevision),
        },
        method: "POST",
        signal: controller.signal,
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const code = payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : `http_${response.status}`;
        throw new Error(code);
      }
      const result = (payload as { result?: QuestionBankCsvImportResult } | null)?.result;
      if (!result || result.bankId !== bankId) throw new Error("resource_busy_retry");
      await onApplied?.(result);
      if (!mountedRef.current || controller.signal.aborted) return;
      showToast(`${result.importedCount} soal berhasil diimpor (${mode === "append" ? "ditambahkan" : "ditimpa"}).`, { variant: "success" });
      closeDialog(false);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      const code = error instanceof Error ? error.message : "resource_busy_retry";
      const message = CSV_ERROR_MESSAGES[code as CsvErrorCode] ?? "Impor CSV belum berhasil. Periksa kembali file dan coba lagi.";
      setApplyError(message);
      showToast("Impor CSV belum berhasil. Rincian tersedia di dialog.", { variant: "error" });
    } finally {
      if (applyControllerRef.current === controller) applyControllerRef.current = null;
      if (mountedRef.current) setIsApplying(false);
    }
  }

  return (
    <Dialog onOpenChange={closeDialog} open={open}>
      <DialogContent aria-describedby="question-bank-csv-import-description" className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl" data-question-bank-csv-import="true">
        <DialogHeader>
          <DialogTitle>Impor soal dari CSV</DialogTitle>
          <DialogDescription id="question-bank-csv-import-description">
            File diperiksa melalui layanan CSV. Perubahan baru ditulis setelah Anda memilih mode dan menekan tombol Terapkan.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>File CSV</label>
            <CsvFilePicker disabled={disabled || isApplying} file={file} inputId={inputId} onChange={(nextFile) => { setApplyError(null); setFile(nextFile); }} onRemove={() => { setApplyError(null); setFile(null); }} />
            <p className="text-xs leading-5 text-secondary-600">UTF-8, maksimal 2 MiB dan 500 baris data. Kolom mengikuti format Bank Soal v1.</p>
          </div>

          <CsvFileSummary preview={preview} />

          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>Cara memasukkan soal</FieldLabel>
            <RadioGroup aria-label="Cara memasukkan soal" className="grid gap-3 sm:grid-cols-2" disabled={disabled || isApplying} onValueChange={(value) => setMode(value as QuestionBankCsvMode)} value={mode}>
              <label className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "items-start")} htmlFor="question-bank-csv-mode-append">
                <RadioGroupItem id="question-bank-csv-mode-append" value="append" />
                <span className="min-w-0"><span className="block font-semibold text-secondary-900">Tambahkan</span><span className="mt-1 block text-sm leading-5 text-secondary-600">Pertahankan soal aktif dan tambahkan baris CSV sebagai soal baru.</span></span>
              </label>
              <label className={cn(REFERENCE_CONTROL_CLASS_NAMES.choice, "items-start")} htmlFor="question-bank-csv-mode-overwrite">
                <RadioGroupItem id="question-bank-csv-mode-overwrite" value="overwrite" />
                <span className="min-w-0"><span className="block font-semibold text-secondary-900">Timpa semua</span><span className="mt-1 block text-sm leading-5 text-secondary-600">Koleksi soal aktif mengikuti isi CSV; metadata Bank Soal tetap sama.</span></span>
              </label>
            </RadioGroup>
          </Field>

          <div className="rounded-2xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm leading-6 text-secondary-700">
            <p className="font-semibold text-secondary-900">Sebelum menerapkan</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>CSV asli dikirim lagi saat tindakan diterapkan agar server memvalidasi bytes yang sama.</li>
              <li>Kesalahan satu baris membatalkan seluruh tindakan.</li>
              <li>Mode Timpa semua akan mengarsipkan soal aktif yang tidak ada di CSV.</li>
            </ul>
          </div>

          {applyError ? (
            <div aria-live="assertive" className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm text-student-status-danger-fg" role="alert">
              <p className="font-semibold">Impor belum diterapkan</p>
              <p className="mt-1 break-words">{applyError}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button disabled={isApplying} onClick={() => closeDialog(false)} type="button" variant="ghost">Batal</Button>
          <Button aria-busy={isApplying} data-csv-import-apply="true" disabled={!canApply} onClick={() => void apply()} type="button" variant="brand">
            {isApplying ? "Menerapkan…" : mode === "append" ? "Terapkan tambahan" : "Terapkan timpa"}
          </Button>
        </DialogFooter>
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

function QuestionBankCsvExportAction({ bankId, disabled = false }: { bankId: string; disabled?: boolean }) {
  const [isExporting, setIsExporting] = useState(false);
  const exportControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    exportControllerRef.current?.abort();
  }, []);

  async function exportCsv() {
    if (isExporting) return;
    setIsExporting(true);
    const controller = new AbortController();
    exportControllerRef.current = controller;
    try {
      const response = await fetch(`/api/mentor/question-banks/${encodeURIComponent(bankId)}/csv`, { method: "GET", signal: controller.signal });
      if (!response.ok) {
        let code = "resource_busy_retry";
        try {
          const payload = await response.json() as { error?: unknown };
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
      anchor.download = safeDownloadName(response.headers.get("content-disposition"));
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      if (!mountedRef.current || controller.signal.aborted) return;
      showToast("CSV Bank Soal berhasil diunduh.", { variant: "success" });
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      const code = error instanceof Error ? error.message : "resource_busy_retry";
      showToast(CSV_ERROR_MESSAGES[code as CsvErrorCode] ?? "CSV belum dapat diunduh. Coba lagi.", { variant: "error" });
    } finally {
      if (exportControllerRef.current === controller) exportControllerRef.current = null;
      if (mountedRef.current) setIsExporting(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3" data-question-bank-csv-export="true">
      <Button aria-busy={isExporting} disabled={disabled || isExporting} onClick={() => void exportCsv()} type="button" variant="brandOutline">
        <Download data-icon="inline-start" />
        {isExporting ? "Menyiapkan CSV…" : "Ekspor CSV"}
      </Button>
    </div>
  );
}

export {
  QuestionBankCsvCreateInput,
  QuestionBankCsvExportAction,
  QuestionBankCsvImportControl,
  QuestionBankCsvImportDialog,
};
export type {
  CsvPreviewStatus,
  QuestionBankCsvDraftSummary,
  QuestionBankCsvImportResult,
  QuestionBankCsvImportSummary,
  QuestionBankCsvMode,
};
