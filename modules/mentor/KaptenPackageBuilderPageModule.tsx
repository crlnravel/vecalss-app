"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, CircleAlert, CircleHelp, ListFilter, PackageCheck, Plus, Save, Search, Upload, X } from "@/lib/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { kaptenSubjects, type BankQuestion, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { listQuestionBankSourcePageAction, listQuestionBankSourceQuestionsAction } from "@/modules/mentor/question-bank-actions";
import { readyReusableQuestionPackageVersionAction, saveReusableQuestionPackageAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type PackageItem = { pointValue: number; sourceQuestionId: string; sourceQuestionRevisionId?: string };
type PackageDraft = { description: string; id: string; items: PackageItem[]; latestReadyVersionNo?: number; sourceBankId: string; sourceBankName?: string; status: "draft" | "ready"; subtest: SubjectCode; title: string };
type Source = { bank: KaptenQuestionBank; questions: BankQuestion[] };
type SourceCatalogPage = { page: number; pageSize: number; total: number };
type SourceCategory = { id: string; name: string };

const SOURCE_BANK_PAGE_SIZE = 20;
const SOURCE_QUESTION_PAGE_SIZE = 100;

function subjectName(code: SubjectCode) { return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code; }

function packageBankLabel(bank: KaptenQuestionBank) {
  const folderName = bank.folderPath?.at(-1)?.name;
  const categoryNames = bank.categories?.map((category) => category.name).join(", ");
  return [bank.title, `${bank.questionCount} soal`, categoryNames, folderName].filter(Boolean).join(" · ");
}

function KaptenPackageBuilderPageModule({ id, initialDraft, sourceCatalog, sourceCatalogPage, sourceCategories = [] }: { id?: string; initialDraft?: PackageDraft | null; sourceCatalog: Source[]; sourceCatalogPage?: SourceCatalogPage; sourceCategories?: SourceCategory[] }) {
  const [draft, setDraft] = useState<PackageDraft>(() => initialDraft ?? { description: "", id: id ?? "baru", items: [], sourceBankId: "", status: "draft", subtest: "PU", title: "Paket Soal Baru" });
  const [bankSearch, setBankSearch] = useState("");
  const [bankCategoryFilter, setBankCategoryFilter] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [sourceEntries, setSourceEntries] = useState<Source[]>(sourceCatalog);
  const [sourceBankPage, setSourceBankPage] = useState(sourceCatalogPage?.page ?? 1);
  const [sourceBankTotal, setSourceBankTotal] = useState(sourceCatalogPage?.total ?? sourceCatalog.length);
  const [sourceBankLoading, setSourceBankLoading] = useState(false);
  const [sourceQuestionPage, setSourceQuestionPage] = useState(1);
  const [sourceQuestionTotal, setSourceQuestionTotal] = useState(0);
  const [sourceQuestionLoading, setSourceQuestionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreErrors, setScoreErrors] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingBankId, setPendingBankId] = useState<string | null>(null);
  const [confirmReady, setConfirmReady] = useState(false);
  const saved = Boolean(id);

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
  const canReady = saved && draft.items.length > 0 && draft.items.every((item) => Number.isFinite(item.pointValue) && item.pointValue > 0);

  const changeBank = (bankId: string) => {
    if (bankId === draft.sourceBankId) return;
    if (draft.items.length) { setPendingBankId(bankId); return; }
    setDraft((current) => ({ ...current, items: [], sourceBankId: bankId, subtest: "PU" }));
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
  };
  const confirmBankChange = () => {
    if (!pendingBankId) return;
    setDraft((current) => ({ ...current, items: [], sourceBankId: pendingBankId, subtest: "PU" }));
    setPendingBankId(null);
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
  };
  const changeSubtest = (subtest: SubjectCode) => {
    if (subtest === draft.subtest) return;
    setDraft((current) => ({ ...current, items: [], subtest }));
    setQuestionSearch("");
    setSourceQuestionPage(1);
    setSourceQuestionTotal(0);
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
  const sourceBankOptions = sourceEntries.reduce<ReactNode[]>((options, { bank }) => {
    const searchText = [
      bank.title,
      bank.description,
      bank.folderPath?.map((item) => item.name).join(" "),
      ...(bank.categories ?? []).map((category) => category.name),
    ].filter(Boolean).join(" ").toLowerCase();
    if (!searchText.includes(bankSearch.trim().toLowerCase()) || (bankCategoryFilter && !bank.categoryIds?.includes(bankCategoryFilter))) return options;
    options.push(<Button className="h-auto justify-start py-2 text-left" key={bank.id} onClick={() => changeBank(bank.id)} variant={bank.id === draft.sourceBankId ? "contextSelected" : "ghost"}><span className="min-w-0 truncate">{packageBankLabel(bank)}</span></Button>);
    return options;
  }, []);
  const save = async () => {
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await saveReusableQuestionPackageAction({ description: draft.description, id, items: draft.items, sourceBankId: draft.sourceBankId, subtest: draft.subtest, title: draft.title });
      if (!result.ok) { setError(result.message); return; }
      setDraft(result.result);
      if (!id) window.location.assign(`/mentor/packages/${result.result.id}/versions/new`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Paket Soal belum dapat disimpan.");
    } finally {
      setSaving(false);
    }
  };
  const ready = async () => {
    if (!id || !validate()) return;
    setSaving(true); setError(null);
    try {
      const result = await readyReusableQuestionPackageVersionAction(id);
      if (!result.ok) { setError(result.message); return; }
      setConfirmReady(false);
      window.location.assign(`/mentor/packages/${id}`);
    } catch (readyError) {
      setError(readyError instanceof Error ? readyError.message : "Versi Paket Soal belum dapat disiapkan.");
    } finally {
      setSaving(false);
    }
  };
  const updateItem = (sourceQuestionId: string, pointValue: number) => {
    setDraft((current) => ({ ...current, items: current.items.map((item) => item.sourceQuestionId === sourceQuestionId ? { ...item, pointValue } : item) }));
    setScoreErrors((current) => { const next = new Set(current); if (Number.isFinite(pointValue) && pointValue > 0) next.delete(sourceQuestionId); return next; });
  };
  const moveItem = (index: number, direction: -1 | 1) => setDraft((current) => {
    const next = [...current.items]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target]!, next[index]!];
    return { ...current, items: next };
  });

  return <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button aria-label={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} render={<Link href={saved ? `/mentor/packages/${id}` : "/mentor/packages"} />} size="icon" title={saved ? "Kembali ke versi Paket" : "Kembali ke Paket Soal"} variant="ghost"><ChevronLeft /></Button>
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} onClick={() => void save()} size="sm" variant="brandOutline"><Save />{saving ? "Menyimpan…" : "Simpan draf"}</Button>
        {saved ? <Button disabled={saving || !canReady} onClick={() => setConfirmReady(true)} size="sm" variant="brand"><Upload />Rilis</Button> : null}
      </div>
    </div>

    {!saved ? <section className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      {error ? <p className="flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-600" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
      <div className={`${error ? "mt-5 " : ""}grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]`}><Field><FieldLabel htmlFor="package-title">Judul Paket</FieldLabel><FieldInput id="package-title" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} /></Field><Field><FieldLabel htmlFor="package-description">Deskripsi singkat</FieldLabel><FieldInput id="package-description" onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} /></Field></div>
    </section> : error ? <p className="mt-3 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-600" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}

    <div className="mt-5 grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-3xl border border-primary-100 bg-white p-4">
          <div className="flex items-center gap-2"><h2 className="font-semibold text-secondary-900">Informasi Bank Soal</h2><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label="Bantuan informasi Bank Soal" size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent>Menampilkan Bank Soal dan Subtest yang digunakan untuk versi ini.</TooltipContent></Tooltip></TooltipProvider></div>
          {saved ? <div className="mt-4 grid gap-4 text-sm"><div><p className="text-secondary-500">Bank Soal</p><p className="mt-1 font-semibold text-secondary-900">{selectedSource?.bank.title ?? draft.sourceBankName}</p>{selectedSource?.bank.folderPath?.length || selectedSource?.bank.categories?.length ? <div className="mt-2 flex flex-wrap gap-2">{selectedSource.bank.folderPath?.length ? <span className="rounded-full bg-secondary-50 px-2.5 py-1 text-xs text-secondary-600">{selectedSource.bank.folderPath.map((item) => item.name).join(" / ")}</span> : null}{selectedSource.bank.categories?.map((category) => <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800" key={category.id}>{category.name}</span>)}</div> : null}</div><div><p className="text-secondary-500">Subtest</p><p className="mt-1"><span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{draft.subtest} · {subjectName(draft.subtest)}</span></p></div><div><p className="text-secondary-500">Versi</p><p className="mt-1 font-semibold text-secondary-900">{draft.latestReadyVersionNo ? `v${draft.latestReadyVersionNo}` : "Draf"}</p></div></div> : <div className="mt-4 grid gap-4"><Field><FieldLabel>Bank Soal</FieldLabel><Picker label={selectedSource?.bank.title ?? "Pilih Bank Soal"} empty="Tidak ada Bank Soal siap." openContent={<><FieldInput aria-label="Cari Bank Soal" className="h-10 rounded-xl px-3 py-2 text-sm" onChange={(event) => { setBankSearch(event.target.value); setSourceBankPage(1); }} placeholder="Cari judul, folder, atau kategori…" value={bankSearch} /><select aria-label="Filter kategori Bank Soal" className="min-h-10 rounded-xl border border-primary-100 bg-white px-3 text-sm text-secondary-900 outline-none focus:border-primary-300 focus:ring-3 focus:ring-primary-100" onChange={(event) => { setBankCategoryFilter(event.target.value); setSourceBankPage(1); }} value={bankCategoryFilter}><option value="">Semua kategori</option>{sourceBankCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{sourceBankLoading ? <p className="px-2 py-1 text-xs text-secondary-500">Memuat bank soal…</p> : null}{sourceBankOptions}</>} /></Field>{Math.max(1, Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE)) > 1 ? <div className="flex items-center justify-between text-xs text-secondary-500"><span>Halaman {sourceBankPage} dari {Math.max(1, Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE))}</span><span className="flex gap-1"><Button aria-label="Bank soal sebelumnya" disabled={sourceBankPage === 1} onClick={() => setSourceBankPage((page) => Math.max(1, page - 1))} size="icon-xs" type="button" variant="ghost"><ChevronLeft /></Button><Button aria-label="Bank soal berikutnya" disabled={sourceBankPage >= Math.ceil(sourceBankTotal / SOURCE_BANK_PAGE_SIZE)} onClick={() => setSourceBankPage((page) => page + 1)} size="icon-xs" type="button" variant="ghost"><ArrowDown className="rotate-[-90deg]" /></Button></span></div> : null}<Field><FieldLabel>Subtest</FieldLabel><Picker label={draft.sourceBankId ? `${draft.subtest} · ${subjectName(draft.subtest)}` : "Pilih Bank terlebih dahulu"} disabled={!draft.sourceBankId} empty="Tidak ada Subtest." openContent={subjectCodes.map((code) => { const count = selectedSource?.questions.filter((question) => question.subjectCode === code).length ?? 0; const hasSubject = Boolean(selectedSource?.bank.subjectCoverage?.includes(code) || count); return <Button className="justify-start" disabled={!hasSubject} key={code} onClick={() => changeSubtest(code)} variant={code === draft.subtest ? "contextSelected" : "ghost"}>{code} · {subjectName(code)}</Button>; })} /></Field></div>}
        </section>
      </aside>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-3xl border border-primary-100 bg-white p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-secondary-900">Soal terpilih</h2><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">{draft.items.length}</span></div>{draft.items.length ? <ol className="mt-4 grid gap-3">{draft.items.map((item, index) => { const question = selectedQuestionById.get(item.sourceQuestionId); const invalid = scoreErrors.has(item.sourceQuestionId); return <li className="rounded-2xl border border-primary-100 p-3" key={item.sourceQuestionId}><div className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{index + 1}</span><p className="min-w-0 flex-1 text-sm leading-6 text-secondary-900">{question?.prompt ?? "Soal sumber tidak tersedia untuk filter ini."}</p></div><div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2"><Field><FieldLabel htmlFor={`points-${item.sourceQuestionId}`} className="text-xs">Poin</FieldLabel><FieldInput aria-invalid={invalid} id={`points-${item.sourceQuestionId}`} min="0.01" onChange={(event) => updateItem(item.sourceQuestionId, Number(event.target.value))} step="0.01" type="number" value={item.pointValue} /></Field><Button aria-label={`Naikkan urutan soal ${index + 1}`} disabled={!index} onClick={() => moveItem(index, -1)} size="icon-sm" variant="ghost"><ArrowUp /></Button><Button aria-label={`Turunkan urutan soal ${index + 1}`} disabled={index === draft.items.length - 1} onClick={() => moveItem(index, 1)} size="icon-sm" variant="ghost"><ArrowDown /></Button><Button aria-label={`Hapus soal ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.sourceQuestionId !== item.sourceQuestionId) }))} size="icon-sm" variant="ghost"><X /></Button></div>{invalid ? <p className="mt-2 text-xs font-medium text-danger-600">Masukkan poin lebih dari 0.</p> : null}</li>; })}</ol> : <div className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-10 text-center"><PackageCheck className="mx-auto size-5 text-primary-800" /><p className="mt-3 text-sm font-semibold text-secondary-900">Belum ada soal dipilih</p><p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-secondary-500">Pilih soal dari daftar setelah Bank dan Subtest ditentukan.</p></div>}</section>
        <section className="min-w-0 rounded-3xl border border-primary-100 bg-white p-5"><h2 className="font-semibold text-secondary-900">Temukan soal</h2><div className="relative mt-4"><Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari soal" className="pl-10" disabled={!draft.sourceBankId || !candidates.length} onChange={(event) => { setQuestionSearch(event.target.value); setSourceQuestionPage(1); setSourceQuestionTotal(0); }} placeholder="Cari isi soal…" value={questionSearch} /></div>{sourceQuestionLoading ? <p className="mt-3 text-xs text-secondary-500">Memuat soal…</p> : null}{!draft.sourceBankId ? <PackageDiscoveryEmpty icon={<ListFilter />} text="Pilih Bank dan Subtest untuk melihat soal." /> : !candidates.length ? <PackageDiscoveryEmpty icon={<PackageCheck />} text={`Tidak ada soal ${draft.subtest} siap dalam Bank ini.`} /> : availableQuestions.length ? <div className="mt-4 grid gap-3">{availableQuestions.map((question) => <article className="rounded-2xl border border-primary-100 p-3" key={question.id}><p className="text-xs font-semibold text-primary-800">{question.subjectCode} · {question.difficulty === "easy" ? "Mudah" : question.difficulty === "hard" ? "Sulit" : "Sedang"}</p><p className="mt-1 text-sm leading-6 text-secondary-900">{question.prompt}</p><Button className="mt-3" onClick={() => setDraft((current) => ({ ...current, items: [...current.items, { pointValue: 1, sourceQuestionId: question.id, sourceQuestionRevisionId: question.questionRevisionId }] }))} size="sm" variant="brandOutline"><Plus />Tambah</Button></article>)}</div> : <PackageDiscoveryEmpty icon={<Search />} text="Tidak ada soal yang cocok dengan pencarian ini." />}{draft.sourceBankId && sourceQuestionTotal > sourceQuestionLoadedCount ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 pt-4"><p className="text-xs text-secondary-500">Menampilkan {sourceQuestionLoadedCount} dari {sourceQuestionTotal} soal siap.</p><Button disabled={sourceQuestionLoading} onClick={() => setSourceQuestionPage((page) => page + 1)} size="sm" type="button" variant="brandOutline"><ArrowDown />{sourceQuestionLoading ? "Memuat…" : "Muat 100 soal lagi"}</Button></div> : null}</section>
      </div>
    </div>

    <AlertDialog onOpenChange={(open) => { if (!saving) setConfirmReady(open); }} open={confirmReady}><AlertDialogContent className="rounded-5xl" pending={saving} variant="warning"><AlertDialogHeader><AlertDialogTitle>Rilis versi?</AlertDialogTitle><AlertDialogDescription>Versi ini membekukan Bank, urutan soal, dan poin yang ada sekarang. Setelah dibuat, versi dapat diikat ke Test Tryout dan tidak dapat diubah.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => void ready()} variant="brand"><Upload />{saving ? "Merilis versi…" : "Rilis"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog onOpenChange={(open) => { if (!open) setPendingBankId(null); }} open={Boolean(pendingBankId)}><AlertDialogContent className="rounded-5xl" variant="danger"><AlertDialogHeader><AlertDialogTitle>Ganti Bank Soal?</AlertDialogTitle><AlertDialogDescription>Soal yang sudah dipilih akan dihapus. Bank dapat diganti hanya sebelum Paket pertama kali tersimpan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={confirmBankChange} variant="destructive">Ganti dan hapus pilihan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Picker({ label, disabled, empty, openContent }: { label: string; disabled?: boolean; empty: string; openContent: React.ReactNode }) {
  return <Popover><PopoverTrigger disabled={disabled} render={<Button aria-haspopup="listbox" className="w-full justify-between" variant="context" />}>{label}<ArrowDown /></PopoverTrigger><PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] gap-2"><div aria-label={empty} className="grid max-h-72 gap-1 overflow-y-auto" role="listbox">{openContent}</div></PopoverContent></Popover>;
}

function PackageDiscoveryEmpty({ icon, text }: { icon: React.ReactNode; text: string }) { return <Empty className="mt-5 rounded-2xl border border-primary-200 px-4 py-10 text-secondary-500"><EmptyHeader><EmptyMedia className="bg-primary-50 text-primary-800" variant="icon">{icon}</EmptyMedia><EmptyDescription>{text}</EmptyDescription></EmptyHeader></Empty>; }

export { KaptenPackageBuilderPageModule };
