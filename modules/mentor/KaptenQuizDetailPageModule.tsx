"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, FilePenLine, ListChecks, Pencil, SendHorizontal } from "@/lib/icons";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { FullWidthLineTabsList, FullWidthLineTabsTrigger } from "@/components/ui/full-width-line-tabs";
import { showToast } from "@/components/ui/sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import { saveStandaloneQuizAction } from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import { DropdownField } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { KaptenQuizResultsContent, type KaptenQuizResultsData } from "@/modules/mentor/KaptenQuizResultsPageModule";

type QuizDetailTab = "preview" | "hasil" | "pengaturan";

type SettingsForm = {
  attemptsAllowed: number | null;
  closesAt: string;
  correctAnswerVisibility: NonNullable<KaptenQuiz["correctAnswerVisibility"]>;
  description: string;
  formBehavior: NonNullable<KaptenQuiz["formBehavior"]>;
  opensAt: string;
  retryDelaySeconds: number | null;
  reviewTiming: NonNullable<KaptenQuiz["reviewTiming"]>;
  scorePolicy: NonNullable<KaptenQuiz["scorePolicy"]>;
  subjectCode: string;
  title: string;
};

function cloneForSave(questions: QuizQuestionSnapshot[]) {
  return questions.map((question) => ({
    ...question,
    choices: question.choices.map((choice) => ({ ...choice })),
    origin: "local" as const,
    sourceContentDigest: undefined,
    sourceQuestionId: undefined,
    sourceQuestionRevisionId: undefined,
    sourceRevisionProvenance: undefined,
  }));
}

function settingsFromQuiz(quiz: KaptenQuiz): SettingsForm {
  return {
    attemptsAllowed: quiz.attemptsAllowed ?? 1,
    closesAt: quiz.closesAt ?? "",
    correctAnswerVisibility: quiz.correctAnswerVisibility ?? "show",
    description: quiz.description,
    formBehavior: quiz.formBehavior ?? "same",
    opensAt: quiz.opensAt ?? "",
    retryDelaySeconds: quiz.retryDelaySeconds ?? null,
    reviewTiming: quiz.reviewTiming ?? "immediate",
    scorePolicy: quiz.scorePolicy ?? "latest",
    subjectCode: quiz.subjectCode ?? "PU",
    title: quiz.title,
  };
}

function StatusPill({ status }: { status: KaptenQuiz["status"] }) {
  const copy = status === "published" ? "Terbit" : status === "archived" ? "Diarsipkan" : status === "scheduled" ? "Terjadwal" : "Draf";
  const className = status === "published" ? "border-primary-200 bg-primary-50 text-primary-800" : status === "archived" ? "border-secondary-200 bg-secondary-50 text-secondary-700" : "border-student-status-attention-border bg-student-status-attention-bg text-student-status-attention-fg";
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{copy}</span>;
}

function QuizPreview({ quizId, questions, subjectCode }: { quizId: string; questions: QuizQuestionSnapshot[]; subjectCode: string }) {
  return <section className="space-y-6">
    {questions.length === 0 ? <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-white py-16 text-center"><ListChecks className="size-12 text-primary-300" /><h3 className="mt-4 font-semibold text-secondary-900">Belum ada soal dalam Kuis ini</h3><p className="mt-1 text-sm text-secondary-600">Mulai menulis soal pilihan ganda lengkap dengan kunci jawaban dan pembahasan.</p><Button className="mt-6" nativeButton={false} render={<Link href={`/mentor/quiz/${quizId}/editor`} />} variant="brand"><FilePenLine /> Tulis Soal Pertama</Button></div> : <div className="grid gap-4">{questions.map((question, index) => <QuizQuestionCard index={index} key={question.id} question={question} subjectCode={subjectCode} />)}</div>}
  </section>;
}

function QuizQuestionCard({ index, question, subjectCode }: { index: number; question: QuizQuestionSnapshot; subjectCode: string }) {
  return <article className="rounded-xl border border-primary-100 bg-white p-4 shadow-xs transition-shadow hover:border-primary-200 hover:shadow-sm sm:p-5">
    <div className="flex flex-col items-start gap-3 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">{index + 1}</span><Badge size="ui" variant="mint">{subjectCode}</Badge><Badge size="ui" variant="mint">Sedang</Badge></div></div>
    <div className="mt-4 space-y-4"><div><p className="text-base font-medium leading-7 text-secondary-900">{question.prompt || <span className="italic text-secondary-400">Pertanyaan belum diisi…</span>}</p>{question.promptMediaAssetId ? <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100"><MediaAssetPreview alt={`Gambar soal ${index + 1}`} assetId={question.promptMediaAssetId} className="max-h-48 bg-white" /></div> : null}</div>
      <div className="grid gap-2.5 sm:grid-cols-2">{question.choices.map((choice, choiceIndex) => { const isCorrect = choice.id === question.correctChoiceId; const choiceLabel = String.fromCharCode(65 + choiceIndex); return <div className={isCorrect ? "flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-sm font-medium text-primary-950 transition-colors" : "flex items-start gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/40 p-3 text-sm text-secondary-700 transition-colors"} key={choice.id}><span className={isCorrect ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold uppercase text-white" : "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-200 text-xs font-bold uppercase text-secondary-700"}>{choiceLabel}</span><div className="min-w-0 flex-1"><p className="leading-5">{choice.text || <span className="italic text-secondary-400">Opsi kosong</span>}</p>{choice.mediaAssetId ? <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100"><MediaAssetPreview alt={`Media opsi ${choiceLabel}`} assetId={choice.mediaAssetId} className="max-h-24 bg-white" /></div> : null}</div></div>; })}</div>
      {question.explanation || question.explanationMediaAssetId ? <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-sm leading-6 text-secondary-700"><span className="font-bold text-primary-900">Pembahasan: </span>{question.explanation}{question.explanationMediaAssetId ? <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100"><MediaAssetPreview alt="Media pembahasan" assetId={question.explanationMediaAssetId} className="max-h-28 bg-white" /></div> : null}</div> : null}
    </div>
  </article>;
}

function QuizSettings({
  disabled,
  form,
  isSaving,
  onChange,
  onSave,
}: {
  disabled: boolean;
  form: SettingsForm;
  isSaving: boolean;
  onChange: (patch: Partial<SettingsForm>) => void;
  onSave: () => void;
}) {
  const scheduleError = form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt) ? "Waktu tutup harus setelah waktu buka." : null;
  const attemptsOptions = [
    ...(form.attemptsAllowed !== null && ![1, 3, 5].includes(form.attemptsAllowed) ? [{ label: `${form.attemptsAllowed} kali`, value: String(form.attemptsAllowed) }] : []),
    { label: "1 kali", value: "1" },
    { label: "3 kali", value: "3" },
    { label: "5 kali", value: "5" },
    { label: "Tanpa batas", value: "unlimited" },
  ];
  return (
    <div className="grid gap-6">
      <section className="max-w-6xl" data-quiz-settings-metadata="bank-style">
        <h2 className="text-lg font-semibold text-secondary-900">Informasi Kuis</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
          <div className="grid gap-5">
            <Field>
              <FieldLabel htmlFor="quiz-settings-title">Judul Kuis</FieldLabel>
              <FieldInput disabled={disabled} id="quiz-settings-title" onChange={(event) => onChange({ title: event.target.value })} value={form.title} />
            </Field>
            <Field>
              <FieldLabel htmlFor="quiz-settings-description">Deskripsi</FieldLabel>
              <FieldTextarea className="min-h-[110px]" disabled={disabled} id="quiz-settings-description" onChange={(event) => onChange({ description: event.target.value })} value={form.description} />
            </Field>
          </div>
          <section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
            <Field>
              <FieldLabel htmlFor="quiz-settings-subject">Subjek</FieldLabel>
              <DropdownField disabled={disabled} id="quiz-settings-subject" onValueChange={(value) => onChange({ subjectCode: value })} options={kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code }))} placeholder="Pilih subjek" value={form.subjectCode} />
            </Field>
          </section>
        </div>
      </section>
      <section className="max-w-6xl rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6">
        <div>
          <h2 className="text-lg font-semibold text-secondary-900">Ketersediaan dan percobaan</h2>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="quiz-settings-opens">Mulai dibuka</FieldLabel>
            <FieldInput disabled={disabled} id="quiz-settings-opens" onChange={(event) => onChange({ opensAt: event.target.value })} type="datetime-local" value={form.opensAt} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-closes">Tutup akses</FieldLabel>
            <FieldInput disabled={disabled} id="quiz-settings-closes" onChange={(event) => onChange({ closesAt: event.target.value })} type="datetime-local" value={form.closesAt} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-attempts">Jumlah percobaan</FieldLabel>
            <DropdownField disabled={disabled} id="quiz-settings-attempts" onValueChange={(value) => onChange({ attemptsAllowed: value === "unlimited" ? null : Number(value) })} options={attemptsOptions} placeholder="Pilih batas" value={form.attemptsAllowed === null ? "unlimited" : String(form.attemptsAllowed)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-score">Penilaian akhir</FieldLabel>
            <DropdownField disabled={disabled} id="quiz-settings-score" onValueChange={(value) => onChange({ scorePolicy: value as SettingsForm["scorePolicy"] })} options={[{ label: "Skor tertinggi", value: "highest" }, { label: "Percobaan terbaru", value: "latest" }, { label: "Percobaan pertama", value: "first" }, { label: "Rata-rata", value: "average" }]} placeholder="Pilih penilaian" value={form.scorePolicy} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-retry">Jeda percobaan ulang (detik)</FieldLabel>
            <FieldInput disabled={disabled} id="quiz-settings-retry" min={0} onChange={(event) => { const value = event.target.value.trim(); const parsed = Number(value); onChange({ retryDelaySeconds: value === "" || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed)) }); }} type="number" value={form.retryDelaySeconds ?? ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-behavior">Susunan soal di percobaan ulang</FieldLabel>
            <DropdownField disabled={disabled} id="quiz-settings-behavior" onValueChange={(value) => onChange({ formBehavior: value as SettingsForm["formBehavior"] })} options={[{ label: "Pertahankan soal dan urutan", value: "same" }, { label: "Acak soal setiap percobaan", value: "fresh_randomized" }]} placeholder="Pilih susunan soal" value={form.formBehavior} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-review">Waktu review</FieldLabel>
            <DropdownField disabled={disabled} id="quiz-settings-review" onValueChange={(value) => onChange({ reviewTiming: value as SettingsForm["reviewTiming"] })} options={[{ label: "Langsung setelah kirim", value: "immediate" }, { label: "Setelah Kuis ditutup", value: "after_close" }, { label: "Tidak tersedia", value: "never" }]} placeholder="Pilih waktu review" value={form.reviewTiming} />
          </Field>
          <Field>
            <FieldLabel htmlFor="quiz-settings-visibility">Jawaban benar</FieldLabel>
            <DropdownField disabled={disabled} id="quiz-settings-visibility" onValueChange={(value) => onChange({ correctAnswerVisibility: value as SettingsForm["correctAnswerVisibility"] })} options={[{ label: "Tampilkan", value: "show" }, { label: "Sembunyikan", value: "hide" }]} placeholder="Pilih visibilitas" value={form.correctAnswerVisibility} />
          </Field>
        </div>
        {scheduleError ? <p className="mt-4 text-sm font-medium text-student-status-danger-fg" role="alert">{scheduleError}</p> : null}
      </section>
      <Button aria-busy={isSaving} className="w-full" disabled={disabled || isSaving || Boolean(scheduleError)} onClick={onSave} type="button" variant="brand">
        {isSaving ? "Menyimpan…" : "Simpan perubahan"}
      </Button>
    </div>
  );
}

function KaptenQuizDetailPageModule({
  initialQuestions,
  initialQuiz,
  initialResults,
  initialTab = "preview",
  session,
}: {
  initialQuestions: QuizQuestionSnapshot[];
  initialQuiz: KaptenQuiz;
  initialResults: KaptenQuizResultsData;
  initialTab?: QuizDetailTab;
  session: SessionContext;
}) {
  const router = useRouter();
  const [quiz, setQuiz] = useState(initialQuiz);
  const [activeTab, setActiveTab] = useState<QuizDetailTab>(initialTab);
  const [questions, setQuestions] = useState(initialQuestions.map((question) => ({ ...question, choices: question.choices.map((choice) => ({ ...choice })) })));
  const [settings, setSettings] = useState(() => settingsFromQuiz(initialQuiz));
  const [isSaving, setIsSaving] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  function changeTab(value: string) {
    if (value !== "preview" && value !== "hasil" && value !== "pengaturan") return;
    const next = value as QuizDetailTab;
    setActiveTab(next);
    router.push(`/mentor/quiz/${quiz.id}?tab=${next}`, { scroll: false });
  }

  async function saveSettings(status: "draft" | "published" = quiz.status === "published" ? "published" : "draft") {
    if (isSaving || quiz.status === "archived") return;
    setIsSaving(true);
    setLifecycleError(null);
    try {
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: settings.attemptsAllowed,
        closesAt: settings.closesAt,
        correctAnswerVisibility: settings.correctAnswerVisibility,
        description: settings.description,
        formBehavior: settings.formBehavior,
        id: quiz.id,
        opensAt: settings.opensAt,
        questions: cloneForSave(questions),
        retryDelaySeconds: settings.retryDelaySeconds,
        reviewTiming: settings.reviewTiming,
        scorePolicy: settings.scorePolicy,
        status,
        subjectCode: settings.subjectCode,
        title: settings.title,
      });
      if (!result.ok) {
        setLifecycleError(result.message);
        showToast(result.message, { variant: "error" });
        return;
      }
      setQuiz(result.quiz);
      setSettings(settingsFromQuiz(result.quiz));
      setQuestions((current) => current.map((question) => ({ ...question, origin: "local" as const })));
      showToast(status === "published" ? "Kuis diterbitkan." : "Perubahan Kuis tersimpan.", { variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Kuis belum dapat disimpan.";
      setLifecycleError(message);
      showToast(message, { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  const title = quiz.title || "Detail Kuis";
  const subject = kaptenSubjects.find((item) => item.code === quiz.subjectCode);

  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={title} contentElement="div" mainClassName="max-w-[1500px] gap-7" session={session} showSearch={false}>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button aria-label="Kembali ke daftar Kuis" nativeButton={false} render={<Link href="/mentor/quiz" />} size="sm" type="button" variant="ghost"><ChevronLeft /> Kembali ke Kuis</Button><div className="flex flex-wrap items-center gap-2">{quiz.status === "draft" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("published")} type="button" variant="brandOutline"><SendHorizontal /> Terbitkan</Button> : quiz.status === "published" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("draft")} type="button" variant="outline"><FilePenLine /> Jadikan draf</Button> : null}<Button nativeButton={false} render={<Link href={`/mentor/quiz/${quiz.id}/editor`} />} type="button" variant="brand"><FilePenLine /> Edit soal</Button></div></div>
    {lifecycleError ? <Alert variant="destructive"><AlertTitle>Perubahan belum tersimpan</AlertTitle><AlertDescription>{lifecycleError}</AlertDescription></Alert> : null}
    <section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-xs sm:p-6"><div className="space-y-6"><div><div className="flex flex-wrap items-center gap-3"><StatusPill status={quiz.status} />{subject ? <Badge size="ui" variant="mint">{subject.code}</Badge> : null}<span className="text-sm text-secondary-500">{questions.length} soal</span></div><div className="group mt-3 flex items-start gap-3"><h1 className="text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">{title}</h1><Button aria-label="Ubah metadata Kuis" className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100" onClick={() => changeTab("pengaturan")} size="icon-sm" title="Ubah metadata Kuis" type="button" variant="ghost"><Pencil className="size-4" /></Button></div></div><div className="space-y-2 border-t border-primary-100/70 pt-4"><div className="flex items-center gap-1.5"><span className="text-xs font-semibold text-secondary-500">Deskripsi</span><Button aria-label="Ubah deskripsi Kuis" className="size-7 text-secondary-400 hover:text-secondary-900" onClick={() => changeTab("pengaturan")} size="icon-sm" title="Ubah deskripsi Kuis" type="button" variant="ghost"><Pencil className="size-3.5" /></Button></div><p className="max-w-3xl text-sm leading-6 text-secondary-700">{quiz.description || <span className="italic text-secondary-400">Belum ada deskripsi untuk Kuis ini. Klik ikon pensil untuk menambahkan.</span>}</p></div></div></section>
    <Tabs className="w-full min-w-0 gap-7" onValueChange={changeTab} value={activeTab}><FullWidthLineTabsList aria-label="Bagian detail Kuis"><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="preview">Soal</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="hasil">Hasil</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="pengaturan">Pengaturan</FullWidthLineTabsTrigger></FullWidthLineTabsList><TabsContent className="m-0" value="preview"><QuizPreview quizId={quiz.id} questions={questions} subjectCode={quiz.subjectCode ?? "PU"} /></TabsContent><TabsContent className="m-0" value="hasil"><KaptenQuizResultsContent result={initialResults} /></TabsContent><TabsContent className="m-0" value="pengaturan"><QuizSettings disabled={quiz.status === "archived"} form={settings} isSaving={isSaving} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onSave={() => void saveSettings()} /></TabsContent></Tabs>
  </MentorWorkspaceShell>;
}

export { KaptenQuizDetailPageModule };
