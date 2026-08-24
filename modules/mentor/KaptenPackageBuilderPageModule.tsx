"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, CircleAlert, CircleHelp, ListFilter, PackageCheck, Plus, Save, Search, Upload, X } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
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
type SourceCatalogPage = { page: number; pageSize: number; total: number };
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

function KaptenPackageBuilderPageModule({ id, initialDraft, sourceCatalog, sourceCatalogPage, sourceCategories = [] }: { id?: string; initialDraft?: PackageDraft | null; sourceCatalog: Source[]; sourceCatalogPage?: SourceCatalogPage; sourceCategories?: SourceCategory[] }) {
  const [draft, setDraft] = useState<PackageDraft>(() => initialDraft ?? { description: "", id: id ?? "baru", items: [], sourceBankId: "", status: "draft", subtest: "PU", title: "Paket Soal Baru" });
  const [savedDraftSignature, setSavedDraftSignature] = useState(() => packageDraftSignature(initialDraft ?? { description: "", id: id ?? "baru", items: [], sourceBankId: "", status: "draft", subtest: "PU", title: "Paket Soal Baru" }));
  const builderRootRef = useRef<HTMLDivElement>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [bankCategoryFilter, setBankCategoryFilter] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [sourceEntries, setSourceEntries] = useState<Source[]>(sourceCatalog);
  const [sourceBankPage, setSourceBankPage] = useState(sourceCatalogPage?.page ?? 1);
  const [sourceBankTotal, setSourceBankTotal] = useState(sourceCatalogPage?.total ?? sourceCatalog.length);
  const [sourceBankLoading, setSourceBankLoading] = useState(false);
  const [sourceQuestionPage, setSourceQuestionPage] = useState(1);
  const [sourceQuestionTotal, setSourceQuestionTotal] = useState(0);
  const [sourceQuestionLoadedBankId, setSourceQuestionLoadedBankId] = useState<string | null>(null);
  const [sourceQuestionLoading, setSourceQuestionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreErrors, setScoreErrors] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [pendingBankId, setPendingBankId] = useState<string | null>(null);
  const [pendingSubtest, setPendingSubtest] = useState<SubjectCode | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const navigatingAfterSaveRef = useRef(false);
  const saved = Boolean(id);
  const hasUnsavedChanges = useMemo(() => packageDraftSignature(draft) !== savedDraftSignature, [draft, savedDraftSignature]);

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
  }, [hasUnsavedChanges, saving]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceBankLoading(true);
      try {
        const result = await listQuestionBankSourcePageAction({
          categoryId: bankCategoryFilter || undefined,
          page: sourceBankPage,
          pageSize: SOURCE_BANK_PAGE_SIZE,
          search: bankSearch,
          subjectCoverage: draft.subtest ? [draft.subtest] : undefined,
        });
        if (cancelled) return;
        setSourceEntries((current) => {
          const selected = current.find(({ bank }) => bank.id === draft.sourceBankId);
          const next = result.items.map(({ bank }) => ({ bank, questions: current.find((entry) => entry.bank.id === bank.id)?.questions ?? [] }));
          return selected && !next.some(({ bank }) => bank.id === selected.bank.id) ? [selected, ...next] : next;
        });
        setSourceBankTotal(result.total);
      } finally {
        if (!cancelled) setSourceBankLoading(false);
      }
    }, bankSearch.trim() ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [bankCategoryFilter, bankSearch, draft.sourceBankId, draft.subtest, sourceBankPage]);

  useEffect(() => {
    if (!draft.sourceBankId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSourceQuestionLoading(true);
      try {
        const result = await listQuestionBankSourceQuestionsAction(draft.sourceBankId, {
          page: sourceQuestionPage,
          pageSize: SOURCE_QUESTION_PAGE_SIZE,
          search: questionSearch,
        });
        if (cancelled || !result) return;
        setSourceQuestionTotal(result.total);
        setSourceQuestionLoadedBankId(draft.sourceBankId);
        setSourceEntries((current) => {
          const existing = current.find(({ bank }) => bank.id === draft.sourceBankId);
          const incomingQuestions = result.questions as BankQuestion[];
          const questions = sourceQuestionPage === 1
            ? incomingQuestions
            : [...(existing?.questions ?? []), ...incomingQuestions].filter((question, index, all) => all.findIndex((candidate) => candidate.id === question.id) === index);
          const nextEntry = { bank: result.bank as KaptenQuestionBank, questions };
          return current.some(({ bank }) => bank.id === draft.sourceBankId)
            ? current.map((entry) => entry.bank.id === draft.sourceBankId ? nextEntry : entry)
            : [nextEntry, ...current];
        });
      } finally {
        if (!cancelled) setSourceQuestionLoading(false);
      }
    }, questionSearch.trim() ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [draft.sourceBankId, draft.subtest, questionSearch, sourceQuestionPage]);

  const selectedSource = sourceEntries.find(({ bank }) => bank.id === draft.sourceBankId);
  const sourceQuestionLoadedCount = selectedSource?.questions.length ?? 0;
  const candidates = useMemo(() => selectedSource?.questions.filter((question) => question.subjectCode === draft.subtest) ?? [], [draft.subtest, selectedSource]);
  const selectedQuestionById = useMemo(() => new Map(candidates.map((question) => [question.id, question])), [candidates]);
  const availableQuestions = useMemo(() => candidates.filter((question) => !draft.items.some((item) => item.sourceQuestionId === question.id) && question.prompt.toLowerCase().includes(questionSearch.trim().toLowerCase())), [candidates, draft.items, questionSearch]);
  const draftTotalPoints = useMemo(() => formatPointTotal(draft.items), [draft.items]);
  const invalidPointIds = useMemo(() => draft.items.filter((item) => !Number.isFinite(item.pointValue) || item.pointValue <= 0).map((item) => item.sourceQuestionId), [draft.items]);
  const unavailableQuestionIds = useMemo(() => {
    const canCheckAvailability = Boolean(sourceQuestionLoadedBankId === draft.sourceBankId && selectedSource && !sourceQuestionLoading && !questionSearch.trim() && sourceQuestionLoadedCount >= sourceQuestionTotal);
    return canCheckAvailability ? draft.items.filter((item) => !selectedQuestionById.has(item.sourceQuestionId)).map((item) => item.sourceQuestionId) : [];
  }, [draft.items, draft.sourceBankId, questionSearch, selectedQuestionById, selectedSource, sourceQuestionLoadedBankId, sourceQuestionLoadedCount, sourceQuestionLoading, sourceQuestionTotal]);
  const reviewIssues = useMemo<ReviewIssue[]>(() => {
    const issues: ReviewIssue[] = [];
    if (!draft.title.trim()) issues.push({ href: "#package-title", message: "Masukkan judul Paket Soal." });
    if (!draft.sourceBankId) issues.push({ href: "#package-source-bank-picker", message: "Pilih Bank Soal sumber." });
    else if (!draft.items.length) issues.push({ href: "#package-question-search", message: "Tambahkan minimal satu soal dari Subtest terpilih." });
    if (unavailableQuestionIds.length) issues.push({ href: "#package-question-search", message: `${unavailableQuestionIds.length} soal tidak tersedia dari sumber yang sedang dipilih.` });
    if (invalidPointIds.length) issues.push({ href: `#points-${invalidPointIds[0]}`, message: `${invalidPointIds.length} soal harus memiliki poin lebih dari 0.` });
    return issues;
  }, [draft.items.length, draft.sourceBankId, draft.title, invalidPointIds, unavailableQuestionIds]);
  const canReady = reviewIssues.length === 0;
  const readyActionLabel = draft.latestReadyVersionNo ? "Terapkan perubahan" : "Siapkan untuk Tryout";

  const changeBank = useCallback((bankId: string) => {
    if (saving || savingRef.current) return;
    if (bankId === draft.sourceBankId) return;
    if (draft.items.length) { setPendingBankId(bankId); return; }
    setDraft((current) => ({ ...current, items: [], sourceBankId: bankId, subtest: "PU" }));
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setSourceQuestionLoadedBankId(null);
  }, [draft.items.length, draft.sourceBankId, saving]);
  const confirmBankChange = () => {
    if (saving || savingRef.current) return;
    if (!pendingBankId) return;
    setDraft((current) => ({ ...current, items: [], sourceBankId: pendingBankId, subtest: "PU" }));
    setPendingBankId(null);
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setSourceQuestionLoadedBankId(null);
  };
  const changeSubtest = (subtest: SubjectCode) => {
    if (saving || savingRef.current) return;
    if (subtest === draft.subtest) return;
    if (draft.items.length) { setPendingSubtest(subtest); return; }
    setDraft((current) => ({ ...current, items: [], subtest }));
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setSourceQuestionLoadedBankId(null);
  };
  const confirmSubtestChange = () => {
    if (saving || savingRef.current) return;
    if (!pendingSubtest) return;
    setDraft((current) => ({ ...current, items: [], subtest: pendingSubtest }));
    setPendingSubtest(null);
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
    setSourceQuestionLoadedBankId(null);
  };
  const validate = () => {
    const invalid = new Set(draft.items.reduce<string[]>((invalidIds, item) => {
      if (!Number.isFinite(item.pointValue) || item.pointValue <= 0) invalidIds.push(item.sourceQuestionId);
      return invalidIds;
    }, []));
    setScoreErrors(invalid);
    if (!draft.title.trim()) { setError("Masukkan judul Paket Soal."); return false; }
    if (!draft.sourceBankId) { setError("Pilih Bank Soal terlebih dahulu."); return false; }
    if (!draft.items.length) { setError("Tambahkan minimal satu soal siap dari Subtest terpilih."); return false; }
    if (invalid.size) { setError("Perbaiki poin yang ditandai; setiap soal harus bernilai positif."); return false; }
    return true;
  };
  const sourceBankCategories = useMemo(
    () => [...new Map((sourceCategories.length ? sourceCategories : sourceEntries.flatMap(({ bank }) => bank.categories ?? [])).map((category) => [category.id, category])).values()]
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" })),
    [sourceCategories, sourceEntries],
  );
  const sourceBankOptions = useMemo(() => sourceEntries.reduce<ReactNode[]>((options, { bank }) => {
    const searchText = [
      bank.title,
      bank.description,
      bank.folderPath?.map((item) => item.name).join(" "),
      ...(bank.categories ?? []).map((category) => category.name),
    ].filter(Boolean).join(" ").toLowerCase();
    if (!searchText.includes(bankSearch.trim().toLowerCase()) || (bankCategoryFilter && !bank.categoryIds?.includes(bankCategoryFilter))) return options;
    options.push(<Button className="h-auto justify-start py-2 text-left" disabled={saving} key={bank.id} onClick={() => changeBank(bank.id)} variant={bank.id === draft.sourceBankId ? "contextSelected" : "ghost"}><span className="min-w-0 truncate">{packageBankLabel(bank)}</span></Button>);
    return options;
  }, []), [bankCategoryFilter, bankSearch, changeBank, draft.sourceBankId, saving, sourceEntries]);
  const save = async (completionIntent: PackageSaveIntent) => {
    if (saving || savingRef.current) return;
    setError(null);
    setConflict(false);
    if (!validate()) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveReusableQuestionPackageAction({ completionIntent, description: draft.description, expectedRevision: draft.revision, id, items: draft.items, sourceBankId: draft.sourceBankId, subtest: draft.subtest, title: draft.title });
      if (!result.ok) { setConflict(result.code === "package_conflict"); setError(result.message); return; }
      const savedPackage = result.result.package;
      const nextDraft: PackageDraft = {
        description: savedPackage.description,
        id: savedPackage.id,
        items: savedPackage.items.map((item) => ({ pointValue: Number(item.pointValue), sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined })),
        latestReadyVersionNo: savedPackage.latestReadyVersionNo,
        revision: savedPackage.revision,
        sourceBankId: savedPackage.sourceBankId,
        sourceBankName: savedPackage.sourceBankName,
        status: savedPackage.status,
        subtest: savedPackage.subtest,
        title: savedPackage.title,
      };
      setDraft(nextDraft);
      setSavedDraftSignature(packageDraftSignature(nextDraft));
      navigatingAfterSaveRef.current = true;
      window.location.assign(`/mentor/packages/${savedPackage.id}?${completionIntent === "ready" ? "released=1" : "saved=draft"}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Paket Soal belum dapat disimpan.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const updateItem = (sourceQuestionId: string, pointValue: number) => {
    if (saving || savingRef.current) return;
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.sourceQuestionId === sourceQuestionId ? { ...item, pointValue } : item) }));
    setScoreErrors((current) => { const next = new Set(current); if (Number.isFinite(pointValue) && pointValue > 0) next.delete(sourceQuestionId); return next; });
  };
  const moveItem = (index: number, direction: -1 | 1) => {
    if (saving || savingRef.current) return;
    setDraft((current) => {
      const next = [...current.items]; const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...current, items: next };
    });
  };

  return <div ref={builderRootRef}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button aria-disabled={saving} aria-label={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} nativeButton={false} render={<Link href={saved ? `/mentor/packages/${id}` : "/mentor/packages"} />} size="icon" title={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} variant="ghost"><ChevronLeft /></Button>
    </div>

    <header className="mt-3 max-w-3xl">
      <h1 className="text-3xl leading-tight font-semibold tracking-[-0.03em] text-secondary-900 sm:text-4xl">{saved ? `Edit pertanyaan & poin · ${draft.title}` : "Buat Paket Soal"}</h1>
      <p className="mt-2 text-sm leading-6 text-secondary-500">Susun sumber, soal, dan poin dalam satu ruang kerja. Simpan draf kapan saja atau lanjutkan sampai siap dipakai di Tryout.</p>
    </header>

    {!saved ? <section aria-labelledby="package-source-heading" className="mt-5 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Source</p>
      <h2 className="mt-2 text-xl font-semibold text-secondary-900" id="package-source-heading">Pilih sumber dan detail paket</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-500">Bank Soal dan Subtest menjadi identitas paket setelah pertama kali disimpan.</p>
      {error ? <div className="mt-5"><p className="flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-600" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>{conflict ? <Button className="mt-3" onClick={() => window.location.reload()} size="sm" type="button" variant="brandOutline">Muat ulang data terbaru</Button> : null}</div> : null}
      <div className={`${error ? "mt-5 " : ""}grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]`}><Field><FieldLabel htmlFor="package-title">Judul Paket</FieldLabel><FieldInput disabled={saving} id="package-title" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} /></Field><Field><FieldLabel htmlFor="package-description">Deskripsi singkat</FieldLabel><FieldInput disabled={saving} id="package-description" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} /></Field></div>
    </section> : <div className="mt-5">{error ? <div><p className="flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-600" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p>{conflict ? <Button className="mt-3" onClick={() => window.location.reload()} size="sm" type="button" variant="brandOutline">Muat ulang data terbaru</Button> : null}</div> : null}</div>}

    {saved && draft.latestReadyVersionNo ? <section aria-label="Keamanan versi aktif" className="mt-5 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 sm:px-5"><CircleAlert className="mt-0.5 size-5 shrink-0" /><p><span className="font-semibold">{packageReleaseLabel(draft.latestReadyVersionNo)} tetap aktif.</span> Tryout yang sudah ada tetap menggunakan versi aktif sampai perubahan diterapkan.</p></section> : null}

    <div className="mt-5 grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section aria-labelledby="package-source-controls-heading" className="rounded-3xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2"><h2 className="font-semibold text-secondary-900" id="package-source-controls-heading">Source · Informasi Bank Soal</h2><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label="Bantuan informasi Bank Soal" size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent>Menampilkan Bank Soal dan Subtest yang digunakan untuk versi ini.</TooltipContent></Tooltip></TooltipProvider></div>
          {saved ? <div className="mt-4 grid gap-4 text-sm"><div><p className="text-secondary-500">Bank Soal</p><p className="mt-1 font-semibold text-secondary-900">{selectedSource?.bank.title ?? draft.sourceBankName}</p>{selectedSource?.bank.folderPath?.length || selectedSource?.bank.categories?.length ? <div className="mt-2 flex flex-wrap gap-2">{selectedSource.bank.folderPath?.length ? <span className="rounded-full bg-secondary-50 px-2.5 py-1 text-xs text-secondary-600">{selectedSource.bank.folderPath.map((item) => item.name).join(" / ")}</span> : null}{selectedSource.bank.categories?.map((category) => <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800" key={category.id}>{category.name}</span>)}</div> : null}</div><div><p className="text-secondary-500">Subtest</p><p className="mt-1"><span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{draft.subtest} · {subjectName(draft.subtest)}</span></p></div><div><p className="text-secondary-500">Versi</p><p className="mt-1 font-semibold text-secondary-900">{draft.latestReadyVersionNo ? packageReleaseLabel(draft.latestReadyVersionNo) : "Draf"}</p></div></div> : <div className="mt-4 grid gap-4"><Field><FieldLabel htmlFor="package-source-bank-picker">Bank Soal</FieldLabel><Picker disabled={saving} id="package-source-bank-picker" label={selectedSource?.bank.title ?? "Pilih Bank Soal"} empty="Tidak ada Bank Soal siap." openContent={<><FieldInput aria-label="Cari Bank Soal" className="h-10 rounded-xl px-3 py-2 text-sm" disabled={saving} onChange={(event) => { if (saving) return; setBankSearch(event.target.value); setSourceBankPage(1); }} placeholder="Cari judul, folder, atau kategori…" value={bankSearch} /><select aria-label="Filter kategori Bank Soal" className="min-h-10 rounded-xl border border-primary-100 bg-white px-3 text-sm text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" disabled={saving} onChange={(event) => { if (saving) return; setBankCategoryFilter(event.target.value); setSourceBankPage(1); }} value={bankCategoryFilter}><option value="">Semua kategori</option>{sourceBankCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{sourceBankLoading ? <p className="px-2 py-1 text-xs text-secondary-500">Memuat bank soal…</p> : null}{sourceBankOptions}</>} /></Field>{Math.max(1, Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE)) > 1 ? <div className="flex items-center justify-between text-xs text-secondary-500"><span>Halaman {sourceBankPage} dari {Math.max(1, Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE))}</span><span className="flex gap-1"><Button aria-label="Bank soal sebelumnya" disabled={saving || sourceBankPage === 1} onClick={() => { if (!saving) setSourceBankPage((page) => Math.max(1, page - 1)); }} size="icon-xs" type="button" variant="ghost"><ChevronLeft /></Button><Button aria-label="Bank soal berikutnya" disabled={saving || sourceBankPage >= Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE)} onClick={() => { if (!saving) setSourceBankPage((page) => page + 1); }} size="icon-xs" type="button" variant="ghost"><ArrowDown className="rotate-[-90deg]" /></Button></span></div> : null}<Field><FieldLabel htmlFor="package-subtest-picker">Subtest</FieldLabel><Picker disabled={saving || !draft.sourceBankId} id="package-subtest-picker" label={draft.sourceBankId ? `${draft.subtest} · ${subjectName(draft.subtest)}` : "Pilih Bank terlebih dahulu"} empty="Tidak ada Subtest." openContent={subjectCodes.map((code) => { const count = selectedSource?.questions.filter((question) => question.subjectCode === code).length ?? 0; const hasSubject = Boolean(selectedSource?.bank.subjectCoverage?.includes(code) || count); return <Button className="justify-start" disabled={saving || !hasSubject} key={code} onClick={() => changeSubtest(code)} variant={code === draft.subtest ? "contextSelected" : "ghost"}>{code} · {subjectName(code)}</Button>; })} /></Field></div>}
        </section>
      </aside>

      <section aria-labelledby="package-questions-heading">
        <div className="mb-4"><p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Questions</p><h2 className="mt-2 text-xl font-semibold text-secondary-900" id="package-questions-heading">Pilih, susun, dan beri poin soal</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Urutan dan poin ini akan menjadi isi kerja paket saat disimpan.</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-primary-100 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-secondary-900">Soal terpilih</h2><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">{draft.items.length}</span></div>{draft.items.length ? <ol className="mt-4 grid gap-3">{draft.items.map((item, index) => { const question = selectedQuestionById.get(item.sourceQuestionId); const invalid = scoreErrors.has(item.sourceQuestionId) || invalidPointIds.includes(item.sourceQuestionId); return <li className="rounded-2xl border border-primary-100 p-3" key={item.sourceQuestionId}><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{index + 1}</span><p className="min-w-0 flex-1 text-sm leading-6 text-secondary-900">{question?.prompt ?? "Soal sumber tidak tersedia untuk filter ini."}</p></div><div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2"><Field><FieldLabel htmlFor={`points-${item.sourceQuestionId}`} className="text-xs">Poin</FieldLabel><FieldInput aria-describedby={invalid ? `points-error-${item.sourceQuestionId}` : undefined} aria-invalid={invalid} disabled={saving} id={`points-${item.sourceQuestionId}`} min="0.01" onChange={(event) => updateItem(item.sourceQuestionId, Number(event.target.value))} step="0.01" type="number" value={item.pointValue} /></Field><Button aria-label={`Naikkan urutan soal ${index + 1}`} disabled={saving || !index} onClick={() => moveItem(index, -1)} size="icon-sm" variant="ghost"><ArrowUp /></Button><Button aria-label={`Turunkan urutan soal ${index + 1}`} disabled={saving || index === draft.items.length - 1} onClick={() => moveItem(index, 1)} size="icon-sm" variant="ghost"><ArrowDown /></Button><Button aria-label={`Hapus soal ${index + 1}`} disabled={saving} onClick={() => { if (!saving) setDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.sourceQuestionId !== item.sourceQuestionId) })); }} size="icon-sm" variant="ghost"><X /></Button></div>{invalid ? <p className="mt-2 text-xs font-medium text-danger-600" id={`points-error-${item.sourceQuestionId}`}>Masukkan poin lebih dari 0.</p> : null}</li>; })}</ol> : <div className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-10 text-center"><PackageCheck className="mx-auto size-5 text-primary-800" /><p className="mt-3 text-sm font-semibold text-secondary-900">Belum ada soal dipilih</p><p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-secondary-500">Pilih soal dari daftar setelah Bank dan Subtest ditentukan.</p></div>}</section>
        <section className="min-w-0 rounded-3xl border border-primary-100 bg-white p-5"><h2 className="font-semibold text-secondary-900">Temukan soal</h2><div className="relative mt-4"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal" className="pl-10" disabled={saving || !draft.sourceBankId || !candidates.length} id="package-question-search" onChange={(event) => { if (saving) return; setQuestionSearch(event.target.value); setSourceQuestionPage(1); setSourceQuestionTotal(0); setSourceQuestionLoadedBankId(null); }} placeholder="Cari isi soal…" value={questionSearch} /></div>{sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal…</p> : null}{!draft.sourceBankId ? <PackageDiscoveryEmpty icon={<ListFilter />} text="Pilih Bank dan Subtest untuk melihat soal." /> : !candidates.length ? <PackageDiscoveryEmpty icon={<PackageCheck />} text={`Tidak ada soal ${draft.subtest} siap dalam Bank ini.`} /> : availableQuestions.length ? <div className="mt-4 grid gap-3">{availableQuestions.map((question) => <article className="rounded-2xl border border-primary-100 p-3" key={question.id}><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {question.difficulty === "easy" ? "Mudah" : question.difficulty === "hard" ? "Sulit" : "Sedang"}</p><p className="mt-1 text-sm leading-6 text-secondary-900">{question.prompt}</p><Button className="mt-3" disabled={saving} onClick={() => { if (saving) return; setDraft((current) => ({ ...current, items: [...current.items, { pointValue: 1, sourceQuestionId: question.id, sourceQuestionRevisionId: question.questionRevisionId }] })); }} size="sm" variant="brandOutline"><Plus />Tambah</Button></article>)}</div> : <PackageDiscoveryEmpty icon={<Search />} text="Tidak ada soal yang cocok dengan pencarian ini." />}{draft.sourceBankId && sourceQuestionTotal > sourceQuestionLoadedCount ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {sourceQuestionLoadedCount} dari {sourceQuestionTotal} soal siap.</p><Button disabled={saving || sourceQuestionLoading} onClick={() => { if (!saving) setSourceQuestionPage((page) => page + 1); }} size="sm" type="button" variant="brandOutline"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat 100 soal lagi"}</Button></div> : null}</section>
      </div>
      </section>
    </div>

    <section aria-labelledby="package-review-heading" className="mt-5 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Review &amp; ready</p><h2 className="mt-2 text-xl font-semibold text-secondary-900" id="package-review-heading">Tinjau lalu pilih hasil akhir</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-500">Draf dapat dilanjutkan kapan saja. Saat siap, aksi berikutnya membuat versi aktif yang tidak mengubah Tryout yang sudah berjalan.</p></div><dl className="grid min-w-44 grid-cols-2 gap-x-5 gap-y-2 text-sm"><div><dt className="text-secondary-500">Soal</dt><dd className="mt-1 font-semibold text-secondary-900">{draft.items.length}</dd></div><div><dt className="text-secondary-500">Total poin</dt><dd className="mt-1 font-semibold text-secondary-900">{draftTotalPoints}</dd></div></dl></div>
      <div aria-labelledby="package-review-validation-heading" aria-live="polite" className="mt-5 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-4 text-sm text-secondary-700" id="package-review-validation" role="region" tabIndex={-1}><h3 className="font-semibold text-secondary-900" id="package-review-validation-heading">{reviewIssues.length ? "Belum siap untuk Tryout" : "Pemeriksaan Review selesai"}</h3><p className="mt-1 leading-6">{saving ? "Penyimpanan sedang berlangsung. Semua kontrol editor dikunci sampai proses selesai." : reviewIssues.length ? "Ready dinonaktifkan sampai semua hal berikut diperbaiki:" : "Semua pemeriksaan selesai. Ready tersedia untuk membuat versi yang siap dipakai di Tryout."}</p>{reviewIssues.length ? <ul className="mt-3 grid gap-2 pl-5" role="list">{reviewIssues.map((issue) => <li key={`${issue.href}-${issue.message}`}><a className="font-medium text-primary-800 underline decoration-primary-300 underline-offset-2 hover:text-primary-950 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700" href={issue.href}>{issue.message}</a></li>)}</ul> : null}</div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-primary-100 pt-5"><Button disabled={saving} onClick={() => void save("draft")} size="sm" variant="brandOutline"><Save />{saving ? "Menyimpan…" : "Simpan draf"}</Button><Button aria-describedby="package-review-validation" disabled={saving || !canReady} onClick={() => setConfirmReady(true)} size="sm" variant="brand"><Upload />{readyActionLabel}</Button></div>
    </section>

    <AlertDialog onOpenChange={(open) => { if (!saving) setConfirmReady(open); }} open={confirmReady}><AlertDialogContent className="rounded-5xl" pending={saving} variant="warning"><AlertDialogHeader><AlertDialogTitle>{readyActionLabel}?</AlertDialogTitle><AlertDialogDescription>{draft.latestReadyVersionNo ? "Perubahan ini akan membuat versi aktif baru. Tryout yang sudah ada tetap menggunakan versi aktif sebelumnya sampai perubahan diterapkan." : "Soal dan poin ini akan menjadi versi pertama yang siap dipakai di Tryout. Setelah dibuat, versi tidak dapat diubah."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => { setConfirmReady(false); void save("ready"); }} variant="brand"><Upload />{saving ? "Menyiapkan…" : readyActionLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog onOpenChange={(open) => { if (!saving && !open) setPendingBankId(null); }} open={Boolean(pendingBankId)}><AlertDialogContent className="rounded-5xl" pending={saving} variant="danger"><AlertDialogHeader><AlertDialogTitle>Ganti Bank Soal?</AlertDialogTitle><AlertDialogDescription>{draft.items.length} soal yang sudah dipilih akan dihapus. Bank dapat diganti hanya sebelum Paket pertama kali tersimpan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={confirmBankChange} variant="destructive">Ganti dan hapus pilihan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog onOpenChange={(open) => { if (!saving && !open) setPendingSubtest(null); }} open={Boolean(pendingSubtest)}><AlertDialogContent className="rounded-5xl" pending={saving} variant="danger"><AlertDialogHeader><AlertDialogTitle>Ganti Subtest?</AlertDialogTitle><AlertDialogDescription>{draft.items.length} soal yang sudah dipilih akan dihapus karena Subtest berubah. Pilih Subtest baru hanya sebelum Paket pertama kali tersimpan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={confirmSubtestChange} variant="destructive">Ganti dan hapus pilihan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Picker({ id, label, disabled, empty, openContent }: { id?: string; label: string; disabled?: boolean; empty: string; openContent: React.ReactNode }) {
  return <Popover><PopoverTrigger disabled={disabled} render={<Button aria-haspopup="dialog" className="w-full justify-between" id={id} variant="context" />}>{label}<ArrowDown /></PopoverTrigger><PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-2"><div aria-label={empty} className="grid max-h-72 gap-1 overflow-y-auto" role="group">{openContent}</div></PopoverContent></Popover>;
}

function PackageDiscoveryEmpty({ icon, text }: { icon: React.ReactNode; text: string }) { return <Empty className="mt-5 rounded-2xl border border-primary-200 px-4 py-10 text-secondary-500"><EmptyHeader><EmptyMedia className="bg-primary-50 text-primary-800" variant="icon">{icon}</EmptyMedia><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>; }

export { KaptenPackageBuilderPageModule };
