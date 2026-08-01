"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Target, UserRound } from "lucide-react";

import {
  Field,
  FieldInput,
  FieldLabel,
  fieldControlClassName,
} from "@/components/ui/field";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import type {
  ExamEvent,
  Major,
  StudentProfile,
  University,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { saveProfileAction } from "@/modules/student/actions";
import { ProfilePhotoEditor } from "@/modules/student/components/profile-photo-editor";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

type ProfileData = StudentProfile & {
  targetExamEvent: ExamEvent | null;
  targetMajor: Major | null;
  targetUniversity: University | null;
};

type ProfileOptionData = {
  examEvents: ExamEvent[];
  majors: Array<Major & { university: University }>;
  universities: University[];
};

const onboardingStatusLabel: Record<StudentProfile["onboardingStatus"], string> = {
  completed: "Profil lengkap",
  not_started: "Belum dimulai",
  skipped: "Dilanjutkan nanti",
};

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileSection({
  children,
  description,
  id,
  title,
}: {
  children: React.ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  return (
    <section
      className="grid gap-6 border-t border-primary-100 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10"
      id={id}
    >
      <div>
        <h2 className="text-xl leading-tight font-semibold text-secondary-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-secondary-500">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function SelectField({
  children,
  id,
  label,
  name,
  onChange,
  value,
}: {
  children: React.ReactNode;
  id: string;
  label: string;
  name?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          className={`${fieldControlClassName} appearance-none pr-12`}
          id={id}
          name={name ?? id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
      </div>
    </Field>
  );
}

function SettingsPageModule({
  examEvents,
  majors,
  profile,
  session,
  universities,
}: ProfileOptionData & {
  profile: ProfileData;
  session: SessionContext;
}) {
  const [state, formAction] = useActionState(saveProfileAction, EMPTY_FORM_STATE);
  const [targetExamEventId, setTargetExamEventId] = useState(profile.targetExamEventId ?? "");
  const [targetUniversityId, setTargetUniversityId] = useState(profile.targetUniversityId ?? "");
  const [targetMajorId, setTargetMajorId] = useState(profile.targetMajorId ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);

  const availableMajors = useMemo(
    () => (targetUniversityId ? majors.filter((major) => major.universityId === targetUniversityId) : majors),
    [majors, targetUniversityId],
  );

  function handleUniversityChange(nextUniversityId: string) {
    setTargetUniversityId(nextUniversityId);

    const selectedMajor = majors.find((major) => major.id === targetMajorId);
    if (selectedMajor && selectedMajor.universityId !== nextUniversityId) {
      setTargetMajorId("");
    }
  }

  const statusLabel = onboardingStatusLabel[profile.onboardingStatus];
  const initials = getInitials(session.user.fullName);

  return (
    <StudentWorkspaceShell
      activeLabel="Profil"
      breadcrumbLabel="Profil"
      mainClassName="max-w-[1240px] gap-6 px-3 py-6 md:px-6 lg:px-8"
      searchPlaceholder="Cari di profil..."
      session={session}
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary-700 uppercase">Ruang belajarmu</p>
          <h1 className="mt-2 text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">Profil</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary-500 md:text-base">
            Kelola identitas akun dan target belajar yang kamu pilih saat onboarding.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-100 bg-white px-4 py-2 text-sm font-medium text-secondary-700 shadow-sm">
          <CheckCircle2 className="size-4 text-primary-700" />
          {statusLabel}
        </div>
      </header>

      <form action={formAction} className="mt-5 space-y-8">
        {state.message ? (
          <FormNotice tone={state.status === "error" ? "danger" : "success"}>{state.message}</FormNotice>
        ) : null}

        <ProfileSection
          description="Informasi ini digunakan untuk menyapa kamu di ruang belajar."
          id="profil"
          title="Data diri"
        >
          <div className="grid gap-6 rounded-4xl border border-primary-100 bg-white p-5 shadow-[0_18px_54px_-42px_rgba(1,76,56,0.45)] md:p-6 xl:grid-cols-[minmax(0,1fr)_170px]">
            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="profile-full-name">Nama lengkap</FieldLabel>
                <FieldInput
                  aria-invalid={Boolean(state.fieldErrors?.fullName)}
                  defaultValue={state.fields?.fullName ?? session.user.fullName}
                  id="profile-full-name"
                  name="fullName"
                  required
                />
                {state.fieldErrors?.fullName ? <p className="text-sm text-danger-700">{state.fieldErrors.fullName}</p> : null}
              </Field>

              <Field>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <FieldInput
                  aria-describedby="profile-email-note"
                  className="bg-secondary-50 text-secondary-500"
                  defaultValue={session.user.email}
                  id="profile-email"
                  readOnly
                  type="email"
                />
                <p className="text-sm leading-5 text-secondary-500" id="profile-email-note">
                  Email dikelola oleh admin dan belum bisa diubah dari sini.
                </p>
              </Field>
            </div>
            <ProfilePhotoEditor initials={initials} />
          </div>
        </ProfileSection>

        <ProfileSection
          description="Target ini berasal dari onboarding dan bisa kamu sesuaikan kapan saja."
          id="target-belajar"
          title="Target belajar"
        >
          <div className="rounded-4xl border border-primary-100 bg-white p-5 shadow-[0_18px_54px_-42px_rgba(1,76,56,0.45)] md:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <SelectField
                id="profile-target-exam"
                label="Ujian target"
                name="targetExamEventId"
                onChange={setTargetExamEventId}
                value={targetExamEventId}
              >
                <option value="">Pilih nanti</option>
                {examEvents.map((examEvent) => (
                  <option key={examEvent.id} value={examEvent.id}>{examEvent.name}</option>
                ))}
              </SelectField>

              <SelectField
                id="profile-target-university"
                label="Kampus tujuan"
                name="targetUniversityId"
                onChange={handleUniversityChange}
                value={targetUniversityId}
              >
                <option value="">Pilih nanti</option>
                {universities.map((university) => (
                  <option key={university.id} value={university.id}>
                    {university.shortName ? `${university.shortName} — ${university.name}` : university.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="profile-target-major"
                label="Jurusan tujuan"
                name="targetMajorId"
                onChange={setTargetMajorId}
                value={targetMajorId}
              >
                <option value="">Pilih nanti</option>
                {availableMajors.map((major) => (
                  <option key={major.id} value={major.id}>
                    {major.name}{!targetUniversityId ? ` · ${major.university.shortName ?? major.university.name}` : ""}
                  </option>
                ))}
              </SelectField>
            </div>

            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-primary-100 bg-primary-50/45 p-4 text-sm leading-6 text-secondary-600">
              <Target className="mt-0.5 size-5 shrink-0 text-primary-700" />
              <p>Perubahan target akan dipakai untuk menyesuaikan rekomendasi materi, kuis, dan tryout di dashboard.</p>
            </div>
          </div>
        </ProfileSection>

        <ProfileSection
          description="Preferensi yang digunakan untuk menampilkan waktu dan jadwal belajarmu."
          id="preferensi"
          title="Preferensi belajar"
        >
          <div className="rounded-4xl border border-primary-100 bg-white p-5 shadow-[0_18px_54px_-42px_rgba(1,76,56,0.45)] md:p-6">
            <SelectField
              id="profile-timezone"
              label="Zona waktu"
              name="timezone"
              onChange={setTimezone}
              value={timezone}
            >
              <option value="Asia/Jakarta">WIB — Asia/Jakarta</option>
              <option value="Asia/Makassar">WITA — Asia/Makassar</option>
              <option value="Asia/Jayapura">WIT — Asia/Jayapura</option>
            </SelectField>
          </div>
        </ProfileSection>

        <div className="flex flex-col gap-3 border-t border-primary-100 pt-6 sm:flex-row sm:items-center sm:justify-end">
          <p className="flex items-center gap-2 text-sm text-secondary-500 sm:mr-auto">
            <UserRound className="size-4 text-primary-700" /> Data profil tersimpan aman di akunmu.
          </p>
          <SubmitButton pendingLabel="Menyimpan profil..." size="lg" type="submit" variant="brand">
            Simpan profil
          </SubmitButton>
        </div>
      </form>
    </StudentWorkspaceShell>
  );
}

export { SettingsPageModule };
