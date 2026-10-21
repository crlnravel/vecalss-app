"use client";

import { useEffect, useId, useRef, useState } from "react";

import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import { showToast } from "@/components/ui/toast";
import { toQuestionBankCsvDraftPayload } from "@/lib/question-bank/csv";
import {
  useQuestionBankCsvPreview,
  type QuestionBankCsvDraftSummary,
} from "@/modules/mentor/components/question-bank-csv-flow";
import {
  QuestionBankXlsxDraftPreviewPanel,
  type QuestionBankXlsxDraftApplied,
  type QuestionBankXlsxDraftUploadStatus,
} from "@/modules/mentor/components/question-bank-xlsx-flow";

type ImportState = "idle" | "processing" | "ready" | "invalid";

type QuestionBankCreateFileImportControlProps = {
  disabled?: boolean;
  hidden?: boolean;
  onCsvDraftApplied: (draft: QuestionBankCsvDraftSummary) => void;
  onRemoveCsvDraft: () => void;
  onRemoveXlsxDraft: () => void;
  onStateChange: (state: ImportState) => void;
  onXlsxDraftApplied: (draft: QuestionBankXlsxDraftApplied) => void;
};

const XLSX_ACCEPT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function questionBankImportFileKind(file: File | null) {
  const name = file?.name.toLowerCase();
  if (name?.endsWith(".csv")) return "csv";
  if (name?.endsWith(".xlsx")) return "xlsx";
  return null;
}

function syncCsvPreviewResult({ csvFile, csvPreview, onCsvDraftApplied, onStateChange, appliedFileRef, errorNotifiedFileRef }: {
  csvFile: File | null;
  csvPreview: ReturnType<typeof useQuestionBankCsvPreview>;
  onCsvDraftApplied: (draft: QuestionBankCsvDraftSummary) => void;
  onStateChange: (state: ImportState) => void;
  appliedFileRef: { current: File | null };
  errorNotifiedFileRef: { current: File | null };
}) {
  if (!csvFile) return;
  if (csvPreview.status === "loading") {
    onStateChange("processing");
    return;
  }
  if (csvPreview.status === "invalid" || csvPreview.status === "empty") {
    onStateChange("invalid");
    if (errorNotifiedFileRef.current !== csvFile) {
      errorNotifiedFileRef.current = csvFile;
      const detail = csvPreview.errors.slice(0, 3).join(" · ");
      showToast(detail || "File CSV belum berisi soal yang bisa digunakan.", { variant: "error" });
    }
    return;
  }
  if (csvPreview.status !== "valid" || !csvPreview.summary) return;
  if (appliedFileRef.current !== csvFile) {
    appliedFileRef.current = csvFile;
    try {
      const payload = toQuestionBankCsvDraftPayload({ normalizedRows: csvPreview.normalizedRows, summary: csvPreview.summary }, "");
      // react-doctor-disable-next-line no-pass-data-to-parent, no-pass-live-state-to-parent -- the parent owns the draft that will be saved after server validation.
      onCsvDraftApplied({ fileName: csvFile.name, questions: payload.questions, rowCount: payload.questions.length, summary: payload.summary });
      showToast(`${payload.questions.length.toLocaleString("id-ID")} soal dari CSV siap disimpan.`, { variant: "success" });
    } catch {
      onStateChange("invalid");
      showToast("Isi file CSV belum dapat digunakan. Periksa kembali formatnya.", { variant: "error" });
      return;
    }
  }
  onStateChange("ready");
}

function QuestionBankCreateFileImportControl({
  disabled = false,
  hidden = false,
  onCsvDraftApplied,
  onRemoveCsvDraft,
  onRemoveXlsxDraft,
  onStateChange,
  onXlsxDraftApplied,
}: QuestionBankCreateFileImportControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const csvAppliedFileRef = useRef<File | null>(null);
  const csvErrorNotifiedFileRef = useRef<File | null>(null);
  const xlsxDraftAppliedRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [xlsxPanelOpen, setXlsxPanelOpen] = useState(false);
  const [xlsxUploadStatus, setXlsxUploadStatus] =
    useState<QuestionBankXlsxDraftUploadStatus | null>(null);
  const fileKind = questionBankImportFileKind(file);
  const csvFile = fileKind === "csv" ? file : null;
  const csvPreview = useQuestionBankCsvPreview(csvFile);

  // The server preview resolves asynchronously after a file is chosen; this effect commits its validated result.
  // react-doctor-disable-next-line no-event-handler -- preview status and validated rows are produced after the file-selection event.
  useEffect(() => {
    syncCsvPreviewResult({ appliedFileRef: csvAppliedFileRef, csvFile, csvPreview, errorNotifiedFileRef: csvErrorNotifiedFileRef, onCsvDraftApplied, onStateChange });
  }, [csvFile, csvPreview, onCsvDraftApplied, onStateChange]);

  function clearSelectedFile() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setXlsxPanelOpen(false);
    setXlsxUploadStatus(null);
    csvAppliedFileRef.current = null;
    csvErrorNotifiedFileRef.current = null;
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

    const nextKind = questionBankImportFileKind(nextFile);
    setFile(nextFile);
    setXlsxUploadStatus(null);
    csvAppliedFileRef.current = null;
    csvErrorNotifiedFileRef.current = null;
    xlsxDraftAppliedRef.current = false;
    onRemoveCsvDraft();
    onRemoveXlsxDraft();

    if (!nextKind) {
      setXlsxPanelOpen(false);
      onStateChange("invalid");
      showToast("Pilih file CSV atau Excel berformat .xlsx.", {
        variant: "error",
      });
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
  const isXlsxUploading =
    fileKind === "xlsx" &&
    xlsxUploadStatus !== null &&
    !xlsxUploadStatus.completed;

  return (
    <section
      className={hidden ? "hidden" : "grid gap-3"}
      data-question-bank-create-file-import="true"
      hidden={hidden}
    >
      <div className="grid gap-2">
        <label className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={inputId}>
          File soal
        </label>
        <FileUploadSlot
          accept={`.csv,text/csv,.xlsx,${XLSX_ACCEPT}`}
          disabled={disabled || isXlsxUploading}
          dropZoneClassName="min-h-44 sm:min-h-64"
          file={file}
          id={inputId}
          inputRef={inputRef}
          maxSizeLabel="CSV: maks. 2 MB · 500 soal | Excel: maks. 24 MB · 1.250 soal"
          onChange={handleFileChange}
          onCancelUpload={
            isXlsxUploading ? () => handleXlsxPanelOpenChange(false) : undefined
          }
          progress={fileKind === "xlsx" ? xlsxUploadStatus?.progress : null}
          uploadMeta={fileKind === "xlsx" ? xlsxUploadStatus?.meta : undefined}
          completed={
            fileKind === "xlsx" && Boolean(xlsxUploadStatus?.completed)
          }
          uploading={isCsvPreviewing || isXlsxUploading}
          uploadLabel={
            fileKind === "xlsx"
              ? (xlsxUploadStatus?.label ?? "Unggahan sedang disiapkan")
              : "Memeriksa file soal"
          }
        />
      </div>
      <QuestionBankXlsxDraftPreviewPanel
        file={fileKind === "xlsx" ? file : null}
        onDraftApplied={(draft) => {
          xlsxDraftAppliedRef.current = true;
          onXlsxDraftApplied(draft);
          onStateChange("ready");
        }}
        onOpenChange={handleXlsxPanelOpenChange}
        onUploadStatusChange={setXlsxUploadStatus}
        open={xlsxPanelOpen}
      />
    </section>
  );
}

export { QuestionBankCreateFileImportControl };
export type { ImportState as QuestionBankCreateFileImportState };
