"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronLeft, CircleHelp, ClipboardList, Copy, Ellipsis, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { kaptenSubjects, type BankQuestion, type KaptenQuestionBank } from "@/modules/mentor/mock-data";
import { duplicateTryoutAction, saveTryoutAction } from "@/modules/mentor/tryout-actions";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

type TryoutSection = { durationMinutes: number; id: string; questionIds: string[]; subtest: string };
type TryoutDraft = { description: string; id: string; locked: boolean; questions: QuizQuestionSnapshot[]; sections: TryoutSection[]; status: "draft" | "published"; title: string; updatedAt: number };

const subjectCodes = kaptenSubjects.map((subject) => subject.code);

function snapshot(question: BankQuestion) {
  return { choices: question.choices.map((choice) => ({ ...choice })), correctChoiceId: question.correctChoiceId, explanation: question.explanation, id: `tryout-${Date.now()}-${question.id}`, origin: "bank" as const, prompt: question.prompt, sourceQuestionId: question.id };
}

function normalizeSections(draft: TryoutDraft): TryoutDraft {
  const bySubject = new Map<string, TryoutSection>();
  for (const section of draft.sections) {
    if (!subjectCodes.includes(section.subtest)) continue;
    const current = bySubject.get(section.subtest);
    if (!current) bySubject.set(section.subtest, { ...section, questionIds: [...new Set(section.questionIds)] });
    else bySubject.set(section.subtest, { ...current, questionIds: [...new Set([...current.questionIds, ...section.questionIds])] });
  }
  return {
    ...draft,
    sections: subjectCodes.map((subtest) => bySubject.get(subtest) ?? { durationMinutes: 30, id: `section-${draft.id}-${subtest}`, questionIds: [], subtest }),
  };
}

function KaptenTryoutPageModule({ initialItems, session }: { initialItems: TryoutDraft[]; session: SessionContext }) {
  const [items] = useState(initialItems);
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Tryout" searchPlaceholder="Cari tryout..." session={session}>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold text-secondary-900">Tryout</h1><Button render={<Link href="/mentor/tryout/create" />} variant="brand"><Plus />Buat Tryout</Button></div>
    <section className="mt-6 grid gap-3">{items.length ? items.map((item) => <article className="flex flex-col gap-4 rounded-3xl border border-primary-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between" key={item.id}><div className="flex items-center gap-2"><ClipboardList className="size-4 text-primary-800" /><h2 className="font-semibold text-secondary-900">{item.title}</h2><span className="text-xs font-semibold text-primary-800">{item.locked ? "Terkunci" : item.status === "published" ? "Diterbitkan" : "Draf"}</span></div><Button render={<Link href={`/mentor/tryout/${item.id}`} />} size="sm" variant="brand">Buka</Button></article>) : <div className="rounded-3xl border border-dashed border-primary-200 px-5 py-12 text-center text-sm text-secondary-500">Belum ada tryout. Buat paket browser-local untuk memeriksa alur authoring.</div>}</section>
  </MentorWorkspaceShell>;
}

function KaptenTryoutBuilderPageModule({ id, initialDraft, session, sourceCatalog }: { id?: string; initialDraft?: TryoutDraft | null; session: SessionContext; sourceCatalog: { bank: KaptenQuestionBank; questions: BankQuestion[] }[] }) {
  const [draft, setDraft] = useState<TryoutDraft>(() => normalizeSections(initialDraft ?? ({ description: "", id: id ?? `tryout-${Date.now()}`, locked: false, questions: [], sections: [], status: "draft", title: "Draft Tryout Baru", updatedAt: Date.now() })));
  const [dirty, setDirty] = useState(false);
  const [activeSubject, setActiveSubject] = useState("PU");
  const [confirm, setConfirm] = useState<"publish" | null>(null);

  const sources = useMemo(() => sourceCatalog, [sourceCatalog]);
  const active = draft.sections.find((section) => section.subtest === activeSubject) ?? draft.sections[0];
  const selectedQuestions = active ? active.questionIds.map((id) => draft.questions.find((question) => question.id === id)).filter((question): question is NonNullable<typeof question> => Boolean(question)) : [];
  const candidates = active ? sources.flatMap(({ bank, questions }) => questions.filter((question) => question.subjectCode === active.subtest && !draft.questions.some((item) => item.sourceQuestionId === question.id)).map((question) => ({ bank: bank.title, question }))) : [];
  const mark = (next: TryoutDraft) => { if (draft.locked) return; setDraft(next); setDirty(true); };
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const save = async (status = draft.status) => { setIsSaving(true); setSaveError(null); const next = { ...draft, sections: normalizeSections(draft).sections, status, updatedAt: Date.now() }; const result = await saveTryoutAction({ description: next.description, id: id, questions: next.questions, sections: next.sections, status, title: next.title }); setIsSaving(false); if (!result.ok) { setSaveError(result.message); return; } setDraft(result.result); setDirty(false); if (!id) window.location.assign(`/mentor/tryout/${result.result.id}`); };
  const duplicate = async () => { if (!id) return; setIsSaving(true); const result = await duplicateTryoutAction(id); setIsSaving(false); if (!result.ok) { setSaveError(result.message); return; } window.location.assign(`/mentor/tryout/${result.result.id}`); };
  const selectSubject = (subtest: string) => { setActiveSubject(subtest); };
  const updateActiveSection = (change: (section: TryoutSection) => TryoutSection) => { if (!active) return; mark({ ...draft, sections: draft.sections.map((section) => section.id === active.id ? change(section) : section) }); };
  const removeQuestion = (questionId: string) => { if (!active) return; mark({ ...draft, questions: draft.questions.filter((question) => question.id !== questionId), sections: draft.sections.map((section) => section.id === active.id ? { ...section, questionIds: section.questionIds.filter((id) => id !== questionId) } : section) }); };
  const moveQuestion = (questionId: string, direction: "up" | "down") => { if (!active) return; const index = active.questionIds.indexOf(questionId); const target = direction === "up" ? index - 1 : index + 1; if (index < 0 || target < 0 || target >= active.questionIds.length) return; const questionIds = [...active.questionIds]; const [moved] = questionIds.splice(index, 1); if (!moved) return; questionIds.splice(target, 0, moved); updateActiveSection((section) => ({ ...section, questionIds })); };

  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel={id ? "Edit Tryout" : "Buat Tryout"} onNavigateAway={() => !dirty} session={session} shouldGuardNavigation={dirty}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Button render={<Link href="/mentor/tryout" />} size="icon-sm" title="Kembali" variant="ghost"><ChevronLeft /></Button><h1 className="mt-4 text-3xl font-semibold text-secondary-900">{draft.title}</h1><p className="mt-1 text-sm text-secondary-500">{draft.locked ? "Terkunci setelah sesi" : dirty ? "Belum disimpan" : "Tersimpan"}</p></div><div className="flex flex-wrap gap-2">{draft.locked ? <Button disabled={isSaving} onClick={duplicate} type="button" variant="brand"><Copy />Duplicate</Button> : <><Button disabled={isSaving} onClick={() => save()} type="button" variant="brand"><Save />{isSaving ? "Menyimpan..." : "Simpan draft"}</Button><DropdownMenu><DropdownMenuTrigger render={<Button aria-label="Aksi Tryout" size="icon-sm" type="button" variant="ghost" />}><Ellipsis /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-52"><DropdownMenuGroup><DropdownMenuItem disabled={isSaving} onClick={() => setConfirm("publish")}>Terbitkan</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu></>}</div></div>
    {saveError ? <p aria-live="assertive" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{saveError}</p> : null}
    <div className="mt-7 grid gap-5"><Field><FieldLabel htmlFor="tryout-title">Judul tryout</FieldLabel><FieldInput disabled={draft.locked} id="tryout-title" onChange={(event) => mark({ ...draft, title: event.target.value })} value={draft.title} /></Field><Field><FieldLabel htmlFor="tryout-description">Deskripsi</FieldLabel><FieldTextarea disabled={draft.locked} id="tryout-description" onChange={(event) => mark({ ...draft, description: event.target.value })} value={draft.description} /></Field></div>
    <section className="mt-7"><div aria-label="Bagian subject" className="flex gap-2 overflow-x-auto border-b border-primary-100 pb-3" role="tablist">{kaptenSubjects.map((subject) => <Button aria-controls={`tryout-section-${subject.code}`} aria-selected={activeSubject === subject.code} key={subject.code} onClick={() => selectSubject(subject.code)} role="tab" size="sm" type="button" variant={activeSubject === subject.code ? "brand" : "brandOutline"}>{subject.code} · {draft.sections.find((section) => section.subtest === subject.code)?.questionIds.length ?? 0}</Button>)}</div></section>
    {active ? <div className="mt-7 grid min-w-0 gap-7 xl:grid-cols-[minmax(0,0.58fr)_minmax(320px,0.42fr)]" id={`tryout-section-${active.subtest}`}><section className="grid min-w-0 gap-5"><div className="min-w-0"><h2 className="text-xl font-semibold text-secondary-900">{active.subtest} · {kaptenSubjects.find((subject) => subject.code === active.subtest)?.name}</h2><p className="mt-1 text-sm text-secondary-500">Pilih dan urutkan soal untuk bagian subject ini.</p></div><Field><FieldLabel htmlFor={`duration-${active.subtest}`}>Durasi bagian (menit)</FieldLabel><FieldInput disabled={draft.locked} id={`duration-${active.subtest}`} min="1" onChange={(event) => updateActiveSection((section) => ({ ...section, durationMinutes: Number(event.target.value) || 0 }))} type="number" value={active.durationMinutes} /></Field><div className="min-w-0 rounded-3xl border border-primary-100 bg-white p-4"><div className="flex min-w-0 items-center justify-between"><h3 className="font-semibold text-secondary-900">Soal terpilih</h3><span className="text-sm text-secondary-500">{selectedQuestions.length} / alokasi bebas</span></div><div className="mt-4 grid gap-2">{selectedQuestions.length ? selectedQuestions.map((question, index) => <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-primary-100 p-3" key={question.id}><span className="text-sm font-semibold text-primary-800">{index + 1}</span><p className="min-w-0 flex-1 truncate text-sm text-secondary-900">{question.prompt}</p><Button aria-label="Pindah soal ke atas" disabled={draft.locked || index === 0} onClick={() => moveQuestion(question.id, "up")} size="icon-sm" type="button" variant="ghost"><ArrowUp /></Button><Button aria-label="Pindah soal ke bawah" disabled={draft.locked || index === selectedQuestions.length - 1} onClick={() => moveQuestion(question.id, "down")} size="icon-sm" type="button" variant="ghost"><ArrowDown /></Button><Button aria-label="Hapus soal" disabled={draft.locked} onClick={() => removeQuestion(question.id)} size="icon-sm" type="button" variant="ghost"><Trash2 /></Button></div>) : <p className="py-5 text-sm text-secondary-500">Belum ada soal dipilih untuk {active.subtest}.</p>}</div></div></section>
    <aside className="min-w-0 border-t border-primary-100 pt-6 xl:border-t-0 xl:border-l xl:pl-7 xl:pt-0"><TooltipProvider><div className="flex items-center gap-2"><h2 className="font-semibold text-secondary-900">Daftar Soal</h2><Tooltip><TooltipTrigger render={<button aria-label="Informasi daftar soal" className="inline-flex size-6 items-center justify-center rounded-full text-secondary-500 transition-colors hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/25" type="button"><CircleHelp aria-hidden="true" className="size-4" /></button>} /><TooltipContent>Soal yang muncul di sini hanya soal-soal dengan tag sesuai subjek yang dipilih</TooltipContent></Tooltip></div></TooltipProvider>{!draft.locked ? <div className="mt-5 grid min-w-0 gap-3">{candidates.map(({ bank, question }) => <article className="min-w-0 rounded-2xl border border-primary-100 p-3" key={question.id}><p className="text-xs font-semibold text-primary-800">{bank} · {question.subjectCode}</p><p className="mt-1 text-sm font-medium text-secondary-900">{question.prompt}</p><Button className="mt-3" onClick={() => { const item = snapshot(question); mark({ ...draft, questions: [...draft.questions, item], sections: draft.sections.map((section) => section.id === active.id ? { ...section, questionIds: [...section.questionIds, item.id] } : section) }); }} size="sm" type="button" variant="brandOutline"><Plus />Tambah</Button></article>)}{!candidates.length && <p className="rounded-2xl border border-dashed border-primary-200 p-4 text-sm text-secondary-500">Tidak ada soal kompatibel tersisa dari Bank yang diterbitkan.</p>}</div> : null}</aside></div> : null}
    <Dialog onOpenChange={(open) => !open && setConfirm(null)} open={Boolean(confirm)}><DialogContent><DialogHeader><DialogTitle>Terbitkan tryout?</DialogTitle><DialogDescription>Tryout akan tersedia sesuai status publikasinya.</DialogDescription></DialogHeader><DialogFooter><Button onClick={() => setConfirm(null)} type="button" variant="brandOutline">Batal</Button><Button onClick={() => { void save("published"); setConfirm(null); }} type="button" variant="brand">Konfirmasi</Button></DialogFooter></DialogContent></Dialog>
  </MentorWorkspaceShell>;
}

export { KaptenTryoutBuilderPageModule, KaptenTryoutPageModule };
