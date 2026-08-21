"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Archive,
  ChevronLeft,
  ArrowUp,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Eye,
  GripVertical,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { DropdownField } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  bankQuestions,
  getSeedQuizContent,
  kaptenSubjects,
  questionBanks,
  type BankQuestion,
  type KaptenQuestionBank,
  type KaptenQuiz,
} from "@/modules/mentor/mock-data";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { saveStandaloneQuizAction, updateStandaloneQuizLifecycleAction } from "@/modules/mentor/quiz-actions";
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
  variant: "danger" | "warning";
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
const SOURCE_BANK_PAGE_SIZE = 20;
const SOURCE_QUESTION_PAGE_SIZE = 100;

type SourceCatalogEntry = { bank: KaptenQuestionBank; questions: BankQuestion[] };
type SourceCatalogPage = { page: number; pageSize: number; total: number };
type SourceCategory = { id: string; name: string };

function getSubjectName(subjectCode: string) {
  return kaptenSubjects.find((subject) => subject.code === subjectCode)?.name ?? subjectCode;
}

function getBankOrganizationLabel(bank: KaptenQuestionBank) {
  const folderName = bank.folderPath?.at(-1)?.name;
  const categoryNames = bank.categories?.map((category) => category.name).join(", ");
  return [bank.title, `${bank.questionCount} soal`, categoryNames, folderName].filter(Boolean).join(" · ");
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
    sourceContentDigest: question.questionContentDigest,
    sourceQuestionId: question.id,
    sourceQuestionRevisionId: question.questionRevisionId,
    sourceRevisionProvenance: question.questionRevisionProvenance,
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
    attemptsAllowed: quiz?.attemptsAllowed === undefined ? 1 : quiz.attemptsAllowed,
    closesAt: quiz?.closesAt ?? "",
    correctAnswerVisibility: quiz?.correctAnswerVisibility ?? "show",
    description: quiz?.description ?? "",
    formBehavior: quiz?.formBehavior ?? "same",
    opensAt: quiz?.opensAt ?? "",
    questions: seedQuestions,
    retryDelaySeconds: quiz?.retryDelaySeconds ?? null,
    reviewTiming: quiz?.reviewTiming ?? "immediate",
    scorePolicy: quiz?.scorePolicy ?? "latest",
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

function createQuizBuilderActions({
  builderState,
  confirmationRequest,
  localQuestion,
  selectedSourceQuestionIds,
  setBuilderState,
  setConfirmationRequest,
  setHasUnsavedChanges,
  setIsAddingLocalQuestion,
  setLocalQuestion,
  setPreviewQuestionIndex,
  setQuestionPage,
  setQuestionSearchQuery,
  setSourceQuestionPage,
  setSourceQuestionTotal,
}: {
  builderState: QuizBuilderState;
  confirmationRequest: ConfirmationRequest | null;
  localQuestion: LocalQuestionForm;
  selectedSourceQuestionIds: Set<string>;
  setBuilderState: (nextState: QuizBuilderState) => void;
  setConfirmationRequest: (request: ConfirmationRequest | null) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setIsAddingLocalQuestion: (isAdding: boolean) => void;
  setLocalQuestion: (nextQuestion: LocalQuestionForm | ((current: LocalQuestionForm) => LocalQuestionForm)) => void;
  setPreviewQuestionIndex: (nextIndex: number | ((current: number) => number)) => void;
  setQuestionPage: (page: number) => void;
  setQuestionSearchQuery: (query: string) => void;
  setSourceQuestionPage: (page: number) => void;
  setSourceQuestionTotal: (total: number) => void;
}) {
  function markChanged(nextState: QuizBuilderState) {
    setBuilderState(nextState);
    setHasUnsavedChanges(true);
  }

  function updateMetadata(
    field: Exclude<keyof QuizBuilderState, "questions" | "sourceBankId" | "attemptsAllowed" | "retryDelaySeconds" | "correctAnswerVisibility" | "formBehavior" | "reviewTiming" | "scorePolicy">,
    value: string,
  ) {
    markChanged({ ...builderState, [field]: value });
  }

  function updatePolicy<K extends "attemptsAllowed" | "retryDelaySeconds" | "scorePolicy" | "formBehavior" | "reviewTiming" | "correctAnswerVisibility">(field: K, value: QuizBuilderState[K]) {
    markChanged({ ...builderState, [field]: value } as QuizBuilderState);
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
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setIsAddingLocalQuestion(false);
  }

  function selectSubject(nextSubjectCode: string) {
    if (nextSubjectCode === builderState.subjectCode) return;

    const needsClear = Boolean(builderState.sourceBankId || builderState.questions.length);
    if (needsClear) {
      setConfirmationRequest({
        confirmLabel: "Ubah subject",
        description: "Mengubah subject akan menghapus Question Bank dan semua soal yang sudah dipilih.",
        onConfirm: () => applySubject(nextSubjectCode, true),
        title: "Ubah subject quiz?",
        variant: "danger",
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
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setIsAddingLocalQuestion(false);
  }

  function selectSourceBank(nextSourceBankId: string) {
    if (nextSourceBankId === builderState.sourceBankId) return;

    if (builderState.questions.length > 0) {
      setConfirmationRequest({
        confirmLabel: "Ganti Question Bank",
        description: "Mengganti Question Bank akan menghapus semua soal yang sudah dipilih, termasuk soal lokal.",
        onConfirm: () => applySourceBank(nextSourceBankId),
        title: "Ganti Question Bank?",
        variant: "danger",
      });
      return;
    }

    applySourceBank(nextSourceBankId);
  }

  function addBankQuestion(question: BankQuestion) {
    if (selectedSourceQuestionIds.has(question.id)) return;

    markChanged({
      ...builderState,
      questions: [
        ...builderState.questions,
        toSnapshot(question, `snapshot-${Date.now()}-${question.id}`),
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

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= builderState.questions.length) return;

    const questions = [...builderState.questions];
    const [movedQuestion] = questions.splice(currentIndex, 1);
    if (!movedQuestion) return;

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

    if (!isValid) return;

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

  return {
    addBankQuestion,
    addLocalQuestion,
    closeConfirmation,
    confirmPendingAction,
    moveQuestion,
    removeQuestion,
    selectSourceBank,
    selectSubject,
    updateLocalChoice,
    updateMetadata,
    updatePolicy,
  };
}

function KaptenQuizBuilderPageModule({
  initialQuiz = null,
  initialQuestions,
  sourceCatalog,
  mode,
  quizId,
  session,
  sourceCatalogPage,
  sourceCategories = [],
}: {
  initialQuiz?: KaptenQuiz | null;
  initialQuestions?: QuizQuestionSnapshot[];
  sourceCatalog: SourceCatalogEntry[];
  sourceCatalogPage?: SourceCatalogPage;
  sourceCategories?: SourceCategory[];
  mode: "create" | "edit";
  quizId?: string;
  session: SessionContext;
}) {
  const router = useRouter();
  const [builderState, setBuilderState] = useState<QuizBuilderState>(() => {
    return { ...getInitialState(initialQuiz), questions: initialQuestions ?? getInitialState(initialQuiz).questions };
  });
  const [savedQuiz, setSavedQuiz] = useState<KaptenQuiz | null>(
    () => initialQuiz,
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
  const [sourceBankCategoryFilter, setSourceBankCategoryFilter] = useState("");
  const [sourceBankSearchQuery, setSourceBankSearchQuery] = useState("");
  const [sourceEntries, setSourceEntries] = useState<SourceCatalogEntry[]>(sourceCatalog);
  const [sourceBankPage, setSourceBankPage] = useState(sourceCatalogPage?.page ?? 1);
  const [sourceBankTotal, setSourceBankTotal] = useState(sourceCatalogPage?.total ?? sourceCatalog.length);
  const [sourceBankLoading, setSourceBankLoading] = useState(false);
  const [sourceQuestionPage, setSourceQuestionPage] = useState(1);
  const [sourceQuestionTotal, setSourceQuestionTotal] = useState(0);
  const [sourceQuestionLoading, setSourceQuestionLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceBankLoading(true);
      try {
        const result = await listQuestionBankSourcePageAction({
          categoryId: sourceBankCategoryFilter || undefined,
          page: sourceBankPage,
          pageSize: SOURCE_BANK_PAGE_SIZE,
          search: sourceBankSearchQuery,
          subjectCoverage: builderState.subjectCode ? [builderState.subjectCode] : undefined,
        });
        if (cancelled) return;
        setSourceEntries((current) => {
          const selected = current.find(({ bank }) => bank.id === builderState.sourceBankId);
          const next = result.items.map(({ bank }) => ({ bank, questions: current.find((entry) => entry.bank.id === bank.id)?.questions ?? [] }));
          return selected && !next.some(({ bank }) => bank.id === selected.bank.id) ? [selected, ...next] : next;
        });
        setSourceBankTotal(result.total);
      } finally {
        if (!cancelled) setSourceBankLoading(false);
      }
    }, sourceBankSearchQuery.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [builderState.sourceBankId, builderState.subjectCode, sourceBankCategoryFilter, sourceBankPage, sourceBankSearchQuery]);

  useEffect(() => {
    if (!builderState.sourceBankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceQuestionLoading(true);
      try {
        const result = await listQuestionBankSourceQuestionsAction(builderState.sourceBankId, {
          page: sourceQuestionPage,
          pageSize: SOURCE_QUESTION_PAGE_SIZE,
          search: questionSearchQuery,
          subjectCode: builderState.subjectCode,
        });
        if (cancelled || !result) return;
        setSourceQuestionTotal(result.total);
        setSourceEntries((current) => {
          const existing = current.find(({ bank }) => bank.id === builderState.sourceBankId);
          const nextBank = result.bank as KaptenQuestionBank;
          const incomingQuestions = result.questions as BankQuestion[];
          const questions = sourceQuestionPage === 1
            ? incomingQuestions
            : [...(existing?.questions ?? []), ...incomingQuestions].filter((question, index, all) => all.findIndex((candidate) => candidate.id === question.id) === index);
          const nextEntry = { bank: nextBank, questions };
          return existing
            ? current.map((entry) => entry.bank.id === builderState.sourceBankId ? nextEntry : entry)
            : [nextEntry, ...current];
        });
      } finally {
        if (!cancelled) setSourceQuestionLoading(false);
      }
    }, questionSearchQuery.trim() ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [builderState.sourceBankId, builderState.subjectCode, questionSearchQuery, sourceQuestionPage]);

  const compatibleBanks = useMemo(
    () => sourceEntries.filter(({ bank, questions }) => bank.id === builderState.sourceBankId || bank.subjectCoverage?.includes(builderState.subjectCode) || questions.some((question) => question.subjectCode === builderState.subjectCode)),
    [builderState.sourceBankId, builderState.subjectCode, sourceEntries],
  );
  const selectedBankEntry = compatibleBanks.find(({ bank }) => bank.id === builderState.sourceBankId)
    ?? sourceEntries.find(({ bank }) => bank.id === builderState.sourceBankId)
    ?? null;
  const sourceBankCategories = useMemo(
    () => [...new Map((sourceCategories.length ? sourceCategories : compatibleBanks.flatMap(({ bank }) => bank.categories ?? [])).map((category) => [category.id, category])).values()]
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [compatibleBanks, sourceCategories],
  );
  const visibleCompatibleBanks = useMemo(() => {
    const normalizedQuery = sourceBankSearchQuery.trim().toLowerCase();
    const filtered = compatibleBanks.filter(({ bank }) => {
      const searchText = [
        bank.title,
        bank.description,
        bank.folderPath?.map((item) => item.name).join(" "),
        ...(bank.categories ?? []).map((category) => category.name),
        ...(bank.subjectCoverage ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      return (!normalizedQuery || searchText.includes(normalizedQuery))
        && (!sourceBankCategoryFilter || bank.categoryIds?.includes(sourceBankCategoryFilter));
    });
    if (selectedBankEntry && !filtered.some(({ bank }) => bank.id === selectedBankEntry.bank.id)) {
      return [selectedBankEntry, ...filtered];
    }
    return filtered;
  }, [compatibleBanks, selectedBankEntry, sourceBankCategoryFilter, sourceBankSearchQuery]);
  const selectedBank = selectedBankEntry?.bank ?? null;
  const selectedSourceQuestionIds = new Set(
    builderState.questions.flatMap((question) =>
      question.origin === "bank" && question.sourceQuestionId ? [question.sourceQuestionId] : [],
    ),
  );
  const availableBankQuestions = (selectedBankEntry?.questions ?? []).filter(
    (question) => question.subjectCode === builderState.subjectCode && !selectedSourceQuestionIds.has(question.id),
  );
  const sourceQuestionLoadedCount = selectedBankEntry?.questions.length ?? 0;
  const filteredBankQuestions = useMemo(() => {
    const normalizedQuery = questionSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return availableBankQuestions;
    }

    return availableBankQuestions.filter((question) => [
      question.prompt,
      question.explanation,
      question.subjectCode,
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
  const quizStatus = savedQuiz?.status ?? "draft";
  const isDraft = quizStatus === "draft";
  const saveLabel = isDraft ? "Simpan Draft" : quizStatus === "published" ? "Simpan perubahan" : "Diarsipkan";
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

  const quizActions = createQuizBuilderActions({
    builderState,
    confirmationRequest,
    localQuestion,
    selectedSourceQuestionIds,
    setBuilderState,
    setConfirmationRequest,
    setHasUnsavedChanges,
    setIsAddingLocalQuestion,
    setLocalQuestion,
    setPreviewQuestionIndex,
    setQuestionPage,
    setQuestionSearchQuery,
    setSourceQuestionPage,
    setSourceQuestionTotal,
  });
  async function saveQuiz(status: "draft" | "published" = quizStatus === "published" ? "published" : "draft") {
    setIsSaving(true); setSaveError(null);
    try {
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: builderState.attemptsAllowed,
        closesAt: builderState.closesAt,
        correctAnswerVisibility: builderState.correctAnswerVisibility,
        description: builderState.description,
        formBehavior: builderState.formBehavior,
        id: savedQuiz?.id ?? quizId,
        opensAt: builderState.opensAt,
        questions: builderState.questions,
        retryDelaySeconds: builderState.retryDelaySeconds,
        reviewTiming: builderState.reviewTiming,
        scorePolicy: builderState.scorePolicy,
        sourceBankId: builderState.sourceBankId || undefined,
        status,
        subjectCode: builderState.subjectCode,
        title: builderState.title,
      });
      if (!result.ok) { setSaveError(result.message); return; }
      setSavedQuiz(result.quiz);
      setHasUnsavedChanges(false);

      if (!quizId) {
        setPendingRouteReplacement(result.quiz.href);
      }
    } catch (saveError) {
      setSaveError(saveError instanceof Error ? saveError.message : "Kuis belum dapat disimpan.");
    } finally {
      setIsSaving(false);
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

  async function updateQuizLifecycle(operation: "archive" | "restore") {
    if (!savedQuiz || isSaving) return;
    setIsSaving(true); setSaveError(null);
    try {
      const result = await updateStandaloneQuizLifecycleAction(savedQuiz.id, operation);
      if (!result.ok) { setSaveError(result.message); return; }
      setSavedQuiz(result.quiz); setHasUnsavedChanges(false);
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : "Status Kuis belum dapat diperbarui.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <QuizBuilderScreen
      data={{
        availableBankQuestions,
        compatibleBanks,
        filteredBankQuestions,
        paginatedBankQuestions,
        questionPageCount,
        scheduleError,
        selectedBank,
        sourceBankCategories,
        sourceBankCategoryFilter,
        sourceBankLoading,
        sourceBankPage,
        sourceBankPageCount: Math.max(1, Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE)),
        sourceBankSearchQuery,
        sourceQuestionLoadedCount,
        sourceQuestionLoading,
        sourceQuestionTotal,
        visibleCompatibleBanks,
        visibleQuestionPage,
      }}
      mode={mode}
      session={session}
      state={{
        activeTab,
        builderState,
        confirmationRequest,
        hasUnsavedChanges,
        isAddingLocalQuestion,
        isDraft,
        isPreviewOpen,
        isSaving,
        localQuestion,
        previewQuestion,
        previewQuestionIndex,
        publishError,
        questionSearchQuery,
        quizStatus,
        readyQuestionCount,
        saveError,
        saveLabel,
      }}
      actions={{
        ...quizActions,
        onActiveTabChange: setActiveTab,
        onCloseConfirmation: quizActions.closeConfirmation,
        onClosePreview: () => setIsPreviewOpen(false),
        onConfirmPendingAction: quizActions.confirmPendingAction,
        onLifecycle: (operation) => { void updateQuizLifecycle(operation); },
        onLocalQuestionChange: setLocalQuestion,
        onOpenPreview: () => {
          setPreviewQuestionIndex(0);
          setIsPreviewOpen(true);
        },
        onPreviewQuestionIndex: setPreviewQuestionIndex,
        onPublish: publishQuiz,
        onSave: () => { void saveQuiz(); },
        onSearchQueryChange: (query) => {
          setQuestionSearchQuery(query);
          setQuestionPage(1);
          setSourceQuestionPage(1);
          setSourceQuestionTotal(0);
        },
        onSourceBankCategoryFilterChange: (categoryId) => { setSourceBankCategoryFilter(categoryId); setSourceBankPage(1); },
        onSourceBankPageChange: setSourceBankPage,
        onSourceBankSearchQueryChange: (query) => { setSourceBankSearchQuery(query); setSourceBankPage(1); },
        onSetAddingLocalQuestion: setIsAddingLocalQuestion,
        onSetConfirmationRequest: setConfirmationRequest,
        onSetQuestionPage: setQuestionPage,
        onLoadMoreSourceQuestions: () => setSourceQuestionPage((page) => page + 1),
        onUnpublish: () => { void unpublishQuiz(); },
      }}
    />
  );
}

type QuizBuilderActionHandlers = ReturnType<typeof createQuizBuilderActions>;

type QuizBuilderViewState = {
  activeTab: string;
  builderState: QuizBuilderState;
  confirmationRequest: ConfirmationRequest | null;
  hasUnsavedChanges: boolean;
  isAddingLocalQuestion: boolean;
  isDraft: boolean;
  isPreviewOpen: boolean;
  isSaving: boolean;
  localQuestion: LocalQuestionForm;
  previewQuestion: QuizQuestionSnapshot | undefined;
  previewQuestionIndex: number;
  publishError: string | null;
  questionSearchQuery: string;
  quizStatus: KaptenQuiz["status"];
  readyQuestionCount: number;
  saveError: string | null;
  saveLabel: string;
};

type QuizBuilderViewData = {
  availableBankQuestions: BankQuestion[];
  compatibleBanks: { bank: KaptenQuestionBank; questions: BankQuestion[] }[];
  filteredBankQuestions: BankQuestion[];
  paginatedBankQuestions: BankQuestion[];
  questionPageCount: number;
  scheduleError: string | null;
  selectedBank: KaptenQuestionBank | null;
  sourceBankCategories: Array<{ id: string; name: string }>;
  sourceBankCategoryFilter: string;
  sourceBankLoading: boolean;
  sourceBankPage: number;
  sourceBankPageCount: number;
  sourceBankSearchQuery: string;
  sourceQuestionLoadedCount: number;
  sourceQuestionLoading: boolean;
  sourceQuestionTotal: number;
  visibleCompatibleBanks: { bank: KaptenQuestionBank; questions: BankQuestion[] }[];
  visibleQuestionPage: number;
};

type QuizBuilderScreenActions = QuizBuilderActionHandlers & {
  onActiveTabChange: (value: string) => void;
  onCloseConfirmation: () => void;
  onClosePreview: () => void;
  onConfirmPendingAction: () => void;
  onLifecycle: (operation: "archive" | "restore") => void;
  onLocalQuestionChange: (nextQuestion: LocalQuestionForm | ((current: LocalQuestionForm) => LocalQuestionForm)) => void;
  onOpenPreview: () => void;
  onPreviewQuestionIndex: (nextIndex: number | ((current: number) => number)) => void;
  onPublish: () => void;
  onSave: () => void;
  onSearchQueryChange: (query: string) => void;
  onLoadMoreSourceQuestions: () => void;
  onSourceBankCategoryFilterChange: (categoryId: string) => void;
  onSourceBankPageChange: (page: number) => void;
  onSourceBankSearchQueryChange: (query: string) => void;
  onSetAddingLocalQuestion: (isAdding: boolean) => void;
  onSetConfirmationRequest: (request: ConfirmationRequest | null) => void;
  onSetQuestionPage: (page: number) => void;
  onUnpublish: () => void;
};

function QuizBuilderScreen({
  actions,
  data,
  mode,
  session,
  state,
}: {
  actions: QuizBuilderScreenActions;
  data: QuizBuilderViewData;
  mode: "create" | "edit";
  session: SessionContext;
  state: QuizBuilderViewState;
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={mode === "create" ? "Buat Kuis" : "Edit Kuis"}
      mainClassName="max-w-[1500px] gap-7"
      onNavigateAway={() => !state.hasUnsavedChanges}
      searchPlaceholder="Cari kuis atau bank soal..."
      session={session}
      shouldGuardNavigation={state.hasUnsavedChanges}
    >
      <QuizBuilderHeader actions={actions} mode={mode} state={state} />
      {state.saveError ? <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{state.saveError}</p> : null}
      {state.isPreviewOpen ? <QuizBuilderPreview actions={actions} state={state} /> : <QuizBuilderTabs actions={actions} data={data} state={state} />}
      <QuizBuilderConfirmationDialog actions={actions} request={state.confirmationRequest} />
    </MentorWorkspaceShell>
  );
}

function QuizBuilderHeader({
  actions,
  mode,
  state,
}: {
  actions: QuizBuilderScreenActions;
  mode: "create" | "edit";
  state: QuizBuilderViewState;
}) {
  return (
    <section className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Button aria-label="Kembali ke quiz" render={<Link href="/mentor/quiz" />} size="icon-sm" title="Kembali ke quiz" variant="ghost">
          <ChevronLeft />
        </Button>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
            {mode === "create" ? "Buat Quiz" : state.builderState.title}
          </h1>
          <span className={cn("inline-flex items-center gap-2 text-sm font-medium text-secondary-600", state.hasUnsavedChanges ? "text-[#856300]" : "text-primary-800")}>
            <span aria-hidden="true" className={cn("size-2 rounded-full", state.hasUnsavedChanges ? "bg-[#d29b18]" : "bg-primary-700")} />
            {state.hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}
          </span>
        </div>
        {state.builderState.questions.length > 0 ? <p className="mt-2 text-sm text-secondary-500">{state.readyQuestionCount}/{state.builderState.questions.length} soal siap</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button aria-label="Preview Quiz" disabled={state.builderState.questions.length === 0} onClick={actions.onOpenPreview} size="icon-sm" title="Preview" type="button" variant="brandOutline">
          <Eye />
        </Button>
        <Button disabled={state.isSaving || state.quizStatus === "archived"} onClick={actions.onSave} type="button" variant="brand">
          <Save />
          {state.isSaving ? "Menyimpan..." : state.saveLabel}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label="Aksi Quiz" size="icon-sm" type="button" variant="ghost" />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              {state.isDraft ? (
                <DropdownMenuItem disabled={Boolean(state.publishError)} onClick={actions.onPublish}><Upload />Terbitkan</DropdownMenuItem>
              ) : state.quizStatus === "published" ? (
                <DropdownMenuItem onClick={() => actions.onSetConfirmationRequest({ confirmLabel: "Batalkan publikasi", description: "Quiz tidak lagi dapat diakses siswa dan kembali menjadi draf.", onConfirm: actions.onUnpublish, title: "Batalkan publikasi quiz?", variant: "warning" })}>Batalkan publikasi</DropdownMenuItem>
              ) : null}
              {state.quizStatus !== "archived" ? <DropdownMenuItem disabled={state.isSaving} onClick={() => actions.onLifecycle("archive")}><Archive />Arsipkan</DropdownMenuItem> : <DropdownMenuItem disabled={state.isSaving} onClick={() => actions.onLifecycle("restore")}>Pulihkan</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled variant="destructive"><Trash2 />Hapus</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}

function QuizBuilderPreview({
  actions,
  state,
}: {
  actions: QuizBuilderScreenActions;
  state: QuizBuilderViewState;
}) {
  const { builderState, previewQuestion, previewQuestionIndex } = state;

  return (
    <section aria-live="polite" className="rounded-3xl border border-primary-100 bg-white px-5 py-6 shadow-sm md:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary-800">Preview learner</p>
          <h2 className="mt-2 text-2xl font-semibold text-secondary-900">{builderState.title}</h2>
          <p className="mt-2 text-sm text-secondary-500">{getSubjectName(builderState.subjectCode)} · Soal {previewQuestionIndex + 1} dari {builderState.questions.length}</p>
        </div>
        <Button onClick={actions.onClosePreview} size="sm" type="button" variant="brandOutline">Kembali mengedit</Button>
      </div>

      {previewQuestion ? (
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="flex items-center justify-between text-xs font-semibold tracking-[0.08em] text-secondary-400 uppercase">
            <span>Question {String(previewQuestionIndex + 1).padStart(2, "0")}</span>
            <span>{previewQuestion.origin === "local" ? "Soal lokal" : "Question Bank"}</span>
          </div>
          <h3 className="mt-5 text-xl leading-8 font-semibold text-secondary-900 md:text-2xl">{previewQuestion.prompt}</h3>
          {previewQuestion.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={previewQuestion.promptMediaAssetId} className="mt-5" /> : null}
          <div className="mt-6 space-y-3">
            {previewQuestion.choices.map((choice, index) => (
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary-100 px-4 py-4 text-sm text-secondary-700 transition hover:border-primary-300 hover:bg-primary-50/50" key={`${previewQuestion.id}-${choice.id}`}>
                <input className="size-4 accent-primary-700" name={`preview-answer-${previewQuestion.id}`} type="radio" />
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">{String.fromCharCode(65 + index)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-3">
                  <span>{choice.text}</span>
                  {choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${String.fromCharCode(65 + index)}`} assetId={choice.mediaAssetId} className="max-h-44" /> : null}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-primary-100 pt-5">
            <Button disabled={previewQuestionIndex === 0} onClick={() => actions.onPreviewQuestionIndex((index) => index - 1)} type="button" variant="ghost"><ChevronLeft />Sebelumnya</Button>
            <span className="text-sm font-semibold text-secondary-500">{previewQuestionIndex + 1}/{builderState.questions.length}</span>
            <Button disabled={previewQuestionIndex >= builderState.questions.length - 1} onClick={() => actions.onPreviewQuestionIndex((index) => index + 1)} type="button" variant="brandOutline">Berikutnya<ChevronRight /></Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QuizBuilderTabs({
  actions,
  data,
  state,
}: {
  actions: QuizBuilderScreenActions;
  data: QuizBuilderViewData;
  state: QuizBuilderViewState;
}) {
  return (
    <Tabs className="gap-8" onValueChange={actions.onActiveTabChange} value={state.activeTab}>
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="w-max min-w-full sm:min-w-0">
          <TabsTrigger className="h-11 rounded-full px-4 text-sm" value="information">Informasi quiz</TabsTrigger>
          <TabsTrigger className="h-11 rounded-full px-4 text-sm" value="content">Isi quiz <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-800">{state.builderState.questions.length}</span></TabsTrigger>
          <TabsTrigger className="h-11 rounded-full px-4 text-sm" value="settings">Pengaturan</TabsTrigger>
        </TabsList>
      </div>
      <QuizInformationTab actions={actions} data={data} state={state} />
      <QuizSettingsTab scheduleError={data.scheduleError} actions={actions} state={state} />
      <QuizContentTab actions={actions} data={data} state={state} />
    </Tabs>
  );
}

function QuizInformationTab({
  actions,
  data,
  state,
}: {
  actions: QuizBuilderScreenActions;
  data: QuizBuilderViewData;
  state: QuizBuilderViewState;
}) {
  const { builderState } = state;

  return (
    <TabsContent className="m-0" value="information">
      <section className="w-full">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field><FieldLabel htmlFor="quiz-title">Judul quiz</FieldLabel><FieldInput id="quiz-title" onChange={(event) => actions.updateMetadata("title", event.target.value)} value={builderState.title} /></Field>
          <Field><FieldLabel htmlFor="quiz-subject">Subjek</FieldLabel><DropdownField id="quiz-subject" onValueChange={actions.selectSubject} options={kaptenSubjects.map((subject) => ({ label: `${subject.code} - ${subject.name}`, value: subject.code }))} placeholder="Pilih subjek" value={builderState.subjectCode} /></Field>
          <Field className="lg:col-span-2">
            <FieldLabel htmlFor="quiz-bank">Bank Soal</FieldLabel>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)]">
              <label className="relative block min-w-0">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" />
                <Input aria-label="Cari bank soal" className="h-12 rounded-2xl border-secondary-900/14 bg-white pl-11" onChange={(event) => actions.onSourceBankSearchQueryChange(event.target.value)} placeholder="Cari judul, folder, atau kategori" value={data.sourceBankSearchQuery} />
              </label>
              <DropdownField ariaLabel="Filter kategori bank soal" onValueChange={actions.onSourceBankCategoryFilterChange} options={[{ label: "Semua kategori", value: "" }, ...data.sourceBankCategories.map((category) => ({ label: category.name, value: category.id }))]} placeholder="Filter kategori" value={data.sourceBankCategoryFilter} />
            </div>
            <DropdownField className="mt-3" id="quiz-bank" onValueChange={actions.selectSourceBank} options={data.visibleCompatibleBanks.map(({ bank }) => ({ label: getBankOrganizationLabel(bank), value: bank.id }))} placeholder="Pilih bank soal" value={builderState.sourceBankId} />
            {data.sourceBankLoading ? <p className="mt-2 text-xs text-secondary-500">Memuat bank soal…</p> : null}
            {data.sourceBankPageCount > 1 ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-secondary-500"><span>Halaman {data.sourceBankPage} dari {data.sourceBankPageCount}</span><span className="flex gap-2"><Button aria-label="Bank soal sebelumnya" disabled={data.sourceBankPage === 1} onClick={() => actions.onSourceBankPageChange(data.sourceBankPage - 1)} size="icon-xs" type="button" variant="ghost"><ChevronLeft /></Button><Button aria-label="Bank soal berikutnya" disabled={data.sourceBankPage === data.sourceBankPageCount} onClick={() => actions.onSourceBankPageChange(data.sourceBankPage + 1)} size="icon-xs" type="button" variant="ghost"><ChevronRight /></Button></span></div> : null}
            {data.compatibleBanks.length === 0 ? <p className="mt-2 text-xs text-secondary-500">Belum ada bank terbit yang sesuai dengan subject quiz.</p> : data.visibleCompatibleBanks.length === 0 ? <p className="mt-2 text-xs text-secondary-500">Tidak ada bank yang cocok dengan filter.</p> : null}
          </Field>
          <Field className="lg:col-span-2"><FieldLabel htmlFor="quiz-summary">Ringkasan</FieldLabel><FieldTextarea className="min-h-[100px]" id="quiz-summary" onChange={(event) => actions.updateMetadata("description", event.target.value)} value={builderState.description} /></Field>
        </div>
      </section>
    </TabsContent>
  );
}

function QuizSettingsTab({
  actions,
  scheduleError,
  state,
}: {
  actions: QuizBuilderScreenActions;
  scheduleError: string | null;
  state: QuizBuilderViewState;
}) {
  const { builderState } = state;
  const attemptsOptions = [
    ...(builderState.attemptsAllowed !== null && ![1, 3, 5].includes(builderState.attemptsAllowed) ? [{ label: `${builderState.attemptsAllowed} kali`, value: String(builderState.attemptsAllowed) }] : []),
    { label: "1 kali", value: "1" },
    { label: "3 kali", value: "3" },
    { label: "5 kali", value: "5" },
    { label: "Tanpa batas", value: "unlimited" },
  ];

  return (
    <TabsContent className="m-0" value="settings">
      <section className="max-w-4xl rounded-3xl border border-primary-100 bg-white p-5 md:p-6">
        <div><h2 className="text-lg font-semibold text-secondary-900">Ketersediaan untuk siswa</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Pengaturan ini opsional. Jika keduanya kosong, quiz yang diterbitkan langsung dapat diakses siswa.</p></div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="quiz-opens-at">Mulai dibuka</FieldLabel><FieldInput id="quiz-opens-at" onChange={(event) => actions.updateMetadata("opensAt", event.target.value)} type="datetime-local" value={builderState.opensAt} /></Field>
          <Field><FieldLabel htmlFor="quiz-closes-at">Tutup akses</FieldLabel><FieldInput id="quiz-closes-at" onChange={(event) => actions.updateMetadata("closesAt", event.target.value)} type="datetime-local" value={builderState.closesAt} /></Field>
        </div>
        {scheduleError ? <p className="mt-4 text-sm font-medium text-red-700">{scheduleError}</p> : null}
        <div className="mt-8 border-t border-primary-100 pt-6">
          <h2 className="text-lg font-semibold text-secondary-900">Kebijakan percobaan</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-500">Aturan ini diperiksa ulang saat siswa menekan Mulai. Perubahan kebijakan tidak dapat dilakukan setelah ada siswa yang memulai quiz.</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            <Field><FieldLabel htmlFor="quiz-attempts-allowed">Jumlah percobaan</FieldLabel><DropdownField id="quiz-attempts-allowed" onValueChange={(value) => actions.updatePolicy("attemptsAllowed", value === "unlimited" ? null : Number(value))} options={attemptsOptions} placeholder="Pilih batas" value={builderState.attemptsAllowed === null ? "unlimited" : String(builderState.attemptsAllowed)} /></Field>
            <Field><FieldLabel htmlFor="quiz-score-policy">Penilaian akhir</FieldLabel><DropdownField id="quiz-score-policy" onValueChange={(value) => actions.updatePolicy("scorePolicy", value as QuizBuilderState["scorePolicy"])} options={[{ label: "Skor tertinggi", value: "highest" }, { label: "Percobaan terbaru", value: "latest" }, { label: "Percobaan pertama", value: "first" }, { label: "Rata-rata", value: "average" }]} placeholder="Pilih penilaian" value={builderState.scorePolicy} /></Field>
            <Field><FieldLabel htmlFor="quiz-retry-delay">Jeda percobaan ulang (detik)</FieldLabel><FieldInput id="quiz-retry-delay" min="0" onChange={(event) => { const value = event.target.value.trim(); const parsed = Number(value); actions.updatePolicy("retryDelaySeconds", value === "" || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed))); }} placeholder="Kosongkan tanpa jeda" type="number" value={builderState.retryDelaySeconds ?? ""} /></Field>
            <Field><FieldLabel htmlFor="quiz-form-behavior">Bentuk soal ulang</FieldLabel><DropdownField id="quiz-form-behavior" onValueChange={(value) => actions.updatePolicy("formBehavior", value as QuizBuilderState["formBehavior"])} options={[{ label: "Form yang sama", value: "same" }, { label: "Form diacak ulang", value: "fresh_randomized" }]} placeholder="Pilih bentuk soal" value={builderState.formBehavior} /></Field>
            <Field><FieldLabel htmlFor="quiz-review-timing">Waktu review</FieldLabel><DropdownField id="quiz-review-timing" onValueChange={(value) => actions.updatePolicy("reviewTiming", value as QuizBuilderState["reviewTiming"])} options={[{ label: "Langsung setelah kirim", value: "immediate" }, { label: "Setelah quiz ditutup", value: "after_close" }, { label: "Tidak tersedia", value: "never" }]} placeholder="Pilih waktu review" value={builderState.reviewTiming} /></Field>
            <Field><FieldLabel htmlFor="quiz-correct-answer-visibility">Jawaban benar</FieldLabel><DropdownField id="quiz-correct-answer-visibility" onValueChange={(value) => actions.updatePolicy("correctAnswerVisibility", value as QuizBuilderState["correctAnswerVisibility"])} options={[{ label: "Tampilkan", value: "show" }, { label: "Sembunyikan", value: "hide" }]} placeholder="Pilih visibilitas" value={builderState.correctAnswerVisibility} /></Field>
          </div>
        </div>
        {state.isDraft && state.publishError && !scheduleError ? <p className="mt-4 text-sm text-secondary-500">Quiz perlu memiliki judul dan semua soal siap sebelum diterbitkan.</p> : null}
      </section>
    </TabsContent>
  );
}

function QuizContentTab({
  actions,
  data,
  state,
}: {
  actions: QuizBuilderScreenActions;
  data: QuizBuilderViewData;
  state: QuizBuilderViewState;
}) {
  const { builderState } = state;

  return (
    <TabsContent className="m-0" value="content">
      <section className="grid gap-8 xl:grid-cols-[minmax(270px,0.3fr)_minmax(0,0.7fr)]">
        <aside className="order-2 border-t border-primary-100 pt-5 xl:order-none xl:border-t-0 xl:border-r xl:pr-7 xl:pt-1">
          <div><p className="text-sm font-semibold text-secondary-900">Susunan soal</p><p className="mt-1 text-xs text-secondary-500">{builderState.questions.length} dipilih</p></div>
          <div className="mt-4 flex gap-1 overflow-x-auto border-t border-primary-100 pt-3 xl:mt-5 xl:block xl:space-y-1">
            {builderState.questions.length > 0 ? builderState.questions.map((question, index) => (
              <div className="flex min-w-[215px] items-center gap-2 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-primary-50/60 xl:w-full" key={question.id}>
                <GripVertical className="size-4 shrink-0 text-secondary-300" />
                <button className="min-w-0 flex-1 text-left" onClick={() => { actions.onActiveTabChange("content"); actions.onPreviewQuestionIndex(index); actions.onOpenPreview(); }} type="button">
                  <span className="block truncate text-sm font-semibold text-secondary-900">{String(index + 1).padStart(2, "0")}. {question.prompt || "Soal tanpa pertanyaan"}</span>
                  <span className="mt-1 block text-xs text-secondary-500">{question.origin === "local" ? "Soal lokal" : data.selectedBank?.title ?? "Question Bank"}</span>
                </button>
                <div className="flex shrink-0 items-center"><Button aria-label="Pindah soal ke atas" onClick={() => actions.moveQuestion(question.id, "up")} size="icon-sm" type="button" variant="ghost"><ArrowUp className="size-3.5" /></Button><Button aria-label="Pindah soal ke bawah" onClick={() => actions.moveQuestion(question.id, "down")} size="icon-sm" type="button" variant="ghost"><ArrowDown className="size-3.5" /></Button><Button aria-label="Hapus soal" onClick={() => actions.removeQuestion(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-3.5" /></Button></div>
              </div>
            )) : <p className="px-2 py-4 text-sm leading-6 text-secondary-500">Belum ada soal di quiz ini.</p>}
          </div>
        </aside>

        <div className="order-1 xl:order-none">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">Pilih soal</p><p className="mt-1 text-sm text-secondary-500">{data.selectedBank ? `Soal dari ${data.selectedBank.title} akan disalin ke quiz ini.` : "Pilih Question Bank yang sesuai dengan subject terlebih dahulu."}</p></div><Button onClick={() => actions.onSetAddingLocalQuestion(!state.isAddingLocalQuestion)} type="button" variant="brandOutline"><Plus />Soal lokal</Button></div>

          {data.selectedBank ? (
            <div className="mt-5 grid gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="relative block min-w-0 flex-1"><Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-secondary-400" /><Input aria-label="Cari soal" className="h-11 rounded-xl border border-primary-100 bg-white pl-10" onChange={(event) => actions.onSearchQueryChange(event.target.value)} placeholder="Cari pertanyaan, pilihan jawaban, atau penjelasan..." value={state.questionSearchQuery} /></label><p aria-live="polite" className="text-sm text-secondary-500">{data.sourceQuestionLoading ? "Memuat soal…" : `${data.filteredBankQuestions.length} soal tersedia`}</p></div>
              {data.paginatedBankQuestions.length > 0 ? data.paginatedBankQuestions.map((question) => (
                <div className="flex flex-col gap-4 rounded-2xl border border-primary-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between" key={question.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-secondary-400"><span>{question.subjectCode}</span><span>·</span><span>{question.difficulty === "easy" ? "Mudah" : question.difficulty === "medium" ? "Sedang" : "Sulit"}</span></div><p className="mt-2 text-sm leading-6 font-semibold text-secondary-900">{question.prompt}</p></div><Button className="shrink-0" onClick={() => actions.addBankQuestion(question)} size="sm" type="button" variant="brandOutline"><Plus />Tambah</Button></div>
              )) : <div className="rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-500">{data.availableBankQuestions.length === 0 ? "Semua soal dari bank ini sudah dipilih. Tambahkan soal lokal bila masih diperlukan." : "Tidak ada soal yang sesuai dengan pencarian ini."}</div>}
              {data.sourceQuestionTotal > data.sourceQuestionLoadedCount ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {data.sourceQuestionLoadedCount} dari {data.sourceQuestionTotal} soal siap.</p><Button disabled={data.sourceQuestionLoading} onClick={actions.onLoadMoreSourceQuestions} size="sm" type="button" variant="brandOutline"><ArrowDown />{data.sourceQuestionLoading ? "Memuat…" : "Muat 100 soal lagi"}</Button></div> : null}
              {data.filteredBankQuestions.length > 0 ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-sm text-secondary-500">Halaman {data.visibleQuestionPage} dari {data.questionPageCount}</p><div className="flex items-center gap-2"><Button aria-label="Halaman sebelumnya" disabled={data.visibleQuestionPage === 1} onClick={() => actions.onSetQuestionPage(data.visibleQuestionPage - 1)} size="sm" type="button" variant="brandOutline"><ChevronLeft /> Sebelumnya</Button><Button aria-label="Halaman berikutnya" disabled={data.visibleQuestionPage === data.questionPageCount} onClick={() => actions.onSetQuestionPage(data.visibleQuestionPage + 1)} size="sm" type="button" variant="brandOutline">Berikutnya <ChevronRight /></Button></div></div> : null}
            </div>
          ) : <div className="mt-5 flex items-start gap-3 rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-500"><CircleHelp className="mt-0.5 size-5 shrink-0 text-primary-800" /><p>{data.compatibleBanks.length === 0 ? "Belum ada Question Bank yang sesuai dengan subject ini. " : "Question Bank yang tampil akan selalu mengikuti subject Quiz. "}{data.compatibleBanks.length === 0 ? <Link className="font-semibold text-primary-800 underline underline-offset-4" href="/mentor/quiz/question-bank">Buka Question Bank</Link> : null}</p></div>}

          {state.isAddingLocalQuestion ? <LocalQuestionForm state={state} actions={actions} /> : null}
        </div>
      </section>
    </TabsContent>
  );
}

function LocalQuestionForm({
  actions,
  state,
}: {
  actions: QuizBuilderScreenActions;
  state: QuizBuilderViewState;
}) {
  const { localQuestion } = state;

  return (
    <div className="mt-5 rounded-3xl border border-primary-200 bg-primary-50/45 p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">Soal pilihan ganda lokal</p><p className="mt-1 text-sm text-secondary-500">Soal ini hanya tersimpan dalam Quiz, bukan Question Bank.</p></div><Button aria-label="Tutup formulir soal lokal" onClick={() => actions.onSetAddingLocalQuestion(false)} size="icon-sm" type="button" variant="ghost"><Trash2 className="size-4" /></Button></div>
      <div className="mt-5 grid gap-5">
        <Field><FieldLabel htmlFor="local-question-prompt">Pertanyaan</FieldLabel><FieldTextarea id="local-question-prompt" onChange={(event) => actions.onLocalQuestionChange((current) => ({ ...current, prompt: event.target.value }))} value={localQuestion.prompt} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {localQuestion.choices.map((choice, index) => <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-3" key={choice.id}><label className="flex shrink-0 cursor-pointer items-center gap-3" htmlFor={`local-choice-${choice.id}`}><input id={`local-choice-${choice.id}`} aria-label={`Jawaban benar opsi ${index + 1}`} checked={choice.id === localQuestion.correctChoiceId} className="size-4 accent-primary-700" name="local-correct-choice" onChange={() => actions.onLocalQuestionChange((current) => ({ ...current, correctChoiceId: choice.id }))} type="radio" /><span className="text-xs font-semibold text-primary-800">{String.fromCharCode(65 + index)}</span></label><input aria-label={`Opsi ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400" onChange={(event) => actions.updateLocalChoice(choice.id, event.target.value)} placeholder={`Opsi ${String.fromCharCode(65 + index)}`} value={choice.text} /></div>)}
        </div>
        <Field><FieldLabel htmlFor="local-question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldTextarea id="local-question-explanation" onChange={(event) => actions.onLocalQuestionChange((current) => ({ ...current, explanation: event.target.value }))} value={localQuestion.explanation} /></Field>
        <div><Button disabled={!localQuestion.prompt.trim() || localQuestion.choices.some((choice) => !choice.text.trim())} onClick={actions.addLocalQuestion} type="button" variant="brand"><Plus />Tambahkan ke Quiz</Button></div>
      </div>
    </div>
  );
}

function QuizBuilderConfirmationDialog({
  actions,
  request,
}: {
  actions: QuizBuilderScreenActions;
  request: ConfirmationRequest | null;
}) {
  return (
    <AlertDialog onOpenChange={(isOpen) => { if (!isOpen) actions.onCloseConfirmation(); }} open={Boolean(request)}>
      <AlertDialogContent size="sm" variant={request?.variant ?? "danger"}>
        <AlertDialogHeader><AlertDialogMedia variant={request?.variant ?? "danger"}><CircleHelp /></AlertDialogMedia><AlertDialogTitle>{request?.title}</AlertDialogTitle><AlertDialogDescription>{request?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel onClick={actions.onCloseConfirmation}>Batal</AlertDialogCancel><AlertDialogAction onClick={actions.onConfirmPendingAction} variant={request?.variant === "warning" ? "brand" : "destructive"}>{request?.confirmLabel}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { KaptenQuizBuilderPageModule };
