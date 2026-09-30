"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  Check,
  CircleHelp,
  Folder,
  LibraryBig,
  Pencil,
  Trash2,
  Upload,
  X,
} from "@/lib/icons";
import { createContext, useContext, useState } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { FieldTextarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { questionBankFolderLabel } from "@/lib/question-bank/labels";
import {
  questionBankNavigationLabel,
  questionBankPurposeLabel,
} from "@/lib/question-bank/purpose";
import {
  getQuestionBankReadinessFromDrafts,
  type QuestionBankReadiness,
  type QuestionReadinessIssue,
} from "@/lib/question-bank/readiness";
import { cn } from "@/lib/utils";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { AdministrationActionRow } from "@/modules/mentor/components/administration-action-row";
import {
  QuestionBankCsvExportAction,
  type QuestionBankCsvImportResult,
} from "@/modules/mentor/components/question-bank-csv-flow";
import type { QuestionBankXlsxImportResult } from "@/modules/mentor/components/question-bank-xlsx-flow";
import { QuestionBankImportControl } from "@/modules/mentor/components/question-bank-import-control";
import { ResourceAuthoringLockBanner } from "@/modules/mentor/components/resource-authoring-lock-banner";
import type {
  BankQuestion,
  KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  deleteQuestionBankAction,
  getQuestionBankForEditAction,
  saveQuestionBankAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";

type ConfirmationRequest = {
  actionVariant?: "brand" | "destructive";
  confirmLabel: string;
  description: string;
  dialogVariant?: "default" | "info" | "warning" | "danger" | "success";
  onConfirm: () => void;
  title: string;
};

type QuestionBankDetailTab = "soal" | "pengaturan";

const QuestionBankReadOnlyContext = createContext(false);

function QuestionBankStatusAction({
  bank,
  handleLifecycle,
  isReadOnly,
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isReadOnly: boolean;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  if (bank.status === "archived") {
    return (
      <Button
        aria-busy={isSavingLifecycle}
        disabled={isSavingLifecycle || isReadOnly}
        onClick={() => void handleLifecycle("restore")}
        size="sm"
        type="button"
        variant="brandOutline"
      >
        <Upload />
        {isSavingLifecycle ? "Memulihkan…" : "Pulihkan"}
      </Button>
    );
  }

  return (
    <Button
      aria-busy={isSavingLifecycle}
      aria-label="Arsipkan bank soal"
      className="shadow-[0_4px_0_var(--student-status-danger-border),0_14px_28px_-22px_color-mix(in_oklab,var(--student-status-danger-fg)_48%,transparent)] hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--student-status-danger-border),0_18px_34px_-22px_color-mix(in_oklab,var(--student-status-danger-fg)_54%,transparent)] motion-safe:active:translate-y-px motion-safe:active:shadow-none motion-reduce:transform-none"
      data-question-bank-lifecycle-action="archive"
      disabled={isSavingLifecycle || isReadOnly}
      onClick={requestArchive}
      size="sm"
      type="button"
      variant="dangerOutline"
    >
      <Archive />
      {isSavingLifecycle ? "Mengarsipkan…" : "Arsipkan"}
    </Button>
  );
}

function QuestionBankLifecycleActions({
  bank,
  handleLifecycle,
  isReadOnly,
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isReadOnly: boolean;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuestionBankStatusAction
        bank={bank}
        handleLifecycle={handleLifecycle}
        isReadOnly={isReadOnly}
        isSavingLifecycle={isSavingLifecycle}
        requestArchive={requestArchive}
      />
    </div>
  );
}

function QuestionBankArchiveSection({
  bank,
  handleLifecycle,
  isDeleting,
  isReadOnly,
  isSavingLifecycle,
  requestDelete,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isDeleting: boolean;
  isReadOnly: boolean;
  isSavingLifecycle: boolean;
  requestDelete: () => void;
  requestArchive: () => void;
}) {
  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6">
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-secondary-900">
          Administrasi
        </h2>
        <div>
          <AdministrationActionRow
            action="Unduh soal"
            description="Unduh seluruh soal dalam bank soal ini ke perangkat Anda."
          >
            <QuestionBankCsvExportAction bankId={bank.id} />
          </AdministrationActionRow>
          <AdministrationActionRow
            action={
              bank.status === "archived"
                ? "Pulihkan bank soal"
                : "Arsipkan bank soal"
            }
            description={
              bank.status === "archived"
                ? "Pulihkan bank soal ini agar dapat digunakan dan diperbarui kembali."
                : "Arsipkan bank soal ini agar tidak lagi muncul di daftar bank soal."
            }
          >
            <QuestionBankLifecycleActions
              bank={bank}
              handleLifecycle={handleLifecycle}
              isReadOnly={isReadOnly}
              isSavingLifecycle={isSavingLifecycle}
              requestArchive={requestArchive}
            />
          </AdministrationActionRow>
          <AdministrationActionRow
            action="Hapus bank soal"
            description="Hapus bank soal ini. Soal yang sudah digunakan dalam ujian atau kuis sebelumnya akan tetap tersimpan."
          >
            <Button
              aria-busy={isDeleting}
              aria-label="Hapus bank soal"
              data-question-bank-delete-action="delete"
              disabled={isDeleting || isSavingLifecycle || isReadOnly}
              onClick={requestDelete}
              size="sm"
              type="button"
              variant="dangerOutline"
            >
              <Trash2 />
              {isDeleting ? "Menghapus…" : "Hapus bank soal"}
            </Button>
          </AdministrationActionRow>
        </div>
      </div>
    </ReferenceSurface>
  );
}

type QuestionBankMetadataFormState = {
  isEditingDescription: boolean;
  isEditingTitle: boolean;
  isLocked: boolean;
  isSavingDescription: boolean;
  isSavingTitle: boolean;
};

function QuestionBankMetadataCard({
  bank,
  descriptionInput,
  folderLabel,
  formState,
  handleSaveDescription,
  handleSaveTitle,
  setDescriptionInput,
  setIsEditingDescription,
  setIsEditingTitle,
  setTitleInput,
  materiCoverage,
  subjectCoverage,
  titleInput,
}: {
  bank: KaptenQuestionBank;
  descriptionInput: string;
  folderLabel: string;
  formState: QuestionBankMetadataFormState;
  handleSaveDescription: () => Promise<void>;
  handleSaveTitle: () => Promise<void>;
  setDescriptionInput: (value: string) => void;
  setIsEditingDescription: (value: boolean) => void;
  setIsEditingTitle: (value: boolean) => void;
  setTitleInput: (value: string) => void;
  materiCoverage: string[];
  subjectCoverage: string[];
  titleInput: string;
}) {
  const {
    isEditingDescription,
    isEditingTitle,
    isLocked: isMetadataLocked,
    isSavingDescription,
    isSavingTitle,
  } = formState;
  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6">
      <div className="space-y-6">
        <div>
          {isEditingTitle ? (
            <div className="mt-3 flex max-w-2xl items-center gap-2">
              <Input
                autoFocus
                className={cn(
                  REFERENCE_CONTROL_CLASS_NAMES.input,
                  "text-2xl font-semibold md:text-3xl",
                )}
                disabled={isSavingTitle || isMetadataLocked}
                id="edit-bank-title-input"
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSaveTitle();
                  } else if (e.key === "Escape") {
                    setIsEditingTitle(false);
                    setTitleInput(bank.title);
                  }
                }}
                value={titleInput}
              />
              <Button
                disabled={isSavingTitle || isMetadataLocked || !titleInput.trim()}
                onClick={() => void handleSaveTitle()}
                size="sm"
                type="button"
                variant="brand"
              >
                <Check />
                Simpan
              </Button>
              <Button
                disabled={isSavingTitle}
                onClick={() => {
                  setIsEditingTitle(false);
                  setTitleInput(bank.title);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X />
                Batal
              </Button>
            </div>
          ) : (
            <div className="group mt-3 flex items-start gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">
                {bank.title}
              </h1>
              {!isMetadataLocked ? (
                <Button
                  aria-label="Ubah judul bank soal"
                  className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100"
                  onClick={() => {
                    setTitleInput(bank.title);
                    setIsEditingTitle(true);
                  }}
                  size="icon-sm"
                  title="Ubah judul bank soal"
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="size-4" />
                </Button>
              ) : null}
            </div>
          )}

        </div>

        <div className="space-y-5">
          <div>
            <span className="text-xs font-semibold text-secondary-500">
              Tipe
            </span>
            <p className="mt-1 text-sm font-medium text-secondary-900">
              {questionBankPurposeLabel(bank.purpose ?? "quiz")}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-start gap-1.5">
              <span className="text-xs font-semibold text-secondary-500">
                Deskripsi
              </span>
              {!isEditingDescription && !isMetadataLocked ? (
                <Button
                  aria-label="Ubah deskripsi bank"
                  className="size-7 text-secondary-400 hover:text-secondary-900"
                  onClick={() => {
                    setDescriptionInput(bank.description ?? "");
                    setIsEditingDescription(true);
                  }}
                  size="icon-sm"
                  title="Ubah deskripsi"
                  type="button"
                  variant="ghost"
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
            </div>

            {isEditingDescription ? (
              <div className="mt-2 max-w-3xl space-y-2">
                <FieldTextarea
                  autoFocus
                  className={cn(
                    REFERENCE_CONTROL_CLASS_NAMES.input,
                    "min-h-[90px] text-sm",
                  )}
                  disabled={isSavingDescription || isMetadataLocked}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Tuliskan deskripsi ringkas tentang bank soal ini…"
                  value={descriptionInput}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={isSavingDescription || isMetadataLocked}
                    onClick={() => void handleSaveDescription()}
                    size="sm"
                    type="button"
                    variant="brand"
                  >
                    <Check />
                    Simpan
                  </Button>
                  <Button
                    disabled={isSavingDescription}
                    onClick={() => {
                      setIsEditingDescription(false);
                      setDescriptionInput(bank.description ?? "");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm leading-6 text-secondary-700">
                {bank.description ? (
                  bank.description
                ) : (
                  <span className="italic text-secondary-400">
                    Belum ada deskripsi untuk bank soal ini. Klik ikon pensil
                    untuk menambahkan.
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary-500">
              Folder
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary-900">
                <Folder className="size-4 text-primary-700" />
                <span className="truncate">{folderLabel}</span>
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary-500">
              Subjek
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {subjectCoverage.length > 0 ? (
                subjectCoverage.map((code) => (
                  <MentorBadge key={code} size="xs" tone="category">
                    {code}
                  </MentorBadge>
                ))
              ) : (
                <span className="text-xs text-secondary-400">
                  Belum ada subjek
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary-500">
              Materi
            </span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {materiCoverage.length > 0 ? (
                materiCoverage.map((materi) => (
                  <MentorBadge key={materi} size="xs" tone="category">
                    {materi}
                  </MentorBadge>
                ))
              ) : (
                <span className="text-xs text-secondary-400">
                  Belum ada Materi
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </ReferenceSurface>
  );
}

function QuestionBankQuestionCard({
  index,
  question,
  questionIssues,
}: {
  index: number;
  question: BankQuestion;
  questionIssues: QuestionReadinessIssue[];
}) {
  const hasIssues = questionIssues.length > 0;

  return (
    <article
      className={cn(
        "rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5",
        hasIssues
          ? "border-warning-300 bg-warning-50/60 hover:border-warning-400"
          : "border-primary-100 bg-white hover:border-primary-200",
      )}
      key={question.id}
    >
      <div className="flex flex-col items-start gap-4 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">
            {index + 1}
          </span>
          {hasIssues ? (
            <MentorBadge className="gap-1" size="xs" tone="attention">
              <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
              Perlu diperbaiki ({questionIssues.length})
            </MentorBadge>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-secondary-500">
              Subjek
            </span>
            <MentorBadge size="xs" tone="category">
              {question.subjectCode}
            </MentorBadge>
          </div>
          {question.materi ? (
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-secondary-500">
                Materi
              </span>
              <MentorBadge
                className="max-w-[min(20rem,60vw)] truncate"
                size="xs"
                tone="category"
              >
                {question.materi}
              </MentorBadge>
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-secondary-500">
              Kesulitan
            </span>
            <MentorBadge
              size="xs"
              tone={
                question.difficulty === "easy"
                  ? "neutral"
                  : question.difficulty === "hard"
                    ? "attention"
                    : "category"
              }
            >
              {question.difficulty === "easy"
                ? "Mudah"
                : question.difficulty === "hard"
                  ? "Sulit"
                  : "Sedang"}
            </MentorBadge>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-medium leading-6 text-secondary-900">
            {question.prompt || (
              <span className="italic text-secondary-400">
                Pertanyaan belum diisi…
              </span>
            )}
          </p>
          {question.promptMediaAssetId ? (
            <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100">
              <MediaAssetPreview
                alt={`Gambar soal ${index + 1}`}
                assetId={question.promptMediaAssetId}
                className="max-h-48 bg-white"
              />
            </div>
          ) : null}
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.choices.map((choice, choiceIndex) => {
            const isCorrect = choice.id === question.correctChoiceId;
            const choiceLabel = String.fromCharCode(65 + choiceIndex);
            return (
              <div
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border p-3 text-sm transition-colors",
                  isCorrect
                    ? "border-primary-200 bg-primary-50/60 text-primary-950 font-medium"
                    : "border-secondary-100 bg-secondary-50/40 text-secondary-700",
                )}
                key={choice.id}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase",
                    isCorrect
                      ? "bg-primary-700 text-white"
                      : "bg-secondary-200 text-secondary-700",
                  )}
                >
                  {choiceLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-5">
                    {choice.text || (
                      <span className="italic text-secondary-400">
                        Opsi kosong
                      </span>
                    )}
                  </p>
                  {choice.mediaAssetId ? (
                    <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                      <MediaAssetPreview
                        alt={`Media opsi ${choice.id.toUpperCase()}`}
                        assetId={choice.mediaAssetId}
                        className="max-h-24 bg-white"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {question.explanation || question.explanationMediaAssetId ? (
          <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-sm leading-6 text-secondary-700">
            <span className="font-bold text-primary-900">Pembahasan: </span>
            {question.explanation}
            {question.explanationMediaAssetId ? (
              <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                <MediaAssetPreview
                  alt="Media pembahasan"
                  assetId={question.explanationMediaAssetId}
                  className="max-h-28 bg-white"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function QuestionBankEditorButton({
  bank,
  bankId,
}: {
  bank: KaptenQuestionBank;
  bankId: string;
}) {
  const isReadOnly = useContext(QuestionBankReadOnlyContext);
  const editorLocked = bank.status === "archived";
  const editorUnavailable = editorLocked || isReadOnly;
  const editorLockReason = editorLocked
    ? "Untuk mengedit kembali, batalkan arsip Bank Soal terlebih dahulu."
    : "Editor dinonaktifkan sampai izin edit tersedia kembali.";
  const editorButton = (
    <Button
      aria-label="Buka Editor"
      className="shrink-0"
      disabled={editorUnavailable}
      nativeButton={editorUnavailable}
      render={
        editorUnavailable ? undefined : (
          <Link
            href={`/mentor/quiz/question-bank/${bankId}/editor?purpose=${bank.purpose ?? "quiz"}`}
          />
        )
      }
      size="default"
      type="button"
      variant="brand"
    >
      <Pencil data-icon="inline-start" />
      Buka Editor
    </Button>
  );

  if (!editorUnavailable) return editorButton;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
          {editorButton}
        </TooltipTrigger>
        <TooltipContent>{editorLockReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function QuestionBankQuestionsSection({
  bank,
  bankId,
  editLease,
  expectedRevision,
  isReadOnly,
  onImport,
  questions,
  readiness,
}: {
  bank: KaptenQuestionBank;
  bankId: string;
  editLease: import("@/lib/resource-edit-lock/types").EditLeaseProof | null;
  expectedRevision: number;
  isReadOnly: boolean;
  onImport: (result: QuestionBankCsvImportResult | QuestionBankXlsxImportResult) => Promise<void> | void;
  questions: BankQuestion[];
  readiness: QuestionBankReadiness;
}) {
  return (
    <section className="space-y-6">
      <QuestionBankReadOnlyContext.Provider value={isReadOnly}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">
              Daftar Soal
            </h2>
            <MentorBadge className="font-bold" size="xs" tone="category">
              {questions.length} Soal
            </MentorBadge>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <QuestionBankEditorButton bank={bank} bankId={bankId} />
            <QuestionBankImportControl
              bankId={bankId}
              currentQuestionCount={questions.length}
              disabled={isReadOnly}
              editLease={editLease}
              expectedRevision={expectedRevision}
              onApplied={onImport}
            />
          </div>
        </div>
      </QuestionBankReadOnlyContext.Provider>

      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-white py-16 text-center">
          <LibraryBig className="size-12 text-primary-300" />
          <h3 className="mt-4 font-semibold text-secondary-900">
            Belum ada soal dalam bank ini
          </h3>
          <p className="mt-1 text-sm text-secondary-600">
            Mulai menulis soal pilihan ganda lengkap dengan kunci jawaban dan
            pembahasan.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {questions.map((question, index) => {
            const questionIssues = readiness.issues.filter(
              (issue) => issue.questionId === question.id,
            );
            return (
              <QuestionBankQuestionCard
                index={index}
                key={question.id}
                question={question}
                questionIssues={questionIssues}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function QuestionBankArchiveConfirmationDialog({
  confirmationRequest,
  onClose,
}: {
  confirmationRequest: ConfirmationRequest | null;
  onClose: () => void;
}) {
  const dialogVariant = confirmationRequest?.dialogVariant ?? "danger";
  const actionVariant = confirmationRequest?.actionVariant ?? "destructive";

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={Boolean(confirmationRequest)}
    >
      <AlertDialogContent size="sm" variant={dialogVariant}>
        <AlertDialogHeader>
          <AlertDialogMedia variant={dialogVariant}>
            <CircleHelp />
          </AlertDialogMedia>
          <AlertDialogTitle>{confirmationRequest?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirmationRequest?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => confirmationRequest?.onConfirm()}
            variant={actionVariant}
          >
            {confirmationRequest?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function QuestionBankDetailContent({
  bankId,
  initialBank,
  initialQuestions = [],
  initialReadiness = null,
  initialTab = "soal",
  session,
}: {
  bankId: string;
  initialBank: KaptenQuestionBank;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  initialTab?: QuestionBankDetailTab;
  session: SessionContext;
}) {
  const router = useRouter();
  const resourceLock = useResourceEditLock();
  const [bank, setBank] = useState<KaptenQuestionBank>(initialBank);
  const [activeTab, setActiveTab] =
    useState<QuestionBankDetailTab>(initialTab);
  const [questions, setQuestions] = useState<BankQuestion[]>(initialQuestions);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(bank.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(
    bank.description ?? "",
  );
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);
  const [readiness, setReadiness] = useState<QuestionBankReadiness>(
    initialReadiness ?? getQuestionBankReadinessFromDrafts(initialQuestions),
  );
  const isReadOnly = !resourceLock.canEdit;
  const isMetadataLocked = bank.status === "archived" || isReadOnly;

  const folderLabel = questionBankFolderLabel(
    bank.folderId ?? null,
    bank.folder?.name ?? "Folder tidak ditemukan",
  );
  const subjectCoverage = [
    ...new Set(
      questions
        .map((q) => q.subjectCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const materiCoverage = [
    ...new Set(
      questions
        .map((question) => question.materi?.trim())
        .filter((materi): materi is string => Boolean(materi)),
    ),
  ].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );

  function changeTab(value: string) {
    if (value !== "soal" && value !== "pengaturan") return;
    const next = value as QuestionBankDetailTab;
    setActiveTab(next);
    router.push(
      `/mentor/quiz/question-bank/${bank.id}?tab=${next}`,
      { scroll: false },
    );
  }

  async function handleSaveTitle() {
    if (isReadOnly) return;
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === bank.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      const result = await saveQuestionBankAction({
        description: bank.description,
        editLease: resourceLock.proof ?? undefined,
        id: bank.id,
        purpose: bank.purpose ?? "quiz",
        questions,
        revision: bank.revision,
        title: trimmed,
      });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      setBank((current) => ({
        ...current,
        revision: result.result.bank.revision,
        title: result.result.bank.title,
        updatedAt: result.result.bank.updatedAt,
      }));
      setIsEditingTitle(false);
      showToast("Judul Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Gagal mengubah judul bank soal.",
        { variant: "error" },
      );
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function handleSaveDescription() {
    if (isReadOnly) return;
    const trimmed = descriptionInput.trim();
    if (trimmed === (bank.description ?? "")) {
      setIsEditingDescription(false);
      return;
    }
    setIsSavingDescription(true);
    try {
      const result = await saveQuestionBankAction({
        description: trimmed,
        editLease: resourceLock.proof ?? undefined,
        id: bank.id,
        purpose: bank.purpose ?? "quiz",
        questions,
        revision: bank.revision,
        title: bank.title,
      });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      setBank((current) => ({
        ...current,
        description: result.result.bank.description,
        revision: result.result.bank.revision,
        updatedAt: result.result.bank.updatedAt,
      }));
      setIsEditingDescription(false);
      showToast("Deskripsi Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Gagal mengubah deskripsi bank soal.",
        { variant: "error" },
      );
    } finally {
      setIsSavingDescription(false);
    }
  }

  async function handleLifecycle(
    operation: "archive" | "restore",
  ) {
    if (isReadOnly) return;
    setIsSavingLifecycle(true);
    try {
      const result = await updateQuestionBankLifecycleAction(
        bank.id,
        operation,
        {
          editLease: resourceLock.proof ?? undefined,
          expectedRevision: bank.revision ?? 1,
        },
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      setBank((current) => ({
        ...current,
        revision: result.result.revision,
        status: result.result.status,
      }));
      const lifecycleMessage = {
        archive: "Bank soal berhasil diarsipkan.",
        restore: "Bank soal berhasil dipulihkan.",
      }[operation];
      showToast(lifecycleMessage, { variant: "success" });
      router.refresh();
    } catch (err) {
      showToast("Status bank soal tidak dapat diperbarui. Coba lagi.", { variant: "error" });
    } finally {
      setIsSavingLifecycle(false);
    }
  }

  async function handleDelete() {
    if (isReadOnly || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteQuestionBankAction(
        bank.id,
        resourceLock.proof ?? undefined,
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      showToast("Bank soal berhasil dihapus.", { variant: "success" });
      router.replace(
        `/mentor/quiz/question-bank?purpose=${encodeURIComponent(bank.purpose ?? "quiz")}`,
      );
    } catch (err) {
      showToast("Bank soal tidak dapat dihapus. Coba lagi.", { variant: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  function requestArchive() {
    setConfirmationRequest({
      confirmLabel: "Arsipkan",
      description:
        "Arsipkan bank soal ini agar tidak lagi muncul di daftar bank soal.",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleLifecycle("archive");
      },
      title: "Arsipkan bank soal?",
    });
  }

  function requestDelete() {
    setConfirmationRequest({
      confirmLabel: "Hapus bank soal",
      description:
        "Hapus bank soal ini. Soal yang sudah digunakan dalam ujian atau kuis sebelumnya akan tetap tersimpan.",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleDelete();
      },
      title: "Hapus bank soal?",
    });
  }

  return <QuestionBankDetailLayout
    activeTab={activeTab}
    bank={bank}
    bankId={bankId}
    changeTab={changeTab}
    confirmationRequest={confirmationRequest}
    descriptionInput={descriptionInput}
    folderLabel={folderLabel}
    formState={{ isEditingDescription, isEditingTitle, isLocked: isMetadataLocked, isSavingDescription, isSavingTitle }}
    handleLifecycle={handleLifecycle}
    handleSaveDescription={handleSaveDescription}
    handleSaveTitle={handleSaveTitle}
    isDeleting={isDeleting}
    isReadOnly={isReadOnly}
    isSavingLifecycle={isSavingLifecycle}
    materiCoverage={materiCoverage}
    onCloseConfirmation={() => setConfirmationRequest(null)}
    onImport={async () => {
      try {
        const refreshed = await getQuestionBankForEditAction(bank.id);
        if (refreshed) {
          setBank(refreshed.bank as KaptenQuestionBank);
          setQuestions(refreshed.questions as BankQuestion[]);
          setReadiness(refreshed.readiness);
          return;
        }
      } catch {
        // The import already committed; refresh the authoritative route
        // instead of turning a successful write into a retryable failure.
      }
      router.refresh();
    }}
    questionBankEditLease={resourceLock.proof}
    questions={questions}
    readiness={readiness}
    requestArchive={requestArchive}
    requestDelete={requestDelete}
    resourceLock={resourceLock}
    session={session}
    setDescriptionInput={setDescriptionInput}
    setIsEditingDescription={setIsEditingDescription}
    setIsEditingTitle={setIsEditingTitle}
    setTitleInput={setTitleInput}
    subjectCoverage={subjectCoverage}
    titleInput={titleInput}
  />;
}

function QuestionBankDetailLayout({
  activeTab, bank, bankId, changeTab, confirmationRequest, descriptionInput, folderLabel, formState,
  handleLifecycle, handleSaveDescription, handleSaveTitle, isDeleting, isReadOnly, isSavingLifecycle,
  materiCoverage, onCloseConfirmation, onImport, questionBankEditLease, questions, readiness, requestArchive,
  requestDelete, resourceLock, session, setDescriptionInput, setIsEditingDescription, setIsEditingTitle,
  setTitleInput, subjectCoverage, titleInput,
}: {
  activeTab: QuestionBankDetailTab;
  bank: KaptenQuestionBank;
  bankId: string;
  changeTab: (value: string) => void;
  confirmationRequest: ConfirmationRequest | null;
  descriptionInput: string;
  folderLabel: string;
  formState: { isEditingDescription: boolean; isEditingTitle: boolean; isLocked: boolean; isSavingDescription: boolean; isSavingTitle: boolean };
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  handleSaveDescription: () => Promise<void>;
  handleSaveTitle: () => Promise<void>;
  isDeleting: boolean;
  isReadOnly: boolean;
  isSavingLifecycle: boolean;
  materiCoverage: string[];
  onCloseConfirmation: () => void;
  onImport: () => Promise<void>;
  questionBankEditLease: ReturnType<typeof useResourceEditLock>["proof"];
  questions: BankQuestion[];
  readiness: QuestionBankReadiness;
  requestArchive: () => void;
  requestDelete: () => void;
  resourceLock: ReturnType<typeof useResourceEditLock>;
  session: SessionContext;
  setDescriptionInput: (value: string) => void;
  setIsEditingDescription: (value: boolean) => void;
  setIsEditingTitle: (value: boolean) => void;
  setTitleInput: (value: string) => void;
  subjectCoverage: string[];
  titleInput: string;
}) {
  const navigationLabel = questionBankNavigationLabel(bank.purpose ?? "quiz");
  return (
    <MentorWorkspaceShell activeLabel={navigationLabel} breadcrumbLabel={bank.title || "Detail Bank Soal"} contentElement="div" mainClassName="max-w-[1400px] gap-7" session={session} sidebarAppearance="reference" showSearch={false}>
      <div className="space-y-8">
        <ResourceAuthoringLockBanner hasLocalChanges={formState.isEditingTitle || formState.isEditingDescription} onRetry={resourceLock.retry} resourceLabel="Bank Soal" state={resourceLock.state} />
        <QuestionBankMetadataCard bank={bank} descriptionInput={descriptionInput} folderLabel={folderLabel} formState={formState} handleSaveDescription={handleSaveDescription} handleSaveTitle={handleSaveTitle} setDescriptionInput={setDescriptionInput} setIsEditingDescription={setIsEditingDescription} setIsEditingTitle={setIsEditingTitle} setTitleInput={setTitleInput} materiCoverage={materiCoverage} subjectCoverage={subjectCoverage} titleInput={titleInput} />
        <Tabs className="w-full min-w-0 gap-7" onValueChange={changeTab} value={activeTab}>
          <FullWidthLineTabsList aria-label="Bagian detail Bank Soal">
            <FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="soal">Soal</FullWidthLineTabsTrigger>
            <FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="pengaturan">Pengaturan</FullWidthLineTabsTrigger>
          </FullWidthLineTabsList>
          <TabsContent className="m-0" value="soal">
            <QuestionBankQuestionsSection bank={bank} bankId={bankId} editLease={questionBankEditLease} expectedRevision={bank.revision ?? 1} isReadOnly={isReadOnly} onImport={onImport} questions={questions} readiness={readiness} />
          </TabsContent>
          <TabsContent className="m-0" value="pengaturan">
            <QuestionBankArchiveSection bank={bank} handleLifecycle={handleLifecycle} isDeleting={isDeleting} isReadOnly={isReadOnly} isSavingLifecycle={isSavingLifecycle} requestDelete={requestDelete} requestArchive={requestArchive} />
          </TabsContent>
        </Tabs>
      </div>
      <QuestionBankArchiveConfirmationDialog confirmationRequest={confirmationRequest} onClose={onCloseConfirmation} />
    </MentorWorkspaceShell>
  );
}

function KaptenQuestionBankDetailPageModule(props: {
  bankId: string;
  initialBank: KaptenQuestionBank;
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  initialTab?: QuestionBankDetailTab;
  session: SessionContext;
}) {
  return (
    <ResourceEditLockProvider resourceId={props.bankId} resourceType="question_bank">
      <QuestionBankDetailContent {...props} />
    </ResourceEditLockProvider>
  );
}

export { KaptenQuestionBankDetailPageModule };
