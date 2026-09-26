"use client";

import { useEffect, useId, useRef, useState } from "react";

import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import { CircleAlert } from "@/lib/icons";
import {
  toQuestionBankCsvDraftPayload,
} from "@/lib/question-bank/csv";
import {
  useQuestionBankCsvPreview,
  type QuestionBankCsvDraftInfo,
  type QuestionBankCsvDraftSummary,
} from "@/modules/mentor/components/question-bank-csv-flow";
import {
  QuestionBankXlsxDraftPreviewPanel,
  type QuestionBankXlsxDraftApplied,
  type QuestionBankXlsxDraftUploadStatus,
} from "@/modules/mentor/components/question-bank-xlsx-flow";
import { cn } from "@/lib/utils";

type ImportState = "idle" | "processing" | "ready" | "invalid";

type QuestionBankCreateFileImportControlProps = {
  csvDraft: QuestionBankCsvDraftInfo | null;
  disabled?: boolean;
  mediaFolderReservationId?: string;
  onCsvDraftApplied: (draft: QuestionBankCsvDraftSummary) => void;
  onRemoveCsvDraft: () => void;
  onRemoveXlsxDraft: () => void;
  onStateChange: (state: ImportState) => void;
  onXlsxDraftApplied: (draft: QuestionBankXlsxDraftApplied) => void;
  xlsxDraft: Pick<QuestionBankXlsxDraftApplied, "fileName" | "imageCount" | "rowCount"> | null;
};

const XLSX_ACCEPT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function QuestionBankCreateFileImportControl({
  disabled = false,
  mediaFolderReservationId,
  onCsvDraftApplied,
  onRemoveCsvDraft,
  onRemoveXlsxDraft,
  onStateChange,
  onXlsxDraftApplied,
}: QuestionBankCreateFileImportControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [unsupportedFile, setUnsupportedFile] = useState(false);
  const [xlsxPanelOpen, setXlsxPanelOpen] = useState(false);
  const [xlsxUploadStatus, setXlsxUploadStatus] = useState<QuestionBankXlsxDraftUploadStatus | null>(null);
  const csvAppliedFileRef = useRef<File | null>(null);
  const xlsxDraftAppliedRef = useRef(false);
  const fileKind = file?.name.toLowerCase().endsWith(".csv")
    ? "csv"
    : file?.name.toLowerCase().endsWith(".xlsx")
      ? "xlsx"
      : null;
  const csvFile = fileKind === "csv" ? file : null;
  const csvPreview = useQuestionBankCsvPreview(csvFile);

  useEffect(() => {
    if (!csvFile) return;
    if (csvPreview.status === "loading") {
      onStateChange("processing");
      return;
    }
    if (csvPreview.status === "invalid" || csvPreview.status === "empty") {
      onStateChange("invalid");
      return;
    }
    if (csvPreview.status !== "valid" || !csvPreview.summary) return;

    if (csvAppliedFileRef.current !== csvFile) {
      csvAppliedFileRef.current = csvFile;
      try {
        const payload = toQuestionBankCsvDraftPayload({
          normalizedRows: csvPreview.normalizedRows,
          summary: csvPreview.summary,
        }, "");
        onCsvDraftApplied({
          fileName: csvFile.name,
          questions: payload.questions,
          rowCount: payload.questions.length,
          summary: payload.summary,
        });
      } catch {
        onStateChange("invalid");
        return;
      }
    }
    onStateChange("ready");
  }, [csvFile, csvPreview, onCsvDraftApplied, onStateChange]);

  function clearSelectedFile() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setUnsupportedFile(false);
    setXlsxPanelOpen(false);
    setXlsxUploadStatus(null);
    csvAppliedFileRef.current = null;
    xlsxDraftAppliedRef.current = false;
    onRemoveCsvDraft();
    onRemoveXlsxDraft();
    onStateChange("idle");
  }

  function handleFileChange(nextFile: File | null) {
    if (disabled) return;
    if (!nextFile) {
      clearSelectedFile();
      return;
    }

    const lowerName = nextFile.name.toLowerCase();
    const nextKind = lowerName.endsWith(".csv")
      ? "csv"
      : lowerName.endsWith(".xlsx")
        ? "xlsx"
        : null;
    setFile(nextFile);
    setUnsupportedFile(!nextKind);
    setXlsxUploadStatus(null);
    csvAppliedFileRef.current = null;
    xlsxDraftAppliedRef.current = false;
    onRemoveCsvDraft();
    onRemoveXlsxDraft();

    if (!nextKind) {
      setXlsxPanelOpen(false);
      onStateChange("invalid");
      return;
    }
    onStateChange("processing");
    setXlsxPanelOpen(nextKind === "xlsx");
  }

  function handleXlsxPanelOpenChange(open: boolean) {
    setXlsxPanelOpen(open);
    if (!open) setXlsxUploadStatus(null);
    if (open || xlsxDraftAppliedRef.current) return;
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    onRemoveXlsxDraft();
    onStateChange("idle");
  }

  const isCsvPreviewing = Boolean(csvFile) && csvPreview.status === "loading";

  return (
    <div className="grid gap-3" data-question-bank-create-file-import="true">
      <div className="grid gap-2">
        <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>
          File soal
        </label>
        <FileUploadSlot
          accept={`.csv,text/csv,.xlsx,${XLSX_ACCEPT}`}
          disabled={disabled || (xlsxPanelOpen && Boolean(xlsxUploadStatus && !xlsxUploadStatus.completed))}
          dropZoneClassName="min-h-44 sm:min-h-64"
          file={file}
          id={inputId}
          inputRef={inputRef}
          maxSizeLabel="CSV: maks. 2 MB · 500 soal | Excel: maks. 24 MB · 1.000 soal"
          onChange={handleFileChange}
          onCancelUpload={fileKind === "xlsx" && xlsxUploadStatus && !xlsxUploadStatus.completed
            ? () => handleXlsxPanelOpenChange(false)
            : undefined}
          progress={fileKind === "xlsx" ? xlsxUploadStatus?.progress : null}
          uploadMeta={fileKind === "xlsx" ? xlsxUploadStatus?.meta : undefined}
          completed={fileKind === "xlsx" && Boolean(xlsxUploadStatus?.completed)}
          uploading={isCsvPreviewing || (fileKind === "xlsx" && xlsxUploadStatus !== null && !xlsxUploadStatus.completed)}
          uploadLabel={fileKind === "xlsx" ? xlsxUploadStatus?.label ?? "Unggahan sedang disiapkan" : "Memeriksa file soal"}
        />
      </div>

      {unsupportedFile ? (
        <div
          aria-live="assertive"
          className="flex items-start gap-2 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm text-student-status-danger-fg"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>Pilih file CSV atau Excel berformat .xlsx.</p>
        </div>
      ) : null}

      {csvFile && (csvPreview.status === "invalid" || csvPreview.status === "empty") ? (
        <div
          aria-live="assertive"
          className={cn(
            "flex min-w-0 items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
            csvPreview.status === "empty"
              ? "border-amber-300 bg-amber-50 text-amber-950"
              : "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg",
          )}
          data-question-bank-create-csv-preview={csvPreview.status}
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              {csvPreview.status === "empty" ? "File belum berisi soal" : "File perlu diperbaiki"}
            </p>
            <ul className="mt-1 max-h-52 list-disc space-y-1 overflow-auto pl-5 text-current/85">
              {csvPreview.errors.length
                ? csvPreview.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)
                : <li>File tidak menghasilkan soal yang bisa digunakan.</li>}
            </ul>
          </div>
        </div>
      ) : null}
      <QuestionBankXlsxDraftPreviewPanel
        file={fileKind === "xlsx" ? file : null}
        mediaFolderReservationId={mediaFolderReservationId}
        onDraftApplied={(draft) => {
          xlsxDraftAppliedRef.current = true;
          onXlsxDraftApplied(draft);
          onStateChange("ready");
        }}
        onOpenChange={handleXlsxPanelOpenChange}
        onUploadStatusChange={setXlsxUploadStatus}
        open={xlsxPanelOpen}
      />
    </div>
  );
}

export { QuestionBankCreateFileImportControl };
export type { ImportState as QuestionBankCreateFileImportState };
