"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldInput } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ReferenceEmptyState,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Search } from "@/lib/icons";
import type { AuthoringEditLease } from "@/lib/serialization/authoring-lease";
import type {
  BankQuestionDto,
  QuestionBankDto,
} from "@/lib/question-bank/repository";
import { importStandaloneQuizBankQuestionSnapshotsAction } from "@/modules/mentor/quiz-actions";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import { PaginationControls } from "@/modules/mentor/components/kapten-ui";
import {
  QUESTION_BANK_PICKER_DIALOG_CLASS_NAME,
  QUESTION_BANK_PICKER_FOOTER_CLASS_NAME,
  QuestionBankPickerRow,
} from "@/modules/mentor/components/question-bank-picker-layout";
import {
  listQuestionBankSourcePageAction,
  listQuestionBankSourceQuestionsAction,
} from "@/modules/mentor/question-bank-actions";

const BANK_PAGE_SIZE = 20;
const QUESTION_PAGE_SIZE = 10;

type QuestionBankPickerProps = {
  disabled?: boolean;
  editLease?: AuthoringEditLease;
  expectedDraftRevision?: number | null;
  onImported: (
    questions: QuizQuestionSnapshot[],
    importedCount: number,
  ) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  quizId?: string;
  subjectCode: string;
};

type PickerQuestion = BankQuestionDto;

function difficultyLabel(value: PickerQuestion["difficulty"]) {
  if (value === "easy") return "Mudah";
  if (value === "hard") return "Sulit";
  return "Sedang";
}

function BankList({
  banks,
  disabled,
  selectedBankId,
  onSelect,
}: {
  banks: QuestionBankDto[];
  disabled: boolean;
  selectedBankId?: string;
  onSelect: (bankId: string) => void;
}) {
  if (!banks.length)
    return (
      <p className="px-2 py-2 text-sm text-secondary-500">
        Tidak ada Bank Soal Kuis yang siap untuk subjek ini.
      </p>
    );
  return (
    <div
      aria-label="Bank Soal Kuis"
      className="grid max-h-64 gap-1 overflow-y-auto"
      role="group"
    >
      {banks.map((bank) => {
        const selected = bank.id === selectedBankId;
        return (
          <button
            aria-pressed={selected}
            className={`min-h-11 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-primary-200 ${selected ? "bg-primary-50 font-semibold text-primary-900" : "text-secondary-700 hover:bg-secondary-50"}`}
            disabled={disabled}
            key={bank.id}
            onClick={() => onSelect(bank.id)}
            type="button"
          >
            <span className="block truncate">{bank.title}</span>
            <span className="mt-0.5 block text-xs font-normal text-secondary-500">
              {bank.questionCount} soal ·{" "}
              {bank.subjectCoverage?.join(", ") || "Subjek sesuai"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function useQuestionBankPageLoad({ bankId, bankPage, bankSearch, disabled, open, quizId, reloadNonce, setBankId, setBankTotal, setBanks, setError, setLoadingBanks, setSelectedBankTitle, subjectCode }: {
  bankId: string;
  bankPage: number;
  bankSearch: string;
  disabled: boolean;
  open: boolean;
  quizId?: string;
  reloadNonce: number;
  setBankId: (value: string) => void;
  setBankTotal: (value: number) => void;
  setBanks: (value: QuestionBankDto[]) => void;
  setError: (value: string | null) => void;
  setLoadingBanks: (value: boolean) => void;
  setSelectedBankTitle: (value: string) => void;
  subjectCode: string;
}) {
  useEffect(() => {
    if (!open || disabled || !quizId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingBanks(true);
      setError(null);
      try {
        const result = await listQuestionBankSourcePageAction({ page: bankPage, pageSize: BANK_PAGE_SIZE, purpose: "quiz", search: bankSearch, subjectCoverage: [subjectCode] });
        if (cancelled) return;
        const nextBanks = result.items.map(({ bank }) => bank);
        setBanks(nextBanks);
        setBankTotal(result.total);
        if (!bankId && nextBanks[0]) {
          setBankId(nextBanks[0].id);
          setSelectedBankTitle(nextBanks[0].title);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Bank Soal belum dapat dimuat.");
      } finally {
        if (!cancelled) setLoadingBanks(false); // react-doctor-disable-line no-loading-flag-reset-outside-finally -- a cancelled request must not clear the newer request's loading state.
      }
    }, bankSearch.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bankId, bankPage, bankSearch, disabled, open, quizId, reloadNonce, subjectCode, setBankId, setBankTotal, setBanks, setError, setLoadingBanks, setSelectedBankTitle]);
}

function useQuestionBankEligibleCountLoad({ bankId, disabled, open, quizId, reloadNonce, setAllInBank, setEligibleQuestionCount, setEligibleQuestionCountError, setLoadingEligibleQuestionCount, setSelectedQuestions, subjectCode }: {
  bankId: string;
  disabled: boolean;
  open: boolean;
  quizId?: string;
  reloadNonce: number;
  setAllInBank: (value: boolean) => void;
  setEligibleQuestionCount: (value: number | null) => void;
  setEligibleQuestionCountError: (value: string | null) => void;
  setLoadingEligibleQuestionCount: (value: boolean) => void;
  setSelectedQuestions: (value: Map<string, PickerQuestion>) => void;
  subjectCode: string;
}) {
  useEffect(() => {
    if (!open || disabled || !quizId || !bankId) return;
    let cancelled = false;
    setLoadingEligibleQuestionCount(true);
    setEligibleQuestionCountError(null);
    void (async () => {
      try {
        const result = await listQuestionBankSourceQuestionsAction(bankId, { page: 1, pageSize: 1, purpose: "quiz", search: "", subjectCode });
        if (cancelled) return;
        if (!result) {
          setEligibleQuestionCount(null);
          setSelectedQuestions(new Map());
          setAllInBank(false);
          setEligibleQuestionCountError("Bank Soal tidak lagi tersedia untuk Kuis ini.");
          return;
        }
        setEligibleQuestionCount(result.total);
        if (result.total === 0) {
          setSelectedQuestions(new Map());
          setAllInBank(false);
        }
      } catch (countError) {
        if (!cancelled) setEligibleQuestionCountError(countError instanceof Error ? countError.message : "Jumlah soal siap belum dapat dimuat.");
      } finally {
        if (!cancelled) setLoadingEligibleQuestionCount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bankId, disabled, open, quizId, reloadNonce, subjectCode, setAllInBank, setEligibleQuestionCount, setEligibleQuestionCountError, setLoadingEligibleQuestionCount, setSelectedQuestions]);
}

function useQuestionBankQuestionPageLoad({ bankId, disabled, open, questionPage, questionSearch, quizId, reloadNonce, setError, setLoadingQuestions, setQuestionTotal, setQuestions, subjectCode }: {
  bankId: string;
  disabled: boolean;
  open: boolean;
  questionPage: number;
  questionSearch: string;
  quizId?: string;
  reloadNonce: number;
  setError: (value: string | null) => void;
  setLoadingQuestions: (value: boolean) => void;
  setQuestionTotal: (value: number) => void;
  setQuestions: (value: PickerQuestion[]) => void;
  subjectCode: string;
}) {
  useEffect(() => {
    if (!open || disabled || !quizId || !bankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingQuestions(true);
      setError(null);
      try {
        const result = await listQuestionBankSourceQuestionsAction(bankId, { page: questionPage, pageSize: QUESTION_PAGE_SIZE, purpose: "quiz", search: questionSearch, subjectCode });
        if (cancelled) return;
        if (!result) {
          setQuestions([]);
          setQuestionTotal(0);
          setError("Bank Soal tidak lagi tersedia untuk Kuis ini.");
          return;
        }
        setQuestions(result.questions);
        setQuestionTotal(result.total);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Soal siap belum dapat dimuat.");
      } finally {
        if (!cancelled) setLoadingQuestions(false); // react-doctor-disable-line no-loading-flag-reset-outside-finally -- a cancelled request must not clear the newer request's loading state.
      }
    }, questionSearch.trim() ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bankId, disabled, open, questionPage, questionSearch, quizId, reloadNonce, subjectCode, setError, setLoadingQuestions, setQuestionTotal, setQuestions]);
}

function useQuestionBankImport({
  allInBank,
  bankId,
  editLease,
  expectedDraftRevision,
  importing,
  onImported,
  onOpenChange,
  quizId,
  selectedCount,
  selectedQuestions,
  setAllInBank,
  setEligibleQuestionCount,
  setError,
  setImportError,
  setImporting,
  setQuestionTotal,
  setQuestions,
  setReloadNonce,
  setSelectedQuestions,
}: {
  allInBank: boolean;
  bankId: string;
  editLease?: AuthoringEditLease;
  expectedDraftRevision?: number | null;
  importing: boolean;
  onImported: QuestionBankPickerProps["onImported"];
  onOpenChange: QuestionBankPickerProps["onOpenChange"];
  quizId?: string;
  selectedCount: number;
  selectedQuestions: Map<string, PickerQuestion>;
  setAllInBank: (value: boolean) => void;
  setEligibleQuestionCount: (value: number | null) => void;
  setError: (value: string | null) => void;
  setImportError: (value: string | null) => void;
  setImporting: (value: boolean) => void;
  setQuestionTotal: (value: number) => void;
  setQuestions: (value: PickerQuestion[]) => void;
  setReloadNonce: (value: number | ((current: number) => number)) => void;
  setSelectedQuestions: (value: Map<string, PickerQuestion>) => void;
}) {
  const importPendingRef = useRef(false);

  const refreshAfterImportFailure = () => {
    setSelectedQuestions(new Map());
    setAllInBank(false);
    setEligibleQuestionCount(null);
    setQuestions([]);
    setQuestionTotal(0);
    setReloadNonce((value) => value + 1);
  };

  const importQuestions = async () => {
    if (
      !quizId ||
      !bankId ||
      expectedDraftRevision == null ||
      !editLease ||
      !selectedCount ||
      importing ||
      importPendingRef.current
    )
      return;

    importPendingRef.current = true;
    setImporting(true);
    setError(null);
    setImportError(null);

    try {
      const base = {
        bankId,
        editLease,
        expectedDraftRevision,
        quizId,
      };
      const selected = [...selectedQuestions.values()];
      const revisionBackedSelected = selected.filter(
        (question): question is PickerQuestion & {
          questionRevisionId: string;
          questionContentDigest: string;
        } => Boolean(question.questionRevisionId && question.questionContentDigest),
      );
      if (!allInBank && revisionBackedSelected.length !== selected.length) {
        refreshAfterImportFailure();
        throw new Error(
          "Sebagian soal berubah setelah dimuat. Muat ulang daftar soal sebelum mengimpornya.",
        );
      }

      const request = allInBank
        ? { ...base, allInBank: true as const }
        : {
            ...base,
            questionIds: revisionBackedSelected.map((question) => question.id),
            expectedSourceRevisions: revisionBackedSelected.map((question) => ({
              contentDigest: question.questionContentDigest,
              questionId: question.id,
              revisionId: question.questionRevisionId,
            })),
          };
      const result =
        await importStandaloneQuizBankQuestionSnapshotsAction(request);
      if (!result.ok) {
        setImportError(result.message);
        refreshAfterImportFailure();
        return;
      }
      if (result.importedCount !== result.snapshots.length) {
        setImportError(
          "Soal belum dapat ditambahkan. Muat ulang daftar soal lalu coba lagi.",
        );
        refreshAfterImportFailure();
        return;
      }
      if (result.importedCount === 0) {
        setEligibleQuestionCount(0);
        setImportError(
          "Tidak ada soal siap yang dapat ditambahkan dari bank ini.",
        );
        refreshAfterImportFailure();
        return;
      }
      onImported(result.snapshots, result.importedCount);
      onOpenChange(false);
    } catch (caughtError) {
      setImportError(
        caughtError instanceof Error
          ? caughtError.message
          : "Soal belum dapat ditambahkan.",
      );
    } finally {
      importPendingRef.current = false;
      setImporting(false);
    }
  };

  return { importPendingRef, importQuestions };
}

function QuestionBankSelector({
  banks,
  bankPage,
  bankPageCount,
  bankSearch,
  bankTotal,
  disabled,
  importing,
  loadingBanks,
  selectedBankId,
  selectedBankTitle,
  onPageChange,
  onSearchChange,
  onSelect,
}: {
  banks: QuestionBankDto[];
  bankPage: number;
  bankPageCount: number;
  bankSearch: string;
  bankTotal: number;
  disabled: boolean;
  importing: boolean;
  loadingBanks: boolean;
  selectedBankId: string;
  selectedBankTitle: string;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  onSelect: (bankId: string) => void;
}) {
  return (
    <div className="grid shrink-0 gap-2">
      <p className="text-xs font-bold tracking-[0.12em] text-secondary-500 uppercase">
        Bank Soal Kuis
      </p>
      <Popover>
        <PopoverTrigger
          disabled={disabled || importing || loadingBanks}
          render={
            <Button
              className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full justify-between`}
              type="button"
              variant="outline"
            />
          }
        >
          <span className="min-w-0 truncate">
            {selectedBankTitle ||
              (selectedBankId ? "Memuat Bank Soal…" : "Pilih Bank Soal")}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(34rem,calc(100vw-2rem))] gap-3"
        >
          <FieldInput
            aria-label="Cari Bank Soal Kuis"
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11`}
            disabled={disabled || importing}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Cari judul, folder, atau materi…"
            value={bankSearch}
          />
          {loadingBanks ? (
            <p className="px-2 text-xs text-secondary-500">
              Memuat Bank Soal…
            </p>
          ) : null}
          <BankList
            banks={banks}
            disabled={disabled || importing}
            onSelect={onSelect}
            selectedBankId={selectedBankId}
          />
          {bankTotal > BANK_PAGE_SIZE ? (
            <PaginationControls
              onPageChange={onPageChange}
              page={bankPage}
              pageCount={bankPageCount}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function QuestionBankSelectionControls({
  allQuestionsSelected,
  bankId,
  disabled,
  eligibleQuestionCount,
  eligibleQuestionCountError,
  importing,
  loadingEligibleQuestionCount,
  questionSearch,
  selectAllCheckboxId,
  selectAllDisabled,
  someQuestionsSelected,
  subjectCode,
  onQuestionSearchChange,
  onRetryCount,
  onSelectAll,
}: {
  allQuestionsSelected: boolean;
  bankId: string;
  disabled: boolean;
  eligibleQuestionCount: number | null;
  eligibleQuestionCountError: string | null;
  importing: boolean;
  loadingEligibleQuestionCount: boolean;
  questionSearch: string;
  selectAllCheckboxId: string;
  selectAllDisabled: boolean;
  someQuestionsSelected: boolean;
  subjectCode: string;
  onQuestionSearchChange: (value: string) => void;
  onRetryCount: () => void;
  onSelectAll: (checked: boolean) => void;
}) {
  return (
    <div className="grid shrink-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[min(100%,20rem)] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
          <FieldInput
            aria-label="Cari soal di bank ini"
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 pl-9`}
            disabled={disabled || importing || !bankId}
            onChange={(event) => onQuestionSearchChange(event.target.value)}
            placeholder={
              bankId
                ? `Cari soal ${subjectCode}…`
                : "Pilih Bank Soal terlebih dahulu"
            }
            value={questionSearch}
          />
        </div>
      </div>
      <div className="grid gap-2 sm:flex sm:items-center sm:justify-between">
        {eligibleQuestionCount !== null && eligibleQuestionCount > 0 ? (
          <label
            className={`flex min-h-11 w-fit max-w-full items-center gap-3 text-sm text-secondary-900 ${
              selectAllDisabled
                ? "cursor-not-allowed opacity-55"
                : "cursor-pointer"
            }`}
            htmlFor={selectAllCheckboxId}
          >
            <Checkbox
              checked={allQuestionsSelected}
              disabled={selectAllDisabled}
              id={selectAllCheckboxId}
              indeterminate={someQuestionsSelected}
              onCheckedChange={onSelectAll}
            />
            <span className="min-w-0">Pilih semua</span>
          </label>
        ) : loadingEligibleQuestionCount ? (
          <p aria-live="polite" className="text-xs text-secondary-500">
            Memuat jumlah soal siap…
          </p>
        ) : eligibleQuestionCount === 0 ? (
          <p className="text-xs text-secondary-500">
            Belum ada soal siap di bank ini.
          </p>
        ) : null}
      </div>
      {eligibleQuestionCountError ? (
        <div
          className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
          role="alert"
        >
          <p>{eligibleQuestionCountError}</p>
          <Button
            className="mt-2"
            disabled={loadingEligibleQuestionCount || importing}
            onClick={onRetryCount}
            size="sm"
            type="button"
            variant="outline"
          >
            Coba lagi
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function QuestionBankQuestionResults({
  allInBank,
  bankId,
  disabled,
  error,
  importing,
  importError,
  loadingBanks,
  loadingQuestions,
  questionPage,
  questionPageCount,
  questionTotal,
  questions,
  selectedQuestions,
  onPageChange,
  onReload,
  onToggle,
}: {
  allInBank: boolean;
  bankId: string;
  disabled: boolean;
  error: string | null;
  importing: boolean;
  importError: string | null;
  loadingBanks: boolean;
  loadingQuestions: boolean;
  questionPage: number;
  questionPageCount: number;
  questionTotal: number;
  questions: PickerQuestion[];
  selectedQuestions: Map<string, PickerQuestion>;
  onPageChange: (page: number) => void;
  onReload: () => void;
  onToggle: (question: PickerQuestion) => void;
}) {
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="grid gap-3">
        {loadingQuestions ? (
          <p aria-live="polite" className="text-xs text-secondary-500">
            Memuat soal siap…
          </p>
        ) : null}
        {error || importError ? (
          <div
            className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
            role="alert"
          >
            <p>{importError ?? error}</p>
            <Button
              className="mt-2"
              disabled={loadingBanks || loadingQuestions || importing}
              onClick={onReload}
              size="sm"
              type="button"
              variant="outline"
            >
              Muat ulang daftar soal
            </Button>
          </div>
        ) : null}
        {!loadingQuestions && !error && !importError && !questions.length ? (
          <ReferenceSurface className="px-4 py-10 text-center" variant="inset">
            <p className="text-sm font-semibold text-secondary-900">
              {bankId
                ? "Tidak ada soal siap yang cocok"
                : "Pilih Bank Soal untuk mulai memilih"}
            </p>
            <p className="mt-1 text-sm leading-6 text-secondary-500">
              Periksa pencarian atau pilih Bank Soal lain yang sesuai.
            </p>
          </ReferenceSurface>
        ) : null}
        {questions.length ? (
          <div className="grid gap-2">
            {questions.map((question) => (
              <QuestionBankPickerRow
                allInBank={allInBank}
                checkboxId={`quiz-bank-question-${question.id}`}
                difficulty={difficultyLabel(question.difficulty)}
                disabled={disabled || importing || allInBank}
                key={question.id}
                onToggle={() => onToggle(question)}
                prompt={question.prompt}
                selected={allInBank || selectedQuestions.has(question.id)}
                subjectCode={question.subjectCode}
              />
            ))}
          </div>
        ) : null}
        {bankId && questionTotal > 0 ? (
          <PaginationControls
            onPageChange={onPageChange}
            page={questionPage}
            pageCount={questionPageCount}
          />
        ) : null}
      </div>
    </div>
  );
}

function getQuestionBankSelectionSummary({
  allInBank,
  eligibleQuestionCount,
  selectedQuestions,
}: {
  allInBank: boolean;
  eligibleQuestionCount: number | null;
  selectedQuestions: Map<string, PickerQuestion>;
}) {
  const selectedCount = allInBank
    ? (eligibleQuestionCount ?? 0)
    : selectedQuestions.size;
  const allQuestionsSelected =
    eligibleQuestionCount !== null &&
    eligibleQuestionCount > 0 &&
    (allInBank || selectedQuestions.size === eligibleQuestionCount);
  return {
    allQuestionsSelected,
    selectedCount,
    someQuestionsSelected: !allQuestionsSelected && selectedCount > 0,
  };
}

function isQuestionBankPickerImportDisabled({
  bankId,
  disabled,
  editLease,
  expectedDraftRevision,
  importing,
  selectedCount,
}: {
  bankId: string;
  disabled: boolean;
  editLease: QuestionBankPickerProps["editLease"];
  expectedDraftRevision: number | null | undefined;
  importing: boolean;
  selectedCount: number;
}) {
  return (
    disabled ||
    importing ||
    !selectedCount ||
    !bankId ||
    expectedDraftRevision == null ||
    !editLease
  );
}

function questionBankImportButtonLabel(importing: boolean) {
  return importing ? "Menambahkan…" : "Tambahkan";
}

function handleQuestionBankPickerDialogOpenChange(
  nextOpen: boolean,
  importPendingRef: { current: boolean },
  onOpenChange: (open: boolean) => void,
) {
  if (!nextOpen && importPendingRef.current) return;
  onOpenChange(nextOpen);
}

function QuestionBankPickerDialog({
  disabled = false,
  editLease,
  expectedDraftRevision,
  onImported,
  onOpenChange,
  open,
  quizId,
  subjectCode,
}: QuestionBankPickerProps) {
  const [bankSearch, setBankSearch] = useState("");
  const [bankPage, setBankPage] = useState(1);
  const [banks, setBanks] = useState<QuestionBankDto[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankId, setBankId] = useState("");
  const [selectedBankTitle, setSelectedBankTitle] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [questions, setQuestions] = useState<PickerQuestion[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [eligibleQuestionCount, setEligibleQuestionCount] = useState<
    number | null
  >(null);
  const [selectedQuestions, setSelectedQuestions] = useState<
    Map<string, PickerQuestion>
  >(new Map());
  const [allInBank, setAllInBank] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingEligibleQuestionCount, setLoadingEligibleQuestionCount] =
    useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [eligibleQuestionCountError, setEligibleQuestionCountError] = useState<
    string | null
  >(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const selectAllCheckboxId = useId();
  const {
    allQuestionsSelected,
    selectedCount,
    someQuestionsSelected,
  } = getQuestionBankSelectionSummary({
    allInBank,
    eligibleQuestionCount,
    selectedQuestions,
  });
  const selectAllDisabled =
    disabled || importing || loadingEligibleQuestionCount;
  const bankPageCount = Math.max(1, Math.ceil(bankTotal / BANK_PAGE_SIZE));
  const questionPageCount = Math.max(
    1,
    Math.ceil(questionTotal / QUESTION_PAGE_SIZE),
  );

  const { importPendingRef, importQuestions } = useQuestionBankImport({
    allInBank,
    bankId,
    editLease,
    expectedDraftRevision,
    importing,
    onImported,
    onOpenChange,
    quizId,
    selectedCount,
    selectedQuestions,
    setAllInBank,
    setEligibleQuestionCount,
    setError,
    setImportError,
    setImporting,
    setQuestionTotal,
    setQuestions,
    setReloadNonce,
    setSelectedQuestions,
  });

  useQuestionBankPageLoad({ bankId, bankPage, bankSearch, disabled, open, quizId, reloadNonce, setBankId, setBankTotal, setBanks, setError, setLoadingBanks, setSelectedBankTitle, subjectCode });
  useQuestionBankEligibleCountLoad({ bankId, disabled, open, quizId, reloadNonce, setAllInBank, setEligibleQuestionCount, setEligibleQuestionCountError, setLoadingEligibleQuestionCount, setSelectedQuestions, subjectCode });
  useQuestionBankQuestionPageLoad({ bankId, disabled, open, questionPage, questionSearch, quizId, reloadNonce, setError, setLoadingQuestions, setQuestionTotal, setQuestions, subjectCode });

  const toggleQuestion = (question: PickerQuestion) => {
    if (allInBank) return;
    setImportError(null);
    setSelectedQuestions((current) => {
      const next = new Map(current);
      if (next.has(question.id)) next.delete(question.id);
      else next.set(question.id, question);
      return next;
    });
  };

  const chooseBank = (nextBankId: string) => {
    if (nextBankId === bankId) return;
    applyBankChange(nextBankId);
  };

  const applyBankChange = (nextBankId: string) => {
    setBankId(nextBankId);
    setSelectedBankTitle(
      banks.find((bank) => bank.id === nextBankId)?.title ?? "",
    );
    setQuestionPage(1);
    setQuestionSearch("");
    setQuestions([]);
    setQuestionTotal(0);
    setEligibleQuestionCount(null);
    setEligibleQuestionCountError(null);
    setSelectedQuestions(new Map());
    setAllInBank(false);
    setImportError(null);
  };

  const updateBankSearch = (value: string) => {
    setBankSearch(value);
    setImportError(null);
    setBankPage(1);
  };

  const updateQuestionSearch = (value: string) => {
    setQuestionSearch(value);
    setImportError(null);
    setQuestionPage(1);
  };

  const selectAllQuestions = (checked: boolean) => {
    setSelectedQuestions(new Map());
    setAllInBank(checked);
    setImportError(null);
  };

  const reloadQuestionPage = () => {
    setImportError(null);
    setError(null);
    setReloadNonce((value) => value + 1);
  };

  const content = !quizId ? (
    <ReferenceEmptyState
      description="Simpan Kuis terlebih dahulu agar soal dari Bank Soal dapat ditambahkan."
      icon={Search}
      title="Kuis belum disimpan"
    />
  ) : (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <QuestionBankSelector
        banks={banks}
        bankPage={bankPage}
        bankPageCount={bankPageCount}
        bankSearch={bankSearch}
        bankTotal={bankTotal}
        disabled={disabled}
        importing={importing}
        loadingBanks={loadingBanks}
        onPageChange={setBankPage}
        onSearchChange={updateBankSearch}
        onSelect={chooseBank}
        selectedBankId={bankId}
        selectedBankTitle={selectedBankTitle}
      />

      <QuestionBankSelectionControls
        allQuestionsSelected={allQuestionsSelected}
        bankId={bankId}
        disabled={disabled}
        eligibleQuestionCount={eligibleQuestionCount}
        eligibleQuestionCountError={eligibleQuestionCountError}
        importing={importing}
        loadingEligibleQuestionCount={loadingEligibleQuestionCount}
        onQuestionSearchChange={updateQuestionSearch}
        onRetryCount={() => setReloadNonce((value) => value + 1)}
        onSelectAll={selectAllQuestions}
        questionSearch={questionSearch}
        selectAllCheckboxId={selectAllCheckboxId}
        selectAllDisabled={selectAllDisabled}
        someQuestionsSelected={someQuestionsSelected}
        subjectCode={subjectCode}
      />

      <QuestionBankQuestionResults
        allInBank={allInBank}
        bankId={bankId}
        disabled={disabled}
        error={error}
        importing={importing}
        importError={importError}
        loadingBanks={loadingBanks}
        loadingQuestions={loadingQuestions}
        onPageChange={setQuestionPage}
        onReload={reloadQuestionPage}
        onToggle={toggleQuestion}
        questionPage={questionPage}
        questionPageCount={questionPageCount}
        questionTotal={questionTotal}
        questions={questions}
        selectedQuestions={selectedQuestions}
      />
    </div>
  );

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) =>
          handleQuestionBankPickerDialogOpenChange(
            nextOpen,
            importPendingRef,
            onOpenChange,
          )
        }
        open={open || importing}
      >
        <DialogContent
          className={QUESTION_BANK_PICKER_DIALOG_CLASS_NAME}
          pending={importing}
        >
          <DialogHeader>
            <DialogTitle>Tambah soal dari Bank Soal</DialogTitle>
          </DialogHeader>
          {content}
          <DialogFooter className={QUESTION_BANK_PICKER_FOOTER_CLASS_NAME}>
            <span
              aria-live="polite"
              className="text-sm font-semibold text-secondary-700"
            >
              {selectedCount} soal dipilih
            </span>
            <Button
              disabled={isQuestionBankPickerImportDisabled({
                bankId,
                disabled,
                editLease,
                expectedDraftRevision,
                importing,
                selectedCount,
              })}
              onClick={() => void importQuestions()}
              type="button"
              variant="default"
            >
              {questionBankImportButtonLabel(importing)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { QuestionBankPickerDialog };
