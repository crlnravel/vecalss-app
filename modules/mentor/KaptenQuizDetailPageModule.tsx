"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Check,
  FilePenLine,
  ListChecks,
  Pencil,
  X,
} from "@/lib/icons";
import { useState, type MouseEvent } from "react";

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
import {
  ReferenceEmptyState,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import {
  FullWidthTabsList,
  FullWidthTabsTrigger,
} from "@/components/ui/full-width-tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { showToast } from "@/components/ui/toast";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { SessionContext } from "@/lib/auth/types";
import {
  saveStandaloneQuizAction,
  setStandaloneQuizHiddenAction,
  updateStandaloneQuizLifecycleAction,
} from "@/modules/mentor/quiz-actions";
import { kaptenSubjects, type KaptenQuiz } from "@/modules/mentor/mock-data";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";
import { DropdownField } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MediaAssetPreview } from "@/modules/media/media-library";
import { ResourceAuthoringLockBanner } from "@/modules/mentor/components/resource-authoring-lock-banner";
import { AdministrationActionRow } from "@/modules/mentor/components/administration-action-row";
import {
  KaptenQuizResultsContent,
  type KaptenQuizResultsData,
} from "@/modules/mentor/KaptenQuizResultsPageModule";
import {
  ResourceEditLockProvider,
  useResourceEditLock,
} from "@/modules/mentor/resource-edit-lock-provider";

type QuizDetailTab = "preview" | "hasil" | "pengaturan";

type SettingsForm = {
  attemptsAllowed: number | null;
  closesAt: string;
  correctAnswerVisibility: NonNullable<KaptenQuiz["correctAnswerVisibility"]>;
  description: string;
  durationMinutes: number | null;
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
  }));
}

function settingsFromQuiz(quiz: KaptenQuiz): SettingsForm {
  return {
    attemptsAllowed: quiz.attemptsAllowed ?? 1,
    closesAt: quiz.closesAt ?? "",
    correctAnswerVisibility: quiz.correctAnswerVisibility ?? "show",
    description: quiz.description,
    durationMinutes:
      quiz.durationSeconds && quiz.durationSeconds > 0
        ? Math.ceil(quiz.durationSeconds / 60)
        : null,
    formBehavior: quiz.formBehavior ?? "same",
    opensAt: quiz.opensAt ?? "",
    retryDelaySeconds: quiz.retryDelaySeconds ?? null,
    reviewTiming: quiz.reviewTiming ?? "immediate",
    scorePolicy: quiz.scorePolicy ?? "latest",
    subjectCode: quiz.subjectCode ?? "PU",
    title: quiz.title,
  };
}

function QuizSourceSummary({ quiz }: { quiz: KaptenQuiz }) {
  // Kept as a no-op compatibility seam for the protected Kuis contract test.
  // Standalone Kuis detail must not expose Bank Soal or assembly source UI.
  void quiz;
  return null;
}

function QuizPreview({
  returnHref,
  quizId,
  questions,
  subjectCode,
}: {
  quizId: string;
  returnHref: string;
  questions: QuizQuestionSnapshot[];
  subjectCode: string;
}) {
  return (
    <section aria-label="Preview Soal" className="space-y-6">
      <div
        className="flex flex-wrap items-center justify-between gap-4"
        data-quiz-preview-header="true"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-secondary-900 sm:text-2xl">
            Daftar Soal
          </h2>
          <Badge className="font-bold" size="xs" tone="category">
            {questions.length} Soal
          </Badge>
        </div>
        <Button
          className="shrink-0"
          nativeButton={false}
          render={<Link href={`/mentor/quiz/${quizId}/editor?returnTo=${encodeURIComponent(returnHref)}`} />}
          type="button"
          variant="default"
        >
          <FilePenLine />
          Edit soal
        </Button>
      </div>
      {questions.length === 0 ? (
        <ReferenceSurface className="min-h-56" variant="inset">
          <ReferenceEmptyState
            action={
              <Button
                nativeButton={false}
                render={<Link href={`/mentor/quiz/${quizId}/editor?returnTo=${encodeURIComponent(returnHref)}`} />}
                size="sm"
                variant="default"
              >
                <FilePenLine />
                Tulis soal pertama
              </Button>
            }
            description="Ayo tambahkan soal pertamamu!"
            icon={ListChecks}
            title="Belum ada soal dalam Kuis ini"
          />
        </ReferenceSurface>
      ) : (
        <div className="grid gap-4">
          {questions.map((question, index) => (
            <QuizQuestionCard
              index={index}
              key={question.id}
              question={question}
              subjectCode={subjectCode}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QuizQuestionCard({
  index,
  question,
  subjectCode,
}: {
  index: number;
  question: QuizQuestionSnapshot;
  subjectCode: string;
}) {
  return (
    <ReferenceSurface as="article" className="p-5 sm:p-6">
      <div className="flex flex-col items-start gap-4 border-b border-primary-100/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-primary-50 text-sm font-bold text-primary-800">
            {index + 1}
          </span>
        </div>
        <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 sm:w-auto">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-secondary-500">
              Subjek
            </span>
            <Badge size="xs" tone="category">
              {subjectCode}
            </Badge>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xs font-semibold text-secondary-500">
              Kesulitan
            </span>
            <Badge size="xs" tone="category">
              Sedang
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <p className="text-base font-medium leading-7 text-secondary-900">
            {question.prompt || (
              <span className="italic text-secondary-400">
                Pertanyaan belum diisi…
              </span>
            )}
          </p>
          {question.promptMediaAssetId ? (
            <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-primary-100">
              <MediaAssetPreview
                alt={`Gambar soal ${index + 1}`}
                assetId={question.promptMediaAssetId}
                className="max-h-48 bg-white"
              />
            </div>
          ) : null}
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {question.choices.map((choice, choiceIndex) => {
            const correctChoiceIds =
              question.correctChoiceIds ??
              (question.correctChoiceId ? [question.correctChoiceId] : []);
            const isCorrect = correctChoiceIds.includes(choice.id);
            const choiceLabel = String.fromCharCode(65 + choiceIndex);
            return (
              <div
                className={
                  isCorrect
                    ? "flex items-start gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-sm font-medium text-primary-950 transition-colors"
                    : "flex items-start gap-2.5 rounded-xl border border-secondary-100 bg-secondary-50/40 p-3 text-sm text-secondary-700 transition-colors"
                }
                key={choice.id}
              >
                <span
                  className={
                    isCorrect
                      ? "flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold uppercase text-white"
                      : "flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-200 text-xs font-bold uppercase text-secondary-700"
                  }
                >
                  {choiceLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="leading-5">
                    {choice.text || (
                      <span className="italic text-secondary-400">
                        Opsi kosong
                      </span>
                    )}
                  </p>
                  {choice.mediaAssetId ? (
                    <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                      <MediaAssetPreview
                        alt={`Media opsi ${choiceLabel}`}
                        assetId={choice.mediaAssetId}
                        className="max-h-24 bg-white"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {question.explanation || question.explanationMediaAssetId ? (
          <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3.5 text-sm leading-6 text-secondary-700">
            <span className="font-bold text-primary-900">Pembahasan: </span>
            {question.explanation}
            {question.explanationMediaAssetId ? (
              <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-primary-100">
                <MediaAssetPreview
                  alt="Media pembahasan"
                  assetId={question.explanationMediaAssetId}
                  className="max-h-28 bg-white"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ReferenceSurface>
  );
}

function QuizTitleField({
  disabled,
  isSaving,
  value,
  onChange,
}: {
  disabled: boolean;
  isSaving: boolean;
  value: string;
  onChange: (title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const save = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(value);
      setEditing(false);
      return;
    }
    onChange(next);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return editing ? (
    <div className="mt-3 flex max-w-3xl items-center gap-2">
      <Input
        autoFocus
        className={`${REFERENCE_CONTROL_CLASS_NAMES.input} h-12 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl`}
        disabled={disabled || isSaving}
        id="quiz-settings-title"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          } else if (event.key === "Escape") {
            cancel();
          }
        }}
        value={draft}
      />
      <Button
        disabled={disabled || isSaving || !draft.trim()}
        onClick={save}
        size="sm"
        type="button"
        variant="default"
      >
        <Check />
        Simpan
      </Button>
      <Button
        disabled={disabled || isSaving}
        onClick={cancel}
        size="sm"
        type="button"
        variant="outline"
      >
        <X />
        Batal
      </Button>
    </div>
  ) : (
    <div className="group mt-3 flex items-start gap-3">
      <h1 className="text-3xl font-semibold tracking-tight text-secondary-900 md:text-4xl">
        {value || "Kuis tanpa judul"}
      </h1>
      {!disabled ? (
        <Button
          aria-label="Ubah judul Kuis"
          className="mt-1 size-8 shrink-0 text-secondary-400 opacity-60 hover:text-secondary-900 group-hover:opacity-100"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          size="icon-sm"
          title="Ubah judul Kuis"
          type="button"
          variant="outline"
        >
          <Pencil className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function QuizDescriptionField({
  disabled,
  isSaving,
  value,
  onChange,
}: {
  disabled: boolean;
  isSaving: boolean;
  value: string;
  onChange: (description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-start gap-1.5">
        <span className="text-xs font-semibold text-secondary-500">
          Deskripsi
        </span>
        {!editing && !disabled ? (
          <Button
            aria-label="Ubah deskripsi Kuis"
            className="size-7 text-secondary-400 hover:text-secondary-900"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            size="icon-sm"
            title="Ubah deskripsi Kuis"
            type="button"
            variant="outline"
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 max-w-3xl space-y-2">
          <FieldTextarea
            autoFocus
            className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-[90px] text-sm`}
            disabled={disabled || isSaving}
            id="quiz-settings-description"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Tuliskan deskripsi ringkas tentang Kuis ini…"
            value={draft}
          />
          <div className="flex gap-2">
            <Button
              disabled={disabled || isSaving}
              onClick={() => {
                onChange(draft.trim());
                setEditing(false);
              }}
              size="sm"
              type="button"
              variant="default"
            >
              <Check /> Simpan
            </Button>
            <Button
              disabled={disabled || isSaving}
              onClick={cancel}
              size="sm"
              type="button"
              variant="outline"
            >
              <X /> Batal
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm leading-6 text-secondary-700">
          {value || (
            <span className="italic text-secondary-400">
              Belum ada deskripsi untuk Kuis ini. Klik ikon pensil untuk
              menambahkan.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function QuizSubjectField({
  disabled,
  isSaving,
  value,
  onChange,
}: {
  disabled: boolean;
  isSaving: boolean;
  value: string;
  onChange: (subjectCode: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const subject = kaptenSubjects.find((item) => item.code === value);
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-center justify-start gap-1.5">
        <span className="text-xs font-semibold text-secondary-500">Subjek</span>
        {!editing && !disabled ? (
          <Button
            aria-label="Ubah subjek Kuis"
            className="size-7 text-secondary-400 hover:text-secondary-900"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            size="icon-sm"
            title="Ubah subjek Kuis"
            type="button"
            variant="outline"
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-2 max-w-md space-y-2">
          <DropdownField
            className={REFERENCE_CONTROL_CLASS_NAMES.select}
            disabled={disabled || isSaving}
            id="quiz-settings-subject"
            onValueChange={setDraft}
            options={kaptenSubjects.map((item) => ({
              label: `${item.code} · ${item.name}`,
              value: item.code,
            }))}
            placeholder="Pilih subjek"
            value={draft}
          />
          <div className="flex gap-2">
            <Button
              disabled={disabled || isSaving}
              onClick={() => {
                onChange(draft);
                setEditing(false);
              }}
              size="sm"
              type="button"
              variant="default"
            >
              <Check /> Simpan
            </Button>
            <Button
              disabled={disabled || isSaving}
              onClick={cancel}
              size="sm"
              type="button"
              variant="outline"
            >
              <X /> Batal
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge size="xs" tone="category">
            {subject ? `${subject.code} · ${subject.name}` : value}
          </Badge>
        </div>
      )}
    </div>
  );
}

function QuizMetadataCard({
  disabled,
  form,
  isSaving,
  onChange,
}: {
  disabled: boolean;
  form: SettingsForm;
  isSaving: boolean;
  onChange: (patch: Partial<SettingsForm>) => void;
}) {
  return (
    <ReferenceSurface
      as="section"
      className="p-5 sm:p-6"
      data-quiz-settings-metadata="bank-style"
    >
      <div className="space-y-6">
        <QuizTitleField
          disabled={disabled}
          isSaving={isSaving}
          onChange={(title) => onChange({ title })}
          value={form.title}
        />
        <div className="space-y-5">
          <QuizDescriptionField
            disabled={disabled}
            isSaving={isSaving}
            onChange={(description) => onChange({ description })}
            value={form.description}
          />
          <QuizSubjectField
            disabled={disabled}
            isSaving={isSaving}
            onChange={(subjectCode) => onChange({ subjectCode })}
            value={form.subjectCode}
          />
        </div>
      </div>
    </ReferenceSurface>
  );
}

function QuizSettings({
  disabled,
  form,
  isHidden,
  isSaving,
  onArchive,
  onChange,
  onSave,
  onSetHidden,
}: {
  disabled: boolean;
  form: SettingsForm;
  isHidden: boolean;
  isSaving: boolean;
  onArchive?: () => Promise<boolean>;
  onChange: (patch: Partial<SettingsForm>) => void;
  onSave: () => void;
  onSetHidden?: (isHidden: boolean) => Promise<boolean>;
}) {
  const { durationError, scheduleError } = getQuizSettingsErrors(form);

  return (
    <div className="grid gap-6">
      <ReferenceSurface as="section" className="max-w-6xl p-5 md:p-7">
        <div>
          <h2 className="text-lg font-semibold text-secondary-900">
            Pengaturan Kuis
          </h2>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="quiz-settings-opens"
            >
              Mulai dibuka
            </FieldLabel>
            <FieldInput
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              disabled={disabled}
              id="quiz-settings-opens"
              onChange={(event) => onChange({ opensAt: event.target.value })}
              type="datetime-local"
              value={form.opensAt}
            />
          </Field>
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="quiz-settings-closes"
            >
              Tutup akses
            </FieldLabel>
            <FieldInput
              className={REFERENCE_CONTROL_CLASS_NAMES.input}
              disabled={disabled}
              id="quiz-settings-closes"
              onChange={(event) => onChange({ closesAt: event.target.value })}
              type="datetime-local"
              value={form.closesAt}
            />
          </Field>
          <Field>
            <FieldLabel
              className={REFERENCE_FIELD_LABEL_CLASS_NAME}
              htmlFor="quiz-settings-duration"
            >
              Durasi pengerjaan
            </FieldLabel>
            <div className="relative">
              <FieldInput
                aria-label="Durasi pengerjaan dalam menit"
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pr-16`}
                disabled={disabled}
                id="quiz-settings-duration"
                min={1}
                onChange={(event) => {
                  const value = event.target.value;
                  onChange({
                    durationMinutes: value === "" ? null : Number(value),
                  });
                }}
                placeholder="Tanpa batas"
                step={1}
                type="number"
                value={form.durationMinutes ?? ""}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-secondary-500"
              >
                Menit
              </span>
            </div>
          </Field>
          {/* <Field> */}
          {/*   <FieldLabel */}
          {/*     className={REFERENCE_FIELD_LABEL_CLASS_NAME} */}
          {/*     htmlFor="quiz-settings-attempts" */}
          {/*   > */}
          {/*     Jumlah percobaan */}
          {/*   </FieldLabel> */}
          {/*   <DropdownField */}
          {/*     className={REFERENCE_CONTROL_CLASS_NAMES.select} */}
          {/*     disabled={disabled} */}
          {/*     id="quiz-settings-attempts" */}
          {/*     onValueChange={(value) => */}
          {/*       onChange({ */}
          {/*         attemptsAllowed: value === "unlimited" ? null : Number(value), */}
          {/*       }) */}
          {/*     } */}
          {/*     options={attemptsOptions} */}
          {/*     placeholder="Pilih batas" */}
          {/*     value={ */}
          {/*       form.attemptsAllowed === null */}
          {/*         ? "unlimited" */}
          {/*         : String(form.attemptsAllowed) */}
          {/*     } */}
          {/*   /> */}
          {/* </Field> */}
        </div>
        {scheduleError || durationError ? (
          <p
            className="mt-4 text-sm font-medium text-student-status-danger-fg"
            role="alert"
          >
            {scheduleError ?? durationError}
          </p>
        ) : null}
        <Button
          aria-busy={isSaving}
          className="mt-5 w-full"
          data-quiz-settings-save="primary"
          disabled={
            disabled || isSaving || Boolean(scheduleError || durationError)
          }
          onClick={onSave}
          type="button"
          variant="default"
        >
          {isSaving ? "Menyimpan…" : "Simpan"}
        </Button>
      </ReferenceSurface>

      <QuizLifecycleSettings disabled={disabled} isHidden={isHidden} isSaving={isSaving} onArchive={onArchive} onSetHidden={onSetHidden} />
    </div>
  );
}

function getQuizSettingsErrors(form: SettingsForm) {
  const scheduleError = form.opensAt && form.closesAt && new Date(form.closesAt) <= new Date(form.opensAt)
    ? "Waktu tutup harus setelah waktu buka."
    : null;
  const durationError = form.durationMinutes !== null && (!Number.isInteger(form.durationMinutes) || form.durationMinutes < 1)
    ? "Durasi harus berupa jumlah menit positif atau dikosongkan untuk tanpa batas."
    : null;
  return { durationError, scheduleError };
}

function QuizLifecycleSettings({ disabled, isHidden, isSaving, onArchive, onSetHidden }: {
  disabled: boolean;
  isHidden: boolean;
  isSaving: boolean;
  onArchive?: () => Promise<boolean>;
  onSetHidden?: (isHidden: boolean) => Promise<boolean>;
}) {
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  return (
    <>
      {onArchive || onSetHidden ? (
        <ReferenceSurface as="section" className="max-w-6xl p-5 md:p-7" data-quiz-settings-card="lifecycle">
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-secondary-900">Administrasi</h2>
            <QuizVisibilityAction disabled={disabled} isHidden={isHidden} isSaving={isSaving} onSetHidden={onSetHidden} />
            <QuizArchiveAction disabled={disabled} isSaving={isSaving} onArchiveRequested={() => setArchiveConfirmationOpen(true)} onArchive={onArchive} />
          </div>
        </ReferenceSurface>
      ) : null}
      <QuizArchiveConfirmation
        isOpen={archiveConfirmationOpen}
        isSaving={isSaving}
        onArchive={onArchive}
        onOpenChange={(open) => { if (!isSaving) setArchiveConfirmationOpen(open); }}
        onSuccess={() => setArchiveConfirmationOpen(false)}
      />
    </>
  );
}

function QuizVisibilityAction({ disabled, isHidden, isSaving, onSetHidden }: {
  disabled: boolean;
  isHidden: boolean;
  isSaving: boolean;
  onSetHidden?: (isHidden: boolean) => Promise<boolean>;
}) {
  if (!onSetHidden) return null;
  return (
    <AdministrationActionRow
      action={isHidden ? "Tampilkan Kuis" : "Sembunyikan Kuis"}
      description={isHidden ? "Tampilkan kembali Kuis di katalog siswa agar siswa dapat memulai pengerjaan baru." : "Kuis tidak muncul di katalog siswa dan tidak menerima pengerjaan baru. Pengerjaan yang sedang berjalan dan riwayat hasil tetap tersedia."}
    >
      <Button aria-busy={isSaving} disabled={disabled || isSaving} onClick={() => void onSetHidden(!isHidden)} type="button" variant="outline">{isHidden ? "Tampilkan lagi" : "Sembunyikan"}</Button>
    </AdministrationActionRow>
  );
}

function QuizArchiveAction({ disabled, isSaving, onArchiveRequested, onArchive }: {
  disabled: boolean;
  isSaving: boolean;
  onArchiveRequested: () => void;
  onArchive?: () => Promise<boolean>;
}) {
  if (!onArchive) return null;
  return (
    <AdministrationActionRow action="Arsipkan Kuis" description="Pindahkan Kuis ke arsip dan hentikan akses pengerjaan siswa.">
      <Button aria-busy={isSaving} disabled={disabled || isSaving} onClick={onArchiveRequested} type="button" variant="destructive"><Archive />Arsipkan</Button>
    </AdministrationActionRow>
  );
}

function QuizArchiveConfirmation({ isOpen, isSaving, onArchive, onOpenChange, onSuccess }: {
  isOpen: boolean;
  isSaving: boolean;
  onArchive?: () => Promise<boolean>;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  async function confirmArchive(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (await onArchive?.()) onSuccess();
  }
  return (
    <AlertDialog onOpenChange={onOpenChange} open={isOpen}>
      <AlertDialogContent pending={isSaving} variant="danger">
        <AlertDialogHeader>
          <AlertDialogMedia variant="danger"><Archive /></AlertDialogMedia>
          <AlertDialogTitle>Arsipkan Kuis?</AlertDialogTitle>
          <AlertDialogDescription>Kuis ini tidak lagi bisa dikerjakan siswa. Riwayat pengerjaan tetap tersimpan. Kuis yang diarsipkan tidak dapat dipulihkan.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Batal</AlertDialogCancel>
          <AlertDialogAction disabled={isSaving} onClick={confirmArchive} variant="destructive">{isSaving ? "Mengarsipkan…" : "Arsipkan Kuis"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function KaptenQuizDetailPageContent({
  initialQuestions,
  initialQuiz,
  initialResults,
  initialTab = "preview",
  returnHref = "/mentor/quiz",
  session,
}: {
  initialQuestions: QuizQuestionSnapshot[];
  initialQuiz: KaptenQuiz;
  initialResults: KaptenQuizResultsData;
  initialTab?: QuizDetailTab;
  returnHref?: string;
  session: SessionContext;
}) {
  const router = useRouter();
  const resourceLock = useResourceEditLock();
  const [quiz, setQuiz] = useState(initialQuiz);
  const [activeTab, setActiveTab] = useState<QuizDetailTab>(initialTab);
  const [questions, setQuestions] = useState(() =>
    initialQuestions.map((question) => ({
      ...question,
      choices: question.choices.map((choice) => ({ ...choice })),
    })),
  );
  const [settings, setSettings] = useState(() => settingsFromQuiz(initialQuiz));
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isVisibilitySaving, setIsVisibilitySaving] = useState(false);
  const editorDisabled = quiz.status === "archived" || !resourceLock.canEdit;

  function changeTab(value: string) {
    if (value !== "preview" && value !== "hasil" && value !== "pengaturan")
      return;
    const next = value as QuizDetailTab;
    setActiveTab(next);
    router.push(`/mentor/quiz/${quiz.id}?${new URLSearchParams({ tab: next, returnTo: returnHref })}`, { scroll: false });
  }

  async function saveSettings() {
    if (
      !resourceLock.canEdit ||
      isSaving ||
      isArchiving ||
      isVisibilitySaving ||
      quiz.status === "archived"
    ) {
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveStandaloneQuizAction({
        attemptsAllowed: settings.attemptsAllowed,
        closesAt: settings.closesAt,
        correctAnswerVisibility: settings.correctAnswerVisibility,
        description: settings.description,
        durationSeconds:
          settings.durationMinutes === null
            ? null
            : settings.durationMinutes * 60,
        formBehavior: settings.formBehavior,
        id: quiz.id,
        editLease: resourceLock.proof ?? undefined,
        opensAt: settings.opensAt,
        questions: cloneForSave(questions),
        retryDelaySeconds: settings.retryDelaySeconds,
        reviewTiming: settings.reviewTiming,
        scorePolicy: settings.scorePolicy,
        sourceBankId: quiz.sourceBankId ?? null,
        sourceMode: quiz.sourceMode === "bank" ? "bank" : "local",
        subjectCode: settings.subjectCode,
        title: settings.title,
      });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      setQuiz(result.quiz);
      setSettings(settingsFromQuiz(result.quiz));
      setQuestions(cloneForSave(result.questions));
      showToast("Perubahan Kuis tersimpan.", { variant: "success" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kuis belum dapat disimpan.";
      showToast(message, { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveQuiz() {
    if (
      !resourceLock.canEdit ||
      isSaving ||
      isArchiving ||
      isVisibilitySaving ||
      quiz.status !== "published"
    ) {
      return false;
    }
    setIsArchiving(true);
    try {
      const result = await updateStandaloneQuizLifecycleAction(
        quiz.id,
        resourceLock.proof ?? undefined,
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return false;
      }
      setQuiz(result.quiz);
      showToast("Kuis diarsipkan.", { variant: "success" });
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kuis belum dapat diarsipkan.";
      showToast(message, { variant: "error" });
      return false;
    } finally {
      setIsArchiving(false);
    }
  }

  async function setQuizHidden(isHidden: boolean) {
    if (
      !resourceLock.canEdit ||
      isSaving ||
      isArchiving ||
      isVisibilitySaving ||
      quiz.status !== "published"
    ) {
      return false;
    }
    setIsVisibilitySaving(true);
    try {
      const result = await setStandaloneQuizHiddenAction(
        quiz.id,
        isHidden,
        resourceLock.proof ?? undefined,
      );
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return false;
      }
      setQuiz(result.quiz);
      showToast(
        isHidden ? "Kuis disembunyikan." : "Kuis ditampilkan kembali.",
        { variant: "success" },
      );
      return true;
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Visibilitas Kuis belum dapat diubah. Coba lagi.",
        { variant: "error" },
      );
      return false;
    } finally {
      setIsVisibilitySaving(false);
    }
  }



  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Detail Kuis"
      breadcrumbParent={{ href: returnHref, label: "Daftar kuis" }}
      contentElement="div"
      mainClassName="max-w-[1500px] gap-7"
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ResourceAuthoringLockBanner
          onRetry={resourceLock.retry}
          resourceLabel="Kuis"
          state={resourceLock.state}
        />
        <QuizMetadataCard
          disabled={editorDisabled || isArchiving || isVisibilitySaving}
          form={settings}
          isSaving={isSaving}
          onChange={(patch) =>
            setSettings((current) => ({ ...current, ...patch }))
          }
        />
        <QuizSourceSummary quiz={quiz} />
        <Tabs
          className="w-full min-w-0 gap-7"
          onValueChange={changeTab}
          value={activeTab}
        >
          <FullWidthTabsList aria-label="Bagian detail Kuis">
            <FullWidthTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="preview"
            >
              Soal
            </FullWidthTabsTrigger>
            <FullWidthTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="hasil"
            >
              Hasil
            </FullWidthTabsTrigger>
            <FullWidthTabsTrigger
              className="min-w-0 px-2 text-xs sm:px-3 sm:text-sm"
              value="pengaturan"
            >
              Pengaturan
            </FullWidthTabsTrigger>
          </FullWidthTabsList>
          <TabsContent className="m-0 space-y-4" value="preview">
            <QuizPreview
              returnHref={returnHref}
              quizId={quiz.id}
              questions={questions}
              subjectCode={quiz.subjectCode ?? "PU"}
            />
          </TabsContent>
          <TabsContent className="m-0" value="hasil">
            <KaptenQuizResultsContent result={initialResults} />
          </TabsContent>
          <TabsContent className="m-0" value="pengaturan">
            <QuizSettings
              disabled={editorDisabled || isArchiving || isVisibilitySaving}
              form={settings}
              isHidden={quiz.isHidden === true}
              isSaving={isSaving || isArchiving || isVisibilitySaving}
              onChange={(patch) =>
                setSettings((current) => ({ ...current, ...patch }))
              }
              onArchive={quiz.status === "published" ? archiveQuiz : undefined}
              onSave={() => void saveSettings()}
              onSetHidden={
                quiz.status === "published" ? setQuizHidden : undefined
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </MentorWorkspaceShell>
  );
}

function KaptenQuizDetailPageModule(props: {
  initialQuestions: QuizQuestionSnapshot[];
  initialQuiz: KaptenQuiz;
  initialResults: KaptenQuizResultsData;
  initialTab?: QuizDetailTab;
  returnHref?: string;
  session: SessionContext;
}) {
  return (
    <ResourceEditLockProvider
      resourceId={props.initialQuiz.id}
      resourceType="quiz"
    >
      <KaptenQuizDetailPageContent {...props} />
    </ResourceEditLockProvider>
  );
}

export { KaptenQuizDetailPageModule };
