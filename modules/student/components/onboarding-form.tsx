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
} from "@phosphor-icons/react";

import type { ExamEvent, Major, University } from "@/generated/prisma/client";
import { saveOnboardingAction, skipOnboardingAction } from "@/modules/student/actions";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

function DoodleBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <svg className="h-full w-full" fill="none" preserveAspectRatio="none" viewBox="0 0 1440 1000">
        <defs>
          <linearGradient id="skyline" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#71d9ee" />
            <stop offset="1" stopColor="#d6f068" />
          </linearGradient>
        </defs>
        <path d="M-10 92C55 35 129 127 202 69S325 142 367 48" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".55" />
        <path d="M1115 50c-46 31-10 99 36 82 59-21-4-105 64-80 45 16 18 105 70 108" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".48" />
        <path d="M-22 405c56-34 107 19 177-33 27-20 44-50 82-60" stroke="#adebb8" strokeLinecap="round" strokeWidth="3" opacity=".7" />
        <path d="M1222 415c18-38 73-20 105-35 39-18 35-63 87-41 33 14 44-4 57-19" stroke="#a8e8f4" strokeLinecap="round" strokeWidth="3" opacity=".62" />
        <path d="M70 815c17-50 95 3 134-32 42-37 14-78 70-88 43-8 47 28 77 12" stroke="url(#skyline)" strokeLinecap="round" strokeWidth="3" opacity=".52" />
        <path d="M1110 808c27-38 80-34 110-3 25 27 59 21 71-13 13-36 51-39 82-13" stroke="#afeec1" strokeLinecap="round" strokeWidth="3" opacity=".62" />
        <g fill="#9be5f4" opacity=".88"><circle cx="295" cy="191" r="4" /><circle cx="1299" cy="322" r="5" /><circle cx="1395" cy="690" r="4" /></g>
        <g fill="#d5ef6f" opacity=".9"><circle cx="76" cy="700" r="5" /><circle cx="1187" cy="840" r="5" /></g>
        <g fill="#b8f0c5" opacity=".85">
          <path d="m259 338 5 12 12 5-12 5-5 12-5-12-12-5 12-5z" />
          <path d="m1127 494 5 12 12 5-12 5-5 12-5-12-12-5 12-5z" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.96)_0%,rgba(251,254,255,.78)_42%,rgba(247,253,252,.35)_100%)]" />
    </div>
  );
}

function StepProgress({ step }: { step: number }) {
  return (
    <div className="mx-auto flex w-full max-w-[33rem] items-center gap-2 px-5 pt-6 sm:px-0">
      {[0, 1, 2].map((item) => (
        <span
          className={`h-1 flex-1 rounded-full transition-colors duration-500 ${item < step ? "bg-[#b7e85d]" : "bg-slate-200"}`}
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
      className={`group flex min-h-[78px] w-full items-center gap-4 rounded-[1.35rem] border bg-white px-4 py-3 text-left transition-all duration-200 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#29b9cc] ${
        selected
          ? "border-[#f7ca48] bg-[#fffdf4] shadow-[0_12px_28px_-20px_rgba(167,124,0,.55)]"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-[#91dce7] hover:shadow-[0_12px_26px_-22px_rgba(42,83,98,.5)]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl border ${selected ? "border-[#ffe29c] bg-[#fff4c9] text-[#6f5400]" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
        <Icon size={23} weight="duotone" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold tracking-[-0.02em] text-slate-800">{title}</span>
        {description ? <span className="mt-0.5 block text-sm leading-5 text-slate-500">{description}</span> : null}
        {children}
      </span>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition ${selected ? "border-[#edbf34] bg-[#ffda59] text-slate-900" : "border-slate-300"}`}>
        {selected ? <Check size={14} weight="bold" /> : null}
      </span>
    </button>
  );
}

function SkipOnboardingButton({ children }: { children: React.ReactNode }) {
  return (
    <form action={skipOnboardingAction}>
      <button className="text-sm font-medium text-slate-400 underline-offset-4 transition hover:text-slate-600 hover:underline" type="submit">
        {children}
      </button>
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
    <main className="relative min-h-screen overflow-hidden bg-[#fbfdff] text-slate-800">
      <DoodleBackdrop />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[42rem] flex-col px-5 pb-7 sm:px-8">
        {step > 0 ? (
          <>
            <StepProgress step={step} />
            <button
              aria-label="Kembali ke langkah sebelumnya"
              className="mt-5 grid size-10 place-items-center rounded-full text-slate-600 transition hover:bg-white focus-visible:outline-3 focus-visible:outline-[#29b9cc]"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              type="button"
            >
              <ArrowLeft size={23} weight="bold" />
            </button>
          </>
        ) : null}

        {step === 0 ? (
          <section className="flex flex-1 flex-col items-center justify-center pb-12 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-6 grid size-28 place-items-center rounded-[2.4rem] bg-[linear-gradient(145deg,#d8f3fb,#e9f7c9)]">
              <span className="absolute inset-2 rounded-[2rem] border border-white/80" />
              <Image alt="Maskot Vecalss" className="relative h-24 w-24 object-contain drop-shadow-[0_9px_8px_rgba(18,83,101,.18)]" height={3100} priority src="/brand/mascot-vecalss.png" width={3100} />
            </div>
            <h1 className="max-w-[15ch] font-heading text-4xl leading-[1.06] font-extrabold tracking-[-0.045em] text-slate-900 sm:text-5xl">
              Halo, kita mulai perjalanan belajarmu.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-slate-500">
              Jawab beberapa pertanyaan singkat supaya Vecalss bisa menyiapkan arah belajar yang pas buatmu.
            </p>
            <button className="mt-9 inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-[#ffda59] px-6 text-base font-extrabold text-slate-900 shadow-[0_16px_30px_-18px_rgba(166,116,0,.65)] transition hover:-translate-y-0.5 hover:bg-[#ffd348] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#29b9cc]" onClick={() => setStep(1)} type="button">
              Mulai <ArrowRight size={19} weight="bold" />
            </button>
            <div className="mt-5"><SkipOnboardingButton>Lewati dulu</SkipOnboardingButton></div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="mx-auto w-full max-w-[33rem] animate-in fade-in slide-in-from-right-3 duration-300">
            <div className="mt-4 flex items-center justify-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-[0_12px_24px_-22px_rgba(32,66,79,.6)]">
              <Image alt="" className="size-16 shrink-0 object-contain" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
              <div>
                <h1 className="text-xl font-bold tracking-[-0.035em] text-slate-900">Kamu lagi menyiapkan apa?</h1>
                <p className="mt-1 text-sm leading-5 text-slate-500">Pilih salah satu target dulu. Detail lainnya bisa kamu atur nanti.</p>
              </div>
            </div>
            <div className="mt-10 space-y-3">
              {examEvents.slice(0, 4).map((examEvent) => (
                <ChoiceCard description={examEvent.examDate ? `Target ujian ${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(examEvent.examDate)}` : "Target ujianmu"} icon={Target} key={examEvent.id} onClick={() => chooseExam(examEvent.id)} selected={targetKind === "exam" && examId === examEvent.id} title={examEvent.name} />
              ))}
              <ChoiceCard description="Menyiapkan pilihan kampus dan jurusan" icon={GraduationCap} onClick={chooseCampusTarget} selected={targetKind === "campus"} title="Aku sudah punya target kampus" />
              {examEvents.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Target ujian belum tersedia. Kamu tetap bisa memilih kampus dan jurusan.</p> : null}
            </div>
            <div className="mt-8 flex flex-col items-center gap-4">
              <button className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-[#ffda59] px-6 font-extrabold text-slate-900 transition hover:bg-[#ffd348] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400" disabled={!canAdvanceFromTargets} onClick={() => setStep(2)} type="button">
                Lanjut <ArrowRight size={18} weight="bold" />
              </button>
              <SkipOnboardingButton>Lewati dulu</SkipOnboardingButton>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="mx-auto w-full max-w-[33rem] animate-in fade-in slide-in-from-right-3 duration-300">
            <div className="mt-4 flex items-center justify-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-[0_12px_24px_-22px_rgba(32,66,79,.6)]">
              <Image alt="" className="size-16 shrink-0 object-contain" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
              <div><h1 className="text-xl font-bold tracking-[-0.035em] text-slate-900">Kampus impianmu di mana?</h1><p className="mt-1 text-sm leading-5 text-slate-500">Tidak perlu pasti kok. Ini hanya untuk membantumu fokus.</p></div>
            </div>
            <label className="mt-9 block text-sm font-bold text-slate-700" htmlFor="university">Pilih kampus</label>
            <div className="relative mt-2">
              <MapPin className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#55bcca]" size={20} weight="duotone" />
              <select className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-11 text-[15px] font-medium text-slate-700 outline-none transition focus:border-[#55bcca] focus:ring-3 focus:ring-[#c7eef4]" id="university" onChange={(event) => chooseUniversity(event.target.value)} value={universityId}>
                <option value="">Pilih nanti</option>
                {universities.map((university) => <option key={university.id} value={university.id}>{university.shortName ? `${university.shortName} — ${university.name}` : university.name}</option>)}
              </select>
            </div>
            <label className="mt-6 block text-sm font-bold text-slate-700" htmlFor="major">Jurusan yang kamu incar</label>
            <select className="mt-2 h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 outline-none transition focus:border-[#55bcca] focus:ring-3 focus:ring-[#c7eef4]" id="major" onChange={(event) => setMajorId(event.target.value)} value={majorId}>
              <option value="">Pilih nanti</option>
              {availableMajors.map((major) => <option key={major.id} value={major.id}>{major.name}{!universityId ? ` · ${major.university.shortName ?? major.university.name}` : ""}</option>)}
            </select>
            {chosenUniversity ? <p className="mt-3 text-sm text-slate-500">Keren, <span className="font-bold text-slate-700">{chosenUniversity.shortName ?? chosenUniversity.name}</span> masuk daftar tujuanmu.</p> : null}
            <div className="mt-9 flex flex-col items-center gap-4">
              <button className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-[#ffda59] px-6 font-extrabold text-slate-900 transition hover:bg-[#ffd348]" onClick={() => setStep(3)} type="button">Lanjut <ArrowRight size={18} weight="bold" /></button>
              <button className="text-sm font-medium text-slate-400 hover:text-slate-600" onClick={() => setStep(3)} type="button">Lewati dulu</button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-1 flex-col items-center justify-center pb-12 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="relative mb-7 grid size-32 place-items-center rounded-full bg-[linear-gradient(145deg,#d6f4f5,#e5f4ba)] shadow-[0_20px_40px_-25px_rgba(52,138,145,.55)]">
              <span className="absolute inset-2 rounded-full border-2 border-white/90" />
              <Image alt="Maskot Vecalss" className="relative size-28 object-contain drop-shadow-[0_10px_9px_rgba(18,83,101,.18)]" height={3100} src="/brand/mascot-vecalss.png" width={3100} />
            </div>
            <h1 className="max-w-[17ch] font-heading text-4xl leading-[1.08] font-extrabold tracking-[-0.045em] text-slate-900 sm:text-5xl">Terima kasih sudah berbagi.</h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-slate-500">Kami akan menyiapkan pengalaman belajar yang lebih personal untukmu.</p>
            {state.message ? <p className="mt-5 w-full max-w-sm rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-700">{state.message}</p> : null}
            <form action={formAction} className="mt-9 flex w-full max-w-sm flex-col items-center gap-4">
              <input name="targetExamEventId" type="hidden" value={examId} />
              <input name="targetUniversityId" type="hidden" value={universityId} />
              <input name="targetMajorId" type="hidden" value={majorId} />
              <button className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-[#ffda59] px-6 text-base font-extrabold text-slate-900 shadow-[0_16px_30px_-18px_rgba(166,116,0,.65)] transition hover:-translate-y-0.5 hover:bg-[#ffd348] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#29b9cc]" type="submit">Mulai belajar <ArrowRight size={19} weight="bold" /></button>
              <button className="text-sm font-medium text-slate-400 hover:text-slate-600" formAction={skipOnboardingAction} type="submit">Atur nanti aja</button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export { OnboardingForm };
