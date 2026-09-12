"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  Check,
  ChevronLeft,
  CircleHelp,
  FilePenLine,
  Folder,
  LibraryBig,
  Pencil,
  Plus,
  Upload,
  X,
} from "@/lib/icons";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { MentorBadge } from "@/components/ui/mentor-badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldTextarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { questionBankFolderLabel } from "@/lib/question-bank/labels";
import { questionBankPurposeLabel } from "@/lib/question-bank/purpose";
import {
  getQuestionBankReadinessFromDrafts,
  type QuestionBankReadiness,
  type QuestionReadinessIssue,
} from "@/lib/question-bank/readiness";
import { cn } from "@/lib/utils";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import type { BankQuestion, KaptenQuestionBank } from "@/modules/mentor/mock-data";
import {
  saveQuestionBankAction,
  setQuestionBankCategoriesAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

type QuestionBankCategoryOption = {
  id: string;
  name: string;
};

type ConfirmationRequest = {
  actionVariant?: "brand" | "destructive";
  confirmLabel: string;
  description: string;
  dialogVariant?: "default" | "info" | "warning" | "danger" | "success";
  onConfirm: () => void;
  title: string;
};

function StatusPill({ status }: { status: KaptenQuestionBank["status"] }) {
  const tone = status === "published"
    ? "success"
    : status === "archived"
      ? "neutral"
      : status === "scheduled"
        ? "info"
        : "attention";
  const label = status === "published"
    ? "Terbit"
    : status === "archived"
      ? "Diarsipkan"
      : status === "scheduled"
        ? "Terjadwal"
        : "Draf";

  return <MentorBadge size="sm" tone={tone}>{label}</MentorBadge>;
}

function QuestionBankArchiveAction({
  bank,
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  if (bank.status === "archived" || bank.status === "scheduled") return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-busy={isSavingLifecycle}
              aria-label="Arsipkan bank soal"
              disabled={isSavingLifecycle}
              onClick={requestArchive}
              size="icon-sm"
              type="button"
              variant="dangerOutline"
            />
          }
        >
          <Archive />
        </TooltipTrigger>
        <TooltipContent>Arsipkan bank soal</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function QuestionBankStatusAction({
  bank,
  handleLifecycle,
  isSavingLifecycle,
  publishDisabledReason,
  requestLifecycleChange,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "publish" | "unpublish" | "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  publishDisabledReason?: string;
  requestLifecycleChange: (operation: "publish" | "unpublish") => void;
}) {
  if (bank.status === "archived") {
    return <Button aria-busy={isSavingLifecycle} disabled={isSavingLifecycle} onClick={() => void handleLifecycle("restore")} size="sm" type="button" variant="brandOutline"><Upload />{isSavingLifecycle ? "Membatalkan arsip…" : "Batalkan arsip"}</Button>;
  }
  if (bank.status === "published") {
    return <Button aria-busy={isSavingLifecycle} data-question-bank-lifecycle-action="unpublish" disabled={isSavingLifecycle} onClick={() => requestLifecycleChange("unpublish")} size="sm" type="button" variant="brandOutline"><FilePenLine />{isSavingLifecycle ? "Membuat draf…" : "Buat draf"}</Button>;
  }
  if (bank.status !== "draft") return null;

  return <Button aria-busy={isSavingLifecycle} aria-describedby={publishDisabledReason ? "publish-disabled-reason" : undefined} data-question-bank-lifecycle-action="publish" disabled={isSavingLifecycle || Boolean(publishDisabledReason)} onClick={() => requestLifecycleChange("publish")} size="sm" type="button" variant="brand"><Upload />{isSavingLifecycle ? "Menerbitkan…" : "Terbitkan"}</Button>;
}

function QuestionBankLifecycleActions({
  bank,
  handleLifecycle,
  isSavingLifecycle,
  publishDisabledReason,
  requestArchive,
  requestLifecycleChange,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "publish" | "unpublish" | "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  publishDisabledReason?: string;
  requestArchive: () => void;
  requestLifecycleChange: (operation: "publish" | "unpublish") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuestionBankArchiveAction bank={bank} isSavingLifecycle={isSavingLifecycle} requestArchive={requestArchive} />
      <QuestionBankStatusAction bank={bank} handleLifecycle={handleLifecycle} isSavingLifecycle={isSavingLifecycle} publishDisabledReason={publishDisabledReason} requestLifecycleChange={requestLifecycleChange} />
      {publishDisabledReason ? <p className="sr-only" id="publish-disabled-reason">{publishDisabledReason}</p> : null}
    </div>
  );
}

function QuestionBankDetailHeaderBar({
  bank,
  handleLifecycle,
  isSavingLifecycle,
  publishDisabledReason,
  requestArchive,
  requestLifecycleChange,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "publish" | "unpublish" | "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  publishDisabledReason?: string;
  requestArchive: () => void;
  requestLifecycleChange: (operation: "publish" | "unpublish") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          aria-label="Kembali ke Bank Soal"
          nativeButton={false}
          render={<Link href={`/mentor/quiz/question-bank?purpose=${bank.purpose ?? "quiz"}`} />}
          size="icon-sm"
          title="Kembali ke Bank Soal"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      </div>

      <QuestionBankLifecycleActions
        bank={bank}
        handleLifecycle={handleLifecycle}
        isSavingLifecycle={isSavingLifecycle}
        publishDisabledReason={publishDisabledReason}
        requestArchive={requestArchive}
        requestLifecycleChange={requestLifecycleChange}
      />
    </div>
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
  assignedCategories,
  bank,
  categories,
  descriptionInput,
  folderLabel,
  formState,
  handleCategoriesChange,
  handleSaveDescription,
  handleSaveTitle,
  setDescriptionInput,
  setIsEditingDescription,
  setIsEditingTitle,
  setTitleInput,
  subjectCoverage,
  titleInput,
}: {
  assignedCategories: QuestionBankCategoryOption[];
  bank: KaptenQuestionBank;
  categories: QuestionBankCategoryOption[];
  descriptionInput: string;
  folderLabel: string;
  formState: QuestionBankMetadataFormState;
  handleCategoriesChange: (nextCategoryIds: string[]) => Promise<void>;
  handleSaveDescription: () => Promise<void>;
  handleSaveTitle: () => Promise<void>;
  setDescriptionInput: (value: string) => void;
  setIsEditingDescription: (value: boolean) => void;
  setIsEditingTitle: (value: boolean) => void;
  setTitleInput: (value: string) => void;
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
                className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "text-2xl font-semibold md:text-3xl")}
                disabled={isSavingTitle}
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
                disabled={isSavingTitle || !titleInput.trim()}
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

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusPill status={bank.status} />
            <MentorBadge size="sm" tone="category">
              Digunakan untuk {questionBankPurposeLabel(bank.purpose ?? "quiz")}
            </MentorBadge>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-start gap-1.5">
              <span className="text-xs font-semibold text-secondary-500">Deskripsi</span>
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
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "min-h-[90px] text-sm")}
                  disabled={isSavingDescription}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Tuliskan deskripsi ringkas tentang bank soal ini…"
                  value={descriptionInput}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={isSavingDescription}
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
                    Belum ada deskripsi untuk bank soal ini. Klik ikon pensil untuk menambahkan.
                  </span>
                )}
              </p>
            )}
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary-500">Folder</span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-secondary-900">
                <Folder className="size-4 text-primary-700" />
                <span className="truncate">{folderLabel}</span>
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-secondary-500">Subjek</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {subjectCoverage.length > 0 ? (
                subjectCoverage.map((code) => (
                  <MentorBadge key={code} size="xs" tone="category">
                    {code}
                  </MentorBadge>
                ))
              ) : (
                <span className="text-xs text-secondary-400">Belum ada subjek</span>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-start gap-1.5">
              <span className="text-xs font-semibold text-secondary-500">Kategori</span>
              {!isMetadataLocked ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        aria-label="Kelola kategori"
                        className="size-6 text-secondary-400 hover:text-secondary-900"
                        size="icon-sm"
                        title="Kelola kategori"
                        type="button"
                        variant="ghost"
                      />
                    }
                  >
                    <Pencil className="size-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Pilih Kategori</DropdownMenuLabel>
                    {categories.map((category) => {
                      const categoryIds = bank.categoryIds ?? [];
                      const checked = categoryIds.includes(category.id);
                      return (
                        <DropdownMenuCheckboxItem
                          checked={checked}
                          key={category.id}
                          onCheckedChange={(nextChecked) => {
                            const nextIds = nextChecked
                              ? [...categoryIds, category.id]
                              : categoryIds.filter((id) => id !== category.id);
                            void handleCategoriesChange(nextIds);
                          }}
                        >
                          {category.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {assignedCategories.length > 0 ? (
                assignedCategories.map((cat) => (
                  <MentorBadge key={cat.id} size="xs" tone="category">
                    {cat.name}
                  </MentorBadge>
                ))
              ) : (
                <span className="text-xs text-secondary-400">Tanpa kategori</span>
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
            <span className="shrink-0 text-xs font-semibold text-secondary-500">Subjek</span>
            <MentorBadge size="xs" tone="category">
              {question.subjectCode}
            </MentorBadge>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-secondary-500">Kesulitan</span>
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
              <span className="italic text-secondary-400">Pertanyaan belum diisi…</span>
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
                  <p className="leading-5">{choice.text || <span className="italic text-secondary-400">Opsi kosong</span>}</p>
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

function QuestionBankQuestionsSection({
  bank,
  bankId,
  questions,
  readiness,
}: {
  bank: KaptenQuestionBank;
  bankId: string;
  questions: BankQuestion[];
  readiness: QuestionBankReadiness;
}) {
  const editorLocked = bank.status !== "draft";
  const editorLockReason = bank.status === "archived"
    ? "Untuk mengedit kembali, batalkan arsip Bank Soal terlebih dahulu."
    : "Untuk mengedit kembali, jadikan Bank Soal draf terlebih dahulu.";
  const editorButton = (
    <Button
      aria-label="Buka Editor"
      className="w-full shadow-sm sm:w-auto"
      disabled={editorLocked}
      nativeButton={editorLocked}
      render={editorLocked ? undefined : <Link href={`/mentor/quiz/question-bank/${bankId}/editor?purpose=${bank.purpose ?? "quiz"}`} />}
      size="default"
      type="button"
      variant="brand"
    >
      <Pencil data-icon="inline-start" />
      Buka Editor
    </Button>
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">
              Daftar Soal
            </h2>
            <MentorBadge className="font-bold" size="xs" tone="category">
              {questions.length} Soal
            </MentorBadge>
          </div>
        </div>
        {editorLocked ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="inline-flex w-full sm:w-auto" />}>
                {editorButton}
              </TooltipTrigger>
              <TooltipContent>{editorLockReason}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : editorButton}
      </div>

      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-white py-16 text-center">
          <LibraryBig className="size-12 text-primary-300" />
          <h3 className="mt-4 font-semibold text-secondary-900">Belum ada soal dalam bank ini</h3>
          <p className="mt-1 text-sm text-secondary-600">
            Mulai menulis soal pilihan ganda lengkap dengan kunci jawaban dan pembahasan.
          </p>
          {bank.status === "draft" ? (
            <Button
              className="mt-6"
              nativeButton={false}
              render={<Link href={`/mentor/quiz/question-bank/${bankId}/editor?purpose=${bank.purpose ?? "quiz"}`} />}
              variant="brand"
            >
              <Plus />
              Tulis Soal Pertama
            </Button>
          ) : null}
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
          <AlertDialogDescription>{confirmationRequest?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>
            Batal
          </AlertDialogCancel>
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

function KaptenQuestionBankDetailPageModule({
  bankId,
  initialBank,
  initialCategories = [],
  initialQuestions = [],
  initialReadiness = null,
  session,
}: {
  bankId: string;
  initialBank: KaptenQuestionBank;
  initialCategories?: QuestionBankCategoryOption[];
  initialQuestions?: BankQuestion[];
  initialReadiness?: QuestionBankReadiness | null;
  session: SessionContext;
}) {
  const router = useRouter();
  const [bank, setBank] = useState<KaptenQuestionBank>(initialBank);
  const [questions] = useState<BankQuestion[]>(initialQuestions);
  const [categories] = useState<QuestionBankCategoryOption[]>(initialCategories);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(bank.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(bank.description ?? "");
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);

  const readiness = initialReadiness ?? getQuestionBankReadinessFromDrafts(questions);
  const isMetadataLocked = bank.status === "archived" || bank.status === "scheduled";

  const folderLabel = questionBankFolderLabel(bank.folderId ?? null, bank.folder?.name ?? "Folder tidak ditemukan");
  const bankCategoryIdSet = new Set(bank.categoryIds ?? []);
  const assignedCategories = categories.filter((category) => bankCategoryIdSet.has(category.id));

  const subjectCoverage = [
    ...new Set(
      questions
        .map((q) => q.subjectCode)
        .filter((code): code is string => Boolean(code)),
    ),
  ];

  async function handleSaveTitle() {
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === bank.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSavingTitle(true);
    setLifecycleError(null);
    try {
      const result = await saveQuestionBankAction({
        description: bank.description,
        id: bank.id,
        purpose: bank.purpose ?? "quiz",
        questions,
        revision: bank.revision,
        title: trimmed,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
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
      setLifecycleError(err instanceof Error ? err.message : "Gagal mengubah judul bank soal.");
    } finally {
      setIsSavingTitle(false);
    }
  }

  async function handleSaveDescription() {
    const trimmed = descriptionInput.trim();
    if (trimmed === (bank.description ?? "")) {
      setIsEditingDescription(false);
      return;
    }
    setIsSavingDescription(true);
    setLifecycleError(null);
    try {
      const result = await saveQuestionBankAction({
        description: trimmed,
        id: bank.id,
        purpose: bank.purpose ?? "quiz",
        questions,
        revision: bank.revision,
        title: bank.title,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
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
      setLifecycleError(err instanceof Error ? err.message : "Gagal mengubah deskripsi bank soal.");
    } finally {
      setIsSavingDescription(false);
    }
  }

  async function handleCategoriesChange(nextCategoryIds: string[]) {
    if (isMetadataLocked) return;
    setLifecycleError(null);
    try {
      const result = await setQuestionBankCategoriesAction(bank.id, nextCategoryIds, {
        expectedRevision: bank.revision,
        expectedUpdatedAt: bank.updatedAt,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setBank((current) => ({
        ...current,
        categoryIds: nextCategoryIds,
        revision: result.result.revision,
        updatedAt: result.result.updatedAt,
      }));
      showToast("Kategori Bank Soal diperbarui.", { variant: "success" });
      router.refresh();
    } catch (err) {
      setLifecycleError(err instanceof Error ? err.message : "Gagal memperbarui kategori.");
    }
  }

  async function handleLifecycle(operation: "publish" | "unpublish" | "archive" | "restore") {
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const result = await updateQuestionBankLifecycleAction(bank.id, operation, {
        expectedRevision: bank.revision ?? 1,
      });
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
        archive: "Bank Soal diarsipkan.",
        publish: "Bank Soal diterbitkan.",
        restore: "Bank Soal dipulihkan.",
        unpublish: "Bank Soal dijadikan draf.",
      }[operation];
      showToast(lifecycleMessage, { variant: "success" });
      router.refresh();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Gagal mengubah status bank.",
        { variant: "error" },
      );
    } finally {
      setIsSavingLifecycle(false);
    }
  }

  function requestArchive() {
    setConfirmationRequest({
      confirmLabel: "Arsipkan",
      description:
        "Bank Soal ini akan dipindahkan ke arsip dan tidak dapat dipakai untuk authoring sampai dipulihkan.",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleLifecycle("archive");
      },
      title: "Arsipkan Bank Soal?",
    });
  }

  function requestLifecycleChange(operation: "publish" | "unpublish") {
    const isPublishing = operation === "publish";

    setConfirmationRequest({
      actionVariant: "brand",
      confirmLabel: isPublishing ? "Terbitkan" : "Jadikan draf",
      description: isPublishing
        ? "Bank Soal akan tersedia sebagai sumber untuk Kuis dan Tryout baru."
        : "Bank Soal ini dapat dikembalikan menjadi draf meskipun sudah digunakan dalam Tryout. Tryout yang sudah dibuat tidak akan terpengaruh. Selama berstatus draf, Bank Soal tidak dapat digunakan untuk membuat Tryout baru hingga diterbitkan kembali.",
      dialogVariant: "warning",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleLifecycle(operation);
      },
      title: isPublishing ? "Terbitkan Bank Soal?" : "Jadikan Bank Soal draf?",
    });
  }

  const publishDisabledReason =
    questions.length === 0
      ? "Tambahkan minimal satu soal sebelum diterbitkan"
      : readiness.incompleteCount > 0
      ? `${readiness.incompleteCount} soal perlu diperbaiki sebelum diterbitkan`
      : undefined;

  return (
    <MentorWorkspaceShell
      activeLabel="Bank Soal"
      breadcrumbLabel={bank.title || "Detail Bank Soal"}
      contentElement="div"
      mainClassName="max-w-[1400px] gap-7"
      session={session}
      sidebarAppearance="reference"
      showSearch={false}
    >
      <div className="space-y-8">
        <QuestionBankDetailHeaderBar
          bank={bank}
          handleLifecycle={handleLifecycle}
          isSavingLifecycle={isSavingLifecycle}
          publishDisabledReason={publishDisabledReason}
          requestArchive={requestArchive}
          requestLifecycleChange={requestLifecycleChange}
        />

        {lifecycleError ? (
          <Alert variant="destructive">
            <AlertTitle>Terjadi Masalah</AlertTitle>
            <AlertDescription>{lifecycleError}</AlertDescription>
          </Alert>
        ) : null}

        <QuestionBankMetadataCard
          assignedCategories={assignedCategories}
          bank={bank}
          categories={categories}
          descriptionInput={descriptionInput}
          folderLabel={folderLabel}
          formState={{
            isEditingDescription,
            isEditingTitle,
            isLocked: isMetadataLocked,
            isSavingDescription,
            isSavingTitle,
          }}
          handleCategoriesChange={handleCategoriesChange}
          handleSaveDescription={handleSaveDescription}
          handleSaveTitle={handleSaveTitle}
          setDescriptionInput={setDescriptionInput}
          setIsEditingDescription={setIsEditingDescription}
          setIsEditingTitle={setIsEditingTitle}
          setTitleInput={setTitleInput}
          subjectCoverage={subjectCoverage}
          titleInput={titleInput}
        />

        <QuestionBankQuestionsSection
          bank={bank}
          bankId={bankId}
          questions={questions}
          readiness={readiness}
        />
      </div>

      <QuestionBankArchiveConfirmationDialog
        confirmationRequest={confirmationRequest}
        onClose={() => setConfirmationRequest(null)}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankDetailPageModule };
