"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  bankQuestions,
  getSeedQuizContent,
  kaptenSubjects,
  questionBanks,
  type BankQuestion,
  type KaptenQuiz,
} from "@/modules/mentor/mock-data";
import { getQuestionBankSourceCatalog } from "@/modules/mentor/question-bank-draft-storage";
import { saveStandaloneQuizAction } from "@/modules/mentor/quiz-actions";
import { getStoredQuizDraft } from "@/modules/mentor/quiz-draft-storage";
import type {
  QuizBuilderState,
  QuizChoice,
  QuizQuestionSnapshot,
} from "@/modules/mentor/quiz-builder-types";

type LocalQuestionForm = {
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation: string;
  prompt: string;
};

type ConfirmationRequest = {
  confirmLabel: string;
  description: string;
  onConfirm: () => void;
  title: string;
};

const emptyLocalQuestion: LocalQuestionForm = {
  choices: [
    { id: "a", text: "" },
    { id: "b", text: "" },
    { id: "c", text: "" },
    { id: "d", text: "" },
  ],
  correctChoiceId: "a",
  explanation: "",
  prompt: "",
};

const QUESTIONS_PER_PAGE = 6;

function getSubjectName(subjectCode: string) {
  return kaptenSubjects.find((subject) => subject.code === subjectCode)?.name ?? subjectCode;
}

function toSnapshot(question: BankQuestion, idPrefix: string): QuizQuestionSnapshot {
  return {
    choices: question.choices.map((choice) => ({ ...choice })),
    correctChoiceId: question.correctChoiceId,
    explanation: question.explanation,
    explanationMediaAssetId: question.explanationMediaAssetId,
    id: `${idPrefix}-${question.id}`,
    origin: "bank",
    prompt: question.prompt,
    promptMediaAssetId: question.promptMediaAssetId,
    sourceQuestionId: question.id,
  };
}

function getInitialState(quiz?: KaptenQuiz | null): QuizBuilderState {
  const sourceBankId = quiz?.sourceBankId
    ?? questionBanks.find((bank) => bank.title === quiz?.sourceBank)?.id
    ?? "";
  const seedContent = getSeedQuizContent(quiz?.id);
  const seedQuestions = seedContent?.questions ?? (sourceBankId
    ? bankQuestions
        .filter((question) => question.bankId === sourceBankId)
        .slice(0, Math.min(3, quiz?.questionCount ?? 0))
        .map((question) => toSnapshot(question, `${quiz?.id ?? "new"}-snapshot`))
    : []);

  return {
    closesAt: quiz?.closesAt ?? "",
    description: quiz?.description ?? "",
    opensAt: quiz?.opensAt ?? "",
    questions: seedQuestions,
    sourceBankId,
    subjectCode: quiz?.subjectCode ?? "PU",
    title: quiz?.title ?? "Draft Quiz Baru",
  };
}

function getReadiness(questions: QuizQuestionSnapshot[]) {
  return questions.filter(
    (question) =>
      question.isReady !== false
      &&
      question.prompt.trim()
      && question.choices.length >= 2
      && question.choices.every((choice) => choice.text.trim())
      && question.choices.some((choice) => choice.id === question.correctChoiceId),
  ).length;
}

function KaptenQuizBuilderPageModule({
  initialQuiz = null,
  initialQuestions,
  mode,
  quizId,
  session,
}: {
  initialQuiz?: KaptenQuiz | null;
  initialQuestions?: QuizQuestionSnapshot[];
  mode: "create" | "edit";
  quizId?: string;
  session: SessionContext;
}) {
  const router = useRouter();
  const initialStoredDraft = initialQuiz ? null : getStoredQuizDraft(quizId);
  const [builderState, setBuilderState] = useState<QuizBuilderState>(() => {
    if (initialStoredDraft) {
      return {
        description: initialStoredDraft.quiz.description,
        closesAt: initialStoredDraft.quiz.closesAt ?? "",
        opensAt: initialStoredDraft.quiz.opensAt ?? "",
        questions: initialStoredDraft.questions,
        sourceBankId: initialStoredDraft.sourceBankId,
        subjectCode: initialStoredDraft.quiz.subjectCode ?? "PU",
        title: initialStoredDraft.quiz.title,
      };
    }

    return { ...getInitialState(initialQuiz), questions: initialQuestions ?? getInitialState(initialQuiz).questions };
  });
  const [savedQuiz, setSavedQuiz] = useState<KaptenQuiz | null>(
    () => initialStoredDraft?.quiz ?? initialQuiz,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingRouteReplacement, setPendingRouteReplacement] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("information");
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewQuestionIndex, setPreviewQuestionIndex] = useState(0);
  const [isAddingLocalQuestion, setIsAddingLocalQuestion] = useState(false);
  const [localQuestion, setLocalQuestion] = useState<LocalQuestionForm>(emptyLocalQuestion);
  const [questionSearchQuery, setQuestionSearchQuery] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const questionSequenceRef = useRef(0);
  const [sourceCatalog, setSourceCatalog] = useState(() => getQuestionBankSourceCatalog());

  useEffect(() => {
    const syncSourceCatalog = () => setSourceCatalog(getQuestionBankSourceCatalog());

    syncSourceCatalog();
    window.addEventListener("storage", syncSourceCatalog);
    window.addEventListener("vecalss-question-bank-drafts-change", syncSourceCatalog);
    return () => {
      window.removeEventListener("storage", syncSourceCatalog);
      window.removeEventListener("vecalss-question-bank-drafts-change", syncSourceCatalog);
    };
  }, []);

  const compatibleBanks = useMemo(
    () => sourceCatalog.filter(
      ({ bank, questions }) => bank.subjectCode === builderState.subjectCode && questions.length > 0,
    ),
    [builderState.subjectCode, sourceCatalog],
  );
  const selectedBankEntry = compatibleBanks.find(({ bank }) => bank.id === builderState.sourceBankId)
    ?? sourceCatalog.find(({ bank }) => bank.id === builderState.sourceBankId)
    ?? null;
  const selectedBank = selectedBankEntry?.bank ?? null;
  const selectedSourceQuestionIds = new Set(
    builderState.questions.flatMap((question) =>
      question.origin === "bank" && question.sourceQuestionId ? [question.sourceQuestionId] : [],
    ),
  );
  const availableBankQuestions = (selectedBankEntry?.questions ?? []).filter(
    (question) => !selectedSourceQuestionIds.has(question.id),
  );
  const filteredBankQuestions = useMemo(() => {
    const normalizedQuery = questionSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return availableBankQuestions;
    }

    return availableBankQuestions.filter((question) => [
      question.prompt,
      question.explanation,
      question.tags.join(" "),
      ...question.choices.map((choice) => choice.text),
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [availableBankQuestions, questionSearchQuery]);
  const questionPageCount = Math.max(1, Math.ceil(filteredBankQuestions.length / QUESTIONS_PER_PAGE));
  const paginatedBankQuestions = filteredBankQuestions.slice(
    (Math.min(questionPage, questionPageCount) - 1) * QUESTIONS_PER_PAGE,
    Math.min(questionPage, questionPageCount) * QUESTIONS_PER_PAGE,
  );
  const visibleQuestionPage = Math.min(questionPage, questionPageCount);
  const readyQuestionCount = getReadiness(builderState.questions);
  const quizStatus = savedQuiz?.status === "published" ? "published" : "draft";
  const isDraft = quizStatus === "draft";
  const saveLabel = isDraft ? "Simpan Draft" : "Simpan perubahan";
  const previewQuestion = builderState.questions[previewQuestionIndex];
  const scheduleError = builderState.opensAt && builderState.closesAt
    && new Date(builderState.closesAt) <= new Date(builderState.opensAt)
    ? "Waktu tutup harus setelah waktu buka."
    : null;
  const publishError = scheduleError
    ?? (!builderState.title.trim()
      ? "Isi judul quiz sebelum menerbitkan."
      : builderState.questions.length === 0
        ? "Tambahkan minimal satu soal sebelum menerbitkan."
        : readyQuestionCount !== builderState.questions.length
          ? "Lengkapi semua soal sebelum menerbitkan."
          : null);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!pendingRouteReplacement || hasUnsavedChanges) {
      return;
    }

    // Allow the shell to remove its same-URL history entry before replacing a
    // create URL. Otherwise Back would revisit the synthetic editor entry.
    const frame = window.requestAnimationFrame(() => {
      router.replace(pendingRouteReplacement);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [hasUnsavedChanges, pendingRouteReplacement, router]);

  function markChanged(nextState: QuizBuilderState) {
    setBuilderState(nextState);
    setHasUnsavedChanges(true);
  }

  function updateMetadata(
    field: Exclude<keyof QuizBuilderState, "questions" | "sourceBankId">,
    value: string,
  ) {
    markChanged({ ...builderState, [field]: value });
  }

  function closeConfirmation() {
    setConfirmationRequest(null);
  }

  function confirmPendingAction() {
    const pendingRequest = confirmationRequest;

    closeConfirmation();
    pendingRequest?.onConfirm();
  }

  function applySubject(nextSubjectCode: string, shouldClear: boolean) {
    markChanged({
      ...builderState,
      questions: shouldClear ? [] : builderState.questions,
      sourceBankId: shouldClear ? "" : builderState.sourceBankId,
      subjectCode: nextSubjectCode,
    });
    setQuestionPage(1);
    setQuestionSearchQuery("");
    setIsAddingLocalQuestion(false);
  }

  function selectSubject(nextSubjectCode: string) {
    if (nextSubjectCode === builderState.subjectCode) {
      return;
    }

    const needsClear = Boolean(builderState.sourceBankId || builderState.questions.length);
    if (needsClear) {
      setConfirmationRequest({
        confirmLabel: "Ubah subject",
        description: "Mengubah subject akan menghapus Question Bank dan semua soal yang sudah dipilih.",
        onConfirm: () => applySubject(nextSubjectCode, true),
        title: "Ubah subject quiz?",
      });
      return;
    }

    applySubject(nextSubjectCode, false);
  }

  function applySourceBank(nextSourceBankId: string) {
    markChanged({
      ...builderState,
      questions: [],
      sourceBankId: nextSourceBankId,
    });
    setQuestionPage(1);
    setQuestionSearchQuery("");
    setIsAddingLocalQuestion(false);
  }

  function selectSourceBank(nextSourceBankId: string) {
    if (nextSourceBankId === builderState.sourceBankId) {
      return;
    }

    if (builderState.questions.length > 0) {
      setConfirmationRequest({
        confirmLabel: "Ganti Question Bank",
        description: "Mengganti Question Bank akan menghapus semua soal yang sudah dipilih, termasuk soal lokal.",
        onConfirm: () => applySourceBank(nextSourceBankId),
        title: "Ganti Question Bank?",
      });
      return;
    }

    applySourceBank(nextSourceBankId);
  }

  function addBankQuestion(question: BankQuestion) {
    if (selectedSourceQuestionIds.has(question.id)) {
      return;
    }

    markChanged({
      ...builderState,
      questions: [
        ...builderState.questions,
        toSnapshot(question, `snapshot-${++questionSequenceRef.current}`),
      ],
    });
  }

  function removeQuestion(questionId: string) {
    const nextQuestions = builderState.questions.filter((question) => question.id !== questionId);
    markChanged({ ...builderState, questions: nextQuestions });
    setPreviewQuestionIndex((index) => Math.max(0, Math.min(index, nextQuestions.length - 1)));
  }

  function moveQuestion(questionId: string, direction: "up" | "down") {
    const currentIndex = builderState.questions.findIndex((question) => question.id === questionId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex < 0
      || nextIndex < 0
      || nextIndex >= builderState.questions.length
    ) {
      return;
    }

    const questions = [...builderState.questions];
    const [movedQuestion] = questions.splice(currentIndex, 1);
    if (!movedQuestion) {
      return;
    }

    questions.splice(nextIndex, 0, movedQuestion);
    markChanged({ ...builderState, questions });
  }

  function updateLocalChoice(choiceId: string, text: string) {
    setLocalQuestion((current) => ({
      ...current,
      choices: current.choices.map((choice) =>
        choice.id === choiceId ? { ...choice, text } : choice,
      ),
    }));
  }

  function addLocalQuestion() {
    const isValid =
      localQuestion.prompt.trim()
      && localQuestion.choices.every((choice) => choice.text.trim())
      && localQuestion.choices.some((choice) => choice.id === localQuestion.correctChoiceId);

    if (!isValid || !builderState.sourceBankId) {
      return;
    }

    markChanged({
      ...builderState,
      questions: [
        ...builderState.questions,
        {
          choices: localQuestion.choices.map((choice) => ({ ...choice })),
          correctChoiceId: localQuestion.correctChoiceId,
          explanation: localQuestion.explanation,
          id: `local-${Date.now()}`,
          origin: "local",
          prompt: localQuestion.prompt,
        },
      ],
    });
    setLocalQuestion(emptyLocalQuestion);
    setIsAddingLocalQuestion(false);
  }

  async function saveQuiz(status: "draft" | "published" = quizStatus) {
    const currentQuiz = savedQuiz;
    const result = await saveStandaloneQuizAction({
      closesAt: builderState.closesAt,
      description: builderState.description,
      id: currentQuiz?.id,
      opensAt: builderState.opensAt,
      questions: builderState.questions,
      status,
      subjectCode: builderState.subjectCode,
      title: builderState.title,
    });
    if (!result.ok) return;
    setSavedQuiz(result.quiz);
    setHasUnsavedChanges(false);

    if (!quizId) {
      setPendingRouteReplacement(result.quiz.href);
    }
  }

  function publishQuiz() {
    if (publishError) {
      setActiveTab(scheduleError ? "settings" : "information");
      return;
    }

    saveQuiz("published");
  }

  function unpublishQuiz() {
    saveQuiz("draft");
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Quiz"
      breadcrumbLabel={mode === "create" ? "Buat Quiz" : "Edit Quiz"}
      mainClassName="max-w-[1500px] gap-7"
      onNavigateAway={() => !hasUnsavedChanges}
      searchPlaceholder="Cari quiz atau question bank..."
      session={session}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button render={<Link href="/mentor/quiz" />} size="sm" variant="ghost">
            <ArrowLeft />
            Quiz
          </Button>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
              {mode === "create" ? "Buat Quiz" : builderState.title}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-2 text-sm font-medium text-secondary-600",
                hasUnsavedChanges
                  ? "text-[#856300]"
                  : "text-primary-800",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700",
                )}
              />
              {hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
            </span>
          </div>
          {builderState.questions.length > 0 ? (
            <p className="mt-2 text-sm text-secondary-500">
              {readyQuestionCount}/{builderState.questions.length} soal siap
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={builderState.questions.length === 0}
            onClick={() => {
              setPreviewQuestionIndex(0);
              setIsPreviewOpen(true);
            }}
            type="button"
            variant="brandOutline"
          >
            <Eye />
            Preview
          </Button>
          <Button onClick={() => saveQuiz()} type="button" variant="brand">
            <Save />
            {saveLabel}
          </Button>
          {isDraft ? (
            <Button disabled={Boolean(publishError)} onClick={publishQuiz} type="button" variant="brandOutline">
              Terbitkan
            </Button>
          ) : (
            <Button
              onClick={() => setConfirmationRequest({
                confirmLabel: "Batalkan publikasi",
                description: "Quiz tidak lagi dapat diakses siswa dan kembali menjadi draf.",
                onConfirm: unpublishQuiz,
                title: "Batalkan publikasi quiz?",
              })}
              type="button"
              variant="brandOutline"
            >
              Batalkan publikasi
            </Button>
          )}
        </div>
      </section>

      {isPreviewOpen ? (
            <section aria-live="polite" className="rounded-3xl border border-primary-100 bg-white px-5 py-6 shadow-sm md:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-primary-800">Preview learner</p>
                  <h2 className="mt-2 text-2xl font-semibold text-secondary-900">
                    {builderState.title}
                  </h2>
                  <p className="mt-2 text-sm text-secondary-500">
                    {getSubjectName(builderState.subjectCode)} · Soal {previewQuestionIndex + 1} dari {builderState.questions.length}
                  </p>
                </div>
                <Button onClick={() => setIsPreviewOpen(false)} size="sm" type="button" variant="brandOutline">
                  Kembali mengedit
                </Button>
              </div>

              {previewQuestion ? (
                <div className="mx-auto mt-8 max-w-3xl">
                  <div className="flex items-center justify-between text-xs font-semibold tracking-[0.08em] text-secondary-400 uppercase">
                    <span>Question {String(previewQuestionIndex + 1).padStart(2, "0")}</span>
                    <span>{previewQuestion.origin === "local" ? "Soal lokal" : "Question Bank"}</span>
                  </div>
                  <h3 className="mt-5 text-xl leading-8 font-semibold text-secondary-900 md:text-2xl">
                    {previewQuestion.prompt}
                  </h3>
                  {previewQuestion.promptMediaAssetId ? (
                    <MediaAssetPreview
                      alt="Gambar pertanyaan"
                      assetId={previewQuestion.promptMediaAssetId}
                      className="mt-5"
                    />
                  ) : null}
                  <div className="mt-6 space-y-3">
                    {previewQuestion.choices.map((choice, index) => (
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 px-4 py-4 text-sm text-secondary-700 transition hover:border-primary-300 hover:bg-primary-50/50" key={`${previewQuestion.id}-${choice.id}`}>
                        <input className="size-4 accent-primary-700" name={`preview-answer-${previewQuestion.id}`} type="radio" />
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-3">
                          <span>{choice.text}</span>
                          {choice.mediaAssetId ? (
                            <MediaAssetPreview
                              alt={`Gambar opsi ${String.fromCharCode(65 + index)}`}
                              assetId={choice.mediaAssetId}
                              className="max-h-44"
                            />
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-8 flex items-center justify-between gap-3 border-t border-primary-100 pt-5">
                    <Button
                      disabled={previewQuestionIndex === 0}
                      onClick={() => setPreviewQuestionIndex((index) => index - 1)}
                      type="button"
                      variant="ghost"
                    >
                      <ChevronLeft />
                      Sebelumnya
                    </Button>
                    <span className="text-sm font-semibold text-secondary-500">
                      {previewQuestionIndex + 1}/{builderState.questions.length}
                    </span>
                    <Button
                      disabled={previewQuestionIndex >= builderState.questions.length - 1}
                      onClick={() => setPreviewQuestionIndex((index) => index + 1)}
                      type="button"
                      variant="brandOutline"
                    >
                      Berikutnya
                      <ChevronRight />
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
      ) : (
        <Tabs className="gap-8" onValueChange={setActiveTab} value={activeTab}>
          <div className="border-b border-primary-100">
            <TabsList className="h-auto gap-4 rounded-none bg-transparent p-0" variant="line">
              <TabsTrigger className="h-11 rounded-none px-1 text-sm" value="information">
                Informasi quiz
              </TabsTrigger>
              <TabsTrigger className="h-11 rounded-none px-1 text-sm" value="content">
                Isi quiz
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">
                  {builderState.questions.length}
                </span>
              </TabsTrigger>
              <TabsTrigger className="h-11 rounded-none px-1 text-sm" value="settings">
                Pengaturan
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="m-0" value="information">
            <section className="w-full">
                <div className="grid gap-5 lg:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="quiz-title">Judul quiz</FieldLabel>
                    <FieldInput id="quiz-title" onChange={(event) => updateMetadata("title", event.target.value)} value={builderState.title} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="quiz-subject">Subject</FieldLabel>
                    <div className="relative">
                      <select className={`${fieldControlClassName} appearance-none pr-12`} id="quiz-subject" onChange={(event) => selectSubject(event.target.value)} value={builderState.subjectCode}>
                        {kaptenSubjects.map((subject) => (
                          <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="quiz-bank">Question Bank</FieldLabel>
                    <div className="relative">
                      <select className={`${fieldControlClassName} appearance-none pr-12`} id="quiz-bank" onChange={(event) => selectSourceBank(event.target.value)} value={builderState.sourceBankId}>
                        <option value="">Pilih Question Bank</option>
                        {compatibleBanks.map(({ bank }) => (
                          <option key={bank.id} value={bank.id}>{bank.title} · {bank.questionCount} soal</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
                    </div>
                  </Field>
                  <Field className="lg:col-span-2">
                    <FieldLabel htmlFor="quiz-summary">Ringkasan</FieldLabel>
                    <FieldTextarea className="min-h-[100px]" id="quiz-summary" onChange={(event) => updateMetadata("description", event.target.value)} value={builderState.description} />
                  </Field>
                </div>
            </section>
          </TabsContent>

          <TabsContent className="m-0" value="settings">
            <section className="max-w-3xl rounded-3xl border border-primary-100 bg-white p-5 md:p-6">
              <div>
                <h2 className="text-lg font-semibold text-secondary-900">Ketersediaan untuk siswa</h2>
                <p className="mt-1 text-sm leading-6 text-secondary-500">
                  Pengaturan ini opsional. Jika keduanya kosong, quiz yang diterbitkan langsung dapat diakses siswa.
                </p>
              </div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="quiz-opens-at">Mulai dibuka</FieldLabel>
                  <FieldInput id="quiz-opens-at" onChange={(event) => updateMetadata("opensAt", event.target.value)} type="datetime-local" value={builderState.opensAt} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quiz-closes-at">Tutup akses</FieldLabel>
                  <FieldInput id="quiz-closes-at" onChange={(event) => updateMetadata("closesAt", event.target.value)} type="datetime-local" value={builderState.closesAt} />
                </Field>
              </div>
              {scheduleError ? (
                <p className="mt-4 text-sm font-medium text-red-700">{scheduleError}</p>
              ) : null}
              {isDraft && publishError && !scheduleError ? (
                <p className="mt-4 text-sm text-secondary-500">Quiz perlu memiliki judul dan semua soal siap sebelum diterbitkan.</p>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent className="m-0" value="content">
            <section className="grid gap-8 xl:grid-cols-[minmax(270px,0.3fr)_minmax(0,0.7fr)]">
              <aside className="order-2 border-t border-primary-100 pt-5 xl:order-none xl:border-t-0 xl:border-r xl:pr-7 xl:pt-1">
                <div>
                  <p className="text-sm font-semibold text-secondary-900">Susunan soal</p>
                  <p className="mt-1 text-xs text-secondary-500">{builderState.questions.length} dipilih</p>
                </div>
                <div className="mt-4 flex gap-1 overflow-x-auto border-t border-primary-100 pt-3 xl:mt-5 xl:block xl:space-y-1">
                  {builderState.questions.length > 0 ? (
                    builderState.questions.map((question, index) => (
                      <div className="flex min-w-[215px] items-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-primary-50/60 xl:w-full" key={question.id}>
                        <GripVertical className="size-4 shrink-0 text-secondary-300" />
                        <button className="min-w-0 flex-1 text-left" onClick={() => { setActiveTab("content"); setPreviewQuestionIndex(index); setIsPreviewOpen(true); }} type="button">
                          <span className="block truncate text-sm font-semibold text-secondary-900">{String(index + 1).padStart(2, "0")}. {question.prompt || "Soal tanpa pertanyaan"}</span>
                          <span className="mt-1 block text-xs text-secondary-500">{question.origin === "local" ? "Soal lokal" : selectedBank?.title ?? "Question Bank"}</span>
                        </button>
                        <div className="flex shrink-0 items-center">
                          <Button aria-label="Pindah soal ke atas" onClick={() => moveQuestion(question.id, "up")} size="icon-sm" type="button" variant="ghost"><ArrowUp className="size-3.5" /></Button>
                          <Button aria-label="Pindah soal ke bawah" onClick={() => moveQuestion(question.id, "down")} size="icon-sm" type="button" variant="ghost"><ArrowDown className="size-3.5" /></Button>
                          <Button aria-label="Hapus soal" onClick={() => removeQuestion(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-4 text-sm leading-6 text-secondary-500">Belum ada soal di quiz ini.</p>
                  )}
                </div>
              </aside>

              <div className="order-1 xl:order-none">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-secondary-900">Pilih soal</p>
                    <p className="mt-1 text-sm text-secondary-500">
                      {selectedBank ? `Soal dari ${selectedBank.title} akan disalin ke quiz ini.` : "Pilih Question Bank yang sesuai dengan subject terlebih dahulu."}
                    </p>
                  </div>
                  <Button disabled={!selectedBank} onClick={() => setIsAddingLocalQuestion((current) => !current)} type="button" variant="brandOutline">
                    <Plus />
                    Soal lokal
                  </Button>
                </div>

                {selectedBank ? (
                  <div className="mt-5 grid gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="relative block min-w-0 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" />
                        <Input aria-label="Cari soal" className="h-11 rounded-xl border border-primary-100 bg-white pl-10" onChange={(event) => { setQuestionSearchQuery(event.target.value); setQuestionPage(1); }} placeholder="Cari pertanyaan, pilihan jawaban, atau tag..." value={questionSearchQuery} />
                      </label>
                      <p aria-live="polite" className="text-sm text-secondary-500">
                        {filteredBankQuestions.length} soal tersedia
                      </p>
                    </div>

                    {paginatedBankQuestions.length > 0 ? paginatedBankQuestions.map((question) => (
                      <div className="flex flex-col gap-4 rounded-2xl border border-primary-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between" key={question.id}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-secondary-400">
                            <span>{question.difficulty === "easy" ? "Mudah" : question.difficulty === "medium" ? "Sedang" : "Sulit"}</span>
                            <span>·</span>
                            <span>{question.tags.join(", ")}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 font-semibold text-secondary-900">{question.prompt}</p>
                        </div>
                        <Button className="shrink-0" onClick={() => addBankQuestion(question)} size="sm" type="button" variant="brandOutline">
                          <Plus />
                          Tambah
                        </Button>
                      </div>
                    )) : (
                      <div className="rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-500">
                        {availableBankQuestions.length === 0
                          ? "Semua soal dari bank ini sudah dipilih. Tambahkan soal lokal bila masih diperlukan."
                          : "Tidak ada soal yang sesuai dengan pencarian ini."}
                      </div>
                    )}

                    {filteredBankQuestions.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4">
                        <p className="text-sm text-secondary-500">Halaman {visibleQuestionPage} dari {questionPageCount}</p>
                        <div className="flex items-center gap-2">
                          <Button aria-label="Halaman sebelumnya" disabled={visibleQuestionPage === 1} onClick={() => setQuestionPage(visibleQuestionPage - 1)} size="sm" type="button" variant="brandOutline"><ChevronLeft /> Sebelumnya</Button>
                          <Button aria-label="Halaman berikutnya" disabled={visibleQuestionPage === questionPageCount} onClick={() => setQuestionPage(visibleQuestionPage + 1)} size="sm" type="button" variant="brandOutline">Berikutnya <ChevronRight /></Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-500">
                    <CircleHelp className="mt-0.5 size-5 shrink-0 text-primary-800" />
                    <p>
                      {compatibleBanks.length === 0
                        ? "Belum ada Question Bank yang sesuai dengan subject ini. "
                        : "Question Bank yang tampil akan selalu mengikuti subject Quiz. "}
                      {compatibleBanks.length === 0 ? (
                        <Link className="font-semibold text-primary-800 underline underline-offset-4" href="/mentor/quiz/question-bank">
                          Buka Question Bank
                        </Link>
                      ) : null}
                    </p>
                  </div>
                )}

                {isAddingLocalQuestion && selectedBank ? (
                  <div className="mt-5 rounded-3xl border border-primary-200 bg-primary-50/45 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-secondary-900">Soal pilihan ganda lokal</p>
                        <p className="mt-1 text-sm text-secondary-500">Soal ini hanya tersimpan dalam Quiz, bukan Question Bank.</p>
                      </div>
                      <Button aria-label="Tutup formulir soal lokal" onClick={() => setIsAddingLocalQuestion(false)} size="icon-sm" type="button" variant="ghost">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-5 grid gap-5">
                      <Field>
                        <FieldLabel htmlFor="local-question-prompt">Pertanyaan</FieldLabel>
                        <FieldTextarea id="local-question-prompt" onChange={(event) => setLocalQuestion((current) => ({ ...current, prompt: event.target.value }))} value={localQuestion.prompt} />
                      </Field>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {localQuestion.choices.map((choice, index) => (
                          <label className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-3" key={choice.id}>
                            <input aria-label={`Jawaban benar opsi ${index + 1}`} checked={choice.id === localQuestion.correctChoiceId} className="size-4 accent-primary-700" name="local-correct-choice" onChange={() => setLocalQuestion((current) => ({ ...current, correctChoiceId: choice.id }))} type="radio" />
                            <span className="text-xs font-semibold text-primary-800">{String.fromCharCode(65 + index)}</span>
                            <input aria-label={`Opsi ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400" onChange={(event) => updateLocalChoice(choice.id, event.target.value)} placeholder={`Opsi ${String.fromCharCode(65 + index)}`} value={choice.text} />
                          </label>
                        ))}
                      </div>
                      <Field>
                        <FieldLabel htmlFor="local-question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel>
                        <FieldTextarea id="local-question-explanation" onChange={(event) => setLocalQuestion((current) => ({ ...current, explanation: event.target.value }))} value={localQuestion.explanation} />
                      </Field>
                      <div>
                        <Button disabled={!localQuestion.prompt.trim() || localQuestion.choices.some((choice) => !choice.text.trim())} onClick={addLocalQuestion} type="button" variant="brand">
                          <Plus />
                          Tambahkan ke Quiz
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}
      <Dialog
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeConfirmation();
          }
        }}
        open={Boolean(confirmationRequest)}
      >
        <DialogContent className="gap-5 border-red-100 bg-white p-6 sm:max-w-3xl" showCloseButton={false}>
          <Alert className="border-red-200 bg-transparent text-secondary-900" variant="destructive">
            <CircleHelp className="text-red-700" />
            <AlertTitle>
              <DialogTitle className="font-semibold text-secondary-900">
                {confirmationRequest?.title}
              </DialogTitle>
            </AlertTitle>
            <AlertDescription className="mt-1 text-red-700">
              <DialogDescription className="whitespace-normal text-red-700 sm:whitespace-nowrap">
                {confirmationRequest?.description}
              </DialogDescription>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button onClick={closeConfirmation} type="button" variant="brandOutline">
              Batal
            </Button>
            <Button className="border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:border-red-700 focus-visible:ring-red-700/25" onClick={confirmPendingAction} type="button" variant="destructive">
              {confirmationRequest?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizBuilderPageModule };
