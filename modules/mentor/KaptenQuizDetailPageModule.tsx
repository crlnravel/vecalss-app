"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, FilePenLine, ListChecks, Pencil, SendHorizontal, X } from "@/lib/icons";
import { useState } from "react";

import {
  ReferenceEmptyState,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { FullWidthLineTabsList, FullWidthLineTabsTrigger } from "@/components/ui/full-width-line-tabs";
import { Input } from "@/components/ui/input";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { showToast } from "@/components/ui/toast";
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

function QuizPreview({ quizId, questions, subjectCode }: { quizId: string; questions: QuizQuestionSnapshot[]; subjectCode: string }) {
  return <section aria-label="Preview Soal" className="space-y-6">
    {questions.length === 0 ? (
      <ReferenceSurface className="min-h-56" variant="inset">
        <ReferenceEmptyState
          action={<Button nativeButton={false} render={<Link href={`/mentor/quiz/${quizId}/editor`} />} size="sm" variant="brand"><FilePenLine />Tulis soal pertama</Button>}
          description="Mulai menulis soal pilihan ganda lengkap dengan kunci jawaban dan pembahasan."
          icon={ListChecks}
          title="Belum ada soal dalam Kuis ini"
        />
      </ReferenceSurface>
    ) : <div className="grid gap-4">{questions.map((question, index) => <QuizQuestionCard index={index} key={question.id} question={question} subjectCode={subjectCode} />)}</div>}
  </section>;
}

function QuizQuestionCard({ index, question, subjectCode }: { index: number; question: QuizQuestionSnapshot; subjectCode: string }) {
  return <ReferenceSurface as="article" className="p-5 sm:p-6">
    <div className="flex flex-col items-start gap-3 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">{index + 1}</span><MentorBadge size="xs" tone="category">{subjectCode}</MentorBadge><MentorBadge size="xs" tone="active">Sedang</MentorBadge></div></div>
    <div className="mt-4 space-y-4"><div><p className="text-base font-medium leading-7 text-secondary-900">{question.prompt || <span className="italic text-secondary-400">Pertanyaan belum diisi…</span>}</p>{question.promptMediaAssetId ? <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100"><MediaAssetPreview alt={`Gambar soal ${index + 1}`} assetId={question.promptMediaAssetId} className="max-h-48 bg-white" /></div> : null}</div>
      <div className="grid gap-2.5 sm:grid-cols-2">{question.choices.map((choice, choiceIndex) => { const isCorrect = choice.id === question.correctChoiceId; const choiceLabel = String.fromCharCode(65 + choiceIndex); return <div className={isCorrect ? "flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-sm font-medium text-primary-950 transition-colors" : "flex items-start gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/40 p-3 text-sm text-secondary-700 transition-colors"} key={choice.id}><span className={isCorrect ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold uppercase text-white" : "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-200 text-xs font-bold uppercase text-secondary-700"}>{choiceLabel}</span><div className="min-w-0 flex-1"><p className="leading-5">{choice.text || <span className="italic text-secondary-400">Opsi kosong</span>}</p>{choice.mediaAssetId ? <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100"><MediaAssetPreview alt={`Media opsi ${choiceLabel}`} assetId={choice.mediaAssetId} className="max-h-24 bg-white" /></div> : null}</div></div>; })}</div>
      {question.explanation || question.explanationMediaAssetId ? <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-sm leading-6 text-secondary-700"><span className="font-bold text-primary-900">Pembahasan: </span>{question.explanation}{question.explanationMediaAssetId ? <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100"><MediaAssetPreview alt="Media pembahasan" assetId={question.explanationMediaAssetId} className="max-h-28 bg-white" /></div> : null}</div> : null}
    </div>
  </ReferenceSurface>;
}

function QuizMetadataCard({ disabled, form, isSaving, onChange }: { disabled: boolean; form: SettingsForm; isSaving: boolean; onChange: (patch: Partial<SettingsForm>) => void }) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(form.title);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(form.description);
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [subjectInput, setSubjectInput] = useState(form.subjectCode);
  const subject = kaptenSubjects.find((item) => item.code === form.subjectCode);

  function startTitleEdit() {
    setTitleInput(form.title);
    setIsEditingTitle(true);
  }

  function saveTitleDraft() {
    const nextTitle = titleInput.trim();
    if (!nextTitle) {
      setTitleInput(form.title);
      setIsEditingTitle(false);
      return;
    }
    onChange({ title: nextTitle });
    setIsEditingTitle(false);
  }

  function cancelTitleEdit() {
    setTitleInput(form.title);
    setIsEditingTitle(false);
  }

  function startDescriptionEdit() {
    setDescriptionInput(form.description);
    setIsEditingDescription(true);
  }

  function saveDescriptionDraft() {
    onChange({ description: descriptionInput.trim() });
    setIsEditingDescription(false);
  }

  function cancelDescriptionEdit() {
    setDescriptionInput(form.description);
    setIsEditingDescription(false);
  }

  function startSubjectEdit() {
    setSubjectInput(form.subjectCode);
    setIsEditingSubject(true);
  }

  function saveSubjectDraft() {
    onChange({ subjectCode: subjectInput });
    setIsEditingSubject(false);
  }

  function cancelSubjectEdit() {
    setSubjectInput(form.subjectCode);
    setIsEditingSubject(false);
  }

  return (
    <ReferenceSurface as="section" className="w-full max-w-none p-6 sm:p-8 lg:p-10" data-quiz-settings-metadata="bank-style">
      <div className="space-y-7 sm:space-y-8">
        <div>
          {isEditingTitle ? (
            <div className="flex max-w-3xl items-center gap-2">
              <Input
                autoFocus
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl`}
                disabled={disabled || isSaving}
                id="quiz-settings-title"
                onChange={(event) => setTitleInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveTitleDraft();
                  } else if (event.key === "Escape") {
                    cancelTitleEdit();
                  }
                }}
                value={titleInput}
              />
              <Button disabled={disabled || isSaving || !titleInput.trim()} onClick={saveTitleDraft} size="sm" type="button" variant="brand">
                <Check />
                Simpan
              </Button>
              <Button disabled={disabled || isSaving} onClick={cancelTitleEdit} size="sm" type="button" variant="ghost">
                <X />
                Batal
              </Button>
            </div>
          ) : (
            <div className="group flex items-start gap-3">
              <h1 className="font-heading text-4xl leading-none font-semibold tracking-[-0.04em] text-secondary-900 md:text-5xl lg:text-[3.5rem]">{form.title || "Kuis tanpa judul"}</h1>
              {!disabled ? (
                <Button aria-label="Ubah judul Kuis" className="mt-1 shrink-0 text-secondary-300 hover:text-secondary-900" onClick={startTitleEdit} size="icon" title="Ubah judul Kuis" type="button" variant="ghost">
                  <Pencil className="size-5" />
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-primary-100/70 pt-6 sm:pt-7">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-secondary-600 sm:text-xl">Deskripsi</span>
            {!isEditingDescription && !disabled ? (
              <Button aria-label="Ubah deskripsi Kuis" className="text-secondary-300 hover:text-secondary-900" onClick={startDescriptionEdit} size="icon" title="Ubah deskripsi Kuis" type="button" variant="ghost">
                <Pencil className="size-5" />
              </Button>
            ) : null}
          </div>
          {isEditingDescription ? (
            <div className="max-w-3xl space-y-2">
              <FieldTextarea autoFocus className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[90px] text-sm`} disabled={disabled || isSaving} id="quiz-settings-description" onChange={(event) => setDescriptionInput(event.target.value)} placeholder="Tuliskan deskripsi ringkas tentang Kuis ini…" value={descriptionInput} />
              <div className="flex gap-2">
                <Button disabled={disabled || isSaving} onClick={saveDescriptionDraft} size="sm" type="button" variant="brand"><Check /> Simpan</Button>
                <Button disabled={disabled || isSaving} onClick={cancelDescriptionEdit} size="sm" type="button" variant="ghost"><X /> Batal</Button>
              </div>
            </div>
          ) : (
            <p className="max-w-4xl text-lg leading-8 text-secondary-500 sm:text-xl">{form.description || <span className="italic text-secondary-400">Belum ada deskripsi untuk Kuis ini. Klik ikon pensil untuk menambahkan.</span>}</p>
          )}
        </div>

        <div className="space-y-3 border-t border-primary-100/70 pt-6 sm:pt-7">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tracking-tight text-secondary-600 sm:text-xl">Subjek</span>
            {!isEditingSubject && !disabled ? (
              <Button aria-label="Ubah subjek Kuis" className="text-secondary-300 hover:text-secondary-900" onClick={startSubjectEdit} size="icon" title="Ubah subjek Kuis" type="button" variant="ghost">
                <Pencil className="size-5" />
              </Button>
            ) : null}
          </div>
          {isEditingSubject ? (
            <div className="max-w-md space-y-2">
              <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled || isSaving} id="quiz-settings-subject" onValueChange={setSubjectInput} options={kaptenSubjects.map((item) => ({ label: `${item.code} · ${item.name}`, value: item.code }))} placeholder="Pilih subjek" value={subjectInput} />
              <div className="flex gap-2">
                <Button disabled={disabled || isSaving} onClick={saveSubjectDraft} size="sm" type="button" variant="brand"><Check /> Simpan</Button>
                <Button disabled={disabled || isSaving} onClick={cancelSubjectEdit} size="sm" type="button" variant="ghost"><X /> Batal</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <MentorBadge size="md" tone="category">{subject ? `${subject.code} · ${subject.name}` : form.subjectCode}</MentorBadge>
            </div>
          )}
        </div>
      </div>
    </ReferenceSurface>
  );
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
      <ReferenceSurface as="section" className="max-w-6xl p-5 md:p-7">
        <div>
          <h2 className="text-lg font-semibold text-secondary-900">Ketersediaan dan percobaan</h2>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-opens">Mulai dibuka</FieldLabel>
          <FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={disabled} id="quiz-settings-opens" onChange={(event) => onChange({ opensAt: event.target.value })} type="datetime-local" value={form.opensAt} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-closes">Tutup akses</FieldLabel>
          <FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={disabled} id="quiz-settings-closes" onChange={(event) => onChange({ closesAt: event.target.value })} type="datetime-local" value={form.closesAt} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-attempts">Jumlah percobaan</FieldLabel>
          <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled} id="quiz-settings-attempts" onValueChange={(value) => onChange({ attemptsAllowed: value === "unlimited" ? null : Number(value) })} options={attemptsOptions} placeholder="Pilih batas" value={form.attemptsAllowed === null ? "unlimited" : String(form.attemptsAllowed)} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-score">Penilaian akhir</FieldLabel>
          <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled} id="quiz-settings-score" onValueChange={(value) => onChange({ scorePolicy: value as SettingsForm["scorePolicy"] })} options={[{ label: "Skor tertinggi", value: "highest" }, { label: "Percobaan terbaru", value: "latest" }, { label: "Percobaan pertama", value: "first" }, { label: "Rata-rata", value: "average" }]} placeholder="Pilih penilaian" value={form.scorePolicy} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-retry">Jeda percobaan ulang (detik)</FieldLabel>
          <FieldInput className={REFERENCE_CONTROL_CLASS_NAMES.input} disabled={disabled} id="quiz-settings-retry" min={0} onChange={(event) => { const value = event.target.value.trim(); const parsed = Number(value); onChange({ retryDelaySeconds: value === "" || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed)) }); }} type="number" value={form.retryDelaySeconds ?? ""} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-behavior">Susunan soal di percobaan ulang</FieldLabel>
          <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled} id="quiz-settings-behavior" onValueChange={(value) => onChange({ formBehavior: value as SettingsForm["formBehavior"] })} options={[{ label: "Pertahankan soal dan urutan", value: "same" }, { label: "Acak soal setiap percobaan", value: "fresh_randomized" }]} placeholder="Pilih susunan soal" value={form.formBehavior} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-review">Waktu review</FieldLabel>
          <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled} id="quiz-settings-review" onValueChange={(value) => onChange({ reviewTiming: value as SettingsForm["reviewTiming"] })} options={[{ label: "Langsung setelah kirim", value: "immediate" }, { label: "Setelah Kuis ditutup", value: "after_close" }, { label: "Tidak tersedia", value: "never" }]} placeholder="Pilih waktu review" value={form.reviewTiming} />
          </Field>
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="quiz-settings-visibility">Jawaban benar</FieldLabel>
          <DropdownField className={REFERENCE_CONTROL_CLASS_NAMES.select} disabled={disabled} id="quiz-settings-visibility" onValueChange={(value) => onChange({ correctAnswerVisibility: value as SettingsForm["correctAnswerVisibility"] })} options={[{ label: "Tampilkan", value: "show" }, { label: "Sembunyikan", value: "hide" }]} placeholder="Pilih visibilitas" value={form.correctAnswerVisibility} />
          </Field>
        </div>
        {scheduleError ? <p className="mt-4 text-sm font-medium text-student-status-danger-fg" role="alert">{scheduleError}</p> : null}
      </ReferenceSurface>
      <Button aria-busy={isSaving} className="w-full" disabled={disabled || isSaving || Boolean(scheduleError)} onClick={onSave} type="button" variant="reference">
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
  const [questions, setQuestions] = useState(() => initialQuestions.map((question) => ({ ...question, choices: question.choices.map((choice) => ({ ...choice })) })));
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

  const subject = kaptenSubjects.find((item) => item.code === quiz.subjectCode);
  const subjectHref = subject ? `/mentor/quiz/subject/${subject.slug}` : "/mentor/quiz";
  const backLabel = subject ? `Kembali ke Kuis ${subject.code}` : "Kembali ke daftar Kuis";

  return (
    <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Detail Kuis" breadcrumbParent={subject ? { href: subjectHref, label: subject.code } : undefined} contentElement="div" mainClassName="max-w-[1500px] gap-7" session={session} showSearch={false} sidebarAppearance="reference">
      <div className="space-y-8">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <Button aria-label={backLabel} className="mt-1 shrink-0" nativeButton={false} render={<Link href={subjectHref} />} size="icon" title={backLabel} type="button" variant="ghost"><ChevronLeft /></Button>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {quiz.status === "draft" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("published")} type="button" variant="brandOutline"><SendHorizontal />Terbitkan</Button> : quiz.status === "published" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("draft")} type="button" variant="reference"><FilePenLine />Jadikan draf</Button> : null}
            <Button nativeButton={false} render={<Link href={`/mentor/quiz/${quiz.id}/editor`} />} type="button" variant="brand"><FilePenLine />Edit soal</Button>
          </div>
        </div>
        <QuizMetadataCard disabled={quiz.status === "archived"} form={settings} isSaving={isSaving} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} />
        {lifecycleError ? <Alert variant="destructive"><AlertTitle>Perubahan belum tersimpan</AlertTitle><AlertDescription>{lifecycleError}</AlertDescription></Alert> : null}
        <Tabs className="w-full min-w-0 gap-7" onValueChange={changeTab} value={activeTab}>
          <FullWidthLineTabsList aria-label="Bagian detail Kuis"><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="preview">Soal</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="hasil">Hasil</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="pengaturan">Pengaturan</FullWidthLineTabsTrigger></FullWidthLineTabsList>
          <TabsContent className="m-0" value="preview"><QuizPreview quizId={quiz.id} questions={questions} subjectCode={quiz.subjectCode ?? "PU"} /></TabsContent>
          <TabsContent className="m-0" value="hasil"><KaptenQuizResultsContent result={initialResults} /></TabsContent>
          <TabsContent className="m-0" value="pengaturan"><QuizSettings disabled={quiz.status === "archived"} form={settings} isSaving={isSaving} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onSave={() => void saveSettings()} /></TabsContent>
        </Tabs>
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizDetailPageModule };
