"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  type BankQuestion,
  type KaptenQuestionBank,
} from "@/modules/mentor/mock-data";
import {
  getSubjectName,
  saveQuestionBankDraft,
  useStoredQuestionBankDraft,
} from "@/modules/mentor/question-bank-draft-storage";

const emptyQuestion = (bankId: string, subjectCode: string): BankQuestion => ({
  bankId,
  choices: [
    { id: "a", text: "" },
    { id: "b", text: "" },
    { id: "c", text: "" },
    { id: "d", text: "" },
  ],
  correctChoiceId: "a",
  difficulty: "medium",
  explanation: "",
  id: "",
  prompt: "",
  subjectCode,
  tags: [],
});

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug || "bank-soal-baru";
}

function difficultyMix(questions: BankQuestion[]) {
  if (questions.length === 0) return "Belum ada soal";
  const counts = questions.reduce<Record<string, number>>((result, question) => {
    result[question.difficulty] = (result[question.difficulty] ?? 0) + 1;
    return result;
  }, {});
  return ["easy", "medium", "hard"]
    .filter((difficulty) => counts[difficulty])
    .map((difficulty) => `${Math.round(((counts[difficulty] ?? 0) / questions.length) * 100)}% ${difficulty === "easy" ? "mudah" : difficulty === "medium" ? "sedang" : "sulit"}`)
    .join(", ");
}

function isReady(question: BankQuestion) {
  return question.prompt.trim() && question.choices.length === 4 && question.choices.every((choice) => choice.text.trim()) && question.choices.some((choice) => choice.id === question.correctChoiceId);
}

function KaptenQuestionBankBuilderPageModule({
  bankId,
  initialBank = null,
  initialQuestions = [],
  mode,
  session,
}: {
  bankId?: string;
  initialBank?: KaptenQuestionBank | null;
  initialQuestions?: BankQuestion[];
  mode: "create" | "edit";
  session: SessionContext;
}) {
  const router = useRouter();
  const storedDraft = useStoredQuestionBankDraft(bankId ?? initialBank?.id ?? "");
  const [localBuilderState, setLocalBuilderState] = useState(() => ({
    description: initialBank?.description ?? "",
    questions: initialQuestions,
    subjectCode: initialBank?.subjectCode ?? "PU",
    title: initialBank?.title ?? "Bank Soal Baru",
    topic: initialBank?.topic ?? "",
  }));
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState<BankQuestion>(() => emptyQuestion(
    bankId ?? initialBank?.id ?? "new-bank",
    initialBank?.subjectCode ?? "PU",
  ));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const builderState = useMemo(() => {
    if (!hasUnsavedChanges && storedDraft) {
      return {
        description: storedDraft.bank.description,
        questions: storedDraft.questions,
        subjectCode: storedDraft.bank.subjectCode ?? "PU",
        title: storedDraft.bank.title,
        topic: storedDraft.bank.topic ?? "",
      };
    }

    return localBuilderState;
  }, [hasUnsavedChanges, localBuilderState, storedDraft]);

  const activeQuestion = activeQuestionId
    ? builderState.questions.find((question) => question.id === activeQuestionId) ?? null
    : null;
  const readyCount = builderState.questions.filter(isReady).length;
  const subjectLocked = builderState.questions.length > 0;
  const lifecycleStatus = storedDraft?.bank.status ?? initialBank?.status ?? "draft";
  const isDraftLifecycle = lifecycleStatus === "draft";
  const saveLabel = isDraftLifecycle ? "Simpan Draft" : "Simpan perubahan";

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

  function markChanged(nextState: typeof builderState) {
    setLocalBuilderState(nextState);
    setHasUnsavedChanges(true);
    setLastSavedAt(null);
  }

  function updateMetadata(field: "title" | "description" | "topic", value: string) {
    markChanged({ ...builderState, [field]: value });
  }

  function selectSubject(subjectCode: string) {
    if (subjectLocked || subjectCode === builderState.subjectCode) return;
    setQuestionDraft((question) => ({ ...question, subjectCode }));
    markChanged({ ...builderState, subjectCode });
  }

  function openQuestion(question: BankQuestion) {
    setActiveQuestionId(question.id);
    setQuestionDraft({ ...question, choices: question.choices.map((choice) => ({ ...choice })), tags: [...question.tags] });
  }

  function updateQuestionDraft(next: BankQuestion) {
    setQuestionDraft(next);
    if (!activeQuestionId) return;
    markChanged({
      ...builderState,
      questions: builderState.questions.map((question) => question.id === activeQuestionId ? next : question),
    });
  }

  function addQuestion() {
    const id = `${builderState.subjectCode.toLowerCase()}-question-${Date.now()}`;
    const nextQuestion = { ...emptyQuestion(bankId ?? initialBank?.id ?? id, builderState.subjectCode), id };
    markChanged({ ...builderState, questions: [...builderState.questions, nextQuestion] });
    setActiveQuestionId(id);
    setQuestionDraft(nextQuestion);
  }

  function removeQuestion(id: string) {
    const questions = builderState.questions.filter((question) => question.id !== id);
    markChanged({ ...builderState, questions });
    if (activeQuestionId === id) {
      setActiveQuestionId(null);
      setQuestionDraft(emptyQuestion(bankId ?? initialBank?.id ?? "new-bank", builderState.subjectCode));
    }
  }

  function saveDraft() {
    const id = initialBank?.id ?? bankId ?? `bank-${slugify(builderState.title)}-${Date.now()}`;
    const bank: KaptenQuestionBank = {
      description: builderState.description,
      difficultyMix: difficultyMix(builderState.questions),
      href: `/mentor/quiz/question-bank/${id}`,
      id,
      primaryMetric: `${builderState.questions.length} soal`,
      progress: builderState.questions.length ? Math.round((readyCount / builderState.questions.length) * 100) : 0,
      questionCount: builderState.questions.length,
      resourceType: "question-bank",
      reusableIn: ["Quiz"],
      status: lifecycleStatus,
      subjectCode: builderState.subjectCode,
      subjectName: getSubjectName(builderState.subjectCode),
      title: builderState.title || "Bank Soal Baru",
      topic: builderState.topic,
      updatedAt: "Diedit baru saja",
    };
    const questions = builderState.questions.map((question) => ({
      ...question,
      bankId: id,
      subjectCode: builderState.subjectCode,
      choices: question.choices.map((choice) => ({ ...choice })),
      tags: [...question.tags],
    }));

    saveQuestionBankDraft({ bank, questions });
    setLocalBuilderState({ ...builderState, questions });
    setHasUnsavedChanges(false);
    setLastSavedAt(isDraftLifecycle ? "Draft tersimpan." : "Perubahan tersimpan.");
    if (mode === "create") router.replace(`/mentor/quiz/question-bank/${id}`);
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Question Bank"
      breadcrumbLabel={mode === "create" ? "Buat Bank Soal" : "Edit Bank Soal"}
      mainClassName="max-w-[1500px] gap-7"
      onNavigateAway={() => !hasUnsavedChanges || window.confirm("Perubahan belum disimpan. Keluar dari builder?")}
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
      shouldGuardNavigation={hasUnsavedChanges}
    >
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button render={<Link href="/mentor/quiz/question-bank" />} size="sm" variant="ghost"><ArrowLeft /> Question Bank</Button>
          <h1 className="mt-5 text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">{mode === "create" ? "Buat Bank Soal" : builderState.title}</h1>
          <p className="mt-2 text-sm text-secondary-500">{hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"} · {readyCount}/{builderState.questions.length} soal siap</p>
        </div>
        <Button onClick={saveDraft} type="button" variant="brand"><Save /> {saveLabel}</Button>
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,0.7fr)_minmax(270px,0.3fr)]">
        <div className="order-1 space-y-8 xl:order-none">
          <section className="border-b border-primary-100 pb-8">
            <div className="grid gap-5 lg:grid-cols-2">
              <Field><FieldLabel htmlFor="bank-title">Judul bank</FieldLabel><FieldInput id="bank-title" onChange={(event) => updateMetadata("title", event.target.value)} value={builderState.title} /></Field>
              <Field><FieldLabel htmlFor="bank-topic">Topik <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldInput id="bank-topic" onChange={(event) => updateMetadata("topic", event.target.value)} value={builderState.topic} /></Field>
              <Field><FieldLabel htmlFor="bank-subject">Subject</FieldLabel><div className="relative"><select className={`${fieldControlClassName} appearance-none pr-12`} disabled={subjectLocked} id="bank-subject" onChange={(event) => selectSubject(event.target.value)} value={builderState.subjectCode}>{kaptenSubjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} - {subject.name}</option>)}</select><ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" /></div>{subjectLocked ? <p className="mt-2 text-xs text-secondary-500">Subject terkunci setelah soal pertama ditambahkan.</p> : null}</Field>
              <Field className="lg:col-span-2"><FieldLabel htmlFor="bank-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-[100px]" id="bank-description" onChange={(event) => updateMetadata("description", event.target.value)} value={builderState.description} /></Field>
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">{activeQuestion ? "Edit soal" : "Soal aktif"}</p><p className="mt-1 text-sm text-secondary-500">Simpan soal lengkap atau biarkan belum lengkap untuk dilanjutkan nanti.</p></div><Button onClick={addQuestion} type="button" variant="brandOutline"><Plus /> Tambah soal</Button></div>
            <div className="mt-5 space-y-5 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm md:p-7">
              <Field><FieldLabel htmlFor="question-prompt">Pertanyaan</FieldLabel><FieldTextarea id="question-prompt" onChange={(event) => updateQuestionDraft({ ...questionDraft, prompt: event.target.value })} value={questionDraft.prompt} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">{questionDraft.choices.map((choice, index) => <label className="flex items-center gap-3 rounded-2xl border border-primary-100 px-3 py-3" key={choice.id}><input aria-label={`Jawaban benar opsi ${index + 1}`} checked={choice.id === questionDraft.correctChoiceId} className="size-4 accent-primary-700" name="bank-correct-choice" onChange={() => updateQuestionDraft({ ...questionDraft, correctChoiceId: choice.id })} type="radio" /><span className="text-xs font-semibold text-primary-800">{String.fromCharCode(65 + index)}</span><input aria-label={`Opsi ${index + 1}`} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-secondary-400" onChange={(event) => updateQuestionDraft({ ...questionDraft, choices: questionDraft.choices.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item) })} placeholder={`Opsi ${String.fromCharCode(65 + index)}`} value={choice.text} /></label>)}</div>
              <div className="grid gap-5 sm:grid-cols-2"><Field><FieldLabel htmlFor="question-difficulty">Tingkat kesulitan</FieldLabel><select className={fieldControlClassName} id="question-difficulty" onChange={(event) => updateQuestionDraft({ ...questionDraft, difficulty: event.target.value as BankQuestion["difficulty"] })} value={questionDraft.difficulty}><option value="easy">Mudah</option><option value="medium">Sedang</option><option value="hard">Sulit</option></select></Field><Field><FieldLabel htmlFor="question-tags">Tags <span className="font-normal text-secondary-400">(pisahkan koma)</span></FieldLabel><FieldInput id="question-tags" onChange={(event) => updateQuestionDraft({ ...questionDraft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} value={questionDraft.tags.join(", ")} /></Field></div>
              <Field><FieldLabel htmlFor="question-explanation">Penjelasan <span className="font-normal text-secondary-400">(opsional)</span></FieldLabel><FieldTextarea id="question-explanation" onChange={(event) => updateQuestionDraft({ ...questionDraft, explanation: event.target.value })} value={questionDraft.explanation} /></Field>
              {activeQuestionId ? <Button onClick={() => removeQuestion(activeQuestionId)} type="button" variant="ghost"><Trash2 /> Hapus soal ini</Button> : <p className="text-sm text-secondary-500">Pilih soal di rail atau tambah soal baru untuk mulai mengedit.</p>}
            </div>
          </section>
        </div>

        <aside className="order-2 border-t border-primary-100 pt-5 xl:order-none xl:border-t-0 xl:border-l xl:pl-7 xl:pt-1"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-secondary-900">Inventori soal</p><p className="mt-1 text-xs text-secondary-500">{builderState.questions.length} soal · {readyCount} siap</p></div><Button onClick={addQuestion} size="icon-sm" type="button" variant="brandOutline"><Plus /></Button></div><div className="mt-4 flex gap-1 overflow-x-auto border-t border-primary-100 pt-3 xl:mt-5 xl:block xl:space-y-1">{builderState.questions.length > 0 ? builderState.questions.map((question, index) => <button className={cn("min-w-[220px] rounded-2xl px-3 py-3 text-left transition-colors xl:block xl:w-full", activeQuestionId === question.id ? "bg-primary-50" : "hover:bg-primary-50/60")} key={question.id} onClick={() => openQuestion(question)} type="button"><span className="block truncate text-sm font-semibold text-secondary-900">{String(index + 1).padStart(2, "0")}. {question.prompt || "Soal tanpa pertanyaan"}</span><span className="mt-1 block text-xs text-secondary-500">{isReady(question) ? "Siap dipakai Quiz" : "Belum lengkap"}</span></button>) : <p className="px-2 py-4 text-sm leading-6 text-secondary-500">Belum ada soal. Tambahkan soal pertama untuk mengunci subject.</p>}</div><div className="mt-7 hidden border-t border-primary-100 pt-5 xl:block"><p className="text-sm font-semibold text-secondary-900">Status</p><div className="mt-4 space-y-3 text-sm text-secondary-600"><div className="flex items-center justify-between gap-4"><span>Subject</span><span className="font-semibold text-secondary-900">{builderState.subjectCode}</span></div><div className="flex items-center justify-between gap-4"><span>Siap</span><span className="font-semibold text-secondary-900">{readyCount}/{builderState.questions.length}</span></div><div className="flex items-center justify-between gap-4"><span>Perubahan</span><span className={cn("font-semibold", hasUnsavedChanges ? "text-[#856300]" : "text-primary-800")}>{hasUnsavedChanges ? "Belum disimpan" : "Tersimpan"}</span></div></div>{lastSavedAt ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-primary-800"><CheckCircle2 className="size-4" /> {lastSavedAt}</p> : null}</div></aside>
      </section>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuestionBankBuilderPageModule };
