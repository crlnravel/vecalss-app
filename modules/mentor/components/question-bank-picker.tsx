"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AlertTriangle, Search } from "@/lib/icons";
import type {
  BankQuestionDto,
  QuestionBankDto,
} from "@/lib/question-bank/repository";
import { importStandaloneQuizBankQuestionsAction } from "@/modules/mentor/quiz-actions";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import type { KaptenQuiz } from "@/modules/mentor/mock-data";
import { PaginationControls } from "@/modules/mentor/components/kapten-ui";
import {
  listQuestionBankSourcePageAction,
  listQuestionBankSourceQuestionsAction,
} from "@/modules/mentor/question-bank-actions";

const BANK_PAGE_SIZE = 20;
const QUESTION_PAGE_SIZE = 10;

type QuestionBankPickerProps = {
  currentQuestions: QuizQuestionSnapshot[];
  disabled?: boolean;
  expectedDraftRevision?: number | null;
  onImported: (questions: QuizQuestionSnapshot[], quiz: KaptenQuiz) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  quizId?: string;
  sourceBankId?: string;
  subjectCode: string;
};

type PickerQuestion = BankQuestionDto;

function questionLabel(question: PickerQuestion) {
  return question.prompt.trim() || "Soal tanpa pertanyaan";
}

function difficultyLabel(value: PickerQuestion["difficulty"]) {
  if (value === "easy") return "Mudah";
  if (value === "hard") return "Sulit";
  return "Sedang";
}

function QuestionRow({
  alreadyAdded,
  onToggle,
  question,
  selected,
}: {
  alreadyAdded: boolean;
  onToggle: () => void;
  question: PickerQuestion;
  selected: boolean;
}) {
  const checkboxId = `quiz-bank-question-${question.id}`;
  return (
    <article
      className={`min-w-0 rounded-2xl border p-3 transition-colors ${alreadyAdded ? "border-primary-100 bg-secondary-50/70" : selected ? "border-primary-300 bg-primary-50/70" : "border-primary-100 bg-white hover:border-primary-200 hover:bg-primary-50/40"}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox
          aria-label={
            alreadyAdded
              ? `Soal sudah ditambahkan: ${questionLabel(question)}`
              : selected
                ? `Batalkan pilihan: ${questionLabel(question)}`
                : `Pilih: ${questionLabel(question)}`
          }
          checked={alreadyAdded || selected}
          disabled={alreadyAdded}
          id={checkboxId}
          onCheckedChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <label
            className={`block min-w-0 ${alreadyAdded ? "cursor-default" : "cursor-pointer"}`}
            htmlFor={checkboxId}
          >
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-primary-100 bg-primary-50 px-2 py-1 font-semibold text-primary-800">
                {question.subjectCode}
              </span>
              <span className="rounded-full border border-secondary-200 bg-secondary-50 px-2 py-1 font-semibold text-secondary-600">
                {difficultyLabel(question.difficulty)}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-secondary-900">
              {questionLabel(question)}
            </p>
          </label>
          <p className="mt-1 text-xs text-secondary-500">
            Revisi {question.questionRevisionNo ?? "terbaru"}
          </p>
        </div>
      </div>
    </article>
  );
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
      role="listbox"
    >
      {banks.map((bank) => {
        const selected = bank.id === selectedBankId;
        return (
          <button
            aria-selected={selected}
            className={`min-h-11 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:ring-3 focus-visible:ring-primary-200 ${selected ? "bg-primary-50 font-semibold text-primary-900" : "text-secondary-700 hover:bg-secondary-50"}`}
            disabled={disabled}
            key={bank.id}
            onClick={() => onSelect(bank.id)}
            role="option"
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

function QuestionBankPickerDialog({
  currentQuestions,
  disabled = false,
  expectedDraftRevision,
  onImported,
  onOpenChange,
  open,
  quizId,
  sourceBankId,
  subjectCode,
}: QuestionBankPickerProps) {
  const [bankSearch, setBankSearch] = useState("");
  const [bankPage, setBankPage] = useState(1);
  const [banks, setBanks] = useState<QuestionBankDto[]>([]);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankId, setBankId] = useState(sourceBankId ?? "");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [questions, setQuestions] = useState<PickerQuestion[]>([]);
  const [questionTotal, setQuestionTotal] = useState(0);
  const [selectedQuestions, setSelectedQuestions] = useState<
    Map<string, PickerQuestion>
  >(new Map());
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [pendingBankId, setPendingBankId] = useState<string | null>(null);
  const [clearCurrentSelection, setClearCurrentSelection] = useState(false);

  const existingQuestionIds = useMemo(
    () =>
      new Set(
        currentQuestions.flatMap((question) =>
          question.sourceQuestionId ? [question.sourceQuestionId] : [],
        ),
      ),
    [currentQuestions],
  );
  const existingLocalContent = useMemo(
    () =>
      !clearCurrentSelection &&
      currentQuestions.some(
        (question) =>
          question.origin === "local" &&
          Boolean(
            question.prompt.trim() ||
            question.choices.some((choice) => choice.text.trim()) ||
            question.explanation.trim(),
          ),
      ),
    [clearCurrentSelection, currentQuestions],
  );
  const visibleQuestions = selectedOnly
    ? [...selectedQuestions.values()]
    : questions;
  const selectedCount = selectedQuestions.size;
  const effectiveExistingQuestionIds = clearCurrentSelection
    ? new Set<string>()
    : existingQuestionIds;
  const hasSelectionToClear =
    selectedQuestions.size > 0 ||
    (currentQuestions.length > 0 && !clearCurrentSelection);
  const bankPageCount = Math.max(1, Math.ceil(bankTotal / BANK_PAGE_SIZE));
  const questionPageCount = Math.max(
    1,
    Math.ceil(questionTotal / QUESTION_PAGE_SIZE),
  );

  useEffect(() => {
    if (!open || disabled || !quizId) return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        setLoadingBanks(true);
        setError(null);
        try {
          const result = await listQuestionBankSourcePageAction({
            page: bankPage,
            pageSize: BANK_PAGE_SIZE,
            purpose: "quiz",
            search: bankSearch,
            subjectCoverage: [subjectCode],
          });
          if (cancelled) return;
          const nextBanks = result.items.map(({ bank }) => bank);
          setBanks(nextBanks);
          setBankTotal(result.total);
          if (!bankId && nextBanks[0]) setBankId(nextBanks[0].id);
        } catch (loadError) {
          if (!cancelled)
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Bank Soal belum dapat dimuat.",
            );
        } finally {
          if (!cancelled) setLoadingBanks(false);
        }
      },
      bankSearch.trim() ? 250 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bankId,
    bankPage,
    bankSearch,
    disabled,
    open,
    quizId,
    reloadNonce,
    subjectCode,
  ]);

  useEffect(() => {
    if (!open || disabled || !quizId || !bankId) return;
    let cancelled = false;
    const timer = window.setTimeout(
      async () => {
        setLoadingQuestions(true);
        setError(null);
        try {
          const result = await listQuestionBankSourceQuestionsAction(bankId, {
            page: questionPage,
            pageSize: QUESTION_PAGE_SIZE,
            purpose: "quiz",
            search: questionSearch,
            subjectCode,
          });
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
          if (!cancelled)
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Soal Ready belum dapat dimuat.",
            );
        } finally {
          if (!cancelled) setLoadingQuestions(false);
        }
      },
      questionSearch.trim() ? 200 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    bankId,
    disabled,
    open,
    questionPage,
    questionSearch,
    quizId,
    reloadNonce,
    subjectCode,
  ]);

  const toggleQuestion = (question: PickerQuestion) => {
    if (effectiveExistingQuestionIds.has(question.id)) return;
    setSelectedQuestions((current) => {
      const next = new Map(current);
      if (next.has(question.id)) next.delete(question.id);
      else next.set(question.id, question);
      return next;
    });
  };

  const chooseBank = (nextBankId: string) => {
    if (nextBankId === bankId) return;
    if (hasSelectionToClear) {
      setPendingBankId(nextBankId);
      return;
    }
    applyBankChange(nextBankId);
  };

  const applyBankChange = (nextBankId: string) => {
    setBankId(nextBankId);
    setClearCurrentSelection(
      currentQuestions.length > 0 &&
        (sourceBankId ? nextBankId !== sourceBankId : true),
    );
    setQuestionPage(1);
    setQuestionSearch("");
    setQuestions([]);
    setQuestionTotal(0);
    setSelectedQuestions(new Map());
  };

  const importQuestions = async () => {
    if (
      !quizId ||
      !bankId ||
      !selectedCount ||
      existingLocalContent ||
      importing
    )
      return;
    setImporting(true);
    setError(null);
    try {
      const selectedById = new Map([...selectedQuestions.entries()]);
      const currentBySourceId = new Map(
        currentQuestions.flatMap((question) =>
          question.sourceQuestionId
            ? [[question.sourceQuestionId, question] as const]
            : [],
        ),
      );
      const questionIds = [
        ...effectiveExistingQuestionIds,
        ...selectedQuestions.keys(),
      ];
      const expectedSources = questionIds.map((questionId) => {
        const selected = selectedById.get(questionId);
        const current = currentBySourceId.get(questionId);
        return {
          contentDigest:
            selected?.questionContentDigest ??
            current?.sourceContentDigest ??
            null,
          questionId,
          revisionId:
            selected?.questionRevisionId ??
            current?.sourceQuestionRevisionId ??
            null,
        };
      });
      const result = await importStandaloneQuizBankQuestionsAction({
        expectedDraftRevision,
        expectedSources,
        questionIds,
        quizId,
        bankId,
        subtestCode: subjectCode,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onImported(result.questions, result.quiz);
      onOpenChange(false);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Soal belum dapat ditambahkan.",
      );
    } finally {
      setImporting(false);
    }
  };

  const content = !quizId ? (
    <ReferenceEmptyState
      description="Simpan Kuis terlebih dahulu agar soal dari Bank Soal dapat ditambahkan."
      icon={Search}
      title="Kuis belum disimpan"
    />
  ) : (
    <div className="grid min-w-0 gap-4">
      {existingLocalContent ? (
        <div className="rounded-2xl border border-warning-300 bg-warning-50 px-4 py-3 text-sm leading-6 text-warning-900">
          Kuis ini berisi soal lokal. Soal Bank tidak akan menggantikan konten
          lokal secara diam-diam; gunakan alur konversi pada tiket berikutnya
          atau hapus draf lokal terlebih dahulu.
        </div>
      ) : null}
      <div className="grid gap-2">
        <p className="text-xs font-bold tracking-[0.12em] text-secondary-500 uppercase">
          Bank Soal Kuis
        </p>
        <Popover>
          <PopoverTrigger
            disabled={disabled || importing || loadingBanks}
            render={
              <Button
                aria-haspopup="listbox"
                className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full justify-between`}
                type="button"
                variant="reference"
              />
            }
          >
            <span className="min-w-0 truncate">
              {banks.find((bank) => bank.id === bankId)?.title ??
                (bankId ? "Memuat Bank Soal…" : "Pilih Bank Soal")}
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
              onChange={(event) => {
                setBankSearch(event.target.value);
                setBankPage(1);
              }}
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
              onSelect={chooseBank}
              selectedBankId={bankId}
            />
            {bankTotal > BANK_PAGE_SIZE ? (
              <PaginationControls
                onPageChange={setBankPage}
                page={bankPage}
                pageCount={bankPageCount}
              />
            ) : null}
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-[min(100%,20rem)] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" />
            <FieldInput
              aria-label="Cari soal Ready"
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-11 pl-9`}
              disabled={disabled || importing || !bankId}
              onChange={(event) => {
                setQuestionSearch(event.target.value);
                setQuestionPage(1);
              }}
              placeholder={
                bankId
                  ? `Cari soal ${subjectCode}…`
                  : "Pilih Bank Soal terlebih dahulu"
              }
              value={questionSearch}
            />
          </div>
        </div>
        {loadingQuestions ? (
          <p aria-live="polite" className="text-xs text-secondary-500">
            Memuat soal Ready…
          </p>
        ) : null}
        {error ? (
          <div
            className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
            role="alert"
          >
            <p>{error}</p>
            <Button
              className="mt-2"
              disabled={loadingBanks || loadingQuestions || importing}
              onClick={() => setReloadNonce((value) => value + 1)}
              size="sm"
              type="button"
              variant="reference"
            >
              Coba lagi
            </Button>
          </div>
        ) : null}
        {!loadingQuestions && !error && !visibleQuestions.length ? (
          <ReferenceSurface className="px-4 py-10 text-center" variant="inset">
            <p className="text-sm font-semibold text-secondary-900">
              {selectedOnly
                ? "Belum ada soal yang dipilih"
                : bankId
                  ? "Tidak ada soal Ready yang cocok"
                  : "Pilih Bank Soal untuk mulai memilih"}
            </p>
            <p className="mt-1 text-sm leading-6 text-secondary-500">
              {selectedOnly
                ? "Pilih soal dari daftar, lalu gunakan tombol Tambahkan."
                : "Periksa pencarian atau pilih Bank Soal lain yang sesuai."}
            </p>
          </ReferenceSurface>
        ) : null}
        {visibleQuestions.length ? (
          <div className="grid gap-2">
            {visibleQuestions.map((question) => (
              <QuestionRow
                alreadyAdded={effectiveExistingQuestionIds.has(question.id)}
                key={question.id}
                onToggle={() => toggleQuestion(question)}
                question={question}
                selected={selectedQuestions.has(question.id)}
              />
            ))}
          </div>
        ) : null}
        {!selectedOnly && bankId && questionTotal > 0 ? (
          <PaginationControls
            onPageChange={setQuestionPage}
            page={questionPage}
            pageCount={questionPageCount}
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          className="max-h-[calc(100svh-1rem)] max-w-5xl gap-5 p-4 sm:max-w-5xl sm:p-6"
          pending={importing}
        >
          <DialogHeader>
            <DialogTitle>Tambah soal dari Bank Soal</DialogTitle>
          </DialogHeader>
          {content}
          <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 border-t border-primary-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6">
            <span
              aria-live="polite"
              className="mr-auto text-sm font-semibold text-secondary-700"
            >
              {selectedCount} soal dipilih
            </span>
            <Button
              disabled={
                disabled ||
                importing ||
                !selectedCount ||
                existingLocalContent ||
                !bankId
              }
              onClick={() => void importQuestions()}
              type="button"
              variant="brand"
            >
              {importing ? "Menambahkan…" : `Tambahkan ${selectedCount} soal`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingBankId(null);
        }}
        open={Boolean(pendingBankId)}
      >
        <AlertDialogContent
          data-quiz-bank-source-change-confirmation="true"
          pending={importing}
          size="sm"
          variant="warning"
        >
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning">
              <AlertTriangle />
            </AlertDialogMedia>
            <AlertDialogTitle>Ganti Bank Soal?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua soal yang saat ini dipilih di Kuis akan dibatalkan
              pilihannya. Setelah mengganti Bank Soal, Anda perlu memilih soal
              kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing || !pendingBankId}
              onClick={() => {
                if (!pendingBankId) return;
                applyBankChange(pendingBankId);
                setPendingBankId(null);
              }}
              variant="destructive"
            >
              Ganti Bank Soal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { QuestionBankPickerDialog };
