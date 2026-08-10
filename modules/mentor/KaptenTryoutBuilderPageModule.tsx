"use client";

import Link from "next/link";
import { ArrowLeft, Check, ChevronDown, ChevronRight, CircleAlert, CircleHelp, Copy, Lock, PackagePlus, Save, Search, Upload } from "@/lib/icons";
import { useMemo, useState, type ReactNode } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { KaptenTryoutParticipantsPageModule } from "@/modules/mentor/KaptenTryoutParticipantsPageModule";
import { KaptenTryoutPolicyPageModule } from "@/modules/mentor/KaptenTryoutPolicyPageModule";
import { KaptenTryoutSessionsPageModule } from "@/modules/mentor/KaptenTryoutSessionsPageModule";
import { duplicateTryoutAction, saveTryoutAction } from "@/modules/mentor/tryout-actions";

const subjectCodes = kaptenSubjects.map((subject) => subject.code) as Array<"PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM">;
type SubjectCode = (typeof subjectCodes)[number];
type TestDraft = { catItemCount?: number; durationMinutes: number; instructions: string; packageVersionId?: string; packageVersionLabel?: string; scoringConfig?: Record<string, unknown>; shuffleItems: boolean; subtest: SubjectCode; testType: "cbt" | "cat" };
type TryoutDraft = { description: string; id: string; locked: boolean; sections: TestDraft[]; status: "draft" | "published"; title: string; updatedAt: number };
type ReadyVersion = { id: string; label: string; subtest: SubjectCode };
type Workspace = "authoring" | "participants" | "policy" | "sessions";

function defaultSections(): TestDraft[] {
  return subjectCodes.map((subtest) => ({ durationMinutes: 30, instructions: "", shuffleItems: false, subtest, testType: "cbt" }));
}

function normalize(draft: TryoutDraft): TryoutDraft {
  const byCode = new Map(draft.sections.map((section) => [section.subtest, section]));
  return { ...draft, sections: subjectCodes.map((code) => byCode.get(code) ?? defaultSections().find((section) => section.subtest === code)!) };
}

function subjectName(code: SubjectCode) {
  return kaptenSubjects.find((subject) => subject.code === code)?.name ?? code;
}

function KaptenTryoutBuilderPageModule({ id, initialDraft, initialWorkspace = "authoring", operationsInitial, readyVersions, session }: { id?: string; initialDraft?: TryoutDraft | null; initialWorkspace?: Workspace; operationsInitial?: TryoutOperationsView; readyVersions: ReadyVersion[]; session: SessionContext }) {
  void session;
  const [draft, setDraft] = useState<TryoutDraft>(() => normalize(initialDraft ?? { description: "", id: id ?? "baru", locked: false, sections: defaultSections(), status: "draft", title: "Draft Tryout Baru", updatedAt: Date.now() }));
  const [activeCode, setActiveCode] = useState<SubjectCode>(() => draft.sections.find((section) => !section.packageVersionId)?.subtest ?? "PU");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [packageSearch, setPackageSearch] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const activeSection = draft.sections.find((section) => section.subtest === activeCode) ?? draft.sections[0];
  const boundCount = draft.sections.filter((section) => section.packageVersionId).length;
  const readyToPublish = boundCount === subjectCodes.length;
  const activeReadyVersions = useMemo(() => readyVersions.filter((version) => version.subtest === activeSection.subtest && version.label.toLocaleLowerCase().includes(packageSearch.toLocaleLowerCase())), [activeSection.subtest, packageSearch, readyVersions]);
  const update = (subtest: SubjectCode, change: Partial<TestDraft>) => setDraft((current) => ({ ...current, sections: current.sections.map((section) => section.subtest === subtest ? { ...section, ...change } : section) }));
  const save = async (status = draft.status) => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveTryoutAction({ description: draft.description, id, sections: draft.sections.map((section) => ({ catItemCount: section.catItemCount, durationMinutes: section.durationMinutes, instructions: section.instructions, packageVersionId: section.packageVersionId, scoringConfig: section.scoringConfig, shuffleItems: section.shuffleItems, subtest: section.subtest, testType: section.testType })), status, title: draft.title });
      if (!result.ok) return setError(result.message);
      setDraft(normalize(result.result));
      if (!id) window.location.assign(`/mentor/tryout/${result.result.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Tryout belum dapat disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    setPublishOpen(false);
    await save("published");
  };
  const duplicate = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const result = await duplicateTryoutAction(id);
      if (!result.ok) return setError(result.message);
      window.location.assign(`/mentor/tryout/${result.result.id}`);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Tryout belum dapat disalin. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };
  const selectPackage = (version: ReadyVersion) => {
    update(activeSection.subtest, { packageVersionId: version.id, packageVersionLabel: version.label });
    setPackageSearch("");
  };
  const activeIndex = subjectCodes.indexOf(activeSection.subtest);
  const changeWorkspace = (value: string) => {
    const nextWorkspace = value as Workspace;
    setWorkspace(nextWorkspace);
    const url = new URL(window.location.href);
    if (nextWorkspace === "authoring") url.searchParams.delete("workspace");
    else url.searchParams.set("workspace", nextWorkspace);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const incompleteSectionButtons = draft.sections.reduce<ReactNode[]>((buttons, section) => {
    if (section.packageVersionId) return buttons;
    buttons.push(<Button className="h-8 rounded-lg border-[#d4a943] bg-white/70 px-2.5 text-xs text-[#6a4a00] hover:bg-white" key={section.subtest} onClick={() => setActiveCode(section.subtest)} variant="outline">Buka {section.subtest}</Button>);
    return buttons;
  }, []);

  return <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-3 border-b border-primary-100 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button render={<Link href="/mentor/tryout" />} size="sm" variant="ghost"><ArrowLeft />Semua Tryout</Button>
        <div className="flex flex-wrap items-center gap-2">
          {draft.locked ? <Button disabled={saving} onClick={() => setDuplicateOpen(true)} size="sm" variant="brand"><Copy />Duplikasi</Button> : <><Button disabled={saving} onClick={() => void save()} size="sm" variant="brandOutline"><Save />{saving ? "Menyimpan…" : "Simpan draft"}</Button><Button disabled={saving || !readyToPublish} onClick={() => setPublishOpen(true)} size="sm" variant="brand"><Upload />Terbitkan</Button></>}
        </div>
      </div>
    </header>

    {error ? <p className="mt-4 flex items-start gap-2 rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm text-danger-500" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
    {draft.locked ? <section className="mt-4 flex items-start gap-3 rounded-2xl border border-secondary-900/10 bg-secondary-50 px-4 py-3 text-sm leading-6 text-secondary-700"><Lock className="mt-0.5 size-4 shrink-0" /><p><strong>Mode baca saja.</strong> Peserta sudah memulai Tryout ini; buat salinan untuk mengubah konfigurasi tanpa mengubah riwayat.</p></section> : null}

    <section className="mt-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-[-0.02em] text-secondary-900">{draft.title || "Tryout tanpa judul"}</h1></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${draft.status === "published" ? "bg-[#d7f2d8] text-[#14563e]" : "bg-[#fff0cc] text-[#805700]"}`}>{draft.status === "published" ? "Diterbitkan" : "Draf"}</span></div><div className="mt-5 grid gap-4"><Field><FieldLabel htmlFor="tryout-title">Judul Tryout</FieldLabel><FieldInput disabled={draft.locked} id="tryout-title" onChange={(event) => setDraft({ ...draft, title: event.target.value })} value={draft.title} /></Field><Field><FieldLabel htmlFor="tryout-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-28 px-4 py-3 text-sm leading-6" disabled={draft.locked} id="tryout-description" onChange={(event) => setDraft({ ...draft, description: event.target.value })} value={draft.description} /></Field></div></section>
    <Tabs onValueChange={changeWorkspace} value={workspace}>
    {id && operationsInitial ? <div className="mt-5 overflow-x-auto pb-1"><TabsList aria-label="Ruang kerja Tryout" className="min-w-max"><TabsTrigger value="authoring">Paket &amp; Test</TabsTrigger><TabsTrigger value="policy">Kebijakan</TabsTrigger><TabsTrigger value="sessions">Sesi</TabsTrigger><TabsTrigger value="participants">Peserta</TabsTrigger></TabsList></div> : null}
    <TabsContent className="mt-5" value="authoring"><div>
      <section className="min-w-0 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><DropdownMenu><DropdownMenuTrigger render={<Button className="w-full justify-between sm:w-80" variant="context" />}><span className="truncate">Test {String(activeIndex + 1).padStart(2, "0")} · {activeSection.subtest} / {subjectName(activeSection.subtest)}</span><ChevronDown /></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-96 w-[min(28rem,calc(100vw-2rem))]"><DropdownMenuLabel>Pilih Test wajib</DropdownMenuLabel><DropdownMenuRadioGroup onValueChange={(value) => setActiveCode(value as SubjectCode)} value={activeCode}>{draft.sections.map((section) => <DropdownMenuRadioItem className="min-h-12 items-start py-3" key={section.subtest} value={section.subtest}><span className="grid gap-0.5"><span className="font-semibold">{section.subtest} · {subjectName(section.subtest)}</span><span className={section.packageVersionId ? "text-xs font-normal text-[#14563e]" : "text-xs font-normal text-[#805700]"}>{section.packageVersionId ? "Paket terikat" : "Belum ada paket soal"}</span></span></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div><div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${activeSection.packageVersionId ? "bg-[#d7f2d8] text-[#14563e]" : "bg-[#fff0cc] text-[#805700]"}`}>{activeSection.packageVersionId ? <Check className="size-3.5" /> : <CircleAlert className="size-3.5" />}{activeSection.packageVersionId ? "Paket siap" : "Belum ada paket soal"}</div></header>
        <div className="mt-6 grid gap-5">
          <Field><FieldLabel>Paket soal</FieldLabel><Popover><PopoverTrigger disabled={draft.locked} render={<Button aria-haspopup="listbox" className="w-full justify-between" variant="context" />}>{activeSection.packageVersionLabel ?? readyVersions.find((version) => version.id === activeSection.packageVersionId)?.label ?? "Cari paket soal"}<ChevronDown /></PopoverTrigger><PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] gap-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400" /><FieldInput aria-label="Cari Paket Soal siap" className="h-10 rounded-xl py-2 pl-9 pr-3 text-sm" onChange={(event) => setPackageSearch(event.target.value)} placeholder="Cari nama Paket atau versi…" value={packageSearch} /></div><div aria-label="Paket Soal kompatibel" className="grid max-h-64 gap-1 overflow-y-auto" role="listbox">{activeReadyVersions.length ? activeReadyVersions.map((version) => <Button aria-selected={activeSection.packageVersionId === version.id} className="h-auto justify-start rounded-xl px-3 py-2.5 text-left hover:bg-primary-50" key={version.id} onClick={() => selectPackage(version)} role="option" variant={activeSection.packageVersionId === version.id ? "contextSelected" : "ghost"}>{version.label}{activeSection.packageVersionId === version.id ? <Check className="ml-auto" /> : null}</Button>) : <div className="grid gap-3 px-3 py-5 text-sm leading-6 text-secondary-500"><p>{readyVersions.some((version) => version.subtest === activeSection.subtest) ? "Tidak ada Paket yang cocok dengan pencarian." : `Belum ada Paket ${activeSection.subtest} yang siap.`}</p>{!readyVersions.some((version) => version.subtest === activeSection.subtest) ? <Button className="w-fit" render={<Link href={`/mentor/packages/create?subtest=${activeSection.subtest}`} />} size="sm" variant="brand"><PackagePlus />Buat Paket</Button> : null}</div>}</div></PopoverContent></Popover></Field>
          <div className="grid gap-5 md:grid-cols-2"><Field><FieldLabel htmlFor={`duration-${activeSection.subtest}`}>Durasi</FieldLabel><div className="relative"><FieldInput className="pr-16" disabled={draft.locked} id={`duration-${activeSection.subtest}`} min="1" onChange={(event) => update(activeSection.subtest, { durationMinutes: Number(event.target.value) })} type="number" value={activeSection.durationMinutes} /><span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500">menit</span></div></Field><Field><FieldLabel>Tipe Test</FieldLabel><div className="grid grid-cols-2 rounded-2xl border border-secondary-900/14 bg-[#f8fbf9] p-1" role="radiogroup"><Button aria-checked={activeSection.testType === "cbt"} className={`rounded-xl ${activeSection.testType === "cbt" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(activeSection.subtest, { testType: "cbt" })} role="radio" variant="ghost">CBT</Button><Button aria-checked={activeSection.testType === "cat"} className={`rounded-xl ${activeSection.testType === "cat" ? "bg-[#d7f2d8] text-[#14563e] hover:bg-[#c8ebca]" : "text-secondary-500"}`} disabled={draft.locked} onClick={() => update(activeSection.subtest, { testType: "cat" })} role="radio" variant="ghost">CAT</Button></div></Field></div>
          <div className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-primary-100 bg-[#f8fbf9] px-4 py-3"><p className="text-sm font-semibold text-secondary-900">Acak urutan soal</p><Switch aria-label="Acak urutan soal" checked={activeSection.shuffleItems} disabled={draft.locked} onCheckedChange={(checked) => update(activeSection.subtest, { shuffleItems: checked })} /></div>
          {activeSection.testType === "cat" ? <Field><div className="flex items-center gap-1"><FieldLabel htmlFor={`cat-count-${activeSection.subtest}`}>Jumlah soal</FieldLabel><TooltipProvider><Tooltip><TooltipTrigger render={<Button aria-label="Bantuan jumlah soal CAT" size="icon-xs" variant="ghost" />}><CircleHelp /></TooltipTrigger><TooltipContent className="bg-white text-black [&>svg]:bg-white [&>svg]:fill-white">Jumlah soal yang dipilih secara adaptif dari Paket Soal yang terikat.</TooltipContent></Tooltip></TooltipProvider></div><FieldInput disabled={draft.locked} id={`cat-count-${activeSection.subtest}`} min="1" onChange={(event) => update(activeSection.subtest, { catItemCount: Number(event.target.value) })} type="number" value={activeSection.catItemCount ?? ""} /></Field> : null}
          <Field><FieldLabel htmlFor={`instruction-${activeSection.subtest}`}>Instruksi peserta</FieldLabel><FieldTextarea className="min-h-32" disabled={draft.locked} id={`instruction-${activeSection.subtest}`} onChange={(event) => update(activeSection.subtest, { instructions: event.target.value })} placeholder="Instruksi yang dibaca peserta sebelum Test dimulai." value={activeSection.instructions} /></Field>
        </div>
        <footer className="mt-7 flex justify-end border-t border-primary-100 pt-5"><div className="flex gap-2">{activeIndex > 0 ? <Button onClick={() => setActiveCode(subjectCodes[activeIndex - 1])} variant="brandOutline">Sebelumnya</Button> : null}{activeIndex < subjectCodes.length - 1 ? <Button onClick={() => setActiveCode(subjectCodes[activeIndex + 1])} variant="brand">Test berikutnya<ChevronRight /></Button> : <Button disabled={saving || !readyToPublish || draft.locked} onClick={() => setPublishOpen(true)} variant="brand"><Upload />Terbitkan</Button>}</div></footer>
      </section>
      {!draft.locked && !readyToPublish ? <section className="mt-4 rounded-2xl border border-[#f3d486] bg-[#fff7e5] px-4 py-3 text-sm leading-6 text-[#6a4a00]" role="status"><div className="flex items-start gap-2"><CircleAlert className="mt-1 size-4 shrink-0" /><p><strong>{7 - boundCount} Test belum siap.</strong> Lengkapi Paket Soal pada Test yang ditandai, lalu publikasi akan tersedia.</p></div><div className="mt-2 flex flex-wrap gap-2 pl-6">{incompleteSectionButtons}</div></section> : null}
    </div></TabsContent>
    {operationsInitial && id ? <><TabsContent className="mt-5" value="policy"><KaptenTryoutPolicyPageModule embedded initial={operationsInitial} /></TabsContent><TabsContent className="mt-5" value="sessions"><KaptenTryoutSessionsPageModule embedded initial={operationsInitial} /></TabsContent><TabsContent className="mt-5" value="participants"><KaptenTryoutParticipantsPageModule embedded initial={operationsInitial} /></TabsContent></> : null}
    </Tabs>

    <AlertDialog onOpenChange={setPublishOpen} open={publishOpen}><AlertDialogContent className="rounded-5xl"><AlertDialogHeader><AlertDialogTitle>Terbitkan Tryout?</AlertDialogTitle><AlertDialogDescription>Ketujuh Test akan dipublikasikan dengan versi Paket, durasi, dan konfigurasi yang terlihat saat ini.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => void publish()} variant="brand"><Upload />{saving ? "Menerbitkan…" : "Terbitkan Tryout"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog onOpenChange={setDuplicateOpen} open={duplicateOpen}><AlertDialogContent className="rounded-5xl"><AlertDialogHeader><AlertDialogTitle>Duplikasi Tryout?</AlertDialogTitle><AlertDialogDescription>Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta pada Tryout ini tetap tidak berubah.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={() => void duplicate()} variant="brand"><Copy />{saving ? "Menyalin…" : "Buat salinan"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}

export { KaptenTryoutBuilderPageModule };
