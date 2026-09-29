"use client";

import { useCallback, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { REFERENCE_FIELD_LABEL_CLASS_NAME } from "@/components/dashboard/reference-dashboard-tokens";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import { showToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Upload } from "@/lib/icons";
import type { EditLeaseProof } from "@/lib/resource-edit-lock/types";
import { QUESTION_BANK_XLSX_MIME_TYPE } from "@/lib/question-bank/xlsx-limits";

import {
  QuestionBankCsvImportDialog,
  type QuestionBankCsvImportResult,
} from "./question-bank-csv-flow";
import {
  QuestionBankXlsxImportContent,
  type QuestionBankXlsxImportResult,
} from "./question-bank-xlsx-flow";

type QuestionBankImportResult =
  | QuestionBankCsvImportResult
  | QuestionBankXlsxImportResult;

type QuestionBankImportControlProps = {
  bankId: string;
  currentQuestionCount: number;
  disabled?: boolean;
  editLease: EditLeaseProof | null;
  expectedRevision: number;
  onApplied?: (result: QuestionBankImportResult) => Promise<void> | void;
};

function importType(file: File): "csv" | "xlsx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  return null;
}

function QuestionBankImportControl({
  bankId,
  currentQuestionCount,
  disabled = false,
  editLease,
  expectedRevision,
  onApplied,
}: QuestionBankImportControlProps) {
  const fileInputId = useId();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleBusyChange = useCallback((busy: boolean) => {
    setIsApplying(busy);
  }, []);

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen && isApplying) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setFile(null);
      setIsApplying(false);
    }
  }

  function closeFromImportFlow(nextOpen: boolean) {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    setOpen(false);
    setFile(null);
    setIsApplying(false);
  }

  function handleFileChange(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!importType(nextFile)) {
      showToast("Pilih file CSV atau Excel (.xlsx).", { variant: "error" });
      return;
    }
    setFile(nextFile);
  }

  const selectedType = file ? importType(file) : null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
            <Button
              aria-label="Impor Soal"
              className="shrink-0"
              disabled={disabled || !editLease}
              onClick={() => {
                setFile(null);
                setIsApplying(false);
                setOpen(true);
              }}
              size="icon"
              type="button"
              variant="brandOutline"
            >
              <Upload aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Impor Soal</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog onOpenChange={handleDialogOpenChange} open={open}>
        <DialogContent
          className="max-h-[min(90vh,820px)] overflow-y-auto sm:max-w-3xl"
          data-question-bank-import="true"
          pending={isApplying}
        >
          <DialogHeader>
            <DialogTitle>Impor Soal</DialogTitle>
          </DialogHeader>

          {!file || !selectedType ? (
            <div className="grid gap-2">
              <label
                className={REFERENCE_FIELD_LABEL_CLASS_NAME}
                htmlFor={fileInputId}
              >
                File soal
              </label>
              <FileUploadSlot
                accept={`.csv,text/csv,.xlsx,${QUESTION_BANK_XLSX_MIME_TYPE}`}
                disabled={disabled || !editLease || isApplying}
                file={null}
                id={fileInputId}
                maxSizeLabel="CSV maks. 2 MB · Excel maks. 24 MB"
                onChange={handleFileChange}
                uploadLabel="Membaca file soal"
              />
            </div>
          ) : selectedType === "csv" ? (
            <QuestionBankCsvImportDialog
              bankId={bankId}
              disabled={disabled}
              editLease={editLease}
              expectedRevision={expectedRevision}
              initialFile={file}
              onApplied={onApplied}
              onBusyChange={handleBusyChange}
              onFileCleared={() => setFile(null)}
              onOpenChange={closeFromImportFlow}
              open={open}
              presentation="embedded"
            />
          ) : (
            <QuestionBankXlsxImportContent
              bankId={bankId}
              currentQuestionCount={currentQuestionCount}
              disabled={disabled}
              editLease={editLease}
              expectedRevision={expectedRevision}
              file={file}
              onApplied={onApplied}
              onBusyChange={handleBusyChange}
              onFileCleared={() => setFile(null)}
              onOpenChange={closeFromImportFlow}
              open={open}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export { QuestionBankImportControl };
