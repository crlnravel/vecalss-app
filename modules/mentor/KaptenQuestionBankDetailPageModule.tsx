"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AlertTriangle,
  Check,
  ChevronLeft,
  CircleHelp,
  Folder,
  LibraryBig,
  Pencil,
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
import type {
  BankQuestion,
  KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  saveQuestionBankAction,
  updateQuestionBankLifecycleAction,
} from "@/modules/mentor/question-bank-actions";

type ConfirmationRequest = {
  actionVariant?: "brand" | "destructive";
  confirmLabel: string;
  description: string;
  dialogVariant?: "default" | "info" | "warning" | "danger" | "success";
  onConfirm: () => void;
  title: string;
};

type QuestionBankDetailTab = "soal" | "pengaturan";

function QuestionBankStatusAction({
  bank,
  handleLifecycle,
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  if (bank.status === "archived") {
    return (
      <Button
        aria-busy={isSavingLifecycle}
        disabled={isSavingLifecycle}
        onClick={() => void handleLifecycle("restore")}
        size="sm"
        type="button"
        variant="brandOutline"
      >
        <Upload />
        {isSavingLifecycle ? "Membatalkan arsip…" : "Batalkan arsip"}
      </Button>
    );
  }

  return (
    <Button
      aria-busy={isSavingLifecycle}
      aria-label="Arsipkan bank soal"
      data-question-bank-lifecycle-action="archive"
      disabled={isSavingLifecycle}
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
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <QuestionBankStatusAction
        bank={bank}
        handleLifecycle={handleLifecycle}
        isSavingLifecycle={isSavingLifecycle}
        requestArchive={requestArchive}
      />
    </div>
  );
}

function QuestionBankDetailHeaderBar({
  bank,
}: {
  bank: KaptenQuestionBank;
}) {
  const navigationLabel = questionBankNavigationLabel(bank.purpose ?? "quiz");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          aria-label={`Kembali ke ${navigationLabel}`}
          nativeButton={false}
          render={
            <Link
              href={`/mentor/quiz/question-bank?purpose=${bank.purpose ?? "quiz"}`}
            />
          }
          size="icon-sm"
          title={`Kembali ke ${navigationLabel}`}
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
      </div>
    </div>
  );
}

function QuestionBankArchiveSection({
  bank,
  handleLifecycle,
  isSavingLifecycle,
  requestArchive,
}: {
  bank: KaptenQuestionBank;
  handleLifecycle: (operation: "archive" | "restore") => Promise<void>;
  isSavingLifecycle: boolean;
  requestArchive: () => void;
}) {
  return (
    <ReferenceSurface as="section" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-secondary-900">
            Administrasi
          </h2>
        </div>
        <QuestionBankLifecycleActions
          bank={bank}
          handleLifecycle={handleLifecycle}
          isSavingLifecycle={isSavingLifecycle}
          requestArchive={requestArchive}
        />
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
  const editorLocked = bank.status === "archived";
  const editorLockReason =
    "Untuk mengedit kembali, batalkan arsip Bank Soal terlebih dahulu.";
  const editorButton = (
    <Button
      aria-label="Buka Editor"
      className="w-full shadow-sm"
      disabled={editorLocked}
      nativeButton={editorLocked}
      render={
        editorLocked ? undefined : (
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

  if (!editorLocked) return editorButton;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="flex w-full" />}>
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
  questions,
  readiness,
}: {
  bank: KaptenQuestionBank;
  bankId: string;
  questions: BankQuestion[];
  readiness: QuestionBankReadiness;
}) {
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
      </div>

      <QuestionBankEditorButton bank={bank} bankId={bankId} />

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

function KaptenQuestionBankDetailPageModule({
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
  const [bank, setBank] = useState<KaptenQuestionBank>(initialBank);
  const [activeTab, setActiveTab] =
    useState<QuestionBankDetailTab>(initialTab);
  const [questions] = useState<BankQuestion[]>(initialQuestions);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(bank.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(
    bank.description ?? "",
  );
  const [isSavingDescription, setIsSavingDescription] = useState(false);

  const [isSavingLifecycle, setIsSavingLifecycle] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [confirmationRequest, setConfirmationRequest] =
    useState<ConfirmationRequest | null>(null);

  const readiness =
    initialReadiness ?? getQuestionBankReadinessFromDrafts(questions);
  const isMetadataLocked = bank.status === "archived";

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
      setLifecycleError(
        err instanceof Error ? err.message : "Gagal mengubah judul bank soal.",
      );
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
      setLifecycleError(
        err instanceof Error
          ? err.message
          : "Gagal mengubah deskripsi bank soal.",
      );
    } finally {
      setIsSavingDescription(false);
    }
  }

  async function handleLifecycle(
    operation: "archive" | "restore",
  ) {
    setIsSavingLifecycle(true);
    setLifecycleError(null);
    try {
      const result = await updateQuestionBankLifecycleAction(
        bank.id,
        operation,
        {
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
        archive: "Bank Soal diarsipkan.",
        restore: "Bank Soal dipulihkan.",
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
        "Bank soal yang diarsipkan tidak dapat digunakan untuk membuat soal hingga dipulihkan.",
      onConfirm: () => {
        setConfirmationRequest(null);
        void handleLifecycle("archive");
      },
      title: "Arsipkan Bank Soal?",
    });
  }

  const navigationLabel = questionBankNavigationLabel(bank.purpose ?? "quiz");

  return (
    <MentorWorkspaceShell
      activeLabel={navigationLabel}
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
        />

        <QuestionBankMetadataCard
          bank={bank}
          descriptionInput={descriptionInput}
          folderLabel={folderLabel}
          formState={{
            isEditingDescription,
            isEditingTitle,
            isLocked: isMetadataLocked,
            isSavingDescription,
            isSavingTitle,
          }}
          handleSaveDescription={handleSaveDescription}
          handleSaveTitle={handleSaveTitle}
          setDescriptionInput={setDescriptionInput}
          setIsEditingDescription={setIsEditingDescription}
          setIsEditingTitle={setIsEditingTitle}
          setTitleInput={setTitleInput}
          materiCoverage={materiCoverage}
          subjectCoverage={subjectCoverage}
          titleInput={titleInput}
        />

        {lifecycleError ? (
          <Alert variant="destructive">
            <AlertTitle>Terjadi Masalah</AlertTitle>
            <AlertDescription>{lifecycleError}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs
          className="w-full min-w-0 gap-7"
          onValueChange={changeTab}
          value={activeTab}
        >
          <FullWidthLineTabsList aria-label="Bagian detail Bank Soal">
            <FullWidthLineTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="soal"
            >
              Soal
            </FullWidthLineTabsTrigger>
            <FullWidthLineTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="pengaturan"
            >
              Pengaturan
            </FullWidthLineTabsTrigger>
          </FullWidthLineTabsList>
          <TabsContent className="m-0" value="soal">
            <QuestionBankQuestionsSection
              bank={bank}
              bankId={bankId}
              questions={questions}
              readiness={readiness}
            />
          </TabsContent>
          <TabsContent className="m-0" value="pengaturan">
            <QuestionBankArchiveSection
              bank={bank}
              handleLifecycle={handleLifecycle}
              isSavingLifecycle={isSavingLifecycle}
              requestArchive={requestArchive}
            />
          </TabsContent>
        </Tabs>
      </div>

      <QuestionBankArchiveConfirmationDialog
        confirmationRequest={confirmationRequest}
        onClose={() => setConfirmationRequest(null)}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankDetailPageModule };
