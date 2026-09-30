"use client";

import { useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type RefObject } from "react";

import { CheckCircle2, FileText, Upload, X } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileUploadSlotProps = {
  accept?: string;
  browseLabel?: string;
  completed?: boolean;
  completionLabel?: string;
  disabled?: boolean;
  dropZoneClassName?: string;
  file: File | null;
  id?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  maxSizeLabel?: string;
  onChange: (file: File | null) => void;
  onCancelUpload?: () => void;
  progress?: number | null;
  uploading?: boolean;
  uploadLabel?: string;
  uploadMeta?: string;
};

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

function openFileFinder(disabled: boolean, inputRef: RefObject<HTMLInputElement | null>) {
  if (!disabled) inputRef.current?.click();
}

function handleDragStart(event: DragEvent<HTMLDivElement>, disabled: boolean, setIsDragging: (value: boolean) => void) {
  event.preventDefault();
  event.stopPropagation();
  if (!disabled) setIsDragging(true);
}

function handleDragLeave(event: DragEvent<HTMLDivElement>, setIsDragging: (value: boolean) => void) {
  event.preventDefault();
  event.stopPropagation();
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
}

function handleFileDrop(event: DragEvent<HTMLDivElement>, disabled: boolean, onChange: (file: File | null) => void, setIsDragging: (value: boolean) => void) {
  event.preventDefault();
  event.stopPropagation();
  setIsDragging(false);
  if (!disabled) onChange(event.dataTransfer.files?.[0] ?? null);
}

function handleFileInputChange(event: ChangeEvent<HTMLInputElement>, disabled: boolean, onChange: (file: File | null) => void) {
  if (!disabled) onChange(event.target.files?.[0] ?? null);
}

function handleFileKeyDown(event: KeyboardEvent<HTMLDivElement>, openFinder: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openFinder();
  }
}

function getProgressAria(completed: boolean, progress: number | null, progressValue: number) {
  if (completed) return { "aria-valuemax": 100, "aria-valuemin": 0, "aria-valuenow": 100 };
  if (typeof progress === "number") return { "aria-valuemax": 100, "aria-valuemin": 0, "aria-valuenow": progressValue };
  return { "aria-valuetext": "File sedang diproses" };
}

function getProgressClass(completed: boolean, progress: number | null) {
  if (completed) return "bg-student-status-success-fg";
  if (typeof progress === "number") return "transition-[width]";
  return "w-2/5 animate-pulse";
}

function getProgressMeta(progress: number | null) {
  return typeof progress === "number" ? "" : "Sedang diproses…";
}

function getProgressText(completed: boolean, progress: number | null, progressValue: number) {
  if (completed) return "100%";
  return typeof progress === "number" ? `${progressValue}%` : null;
}

function FileUploadSlot({
  accept,
  browseLabel = "telusuri",
  completed = false,
  completionLabel = "File siap digunakan",
  disabled = false,
  dropZoneClassName,
  file,
  id,
  inputRef: providedInputRef,
  maxSizeLabel = "Maks. 2 MB · 500 baris",
  onCancelUpload,
  onChange,
  progress = null,
  uploading = false,
  uploadLabel = "File sedang diproses",
  uploadMeta,
}: FileUploadSlotProps) {
  const generatedId = useId();
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = providedInputRef ?? localInputRef;
  const showProgressRow = Boolean(file) && (uploading || typeof progress === "number" || completed);
  const progressValue = completed ? 100 : typeof progress === "number" ? clampProgress(progress) : 0;

  return (
    <div className="grid min-w-0 gap-3" data-file-upload-slot="true">
      <input
        accept={accept}
        aria-label="Pilih file"
        className="sr-only"
        disabled={disabled}
        id={id ?? `file-upload-${generatedId}`}
        onChange={(event) => handleFileInputChange(event, Boolean(disabled), onChange)}
        ref={inputRef}
        type="file"
      />
      {file ? (showProgressRow ? <FileUploadProgressRow completed={completed} completionLabel={completionLabel} disabled={disabled} file={file} inputRef={inputRef} onCancelUpload={onCancelUpload} onChange={onChange} progress={progress} progressValue={progressValue} uploadLabel={uploadLabel} uploadMeta={uploadMeta} /> : <SelectedFilePill disabled={disabled} file={file} inputRef={inputRef} onChange={onChange} />) : <EmptyFileDropZone accept={accept} browseLabel={browseLabel} disabled={disabled} dropZoneClassName={dropZoneClassName} inputRef={inputRef} maxSizeLabel={maxSizeLabel} onChange={onChange} />}
    </div>
  );
}

function EmptyFileDropZone({ browseLabel, disabled, dropZoneClassName, inputRef, maxSizeLabel, onChange }: Pick<FileUploadSlotProps, "browseLabel" | "disabled" | "dropZoneClassName" | "inputRef" | "maxSizeLabel" | "onChange"> & { inputRef: RefObject<HTMLInputElement | null> }) {
  const [isDragging, setIsDragging] = useState(false);
  const openFinder = () => openFileFinder(Boolean(disabled), inputRef);
  return (
    <div
      className={cn(
        "relative grid min-h-44 min-w-0 place-items-center rounded-3xl border-2 border-dashed px-5 py-8 text-center transition-[background-color,border-color,box-shadow]",
        dropZoneClassName,
        isDragging ? "border-primary-500 bg-primary-100/70 shadow-[inset_3px_3px_8px_color-mix(in_oklab,var(--voyage-forest)_10%,transparent)]" : "border-primary-200 bg-primary-50/35 hover:border-primary-300 hover:bg-primary-50/70",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      )}
      aria-label="Pilih file untuk diunggah"
      onDragEnter={(event) => handleDragStart(event, Boolean(disabled), setIsDragging)}
      onDragLeave={(event) => handleDragLeave(event, setIsDragging)}
      onDragOver={(event) => handleDragStart(event, Boolean(disabled), setIsDragging)}
      onDrop={(event) => handleFileDrop(event, Boolean(disabled), onChange, setIsDragging)}
      onClick={openFinder}
      onKeyDown={(event) => handleFileKeyDown(event, openFinder)}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <div className="grid w-full justify-items-center">
        <span aria-hidden="true" className="mb-3 grid size-11 place-items-center rounded-full bg-primary-100 text-primary-800"><Upload className="size-5" weight="bold" /></span>
        <button
          aria-label={`${browseLabel} file`}
          className="rounded-xl px-2 py-1 text-sm leading-6 text-secondary-500 outline-none transition-colors hover:text-secondary-800 focus-visible:ring-3 focus-visible:ring-primary-700/20"
          disabled={disabled}
          onClick={(event) => { event.stopPropagation(); openFinder(); }}
          type="button"
        >
          Letakkan file di sini atau <span className="font-semibold text-primary-800 underline decoration-primary-300 underline-offset-4">{browseLabel}</span>
        </button>
        <p className="pointer-events-none mt-1 select-none text-xs leading-5 text-secondary-500">{maxSizeLabel}</p>
      </div>
    </div>
  );
}

function SelectedFilePill({ disabled, file, inputRef, onChange }: Pick<FileUploadSlotProps, "disabled" | "file" | "inputRef" | "onChange"> & { file: File; inputRef: RefObject<HTMLInputElement | null> }) {
  const removeFile = () => {
    if (disabled) return;
    if (inputRef.current) inputRef.current.value = "";
    onChange(null);
  };
  return (
    <div className="flex min-w-0 justify-center">
      <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary-200 bg-white px-2 py-1.5 text-left shadow-sm">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-800"><FileText className="size-4" /></span>
        <span className="min-w-0 max-w-[min(58vw,20rem)] truncate text-xs font-semibold text-secondary-800" title={file.name}>{file.name}</span>
        <Button aria-label={`Hapus file ${file.name}`} disabled={disabled} onClick={removeFile} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>
      </div>
    </div>
  );
}

function FileUploadProgressRow({ completed, completionLabel, disabled, file, inputRef, onCancelUpload, onChange, progress, progressValue, uploadLabel, uploadMeta }: Pick<FileUploadSlotProps, "completed" | "completionLabel" | "disabled" | "file" | "onCancelUpload" | "onChange" | "progress" | "uploadLabel" | "uploadMeta"> & { file: File; inputRef: RefObject<HTMLInputElement | null>; progressValue: number }) {
  const progressLabel = completed ? "Unggahan selesai, 100%" : typeof progress === "number" ? `${progressValue}% selesai` : "File sedang diproses";
  const progressWidth = typeof progress === "number" ? { width: `${progressValue}%` } : undefined;
  return (
    <div className="rounded-3xl border border-primary-100 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-800"><FileText className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-secondary-900" title={file.name}>{file.name}</p>
          <p aria-live="polite" className="mt-0.5 text-xs text-secondary-500" role="status">{completed ? completionLabel : uploadLabel}</p>
        </div>
        <FileUploadProgressAction completed={completed} disabled={disabled} file={file} inputRef={inputRef} onCancelUpload={onCancelUpload} onChange={onChange} />
      </div>
      <div aria-label={progressLabel} {...getProgressAria(completed, progress, progressValue)} className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary-100" role="progressbar">
        <span className={cn("block h-full rounded-full bg-primary-700", getProgressClass(completed, progress))} style={progressWidth} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-xs text-secondary-500">
        <p>{uploadMeta ?? getProgressMeta(progress)}</p>
        <p>{getProgressText(completed, progress, progressValue)}</p>
      </div>
    </div>
  );
}

function FileUploadProgressAction({ completed, disabled, file, inputRef, onCancelUpload, onChange }: Pick<FileUploadSlotProps, "completed" | "disabled" | "file" | "onCancelUpload" | "onChange"> & { file: File; inputRef: RefObject<HTMLInputElement | null> }) {
  const removeFile = () => {
    if (disabled) return;
    if (inputRef.current) inputRef.current.value = "";
    onChange(null);
  };
  if (completed) {
    return (
      <>
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-student-status-success-fg" weight="fill" />
        <Button aria-label={`Hapus file ${file.name}`} disabled={disabled} onClick={removeFile} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>
      </>
    );
  }
  return (
    <Button aria-label={onCancelUpload ? "Batalkan proses" : `Hapus file ${file.name}`} onClick={onCancelUpload ?? removeFile} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>
  );
}

export { FileUploadSlot };
export type { FileUploadSlotProps };
