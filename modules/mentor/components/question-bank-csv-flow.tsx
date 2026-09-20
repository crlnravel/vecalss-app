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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { cn } from "@/lib/utils";

type CsvPreviewStatus = "idle" | "loading" | "valid" | "invalid" | "empty";
type QuestionBankCsvMode = "append" | "overwrite";

type QuestionBankCsvDraftSummary = {
  fileName: string;
  rowCount: number;
};

type QuestionBankCsvImportSummary = QuestionBankCsvDraftSummary & {
  mode: QuestionBankCsvMode;
};

type CsvPreview = QuestionBankCsvDraftSummary & {
  errors: string[];
  status: CsvPreviewStatus;
};

function getMockCsvPreview(file: { name: string; size: number }): CsvPreview {
  const normalizedName = file.name.trim().toLowerCase();
  if (!file.size || normalizedName.includes("empty")) {
    return {
      errors: ["CSV tidak memiliki baris data. Pilih file yang berisi soal."],
      fileName: file.name,
      rowCount: 0,
      status: "empty",
    };
  }
  if (!normalizedName.endsWith(".csv")) {
    return {
      errors: ["Format file tidak didukung. Pilih file dengan ekstensi .csv."],
      fileName: file.name,
      rowCount: 0,
      status: "invalid",
    };
  }
  if (normalizedName.includes("invalid") || normalizedName.includes("error")) {
    return {
      errors: [
        "Baris 4: subject_code tidak sesuai daftar Subtest.",
        "Baris 7: correct_options harus menunjuk opsi yang terisi.",
      ],
      fileName: file.name,
      rowCount: 8,
      status: "invalid",
    };
  }
  const rowCount = normalizedName.includes("large")
    ? 500
    : Math.max(1, Math.min(500, Math.round(file.size / 1024) || 12));
  return { errors: [], fileName: file.name, rowCount, status: "valid" };
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
    <div className="flex flex-wrap items-center gap-2">
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
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      ) : null}
      {file ? (
        <span className="min-w-0 max-w-full truncate text-sm text-secondary-700">
          {file.name}
        </span>
      ) : null}
    </div>
  );
}

function CsvFileSummary({
  preview,
}: {
  preview: CsvPreview;
}) {
  if (preview.status === "idle") return null;
  if (preview.status === "loading") {
    return (
      <div
        aria-live="polite"
        aria-label="Memeriksa CSV"
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
        className="flex items-start gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-3 text-sm text-primary-950"
        data-csv-preview-status="valid"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{preview.rowCount} soal siap ditinjau.</p>
          <p className="mt-1 text-primary-900/80">
            {preview.fileName} · CSV hanya mengisi draf lokal sampai Anda
            menyimpannya.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div
      aria-live="assertive"
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
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
            ? "CSV belum berisi soal"
            : "CSV perlu diperbaiki"}
        </p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-current/85">
          {preview.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function useCsvPreview(file: File | null) {
  const [resolvedFile, setResolvedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview>({
    errors: [],
    fileName: "",
    rowCount: 0,
    status: "idle",
  });

  useEffect(() => {
    if (!file) return;
    const timer = window.setTimeout(() => {
      setResolvedFile(file);
      setPreview(getMockCsvPreview(file));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [file]);

  if (!file) {
    return {
      errors: [],
      fileName: "",
      rowCount: 0,
      status: "idle" as const,
    };
  }
  if (resolvedFile !== file) {
    return {
      errors: [],
      fileName: file.name,
      rowCount: 0,
      status: "loading" as const,
    };
  }
  return preview;
}

function QuestionBankCsvCreateInput({
  disabled = false,
  onApply,
}: {
  disabled?: boolean;
  onApply?: (summary: QuestionBankCsvDraftSummary) => void;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const preview = useCsvPreview(file);
  const canApply = preview.status === "valid" && Boolean(file);

  function handleRemove() {
    setFile(null);
  }

  return (
    <ReferenceSurface
      as="section"
      className="grid gap-4 p-5 md:p-7"
      data-question-bank-csv-create="true"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-800">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-secondary-900">
            Isi soal dari CSV
          </h2>
          <p className="mt-1 max-w-[68ch] text-sm leading-6 text-secondary-600">
            Pilih CSV UTF-8 dengan maksimal 500 baris untuk menyiapkan draf
            soal. File tidak dikirim atau disimpan pada tahap pratinjau ini.
          </p>
        </div>
      </div>
      <CsvFilePicker
        disabled={disabled}
        file={file}
        inputId={inputId}
        onChange={setFile}
        onRemove={handleRemove}
      />
      <CsvFileSummary preview={preview} />
      {canApply ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4">
          <p className="text-sm text-secondary-700">
            Memilih file akan mengganti bagian soal yang berasal dari CSV pada
            draf lokal.
          </p>
          <Button
            disabled={disabled}
            onClick={() => {
              if (!file) return;
              onApply?.({ fileName: file.name, rowCount: preview.rowCount });
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
  disabled = false,
  onApply,
}: {
  disabled?: boolean;
  onApply?: (summary: QuestionBankCsvImportSummary) => void;
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
                disabled={disabled}
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
        disabled={disabled}
        onApply={onApply}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}

function QuestionBankCsvImportDialog({
  disabled = false,
  onApply,
  onOpenChange,
  open,
}: {
  disabled?: boolean;
  onApply?: (summary: QuestionBankCsvImportSummary) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<QuestionBankCsvMode>("append");
  const preview = useCsvPreview(file);
  const canApply = preview.status === "valid" && Boolean(file) && !disabled;

  function closeDialog(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setMode("append");
    }
  }

  return (
    <Dialog onOpenChange={closeDialog} open={open}>
      <DialogContent
        aria-describedby="question-bank-csv-import-description"
        className="sm:max-w-2xl"
        data-question-bank-csv-import="true"
      >
        <DialogHeader>
          <DialogTitle>Impor soal dari CSV</DialogTitle>
          <DialogDescription id="question-bank-csv-import-description">
            Pratinjau ini hanya mock state. File akan diperiksa lagi ketika
            alur impor nyata tersedia.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <label
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor={inputId}
            >
              File CSV
            </label>
            <CsvFilePicker
              disabled={disabled}
              file={file}
              inputId={inputId}
              onChange={setFile}
              onRemove={() => setFile(null)}
            />
            <p className="text-xs leading-5 text-secondary-600">
              UTF-8, maksimal 2 MiB dan 500 baris data. Kolom mengikuti format
              Bank Soal v1.
            </p>
          </div>

          <CsvFileSummary preview={preview} />

          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME}>
              Cara memasukkan soal
            </FieldLabel>
            <RadioGroup
              aria-label="Cara memasukkan soal"
              className="grid gap-3 sm:grid-cols-2"
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
                    Pertahankan soal aktif dan tambahkan baris CSV sebagai soal
                    baru.
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
                    Koleksi soal aktif akan mengikuti isi CSV; metadata Bank
                    Soal tetap sama.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </Field>

          <div className="rounded-2xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm leading-6 text-secondary-700">
            <p className="font-semibold text-secondary-900">Sebelum menerapkan</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>CSV akan diringkas ulang saat tindakan diterapkan.</li>
              <li>Kesalahan satu baris membatalkan seluruh tindakan.</li>
              <li>Mode Timpa semua akan mengarsipkan soal aktif yang tidak ada di CSV.</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => closeDialog(false)}
            type="button"
            variant="ghost"
          >
            Batal
          </Button>
          <Button
            data-csv-import-apply="true"
            disabled={!canApply}
            onClick={() => {
              if (!file || preview.status !== "valid") return;
              onApply?.({
                fileName: file.name,
                mode,
                rowCount: preview.rowCount,
              });
              closeDialog(false);
            }}
            type="button"
            variant="brand"
          >
            {mode === "append" ? "Terapkan tambahan" : "Terapkan timpa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuestionBankCsvExportAction({
  disabled = false,
  onExport,
}: {
  disabled?: boolean;
  onExport?: () => void;
}) {
  const [requested, setRequested] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3" data-question-bank-csv-export="true">
      <Button
        disabled={disabled}
        onClick={() => {
          setRequested(true);
          onExport?.();
        }}
        type="button"
        variant="brandOutline"
      >
        <Download data-icon="inline-start" />
        Ekspor CSV
      </Button>
      {requested ? (
        <p aria-live="polite" className="text-sm text-secondary-700" role="status">
          Mock ekspor CSV diminta. Unduhan nyata belum diaktifkan pada alur UI ini.
        </p>
      ) : null}
    </div>
  );
}

export {
  QuestionBankCsvCreateInput,
  QuestionBankCsvExportAction,
  QuestionBankCsvImportControl,
  QuestionBankCsvImportDialog,
  getMockCsvPreview,
};
export type {
  CsvPreviewStatus,
  QuestionBankCsvDraftSummary,
  QuestionBankCsvImportSummary,
  QuestionBankCsvMode,
};
