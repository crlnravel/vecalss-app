"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  MapPin,
  Target,
} from "@/lib/icons";

import type { ExamEvent, Major, University } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/use-action-toast";
import {
  ReferenceSelect,
  type ReferenceSelectProps,
} from "@/components/dashboard/reference-dashboard-controls";
import { saveOnboardingAction, skipOnboardingAction } from "@/modules/student/actions";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

const examDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Jakarta",
  year: "numeric",
});

const ONBOARDING_SELECT_CLASS_NAMES = {
  icon: "text-[var(--voyage-forest)]",
  item: "data-[highlighted]:bg-[var(--voyage-sea-glass)] data-[highlighted]:text-secondary-900 data-[selected]:bg-[var(--voyage-sea-glass)] data-[selected]:text-secondary-900",
  popup: "border-secondary-200 text-secondary-800 shadow-none",
  trigger: "border-secondary-200 bg-white text-secondary-800 shadow-none hover:border-secondary-200 hover:bg-voyage-surface focus-visible:border-[var(--voyage-forest)] focus-visible:ring-[var(--voyage-sea-glass)] data-popup-open:border-[var(--voyage-forest)] data-popup-open:ring-[var(--voyage-sea-glass)]",
} as const;

type OnboardingSelectProps = Omit<ReferenceSelectProps, "classNames">;

function OnboardingSelect({ className, ...props }: OnboardingSelectProps) {
  return (
    <ReferenceSelect
      {...props}
      className={className}
      classNames={ONBOARDING_SELECT_CLASS_NAMES}
    />
  );
}

function DoodleBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <svg className="h-full w-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1440 1000">
        <defs>
          <linearGradient id="skyline" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="var(--voyage-sea-glass)" />
            <stop offset="1" stopColor="var(--voyage-warm-sun)" />
          </linearGradient>
        </defs>
        <path d="M-10 92C55 35 129 127 202 69S325 142 367 48" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".55" />
        <path d="M1115 50c-46 31-10 99 36 82 59-21-4-105 64-80 45 16 18 105 70 108" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".48" />
        <path d="M-22 405c56-34 107 19 177-33 27-20 44-50 82-60" stroke="var(--voyage-sea-glass)" strokeLinecap="round" strokeWidth="3" opacity=".7" />
        <path d="M1222 415c18-38 73-20 105-35 39-18 35-63 87-41 33 14 44-4 57-19" stroke="var(--voyage-sea-glass)" strokeLinecap="round" strokeWidth="3" opacity=".62" />
        <path d="M70 815c17-50 95 3 134-32 42-37 14-78 70-88 43-8 47 28 77 12" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".52" />
        <path d="M1110 808c27-38 80-34 110-3 25 27 59 21 71-13 13-36 51-39 82-13" stroke="var(--voyage-sea-glass)" strokeLinecap="round" strokeWidth="3" opacity=".62" />
        <g fill="var(--voyage-sea-glass)" opacity=".88"><circle cx="295" cy="191" r="4" /><circle cx="1299" cy="322" r="5" /><circle cx="1395" cy="690" r="4" /></g>
        <g fill="var(--voyage-warm-sun)" opacity=".9"><circle cx="76" cy="700" r="5" /><circle cx="1187" cy="840" r="5" /></g>
        <g fill="var(--voyage-sea-glass)" opacity=".85">
          <path d="m259 338 5 12 12 5-12 5-5 12-5-12-12-5 12-5z" />
          <path d="m1127 494 5 12 12 5-12 5-5 12-5-12-12-5 12-5z" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--voyage-surface)_96%,transparent)_0%,color-mix(in_oklab,var(--voyage-surface)_78%,transparent)_42%,color-mix(in_oklab,var(--voyage-canvas)_35%,transparent)_100%)]" />
    </div>
  );
}

function StepProgress({ step }: { step: number }) {
  return (
    <div
      aria-label={`Langkah ${step} dari 3`}
      aria-valuemax={3}
      aria-valuemin={1}
      aria-valuenow={Math.max(1, Math.min(3, step))}
      aria-valuetext={`Langkah ${step} dari 3`}
      className="mx-auto flex w-full max-w-[33rem] items-center gap-2 px-5 pt-6 sm:px-0"
      role="progressbar"
    >
      {[0, 1, 2].map((item) => (
        <span
          aria-hidden="true"
          className={`h-1 flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${item < step ? "bg-[var(--voyage-warm-sun)]" : "bg-secondary-200"}`}
          key={item}
        />
      ))}
    </div>
  );
}

function ChoiceCard({
  children,
  description,
  icon: Icon,
  onClick,
  selected,
  title,
}: {
  children?: React.ReactNode;
  description?: string;
  icon: typeof Target;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`group flex min-h-[78px] w-full items-center gap-4 rounded-[1.35rem] border bg-white px-4 py-3 text-left transition-all duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--voyage-leaf)] ${
        selected
          ? "border-[var(--voyage-warm-sun)] bg-[var(--warning-50)] shadow-[0_12px_28px_-20px_color-mix(in_oklab,var(--warning-700)_55%,transparent)]"
          : "border-secondary-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:border-[var(--voyage-sea-glass)] hover:shadow-[0_12px_26px_-22px_color-mix(in_oklab,var(--voyage-forest)_50%,transparent)]"
      } motion-reduce:translate-y-0 motion-reduce:transition-none`}
      onClick={onClick}
      type="button"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${selected ? "border-[var(--warning-200)] bg-[var(--warning-100)] text-[var(--voyage-warm-sun-ink)]" : "border-secondary-200 bg-voyage-canvas text-secondary-500"}`}>
        <Icon size={23} weight="duotone" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold tracking-[-0.02em] text-secondary-900">{title}</span>
        {description ? <span className="mt-0.5 block text-sm leading-5 text-voyage-muted-ink">{description}</span> : null}
        {children}
      </span>
      <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition motion-reduce:transition-none ${selected ? "border-[var(--voyage-warm-sun)] bg-[var(--voyage-warm-sun)] text-voyage-ink" : "border-secondary-300"}`}>
        {selected ? <Check size={14} weight="bold" /> : null}
      </span>
    </button>
  );
}

function SkipOnboardingButton({ children }: { children: React.ReactNode }) {
  return (
    <form action={skipOnboardingAction}>
      <Button size="default" type="submit" variant="outline">
        {children}
      </Button>
    </form>
  );
}

function OnboardingForm({
  examEvents,
  majors,
  universities,
}: {
  examEvents: ExamEvent[];
  majors: Array<Major & { university: University }>;
  universities: University[];
}) {
  const [state, formAction] = useActionState(saveOnboardingAction, EMPTY_FORM_STATE);
  const keepMessageInline = useActionToast(state);
  const [step, setStep] = useState(0);
  const [examId, setExamId] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [majorId, setMajorId] = useState("");
  const [targetKind, setTargetKind] = useState<"exam" | "campus" | "">("");

  const availableMajors = useMemo(
    () => (universityId ? majors.filter((major) => major.universityId === universityId) : majors),
    [majors, universityId],
  );
  const chosenUniversity = universities.find((university) => university.id === universityId);
  const canAdvanceFromTargets = Boolean(targetKind);

  function chooseUniversity(id: string) {
    setUniversityId(id);
    const majorBelongsElsewhere = majors.find((major) => major.id === majorId)?.universityId !== id;
    if (majorBelongsElsewhere) setMajorId("");
  }

  function chooseExam(id: string) {
    setTargetKind("exam");
    setExamId(id);
    setUniversityId("");
    setMajorId("");
  }

  function chooseCampusTarget() {
    setTargetKind("campus");
    setExamId("");
  }

  return (
    <main className="student-page-canvas relative min-h-screen overflow-hidden text-secondary-900">
      <DoodleBackdrop />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[42rem] flex-col px-5 pb-7 sm:px-8">
        {step > 0 ? (
          <>
            <StepProgress step={step} />
            <Button
              aria-label="Kembali ke langkah sebelumnya"
              className="mt-5"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ArrowLeft size={23} weight="bold" />
            </Button>
          </>
        ) : null}

        {step === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center pb-12 text-center vecalss-enter-fade-zoom-500">
            <div className="relative mb-6 grid size-28 place-items-center rounded-[2.4rem] bg-[linear-gradient(145deg,var(--voyage-sea-glass-wash),var(--voyage-sea-glass-wash))]">
              <span className="absolute inset-2 rounded-[2rem] border border-white/80" />
              <Image alt="Maskot Vecalss" className="relative h-24 w-24 object-contain drop-shadow-[0_9px_8px_color-mix(in_oklab,var(--voyage-forest)_18%,transparent)]" height={3100} priority src="/brand/mascot-vecalss.png" width={3100} />
            </div>
            <h1 className="max-w-[15ch] font-heading text-4xl leading-[1.06] font-extrabold tracking-[-0.045em] text-voyage-ink sm:text-5xl">
              Halo, kita mulai perjalanan belajarmu.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-voyage-muted-ink">
              Jawab beberapa pertanyaan singkat supaya Vecalss bisa menyiapkan arah belajar yang pas buatmu.
            </p>
            <Button className="mt-9 w-full max-w-sm" onClick={() => setStep(1)} size="lg" type="button" variant="warning">
              Atur target belajar <ArrowRight size={19} weight="bold" />
            </Button>
            <div className="mt-5"><SkipOnboardingButton>Atur nanti</SkipOnboardingButton></div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mx-auto w-full max-w-[33rem] vecalss-enter-fade-slide-right-300">
            <div className="mt-4 flex items-center justify-center gap-3 rounded-[1.5rem] border border-secondary-200 bg-voyage-surface/90 p-4 shadow-[0_12px_24px_-22px_color-mix(in_oklab,var(--voyage-deep)_60%,transparent)]">
              <Image alt="" className="size-16 shrink-0 object-contain" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
              <div>
                <h1 className="text-xl font-bold tracking-[-0.035em] text-voyage-ink">Apa target belajarmu?</h1>
                <p className="mt-1 text-sm leading-5 text-voyage-muted-ink">Pilih ujian atau kampus tujuan. Kamu bisa melengkapi detailnya nanti.</p>
              </div>
            </div>
            <div className="mt-10 space-y-3">
              {examEvents.slice(0, 4).map((examEvent) => (
                <ChoiceCard description={examEvent.examDate ? `Target ujian ${examDateFormatter.format(examEvent.examDate)}` : "Jadikan ujian ini target belajarmu."} icon={Target} key={examEvent.id} onClick={() => chooseExam(examEvent.id)} selected={targetKind === "exam" && examId === examEvent.id} title={examEvent.name} />
              ))}
              <ChoiceCard description="Atur kampus dan jurusan tujuanmu." icon={GraduationCap} onClick={chooseCampusTarget} selected={targetKind === "campus"} title="Target kampus dan jurusan" />
              {examEvents.length === 0 ? <p className="rounded-2xl border border-dashed border-secondary-300 p-4 text-sm text-voyage-muted-ink">Pilihan ujian belum tersedia. Kamu tetap bisa mengatur target kampus dan jurusan.</p> : null}
            </div>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Button className="w-full" disabled={!canAdvanceFromTargets} onClick={() => setStep(2)} size="lg" type="button" variant="warning">
                Lanjut <ArrowRight size={18} weight="bold" />
              </Button>
              <SkipOnboardingButton>Atur nanti</SkipOnboardingButton>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mx-auto w-full max-w-[33rem] vecalss-enter-fade-slide-right-300">
            <div className="mt-4 flex items-center justify-center gap-3 rounded-[1.5rem] border border-secondary-200 bg-voyage-surface/90 p-4 shadow-[0_12px_24px_-22px_color-mix(in_oklab,var(--voyage-deep)_60%,transparent)]">
              <Image alt="" className="size-16 shrink-0 object-contain" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
              <div><h1 className="text-xl font-bold tracking-[-0.035em] text-voyage-ink">Pilih kampus dan jurusan tujuan</h1><p className="mt-1 text-sm leading-5 text-voyage-muted-ink">Belum yakin? Pilih nanti. Kamu bisa mengubah target ini di Profil.</p></div>
            </div>
            <label className="mt-9 block text-sm font-bold text-secondary-800" htmlFor="university">Pilih kampus</label>
            <div className="relative mt-2">
              <MapPin className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--voyage-forest)]" size={20} weight="duotone" />
              <OnboardingSelect
                aria-label="Pilih kampus"
                className="h-14 pl-11"
                id="university"
                onValueChange={chooseUniversity}
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...universities.map((university) => ({
                    label: university.shortName ? `${university.shortName} — ${university.name}` : university.name,
                    value: university.id,
                  })),
                ]}
                placeholder="Pilih nanti"
                value={universityId}
              />
            </div>
            <label className="mt-6 block text-sm font-bold text-secondary-800" htmlFor="major">Jurusan tujuan</label>
            <OnboardingSelect
              aria-label="Jurusan tujuan"
              className="mt-2 h-14"
              id="major"
              onValueChange={setMajorId}
              options={[
                { label: "Pilih nanti", value: "" },
                ...availableMajors.map((major) => ({
                  label: `${major.name}${!universityId ? ` · ${major.university.shortName ?? major.university.name}` : ""}`,
                  value: major.id,
                })),
              ]}
              placeholder="Pilih nanti"
              value={majorId}
            />
            {chosenUniversity ? <p className="mt-3 text-sm text-voyage-muted-ink">Keren, <span className="font-bold text-secondary-800">{chosenUniversity.shortName ?? chosenUniversity.name}</span> masuk daftar tujuanmu.</p> : null}
            <div className="mt-9 flex flex-col items-center gap-4">
              <Button className="w-full" onClick={() => setStep(3)} size="lg" type="button" variant="warning">Lanjut <ArrowRight size={18} weight="bold" /></Button>
              <Button onClick={() => setStep(3)} size="default" type="button" variant="outline">Lanjut tanpa memilih</Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-1 flex-col items-center justify-center pb-12 text-center vecalss-enter-fade-zoom-500">
            <div className="relative mb-7 grid size-32 place-items-center rounded-full bg-[linear-gradient(145deg,var(--voyage-sea-glass-wash),var(--voyage-sea-glass-wash))] shadow-[0_20px_40px_-25px_color-mix(in_oklab,var(--voyage-leaf)_55%,transparent)]">
              <span className="absolute inset-2 rounded-full border-2 border-white/90" />
              <Image alt="Maskot Vecalss" className="relative size-28 object-contain drop-shadow-[0_10px_9px_color-mix(in_oklab,var(--voyage-forest)_18%,transparent)]" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
            </div>
            <h1 className="max-w-[17ch] font-heading text-4xl leading-[1.08] font-extrabold tracking-[-0.045em] text-voyage-ink sm:text-5xl">Terima kasih sudah berbagi.</h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-voyage-muted-ink">Kami akan menyiapkan pengalaman belajar yang lebih personal untukmu.</p>
            {state.message && keepMessageInline ? <p aria-live="assertive" className="mt-5 w-full max-w-sm rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-left text-sm text-student-status-danger-fg" role="alert">{state.message}</p> : null}
            <form action={formAction} className="mt-9 flex w-full max-w-sm flex-col items-center gap-4">
              <input name="targetExamEventId" type="hidden" value={examId} />
              <input name="targetUniversityId" type="hidden" value={universityId} />
              <input name="targetMajorId" type="hidden" value={majorId} />
              <Button className="w-full" size="lg" type="submit" variant="warning">Mulai belajar <ArrowRight size={19} weight="bold" /></Button>
              <Button formAction={skipOnboardingAction} size="default" type="submit" variant="outline">Lewati target belajar</Button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export { OnboardingForm };
