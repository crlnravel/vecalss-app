"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, ChevronRight, Eye, FilePenLine, ListChecks, Pencil, RotateCcw, SendHorizontal } from "@/lib/icons";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { FullWidthLineTabsList, FullWidthLineTabsTrigger } from "@/components/ui/full-width-line-tabs";
import { showToast } from "@/components/ui/sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import { saveStandaloneQuizAction, updateStandaloneQuizLifecycleAction } from "@/modules/mentor/quiz-actions";
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

function QuizPreview({ quizId, questions }: { quizId: string; questions: QuizQuestionSnapshot[] }) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(0, questions.length - 1));
  const question = questions[safeIndex] ?? null;
  if (!question) {
    return <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-primary-200 bg-white p-8 text-center"><div><ListChecks aria-hidden="true" className="mx-auto size-9 text-primary-300" /><h2 className="mt-4 text-lg font-semibold text-secondary-900">Belum ada soal</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-secondary-500">Tambahkan soal melalui editor agar preview Kuis dapat ditinjau di sini.</p><Button className="mt-5" nativeButton={false} render={<Link href={`/mentor/quiz/${quizId}/editor`} />} variant="brand"><FilePenLine /> Edit soal</Button></div></section>;
  }
  return <section className="grid gap-5 rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.12em] text-primary-700 uppercase">Preview Soal</p><p className="mt-1 text-sm text-secondary-500">Soal {safeIndex + 1} dari {questions.length} · tampilan penulis</p></div><span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">Belum dikirim</span></div><div className="mx-auto w-full max-w-3xl"><h2 className="text-xl leading-8 font-semibold text-secondary-900 md:text-2xl">{question.prompt || "Soal tanpa pertanyaan"}</h2>{question.promptMediaAssetId ? <MediaAssetPreview alt="Gambar pertanyaan" assetId={question.promptMediaAssetId} className="mt-5" /> : null}<div className="mt-6 grid gap-3">{question.choices.map((choice, choiceIndex) => <div className="rounded-xl border border-primary-100 bg-secondary-50/40 p-4" key={choice.id}><div className="flex items-start gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold uppercase text-primary-800">{String.fromCharCode(65 + choiceIndex)}</span><span className="min-w-0 flex-1 text-sm leading-6 text-secondary-800">{choice.text || `Opsi ${String.fromCharCode(65 + choiceIndex)}`}{choice.mediaAssetId ? <MediaAssetPreview alt={`Gambar opsi ${String.fromCharCode(65 + choiceIndex)}`} assetId={choice.mediaAssetId} className="mt-3 max-h-44" /> : null}</span></div></div>)}</div>{question.explanation ? <div className="mt-6 border-t border-primary-100 pt-5"><h3 className="text-sm font-semibold text-secondary-900">Penjelasan</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-secondary-600">{question.explanation}</p>{question.explanationMediaAssetId ? <MediaAssetPreview alt="Gambar penjelasan" assetId={question.explanationMediaAssetId} className="mt-4" /> : null}</div> : null}</div><div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 border-t border-primary-100 pt-5"><Button disabled={safeIndex === 0} onClick={() => setIndex((current) => current - 1)} type="button" variant="ghost"><ChevronLeft /> Sebelumnya</Button><span className="text-sm font-semibold text-secondary-500">{safeIndex + 1}/{questions.length}</span><Button disabled={safeIndex === questions.length - 1} onClick={() => setIndex((current) => current + 1)} type="button" variant="brandOutline">Berikutnya <ChevronRight /></Button></div></section>;
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
  return <div className="grid gap-5"><section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6"><div><h2 className="text-lg font-semibold text-secondary-900">Informasi Kuis</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Metadata ini hanya berlaku untuk Kuis mandiri ini.</p></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field><FieldLabel htmlFor="quiz-settings-title">Judul Kuis</FieldLabel><FieldInput disabled={disabled} id="quiz-settings-title" onChange={(event) => onChange({ title: event.target.value })} value={form.title} /></Field><Field><FieldLabel htmlFor="quiz-settings-subject">Subjek</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-subject" onValueChange={(value) => onChange({ subjectCode: value })} options={kaptenSubjects.map((subject) => ({ label: `${subject.code} · ${subject.name}`, value: subject.code }))} placeholder="Pilih subjek" value={form.subjectCode} /></Field><Field className="sm:col-span-2"><FieldLabel htmlFor="quiz-settings-description">Deskripsi</FieldLabel><FieldTextarea className="min-h-[110px]" disabled={disabled} id="quiz-settings-description" onChange={(event) => onChange({ description: event.target.value })} value={form.description} /></Field></div></section><section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-sm md:p-6"><div><h2 className="text-lg font-semibold text-secondary-900">Ketersediaan dan percobaan</h2><p className="mt-1 text-sm leading-6 text-secondary-500">Perubahan akan divalidasi lagi oleh server saat disimpan.</p></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><Field><FieldLabel htmlFor="quiz-settings-opens">Mulai dibuka</FieldLabel><FieldInput disabled={disabled} id="quiz-settings-opens" onChange={(event) => onChange({ opensAt: event.target.value })} type="datetime-local" value={form.opensAt} /></Field><Field><FieldLabel htmlFor="quiz-settings-closes">Tutup akses</FieldLabel><FieldInput disabled={disabled} id="quiz-settings-closes" onChange={(event) => onChange({ closesAt: event.target.value })} type="datetime-local" value={form.closesAt} /></Field><Field><FieldLabel htmlFor="quiz-settings-attempts">Jumlah percobaan</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-attempts" onValueChange={(value) => onChange({ attemptsAllowed: value === "unlimited" ? null : Number(value) })} options={attemptsOptions} placeholder="Pilih batas" value={form.attemptsAllowed === null ? "unlimited" : String(form.attemptsAllowed)} /></Field><Field><FieldLabel htmlFor="quiz-settings-score">Penilaian akhir</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-score" onValueChange={(value) => onChange({ scorePolicy: value as SettingsForm["scorePolicy"] })} options={[{ label: "Skor tertinggi", value: "highest" }, { label: "Percobaan terbaru", value: "latest" }, { label: "Percobaan pertama", value: "first" }, { label: "Rata-rata", value: "average" }]} placeholder="Pilih penilaian" value={form.scorePolicy} /></Field><Field><FieldLabel htmlFor="quiz-settings-retry">Jeda percobaan ulang (detik)</FieldLabel><FieldInput disabled={disabled} id="quiz-settings-retry" min={0} onChange={(event) => { const value = event.target.value.trim(); const parsed = Number(value); onChange({ retryDelaySeconds: value === "" || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed)) }); }} type="number" value={form.retryDelaySeconds ?? ""} /></Field><Field><FieldLabel htmlFor="quiz-settings-behavior">Bentuk soal ulang</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-behavior" onValueChange={(value) => onChange({ formBehavior: value as SettingsForm["formBehavior"] })} options={[{ label: "Form yang sama", value: "same" }, { label: "Form diacak ulang", value: "fresh_randomized" }]} placeholder="Pilih bentuk soal" value={form.formBehavior} /></Field><Field><FieldLabel htmlFor="quiz-settings-review">Waktu review</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-review" onValueChange={(value) => onChange({ reviewTiming: value as SettingsForm["reviewTiming"] })} options={[{ label: "Langsung setelah kirim", value: "immediate" }, { label: "Setelah Kuis ditutup", value: "after_close" }, { label: "Tidak tersedia", value: "never" }]} placeholder="Pilih waktu review" value={form.reviewTiming} /></Field><Field><FieldLabel htmlFor="quiz-settings-visibility">Jawaban benar</FieldLabel><DropdownField disabled={disabled} id="quiz-settings-visibility" onValueChange={(value) => onChange({ correctAnswerVisibility: value as SettingsForm["correctAnswerVisibility"] })} options={[{ label: "Tampilkan", value: "show" }, { label: "Sembunyikan", value: "hide" }]} placeholder="Pilih visibilitas" value={form.correctAnswerVisibility} /></Field></div>{scheduleError ? <p className="mt-4 text-sm font-medium text-student-status-danger-fg" role="alert">{scheduleError}</p> : null}<div className="mt-6 flex justify-end"><Button aria-busy={isSaving} disabled={disabled || isSaving || Boolean(scheduleError)} onClick={onSave} type="button" variant="brand"><SaveIcon /> {isSaving ? "Menyimpan…" : "Simpan pengaturan"}</Button></div></section></div>;
}

function SaveIcon() {
  return <span aria-hidden="true" className="text-base">✓</span>;
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
  const [pendingArchive, setPendingArchive] = useState(false);

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
        return;
      }
      setQuiz(result.quiz);
      setSettings(settingsFromQuiz(result.quiz));
      setQuestions((current) => current.map((question) => ({ ...question, origin: "local" as const })));
      showToast(status === "published" ? "Kuis diterbitkan." : "Pengaturan Kuis tersimpan.", { variant: "success" });
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Kuis belum dapat disimpan.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateLifecycle(operation: "archive" | "restore") {
    if (isSaving) return;
    setIsSaving(true);
    setLifecycleError(null);
    try {
      const result = await updateStandaloneQuizLifecycleAction(quiz.id, operation);
      if (!result.ok) {
        setLifecycleError(result.message);
        return;
      }
      setQuiz(result.quiz);
      showToast(operation === "archive" ? "Kuis diarsipkan." : "Kuis dipulihkan.", { variant: "success" });
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Status Kuis belum dapat diperbarui.");
    } finally {
      setIsSaving(false);
      setPendingArchive(false);
    }
  }

  const title = quiz.title || "Detail Kuis";
  const subject = kaptenSubjects.find((item) => item.code === quiz.subjectCode);
  const lifecycleAction = quiz.status === "archived" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void updateLifecycle("restore")} type="button" variant="brandOutline"><RotateCcw /> Pulihkan</Button> : <Button aria-busy={isSaving} disabled={isSaving} onClick={() => setPendingArchive(true)} type="button" variant="ghost"><Archive /> Arsipkan</Button>;

  return <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel={title} contentElement="div" mainClassName="max-w-[1500px] gap-7" session={session} showSearch={false}>
    <div className="flex flex-wrap items-center justify-between gap-3"><Button aria-label="Kembali ke daftar Kuis" nativeButton={false} render={<Link href="/mentor/quiz" />} size="sm" type="button" variant="ghost"><ChevronLeft /> Kembali ke Kuis</Button><div className="flex flex-wrap items-center gap-2">{lifecycleAction}{quiz.status === "draft" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("published")} type="button" variant="brandOutline"><SendHorizontal /> Terbitkan</Button> : quiz.status === "published" ? <Button aria-busy={isSaving} disabled={isSaving} onClick={() => void saveSettings("draft")} type="button" variant="outline"><FilePenLine /> Jadikan draf</Button> : null}<Button nativeButton={false} render={<Link href={`/mentor/quiz/${quiz.id}/editor`} />} type="button" variant="brand"><FilePenLine /> Edit soal</Button></div></div>
    {lifecycleError ? <Alert variant="destructive"><AlertTitle>Perubahan belum tersimpan</AlertTitle><AlertDescription>{lifecycleError}</AlertDescription></Alert> : null}
    <section className="rounded-2xl border border-primary-100 bg-white p-5 shadow-xs sm:p-6"><div className="space-y-6"><div><div className="flex flex-wrap items-center gap-3"><StatusPill status={quiz.status} />{subject ? <Badge size="ui" variant="mint">{subject.code}</Badge> : null}<span className="text-sm text-secondary-500">{questions.length} soal</span></div><div className="group mt-3 flex items-start gap-3"><h1 className="text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">{title}</h1><Button aria-label="Ubah metadata Kuis" className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100" onClick={() => changeTab("pengaturan")} size="icon-sm" title="Ubah metadata Kuis" type="button" variant="ghost"><Pencil className="size-4" /></Button></div></div><div className="space-y-2 border-t border-primary-100/70 pt-4"><div className="flex items-center gap-1.5"><span className="text-xs font-semibold text-secondary-500">Deskripsi</span><Button aria-label="Ubah deskripsi Kuis" className="size-7 text-secondary-400 hover:text-secondary-900" onClick={() => changeTab("pengaturan")} size="icon-sm" title="Ubah deskripsi Kuis" type="button" variant="ghost"><Pencil className="size-3.5" /></Button></div><p className="max-w-3xl text-sm leading-6 text-secondary-700">{quiz.description || <span className="italic text-secondary-400">Belum ada deskripsi untuk Kuis ini. Klik ikon pensil untuk menambahkan.</span>}</p></div></div></section>
    <Tabs className="w-full min-w-0 gap-7" onValueChange={changeTab} value={activeTab}><FullWidthLineTabsList aria-label="Bagian detail Kuis"><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="preview"><Eye /> Preview Soal</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="hasil"><ListChecks /> Hasil</FullWidthLineTabsTrigger><FullWidthLineTabsTrigger className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm" value="pengaturan">Pengaturan</FullWidthLineTabsTrigger></FullWidthLineTabsList><TabsContent className="m-0" value="preview"><QuizPreview quizId={quiz.id} questions={questions} /></TabsContent><TabsContent className="m-0" value="hasil"><KaptenQuizResultsContent result={initialResults} /></TabsContent><TabsContent className="m-0" value="pengaturan"><QuizSettings disabled={quiz.status === "archived"} form={settings} isSaving={isSaving} onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))} onSave={() => void saveSettings()} /></TabsContent></Tabs>
    <AlertDialog onOpenChange={(open) => { if (!open) setPendingArchive(false); }} open={pendingArchive}><AlertDialogContent size="sm" variant="danger"><AlertDialogHeader><AlertDialogMedia variant="danger"><Archive /></AlertDialogMedia><AlertDialogTitle>Arsipkan Kuis?</AlertDialogTitle><AlertDialogDescription>Kuis akan keluar dari daftar aktif. Data soal tetap tersimpan dan bisa dipulihkan.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => setPendingArchive(false)}>Batal</AlertDialogCancel><AlertDialogAction onClick={() => void updateLifecycle("archive")} variant="destructive">Arsipkan</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </MentorWorkspaceShell>;
}

export { KaptenQuizDetailPageModule };
