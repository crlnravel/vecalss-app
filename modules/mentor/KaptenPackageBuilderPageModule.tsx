"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, CircleAlert, CircleHelp, ListFilter, PackageCheck, Plus, Save, Search, Upload, X } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";
import { useCallback, useEffect, useMemo, useReducer, useRef, type ComponentType, type Dispatch, type ReactNode } from "react";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { kaptenSubjects, type BankQuestion, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { saveReusableQuestionPackageAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type PackageItem = { pointValue: number; sourceQuestionId: string; sourceQuestionRevisionId?: string };
type PackageSaveIntent = "draft" | "ready";
type PackageDraft = { description: string; id: string; items: PackageItem[]; latestReadyVersionNo?: number; revision?: number; sourceBankId: string; sourceBankName?: string; status: "draft" | "ready"; subtest: SubjectCode; title: string };
type Source = { bank: KaptenQuestionBank; questions: BankQuestion[] };
type SourceCatalogPage = { items?: Array<{ bank: KaptenQuestionBank }>; page: number; pageSize: number; total: number };
type SourceCategory = { id: string; name: string };
type ReviewIssue = { href: string; message: string };

const SOURCE_BANK_PAGE_SIZE = 20;
const SOURCE_QUESTION_PAGE_SIZE = 100;

function subjectName(code: SubjectCode) { return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code; }

function packageBankLabel(bank: KaptenQuestionBank) {
  const folderName = bank.folderPath?.at(-1)?.name;
  const categoryNames = bank.categories?.map((category) => category.name).join(", ");
  return [bank.title, `${bank.questionCount} soal`, categoryNames, folderName].filter(Boolean).join(" · ");
}

function packageDraftSignature(draft: PackageDraft) {
  return JSON.stringify({ description: draft.description, items: draft.items, sourceBankId: draft.sourceBankId, subtest: draft.subtest, title: draft.title });
}

function formatPointTotal(items: readonly PackageItem[]) {
  const totalHundredths = items.reduce((total, item) => total + (Number.isFinite(item.pointValue) ? Math.round(item.pointValue * 100) : 0), 0);
  return (totalHundredths / 100).toFixed(2);
}

const EMPTY_SOURCE_CATEGORIES: SourceCategory[] = [];

type PackageBuilderState = {
  bankCategoryFilter: string;
  bankSearch: string;
  conflict: boolean;
  confirmReady: boolean;
  draft: PackageDraft;
  error: string | null;
  pendingBankId: string | null;
  pendingSubtest: SubjectCode | null;
  questionSearch: string;
  savedDraftSignature: string;
  saving: boolean;
  scoreErrors: Set<string>;
  sourceBankLoading: boolean;
  sourceBankPage: number;
  sourceBankTotal: number;
  sourceEntries: Source[];
  sourceQuestionLoadedBankId: string | null;
  sourceQuestionLoading: boolean;
  sourceQuestionPage: number;
  sourceQuestionTotal: number;
};

type PackageBuilderAction =
  | { type: "setDraft"; draft: PackageDraft | ((prev: PackageDraft) => PackageDraft) }
  | { type: "setBankSearch"; search: string }
  | { type: "setBankCategoryFilter"; filter: string }
  | { type: "setSourceBankPage"; page: number }
  | { type: "setSourceBankLoading"; loading: boolean }
  | { type: "setSourceBankResults"; items: Array<{ bank: KaptenQuestionBank }>; total: number }
  | { type: "setQuestionSearch"; search: string }
  | { type: "setSourceQuestionPage"; page: number }
  | { type: "setSourceQuestionLoading"; loading: boolean }
  | { type: "setSourceQuestionResults"; bank: KaptenQuestionBank; questions: BankQuestion[]; total: number }
  | { type: "changeBank"; bankId: string }
  | { type: "confirmBankChange" }
  | { type: "cancelPendingBank" }
  | { type: "changeSubtest"; subtest: SubjectCode }
  | { type: "confirmSubtestChange" }
  | { type: "cancelPendingSubtest" }
  | { type: "updateItem"; pointValue: number; sourceQuestionId: string }
  | { type: "moveItem"; direction: -1 | 1; index: number }
  | { type: "removeItem"; sourceQuestionId: string }
  | { type: "addItem"; question: BankQuestion }
  | { type: "setValidation"; error: string | null; scoreErrors: Set<string> }
  | { type: "saveStart" }
  | { type: "saveFailure"; conflict: boolean; error: string }
  | { type: "saveSuccess"; nextDraft: PackageDraft }
  | { type: "setConfirmReady"; confirm: boolean };

function packageBuilderReducer(state: PackageBuilderState, action: PackageBuilderAction): PackageBuilderState {
  switch (action.type) {
    case "setDraft": {
      const nextDraft = typeof action.draft === "function" ? action.draft(state.draft) : action.draft;
      return { ...state, draft: nextDraft };
    }
    case "setBankSearch":
      return { ...state, bankSearch: action.search, sourceBankPage: 1 };
    case "setBankCategoryFilter":
      return { ...state, bankCategoryFilter: action.filter, sourceBankPage: 1 };
    case "setSourceBankPage":
      return { ...state, sourceBankPage: action.page };
    case "setSourceBankLoading":
      return { ...state, sourceBankLoading: action.loading };
    case "setSourceBankResults": {
      const selected = state.sourceEntries.find(({ bank }) => bank.id === state.draft.sourceBankId);
      const next = action.items.map(({ bank }) => ({
        bank,
        questions: state.sourceEntries.find((entry) => entry.bank.id === bank.id)?.questions ?? [],
      }));
      const nextEntries = selected && !next.some(({ bank }) => bank.id === selected.bank.id) ? [selected, ...next] : next;
      return { ...state, sourceBankTotal: action.total, sourceEntries: nextEntries };
    }
    case "setQuestionSearch":
      return {
        ...state,
        questionSearch: action.search,
        sourceQuestionLoadedBankId: null,
        sourceQuestionPage: 1,
        sourceQuestionTotal: 0,
      };
    case "setSourceQuestionPage":
      return { ...state, sourceQuestionPage: action.page };
    case "setSourceQuestionLoading":
      return { ...state, sourceQuestionLoading: action.loading };
    case "setSourceQuestionResults": {
      const existing = state.sourceEntries.find(({ bank }) => bank.id === state.draft.sourceBankId);
      const incomingQuestions = action.questions;
      const questions = state.sourceQuestionPage === 1
        ? incomingQuestions
        : [...(existing?.questions ?? []), ...incomingQuestions].filter((question, index, all) => all.findIndex((candidate) => candidate.id === question.id) === index);
      const nextEntry = { bank: action.bank, questions };
      const nextEntries = state.sourceEntries.some(({ bank }) => bank.id === state.draft.sourceBankId)
        ? state.sourceEntries.map((entry) => entry.bank.id === state.draft.sourceBankId ? nextEntry : entry)
        : [nextEntry, ...state.sourceEntries];
      return {
        ...state,
        sourceEntries: nextEntries,
        sourceQuestionLoadedBankId: state.draft.sourceBankId,
        sourceQuestionTotal: action.total,
      };
    }
    case "changeBank":
      if (action.bankId === state.draft.sourceBankId) return state;
      if (state.draft.items.length) return { ...state, pendingBankId: action.bankId };
      return {
        ...state,
        draft: { ...state.draft, items: [], sourceBankId: action.bankId, subtest: "PU" },
        questionSearch: "",
        sourceQuestionLoadedBankId: null,
        sourceQuestionPage: 1,
        sourceQuestionTotal: 0,
      };
    case "confirmBankChange":
      if (!state.pendingBankId) return state;
      return {
        ...state,
        draft: { ...state.draft, items: [], sourceBankId: state.pendingBankId, subtest: "PU" },
        pendingBankId: null,
        questionSearch: "",
        sourceQuestionLoadedBankId: null,
        sourceQuestionPage: 1,
        sourceQuestionTotal: 0,
      };
    case "cancelPendingBank":
      return { ...state, pendingBankId: null };
    case "changeSubtest":
      if (action.subtest === state.draft.subtest) return state;
      if (state.draft.items.length) return { ...state, pendingSubtest: action.subtest };
      return {
        ...state,
        draft: { ...state.draft, items: [], subtest: action.subtest },
        questionSearch: "",
        sourceQuestionLoadedBankId: null,
        sourceQuestionPage: 1,
        sourceQuestionTotal: 0,
      };
    case "confirmSubtestChange":
      if (!state.pendingSubtest) return state;
      return {
        ...state,
        draft: { ...state.draft, items: [], subtest: state.pendingSubtest },
        pendingSubtest: null,
        questionSearch: "",
        sourceQuestionLoadedBankId: null,
        sourceQuestionPage: 1,
        sourceQuestionTotal: 0,
      };
    case "cancelPendingSubtest":
      return { ...state, pendingSubtest: null };
    case "updateItem": {
      const nextItems = state.draft.items.map((item) =>
        item.sourceQuestionId === action.sourceQuestionId ? { ...item, pointValue: action.pointValue } : item,
      );
      const nextScoreErrors = new Set(state.scoreErrors);
      if (Number.isFinite(action.pointValue) && action.pointValue > 0) {
        nextScoreErrors.delete(action.sourceQuestionId);
      }
      return { ...state, draft: { ...state.draft, items: nextItems }, scoreErrors: nextScoreErrors };
    }
    case "moveItem": {
      const nextItems = [...state.draft.items];
      const target = action.index + action.direction;
      if (target < 0 || target >= nextItems.length) return state;
      [nextItems[action.index], nextItems[target]] = [nextItems[target]!, nextItems[action.index]!] as [PackageItem, PackageItem];
      return { ...state, draft: { ...state.draft, items: nextItems } };
    }
    case "removeItem":
      return {
        ...state,
        draft: { ...state.draft, items: state.draft.items.filter((item) => item.sourceQuestionId !== action.sourceQuestionId) },
      };
    case "addItem":
      return {
        ...state,
        draft: {
          ...state.draft,
          items: [...state.draft.items, { pointValue: 1, sourceQuestionId: action.question.id, sourceQuestionRevisionId: action.question.questionRevisionId }],
        },
      };
    case "setValidation":
      return { ...state, error: action.error, scoreErrors: action.scoreErrors };
    case "saveStart":
      return { ...state, conflict: false, error: null, saving: true };
    case "saveFailure":
      return { ...state, conflict: action.conflict, error: action.error, saving: false };
    case "saveSuccess":
      return {
        ...state,
        draft: action.nextDraft,
        savedDraftSignature: packageDraftSignature(action.nextDraft),
        saving: false,
      };
    case "setConfirmReady":
      return { ...state, confirmReady: action.confirm };
    default:
      return state;
  }
}

type PackageBuilderViewModel = {
  availableQuestions: BankQuestion[];
  canReady: boolean;
  candidates: BankQuestion[];
  draftTotalPoints: string;
  invalidPointIds: string[];
  readyActionLabel: string;
  reviewIssues: ReviewIssue[];
  selectedQuestionById: Map<string, BankQuestion>;
  selectedSource?: Source;
  sourceBankCategories: SourceCategory[];
  sourceQuestionLoadedCount: number;
  unavailableQuestionIds: string[];
};

type PackageBuilderActions = {
  changeBank: (bankId: string) => void;
  changeSubtest: (subtest: SubjectCode) => void;
  confirmBankChange: () => void;
  confirmSubtestChange: () => void;
  moveItem: (index: number, direction: -1 | 1) => void;
  save: (completionIntent: PackageSaveIntent) => Promise<void>;
  updateItem: (sourceQuestionId: string, pointValue: number) => void;
};

type PackageBuilderController = {
  actions: PackageBuilderActions;
  dispatch: Dispatch<PackageBuilderAction>;
  hasUnsavedChanges: boolean;
  id?: string;
  saved: boolean;
  state: PackageBuilderState;
  view: PackageBuilderViewModel;
};

function getPackageBuilderInitialDraft(id?: string, initialDraft?: PackageDraft | null): PackageDraft {
  return initialDraft ?? { description: "", id: id ?? "baru", items: [], sourceBankId: "", status: "draft", subtest: "PU", title: "Paket Soal Baru" };
}

function createPackageBuilderInitialState({ draft, sourceCatalog, sourceCatalogPage }: { draft: PackageDraft; sourceCatalog?: Source[]; sourceCatalogPage?: SourceCatalogPage }): PackageBuilderState {
  return {
    bankCategoryFilter: "",
    bankSearch: "",
    conflict: false,
    confirmReady: false,
    draft,
    error: null,
    pendingBankId: null,
    pendingSubtest: null,
    questionSearch: "",
    savedDraftSignature: packageDraftSignature(draft),
    saving: false,
    scoreErrors: new Set<string>(),
    sourceBankLoading: false,
    sourceBankPage: sourceCatalogPage?.page ?? 1,
    sourceBankTotal: sourceCatalogPage?.total ?? sourceCatalog?.length ?? 0,
    sourceEntries: sourceCatalog ?? sourceCatalogPage?.items?.map(({ bank }) => ({ bank, questions: [] })) ?? [],
    sourceQuestionLoadedBankId: null,
    sourceQuestionLoading: false,
    sourceQuestionPage: 1,
    sourceQuestionTotal: 0,
  };
}

function getPackageBuilderViewModel(state: PackageBuilderState, sourceCategories: SourceCategory[]): PackageBuilderViewModel {
  const { draft, sourceEntries } = state;
  const selectedSource = sourceEntries.find(({ bank }) => bank.id === draft.sourceBankId);
  const sourceQuestionLoadedCount = selectedSource?.questions.length ?? 0;
  const candidates = selectedSource?.questions.filter((question) => question.subjectCode === draft.subtest) ?? [];
  const selectedQuestionById = new Map(candidates.map((question) => [question.id, question]));
  const availableQuestions = candidates.filter((question) => !draft.items.some((item) => item.sourceQuestionId === question.id) && question.prompt.toLowerCase().includes(state.questionSearch.trim().toLowerCase()));
  const draftTotalPoints = formatPointTotal(draft.items);
  const invalidPointIds = draft.items.flatMap((item) => (!Number.isFinite(item.pointValue) || item.pointValue <= 0) ? [item.sourceQuestionId] : []);
  const canCheckAvailability = state.sourceQuestionLoadedBankId === draft.sourceBankId && selectedSource && !state.sourceQuestionLoading && !state.questionSearch.trim() && sourceQuestionLoadedCount >= state.sourceQuestionTotal;
  const unavailableQuestionIds = canCheckAvailability ? draft.items.flatMap((item) => !selectedQuestionById.has(item.sourceQuestionId) ? [item.sourceQuestionId] : []) : [];
  const reviewIssues: ReviewIssue[] = [];
  if (!draft.title.trim()) reviewIssues.push({ href: "#package-title", message: "Masukkan judul Paket Soal." });
  if (!draft.sourceBankId) reviewIssues.push({ href: "#package-source-bank-picker", message: "Pilih Bank Soal sumber." });
  else if (!draft.items.length) reviewIssues.push({ href: "#package-question-search", message: "Tambahkan minimal satu soal dari Subtest terpilih." });
  if (unavailableQuestionIds.length) reviewIssues.push({ href: "#package-question-search", message: `${unavailableQuestionIds.length} soal tidak tersedia dari sumber yang sedang dipilih.` });
  if (invalidPointIds.length) reviewIssues.push({ href: `#points-${invalidPointIds[0]}`, message: `${invalidPointIds.length} soal harus memiliki poin lebih dari 0.` });
  const sourceBankCategories = [...new Map((sourceCategories.length ? sourceCategories : sourceEntries.flatMap(({ bank }) => bank.categories ?? [])).map((category) => [category.id, category])).values()]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  return { availableQuestions, canReady: reviewIssues.length === 0, candidates, draftTotalPoints, invalidPointIds, readyActionLabel: draft.latestReadyVersionNo ? "Terapkan perubahan" : "Siapkan versi pertama", reviewIssues, selectedQuestionById, selectedSource, sourceBankCategories, sourceQuestionLoadedCount, unavailableQuestionIds };
}

function getPackageBuilderValidation(draft: PackageDraft) {
  const scoreErrors = new Set(draft.items.reduce<string[]>((invalidIds, item) => {
    if (!Number.isFinite(item.pointValue) || item.pointValue <= 0) invalidIds.push(item.sourceQuestionId);
    return invalidIds;
  }, []));
  if (!draft.title.trim()) return { error: "Masukkan judul Paket Soal.", scoreErrors, valid: false };
  if (!draft.sourceBankId) return { error: "Pilih Bank Soal terlebih dahulu.", scoreErrors, valid: false };
  if (!draft.items.length) return { error: "Tambahkan minimal satu soal siap dari Subtest terpilih.", scoreErrors, valid: false };
  if (scoreErrors.size) return { error: "Perbaiki poin yang ditandai; setiap soal harus bernilai positif.", scoreErrors, valid: false };
  return { error: null, scoreErrors, valid: true };
}

function usePackageBuilderNavigationGuard({ hasUnsavedChanges, navigatingAfterSaveRef, saving }: { hasUnsavedChanges: boolean; navigatingAfterSaveRef: { current: boolean }; saving: boolean }) {
  useEffect(() => {
    if (!hasUnsavedChanges && !saving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { if (navigatingAfterSaveRef.current) return; event.preventDefault(); };
    const handleRouteClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!target || target.getAttribute("target") === "_blank" || target.getAttribute("href")?.startsWith("#")) return;
      if (saving) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!window.confirm("Perubahan belum disimpan. Tinggalkan halaman ini?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleRouteClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleRouteClick, true);
    };
  }, [hasUnsavedChanges, navigatingAfterSaveRef, saving]);
}

function usePackageBuilderSourceBankLoader({ bankCategoryFilter, bankSearch, dispatch, draft, sourceBankPage }: { bankCategoryFilter: string; bankSearch: string; dispatch: Dispatch<PackageBuilderAction>; draft: PackageDraft; sourceBankPage: number }) {
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      dispatch({ loading: true, type: "setSourceBankLoading" });
      try {
        const result = await listQuestionBankSourcePageAction({ categoryId: bankCategoryFilter || undefined, page: sourceBankPage, pageSize: SOURCE_BANK_PAGE_SIZE, purpose: "tryout", search: bankSearch, subjectCoverage: draft.subtest ? [draft.subtest] : undefined });
        if (cancelled) return;
        dispatch({ items: result.items, total: result.total, type: "setSourceBankResults" });
      } finally {
        dispatch({ loading: false, type: "setSourceBankLoading" });
      }
    }, bankSearch.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bankCategoryFilter, bankSearch, dispatch, draft.subtest, sourceBankPage]);
}

function usePackageBuilderSourceQuestionLoader({ dispatch, draft, questionSearch, sourceQuestionPage }: { dispatch: Dispatch<PackageBuilderAction>; draft: PackageDraft; questionSearch: string; sourceQuestionPage: number }) {
  useEffect(() => {
    if (!draft.sourceBankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      dispatch({ loading: true, type: "setSourceQuestionLoading" });
      try {
        const result = await listQuestionBankSourceQuestionsAction(draft.sourceBankId, { page: sourceQuestionPage, pageSize: SOURCE_QUESTION_PAGE_SIZE, purpose: "tryout", search: questionSearch });
        if (cancelled || !result) return;
        dispatch({ bank: result.bank as KaptenQuestionBank, questions: result.questions as BankQuestion[], total: result.total, type: "setSourceQuestionResults" });
      } finally {
        dispatch({ loading: false, type: "setSourceQuestionLoading" });
      }
    }, questionSearch.trim() ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [dispatch, draft.sourceBankId, questionSearch, sourceQuestionPage]);
}

function usePackageBuilderSelectionActions({ dispatch, saving }: { dispatch: Dispatch<PackageBuilderAction>; saving: boolean }) {
  const changeBank = useCallback((bankId: string) => { if (!saving) dispatch({ bankId, type: "changeBank" }); }, [dispatch, saving]);
  const confirmBankChange = useCallback(() => { if (!saving) dispatch({ type: "confirmBankChange" }); }, [dispatch, saving]);
  const changeSubtest = useCallback((subtest: SubjectCode) => { if (!saving) dispatch({ subtest, type: "changeSubtest" }); }, [dispatch, saving]);
  const confirmSubtestChange = useCallback(() => { if (!saving) dispatch({ type: "confirmSubtestChange" }); }, [dispatch, saving]);
  const updateItem = useCallback((sourceQuestionId: string, pointValue: number) => { if (!saving) dispatch({ pointValue, sourceQuestionId, type: "updateItem" }); }, [dispatch, saving]);
  const moveItem = useCallback((index: number, direction: -1 | 1) => { if (!saving) dispatch({ direction, index, type: "moveItem" }); }, [dispatch, saving]);
  return { changeBank, changeSubtest, confirmBankChange, confirmSubtestChange, moveItem, updateItem };
}

function usePackageBuilderSaveAction({ dispatch, id, navigatingAfterSaveRef, state }: { dispatch: Dispatch<PackageBuilderAction>; id?: string; navigatingAfterSaveRef: { current: boolean }; state: PackageBuilderState }) {
  return useCallback(async (completionIntent: PackageSaveIntent) => {
    if (state.saving) return;
    const validation = getPackageBuilderValidation(state.draft);
    if (!validation.valid) {
      dispatch({ error: validation.error, scoreErrors: validation.scoreErrors, type: "setValidation" });
      return;
    }
    dispatch({ type: "saveStart" });
    try {
      const result = await saveReusableQuestionPackageAction({ completionIntent, description: state.draft.description, expectedRevision: state.draft.revision, id, items: state.draft.items, sourceBankId: state.draft.sourceBankId, subtest: state.draft.subtest, title: state.draft.title });
      if (!result.ok) {
        dispatch({ conflict: result.code === "package_conflict", error: result.message, type: "saveFailure" });
        return;
      }
      const savedPackage = result.result.package;
      const nextDraft: PackageDraft = { description: savedPackage.description, id: savedPackage.id, items: savedPackage.items.map((item: { pointValue: number | string; sourceQuestionId: string; sourceQuestionRevisionId?: string | null }) => ({ pointValue: Number(item.pointValue), sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined })), latestReadyVersionNo: savedPackage.latestReadyVersionNo, revision: savedPackage.revision, sourceBankId: savedPackage.sourceBankId, sourceBankName: savedPackage.sourceBankName, status: savedPackage.status as "draft" | "ready", subtest: savedPackage.subtest as SubjectCode, title: savedPackage.title };
      dispatch({ nextDraft, type: "saveSuccess" });
      navigatingAfterSaveRef.current = true;
      window.location.assign(`/mentor/packages/${savedPackage.id}?${completionIntent === "ready" ? "released=1" : "saved=draft"}`);
    } catch (saveError) {
      dispatch({ conflict: false, error: saveError instanceof Error ? saveError.message : "Paket Soal belum dapat disimpan.", type: "saveFailure" });
    }
  }, [dispatch, id, navigatingAfterSaveRef, state]);
}

function usePackageBuilderState({ id, initialDraft, sourceCatalog, sourceCatalogPage, sourceCategories }: { id?: string; initialDraft?: PackageDraft | null; sourceCatalog?: Source[]; sourceCatalogPage?: SourceCatalogPage; sourceCategories: SourceCategory[] }): PackageBuilderController {
  const initialDraftValue = useMemo(() => getPackageBuilderInitialDraft(id, initialDraft), [id, initialDraft]);
  const [state, dispatch] = useReducer(packageBuilderReducer, { draft: initialDraftValue, sourceCatalog, sourceCatalogPage }, ({ draft, sourceCatalog: catalog, sourceCatalogPage: catalogPage }) => createPackageBuilderInitialState({ draft, sourceCatalog: catalog, sourceCatalogPage: catalogPage }));
  const navigatingAfterSaveRef = useRef(false);
  const saved = Boolean(id);
  const hasUnsavedChanges = useMemo(() => packageDraftSignature(state.draft) !== state.savedDraftSignature, [state.draft, state.savedDraftSignature]);
  usePackageBuilderNavigationGuard({ hasUnsavedChanges, navigatingAfterSaveRef, saving: state.saving });
  usePackageBuilderSourceBankLoader({ bankCategoryFilter: state.bankCategoryFilter, bankSearch: state.bankSearch, dispatch, draft: state.draft, sourceBankPage: state.sourceBankPage });
  usePackageBuilderSourceQuestionLoader({ dispatch, draft: state.draft, questionSearch: state.questionSearch, sourceQuestionPage: state.sourceQuestionPage });
  const view = useMemo(() => getPackageBuilderViewModel(state, sourceCategories), [sourceCategories, state]);
  const selectionActions = usePackageBuilderSelectionActions({ dispatch, saving: state.saving });
  const save = usePackageBuilderSaveAction({ dispatch, id, navigatingAfterSaveRef, state });
  return { actions: { ...selectionActions, save }, dispatch, hasUnsavedChanges, id, saved, state, view };
}

function PackageBuilderHeader({ controller }: { controller: PackageBuilderController }) {
  const { id, saved, state } = controller;

  return <>
    <Button aria-disabled={state.saving} aria-label={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} nativeButton={false} render={<Link href={saved ? `/mentor/packages/${id}` : "/mentor/packages"} />} size="icon" title={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} variant="ghost"><ChevronLeft /></Button>
    <ReferencePageHeader
      description="Susun sumber, soal, dan poin dalam satu ruang kerja. Simpan draf kapan saja atau lanjutkan sampai siap."
      title={saved ? `Edit pertanyaan & poin · ${state.draft.title}` : "Buat Paket Soal"}
    />
  </>;
}

function PackageBuilderError({ controller }: { controller: PackageBuilderController }) {
  const { state } = controller;
  if (!state.error) return null;

  return <ReferenceSurface as="div" className="flex flex-wrap items-start gap-2 px-4 py-3 text-sm text-danger-600" role="alert" variant="inset"><CircleAlert className="mt-0.5 size-4 shrink-0" />{state.error}{state.conflict ? <Button className="ml-6" onClick={() => window.location.reload()} size="sm" type="button" variant="reference">Muat ulang data terbaru</Button> : null}</ReferenceSurface>;
}

function PackageBuilderDraftDetails({ controller }: { controller: PackageBuilderController }) {
  const { saved, state } = controller;
  const { draft, saving } = state;

  return <>
    {!saved ? <ReferenceSurface as="section" aria-labelledby="package-source-heading" className="grid gap-5 p-5 sm:p-7">
      <h2 className="text-xl font-semibold text-secondary-900" id="package-source-heading">Pilih sumber dan detail paket</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-500">Bank Soal dan Subtest menjadi identitas paket setelah pertama kali disimpan.</p>
      <PackageBuilderError controller={controller} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="package-title" required>Judul Paket</FieldLabel><FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={saving} id="package-title" onChange={(event) => controller.dispatch({ draft: (current) => ({ ...current, title: event.target.value }), type: "setDraft" })} value={draft.title} /></Field><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="package-description">Deskripsi singkat</FieldLabel><FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={saving} id="package-description" onChange={(event) => controller.dispatch({ draft: (current) => ({ ...current, description: event.target.value }), type: "setDraft" })} value={draft.description} /></Field></div>
    </ReferenceSurface> : <PackageBuilderError controller={controller} />}
    {saved && draft.latestReadyVersionNo ? <ReferenceSurface as="section" aria-label="Keamanan versi aktif" className="flex items-start gap-3 px-4 py-4 text-sm text-student-status-attention-fg sm:px-5" variant="inset"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p><span className="font-semibold">{packageReleaseLabel(draft.latestReadyVersionNo)} tetap aktif.</span> Versi aktif tidak berubah sampai perubahan diterapkan.</p></ReferenceSurface> : null}
  </>;
}

function PackageSourceBankOptions({ bankCategoryFilter, bankSearch, onChangeBank, saving, sourceEntries, sourceBankId }: { bankCategoryFilter: string; bankSearch: string; onChangeBank: (bankId: string) => void; saving: boolean; sourceEntries: Source[]; sourceBankId: string }) {
  const searchTerm = bankSearch.trim().toLowerCase();

  return sourceEntries.reduce<ReactNode[]>((options, { bank }) => {
    const searchText = [bank.title, bank.description, bank.folderPath?.map((item) => item.name).join(" "), ...(bank.categories ?? []).map((category) => category.name)].filter(Boolean).join(" ").toLowerCase();
    if (!searchText.includes(searchTerm) || (bankCategoryFilter && !bank.categoryIds?.includes(bankCategoryFilter))) return options;
    options.push(<Button className="h-auto justify-start py-2 text-left" disabled={saving} key={bank.id} onClick={() => onChangeBank(bank.id)} variant={bank.id === sourceBankId ? "contextSelected" : "ghost"}><span className="min-w-0 truncate">{packageBankLabel(bank)}</span></Button>);
    return options;
  }, []);
}

function PackageSubtestOptions({ draft, onChangeSubtest, saving, selectedSource }: { draft: PackageDraft; onChangeSubtest: (subtest: SubjectCode) => void; saving: boolean; selectedSource?: Source }) {
  const subjectCoverageSet = new Set(selectedSource?.bank.subjectCoverage ?? []);

  return subjectCodes.map((code) => {
    const count = selectedSource?.questions.filter((question) => question.subjectCode === code).length ?? 0;
    const hasSubject = Boolean(subjectCoverageSet.has(code) || count);
    return <Button className="justify-start" disabled={saving || !hasSubject} key={code} onClick={() => onChangeSubtest(code)} variant={code === draft.subtest ? "contextSelected" : "ghost"}>{code} · {subjectName(code)}</Button>;
  });
}

function PackageSourceBankPagination({ onPageChange, page, saving, total }: { onPageChange: (page: number) => void; page: number; saving: boolean; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / SOURCE_BANK_PAGE_SIZE));
  if (totalPages <= 1) return null;

  return <div className="flex items-center justify-between text-xs text-secondary-500"><span>Halaman {page} dari {totalPages}</span><span className="flex gap-1"><Button aria-label="Bank soal sebelumnya" disabled={saving || page === 1} onClick={() => onPageChange(Math.max(1, page - 1))} size="icon-xs" type="button" variant="ghost"><ChevronLeft /></Button><Button aria-label="Bank soal berikutnya" disabled={saving || page >= totalPages} onClick={() => onPageChange(page + 1)} size="icon-xs" type="button" variant="ghost"><ArrowDown className="rotate-[-90deg]" /></Button></span></div>;
}

function PackageBuilderSavedSource({ draft, selectedSource }: { draft: PackageDraft; selectedSource?: Source }) {
  const bank = selectedSource?.bank;

  return <div className="mt-4 grid gap-4 text-sm"><div><p className="text-secondary-500">Bank Soal</p><p className="mt-1 font-semibold text-secondary-900">{bank?.title ?? draft.sourceBankName}</p>{bank?.folderPath?.length || bank?.categories?.length ? <div className="mt-2 flex flex-wrap gap-2">{bank.folderPath?.length ? <MentorBadge className="max-w-full whitespace-normal text-left" size="xs" tone="neutral">{bank.folderPath.map((item) => item.name).join(" / ")}</MentorBadge> : null}{bank.categories?.map((category) => <MentorBadge key={category.id} size="xs" tone="category">{category.name}</MentorBadge>)}</div> : null}</div><div><p className="text-secondary-500">Subtest</p><p className="mt-1"><MentorBadge size="sm" tone="category">{draft.subtest} · {subjectName(draft.subtest)}</MentorBadge></p></div><div><p className="text-secondary-500">Versi</p><p className="mt-1 font-semibold text-secondary-900">{draft.latestReadyVersionNo ? packageReleaseLabel(draft.latestReadyVersionNo) : "Draf"}</p></div></div>;
}

function PackageBuilderSourceControls({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state, view } = controller;
  const { bankCategoryFilter, bankSearch, draft, saving, sourceBankLoading, sourceBankPage, sourceBankTotal } = state;

  return <div className="mt-4 grid gap-4"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="package-source-bank-picker" required>Bank Soal</FieldLabel><Picker disabled={saving} empty="Tidak ada Bank Soal siap." id="package-source-bank-picker" label={view.selectedSource?.bank.title ?? "Pilih Bank Soal"} openContent={<><FieldInput aria-label="Cari Bank Soal" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 rounded-xl px-3 py-2 text-sm`} disabled={saving} onChange={(event) => { if (saving) return; dispatch({ search: event.target.value, type: "setBankSearch" }); }} placeholder="Cari judul, folder, atau kategori…" value={bankSearch} /><PackageCategoryFilter disabled={saving} onValueChange={(value) => { if (saving) return; dispatch({ filter: value, type: "setBankCategoryFilter" }); }} options={view.sourceBankCategories.map((category) => ({ label: category.name, value: category.id }))} value={bankCategoryFilter} />{sourceBankLoading ? <p className="px-2 py-1 text-xs text-secondary-500">Memuat bank soal…</p> : null}<PackageSourceBankOptions bankCategoryFilter={bankCategoryFilter} bankSearch={bankSearch} onChangeBank={actions.changeBank} saving={saving} sourceBankId={draft.sourceBankId} sourceEntries={state.sourceEntries} /></>} /></Field><PackageSourceBankPagination onPageChange={(page) => dispatch({ page, type: "setSourceBankPage" })} page={sourceBankPage} saving={saving} total={sourceBankTotal} /><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="package-subtest-picker" required>Subtest</FieldLabel><Picker disabled={saving || !draft.sourceBankId} empty="Tidak ada Subtest." id="package-subtest-picker" label={draft.sourceBankId ? `${draft.subtest} · ${subjectName(draft.subtest)}` : "Pilih Bank terlebih dahulu"} openContent={<PackageSubtestOptions draft={draft} onChangeSubtest={actions.changeSubtest} saving={saving} selectedSource={view.selectedSource} />} /></Field></div>;
}

function PackageBuilderSourcePanel({ controller }: { controller: PackageBuilderController }) {
  const { saved, state, view } = controller;

  return <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start"><ReferenceSurface as="section" aria-labelledby="package-source-controls-heading" className="p-4"><div className="flex items-center gap-2"><h2 className="font-semibold text-secondary-900" id="package-source-controls-heading">Informasi Bank Soal</h2><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label="Bantuan informasi Bank Soal" size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent>Menampilkan Bank Soal dan Subtest yang digunakan untuk versi ini.</TooltipContent></Tooltip></TooltipProvider></div>{saved ? <PackageBuilderSavedSource draft={state.draft} selectedSource={view.selectedSource} /> : <PackageBuilderSourceControls controller={controller} />}</ReferenceSurface></aside>;
}

function PackageSelectedQuestionItem({ index, invalid, item, itemCount, onMove, onRemove, onUpdate, question, saving }: { index: number; invalid: boolean; item: PackageItem; itemCount: number; onMove: (index: number, direction: -1 | 1) => void; onRemove: () => void; onUpdate: (sourceQuestionId: string, pointValue: number) => void; question?: BankQuestion; saving: boolean }) {
  return <li className="rounded-2xl bg-white/80 p-3"><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{index + 1}</span><p className="min-w-0 flex-1 text-sm leading-6 text-secondary-900">{question?.prompt ?? "Soal sumber tidak tersedia untuk filter ini."}</p></div><div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2"><Field><FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`points-${item.sourceQuestionId}`} required>Poin</FieldLabel><FieldInput aria-describedby={invalid ? `points-error-${item.sourceQuestionId}` : undefined} aria-invalid={invalid} className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-10 rounded-xl px-3 py-2`} disabled={saving} id={`points-${item.sourceQuestionId}`} min="0.01" onChange={(event) => onUpdate(item.sourceQuestionId, Number(event.target.value))} step="0.01" type="number" value={item.pointValue} /></Field><Button aria-label={`Naikkan urutan soal ${index + 1}`} disabled={saving || !index} onClick={() => onMove(index, -1)} size="icon-sm" variant="ghost"><ArrowUp /></Button><Button aria-label={`Turunkan urutan soal ${index + 1}`} disabled={saving || index === itemCount - 1} onClick={() => onMove(index, 1)} size="icon-sm" variant="ghost"><ArrowDown /></Button><Button aria-label={`Hapus soal ${index + 1}`} disabled={saving} onClick={onRemove} size="icon-sm" variant="ghost"><X /></Button></div>{invalid ? <p className="mt-2 text-xs font-medium text-danger-600" id={`points-error-${item.sourceQuestionId}`}>Masukkan poin lebih dari 0.</p> : null}</li>;
}

function PackageBuilderSelectedQuestions({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state, view } = controller;
  const invalidPointIdSet = new Set(view.invalidPointIds);

  return <ReferenceSurface as="section" className="min-w-0 p-5" variant="inset"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-secondary-900">Soal terpilih</h2><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-primary-800">{state.draft.items.length}</span></div>{state.draft.items.length ? <ol className="mt-4 grid gap-3">{state.draft.items.map((item, index) => <PackageSelectedQuestionItem index={index} invalid={state.scoreErrors.has(item.sourceQuestionId) || invalidPointIdSet.has(item.sourceQuestionId)} item={item} itemCount={state.draft.items.length} key={item.sourceQuestionId} onMove={actions.moveItem} onRemove={() => { if (!state.saving) dispatch({ sourceQuestionId: item.sourceQuestionId, type: "removeItem" }); }} onUpdate={actions.updateItem} question={view.selectedQuestionById.get(item.sourceQuestionId)} saving={state.saving} />)}</ol> : <ReferenceEmptyState className="mt-4 min-h-48" description="Pilih soal dari daftar setelah Bank dan Subtest ditentukan." icon={PackageCheck} title="Belum ada soal dipilih" />}</ReferenceSurface>;
}

function packageDifficultyLabel(difficulty: BankQuestion["difficulty"]) {
  return difficulty === "easy" ? "Mudah" : difficulty === "hard" ? "Sulit" : "Sedang";
}

function PackageDiscoveryQuestion({ onAdd, question, saving }: { onAdd: (question: BankQuestion) => void; question: BankQuestion; saving: boolean }) {
  return <article className="rounded-2xl border border-primary-100 bg-white/80 p-3"><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {packageDifficultyLabel(question.difficulty)}</p><p className="mt-1 text-sm leading-6 text-secondary-900">{question.prompt}</p><Button className="mt-3" disabled={saving} onClick={() => onAdd(question)} size="sm" variant="reference"><Plus />Tambah</Button></article>;
}

function PackageBuilderQuestionDiscovery({ controller }: { controller: PackageBuilderController }) {
  const { dispatch, state, view } = controller;
  const { draft, questionSearch, saving, sourceQuestionLoading, sourceQuestionPage, sourceQuestionTotal } = state;

  return <ReferenceSurface as="section" className="min-w-0 p-5" variant="inset"><h2 className="font-semibold text-secondary-900">Temukan soal</h2><div className="relative mt-4"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal" className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pl-10`} disabled={saving || !draft.sourceBankId || !view.candidates.length} id="package-question-search" onChange={(event) => { if (saving) return; dispatch({ search: event.target.value, type: "setQuestionSearch" }); }} placeholder="Cari isi soal…" value={questionSearch} /></div>{sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal…</p> : null}{!draft.sourceBankId ? <PackageDiscoveryEmpty icon={ListFilter} text="Pilih Bank dan Subtest untuk melihat soal." /> : !view.candidates.length ? <PackageDiscoveryEmpty icon={PackageCheck} text={`Tidak ada soal ${draft.subtest} siap dalam Bank ini.`} /> : view.availableQuestions.length ? <div className="mt-4 grid gap-3">{view.availableQuestions.map((question) => <PackageDiscoveryQuestion key={question.id} onAdd={(selectedQuestion) => { if (!saving) dispatch({ question: selectedQuestion, type: "addItem" }); }} question={question} saving={saving} />)}</div> : <PackageDiscoveryEmpty icon={Search} text="Tidak ada soal yang cocok dengan pencarian ini." />}{draft.sourceBankId && sourceQuestionTotal > view.sourceQuestionLoadedCount ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {view.sourceQuestionLoadedCount} dari {sourceQuestionTotal} soal siap.</p><Button disabled={saving || sourceQuestionLoading} onClick={() => { if (!saving) dispatch({ page: sourceQuestionPage + 1, type: "setSourceQuestionPage" }); }} size="sm" type="button" variant="reference"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat 100 soal lagi"}</Button></div> : null}</ReferenceSurface>;
}

function PackageBuilderQuestionsWorkspace({ controller }: { controller: PackageBuilderController }) {
  return <ReferenceSurface as="section" aria-labelledby="package-questions-heading" className="grid gap-6 p-5 sm:p-7"><div><h2 className="text-xl font-semibold text-secondary-900" id="package-questions-heading">Pilih, susun, dan beri poin soal</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Urutan dan poin ini akan menjadi isi kerja paket saat disimpan.</p></div><div className="grid gap-5 lg:grid-cols-2"><PackageBuilderSelectedQuestions controller={controller} /><PackageBuilderQuestionDiscovery controller={controller} /></div></ReferenceSurface>;
}

function PackageBuilderReviewValidation({ controller }: { controller: PackageBuilderController }) {
  const { state, view } = controller;

  return <ReferenceSurface aria-labelledby="package-review-validation-heading" aria-live="polite" className="px-4 py-4 text-sm text-secondary-700" id="package-review-validation" role="region" tabIndex={-1} variant="inset"><h3 className="font-semibold text-secondary-900" id="package-review-validation-heading">{view.reviewIssues.length ? "Belum siap" : "Pemeriksaan Review selesai"}</h3><p className="mt-1 leading-6">{state.saving ? "Penyimpanan sedang berlangsung. Semua kontrol editor dikunci sampai proses selesai." : view.reviewIssues.length ? "Aksi siap dinonaktifkan sampai semua hal berikut diperbaiki:" : "Semua pemeriksaan selesai. Versi aktif siap dibuat."}</p>{view.reviewIssues.length ? <ul className="mt-3 grid gap-2 pl-5" role="list">{view.reviewIssues.map((issue) => <li key={`${issue.href}-${issue.message}`}><a className="font-medium text-primary-800 underline decoration-primary-300 underline-offset-2 hover:text-primary-950 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700" href={issue.href}>{issue.message}</a></li>)}</ul> : null}</ReferenceSurface>;
}

function PackageBuilderReview({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state, view } = controller;

  return <ReferenceSurface as="section" aria-labelledby="package-review-heading" className="grid gap-5 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-secondary-900" id="package-review-heading">Tinjau lalu pilih hasil akhir</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-500">Draf dapat dilanjutkan kapan saja. Saat siap, aksi berikutnya membuat versi aktif tanpa mengubah versi yang sudah tersimpan.</p></div><dl className="grid min-w-44 grid-cols-2 gap-x-5 gap-y-2 text-sm"><div><dt className="text-secondary-500">Soal</dt><dd className="mt-1 font-semibold text-secondary-900">{state.draft.items.length}</dd></div><div><dt className="text-secondary-500">Total poin</dt><dd className="mt-1 font-semibold text-secondary-900">{view.draftTotalPoints}</dd></div></dl></div><PackageBuilderReviewValidation controller={controller} /><div className="flex flex-wrap gap-3"><Button disabled={state.saving} onClick={() => void actions.save("draft")} size="sm" variant="reference"><Save />{state.saving ? "Menyimpan…" : "Simpan draf"}</Button><Button aria-describedby="package-review-validation" disabled={state.saving || !view.canReady} onClick={() => dispatch({ confirm: true, type: "setConfirmReady" })} size="sm" variant="brand"><Upload />{view.readyActionLabel}</Button></div></ReferenceSurface>;
}

function PackageBuilderReadyDialog({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state, view } = controller;

  return <AlertDialog onOpenChange={(open) => { if (!state.saving) dispatch({ confirm: open, type: "setConfirmReady" }); }} open={state.confirmReady}><AlertDialogContent className="rounded-5xl" pending={state.saving} variant="warning"><AlertDialogHeader><AlertDialogTitle>{view.readyActionLabel}?</AlertDialogTitle><AlertDialogDescription>{state.draft.latestReadyVersionNo ? "Perubahan ini akan membuat versi aktif baru. Versi aktif sebelumnya tetap tersimpan sampai perubahan diterapkan." : "Soal dan poin ini akan menjadi versi pertama yang siap. Setelah dibuat, versi tidak dapat diubah."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={state.saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={state.saving} onClick={() => { dispatch({ confirm: false, type: "setConfirmReady" }); void actions.save("ready"); }} variant="brand"><Upload />{state.saving ? "Menyiapkan…" : view.readyActionLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function PackageBuilderBankChangeDialog({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state } = controller;

  return <AlertDialog onOpenChange={(open) => { if (!state.saving && !open) dispatch({ type: "cancelPendingBank" }); }} open={Boolean(state.pendingBankId)}><AlertDialogContent className="rounded-5xl" pending={state.saving} variant="danger"><AlertDialogHeader><AlertDialogTitle>Ganti Bank Soal?</AlertDialogTitle><AlertDialogDescription>{state.draft.items.length} soal yang sudah dipilih akan dihapus. Bank dapat diganti hanya sebelum Paket pertama kali tersimpan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={state.saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={state.saving} onClick={actions.confirmBankChange} variant="destructive">Ganti dan hapus pilihan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function PackageBuilderSubtestChangeDialog({ controller }: { controller: PackageBuilderController }) {
  const { actions, dispatch, state } = controller;

  return <AlertDialog onOpenChange={(open) => { if (!state.saving && !open) dispatch({ type: "cancelPendingSubtest" }); }} open={Boolean(state.pendingSubtest)}><AlertDialogContent className="rounded-5xl" pending={state.saving} variant="danger"><AlertDialogHeader><AlertDialogTitle>Ganti Subtest?</AlertDialogTitle><AlertDialogDescription>{state.draft.items.length} soal yang sudah dipilih akan dihapus karena Subtest berubah. Pilih Subtest baru hanya sebelum Paket pertama kali tersimpan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={state.saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={state.saving} onClick={actions.confirmSubtestChange} variant="destructive">Ganti dan hapus pilihan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function PackageBuilderDialogs({ controller }: { controller: PackageBuilderController }) {
  return <><PackageBuilderReadyDialog controller={controller} /><PackageBuilderBankChangeDialog controller={controller} /><PackageBuilderSubtestChangeDialog controller={controller} /></>;
}

function PackageBuilderView({ controller }: { controller: PackageBuilderController }) {
  return <div className="w-full min-w-0 space-y-5"><PackageBuilderHeader controller={controller} /><PackageBuilderDraftDetails controller={controller} /><div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]"><PackageBuilderSourcePanel controller={controller} /><PackageBuilderQuestionsWorkspace controller={controller} /></div><PackageBuilderReview controller={controller} /><PackageBuilderDialogs controller={controller} /></div>;
}

function KaptenPackageBuilderPageModule({ id, initialDraft, sourceCatalog, sourceCatalogPage, sourceCategories = EMPTY_SOURCE_CATEGORIES }: { id?: string; initialDraft?: PackageDraft | null; sourceCatalog?: Source[]; sourceCatalogPage?: SourceCatalogPage; sourceCategories?: SourceCategory[] }) {
  const controller = usePackageBuilderState({ id, initialDraft, sourceCatalog, sourceCatalogPage, sourceCategories });

  return <PackageBuilderView controller={controller} />;
}

function Picker({ id, label, disabled, empty, openContent }: { id?: string; label: string; disabled?: boolean; empty: string; openContent: React.ReactNode }) {
  return <Popover><PopoverTrigger disabled={disabled} render={<Button aria-haspopup="dialog" className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full`} id={id} variant="reference" />}><span className="min-w-0 truncate">{label}</span><ArrowDown /></PopoverTrigger><PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-2"><div aria-label={empty} className="grid max-h-72 gap-1 overflow-y-auto" role="group">{openContent}</div></PopoverContent></Popover>;
}

function PackageCategoryFilter({ disabled, onValueChange, options, value }: { disabled?: boolean; onValueChange: (value: string) => void; options: Array<{ label: string; value: string }>; value: string }) {
  const selected = options.find((option) => option.value === value)?.label ?? "Semua kategori";

  return <DropdownMenu><DropdownMenuTrigger aria-label="Filter kategori Bank Soal" disabled={disabled} render={<Button className={`${REFERENCE_CONTROL_CLASS_NAMES.select} w-full`} variant="reference" />}><span className="truncate">{selected}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0 text-secondary-500" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-(--anchor-width)"><DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>{[{ label: "Semua kategori", value: "" }, ...options].map((option) => <DropdownMenuRadioItem key={option.value || "all"} value={option.value}>{option.label}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

function PackageDiscoveryEmpty({ icon, text }: { icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>; text: string }) { return <ReferenceEmptyState className="mt-5" icon={icon} title={text} />; }

export { KaptenPackageBuilderPageModule };
