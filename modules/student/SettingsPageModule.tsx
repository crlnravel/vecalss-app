"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, ChevronDown } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldInput,
  FieldLabel,
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
  description?: string;
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
        {description ? <p className="mt-2 text-sm leading-6 text-secondary-500">{description}</p> : null}
      </div>
      <div>{children}</div>
    </section>
  );
}

function SelectField({
  id,
  label,
  name,
  onChange,
  options,
  value,
}: {
  id: string;
  label: string;
  name?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "Pilih nanti";

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          id={id}
          render={<Button className="w-full justify-between rounded-2xl border-secondary-900/14 bg-white px-5 text-left text-[15px] font-normal text-secondary-900 hover:border-primary-300 hover:bg-primary-50/40" variant="context" />}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-secondary-500" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--anchor-width)">
          <DropdownMenuRadioGroup onValueChange={(nextValue) => onChange(String(nextValue))} value={value}>
            {options.map((option) => (
              <DropdownMenuRadioItem closeOnClick key={option.value || "empty"} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input name={name ?? id} type="hidden" value={value} />
    </Field>
  );
}

function ProfileFormContent({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <fieldset aria-busy={pending} className="contents" disabled={pending}>
      {children}
    </fieldset>
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
  const [fullName, setFullName] = useState(() => session.user.fullName);
  const [targetExamEventId, setTargetExamEventId] = useState(() => profile.targetExamEventId ?? "");
  const [targetUniversityId, setTargetUniversityId] = useState(() => profile.targetUniversityId ?? "");
  const [targetMajorId, setTargetMajorId] = useState(() => profile.targetMajorId ?? "");

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

  const initials = getInitials(fullName || session.user.fullName);
  const hasUnsavedChanges = useMemo(
    () =>
      fullName.trim() !== session.user.fullName.trim() ||
      targetExamEventId !== (profile.targetExamEventId ?? "") ||
      targetUniversityId !== (profile.targetUniversityId ?? "") ||
      targetMajorId !== (profile.targetMajorId ?? ""),
    [
      fullName,
      profile.targetExamEventId,
      profile.targetMajorId,
      profile.targetUniversityId,
      session.user.fullName,
      targetExamEventId,
      targetMajorId,
      targetUniversityId,
    ],
  );

  function handleResetChanges() {
    setFullName(session.user.fullName);
    setTargetExamEventId(profile.targetExamEventId ?? "");
    setTargetUniversityId(profile.targetUniversityId ?? "");
    setTargetMajorId(profile.targetMajorId ?? "");
  }

  return (
    <StudentWorkspaceShell
      activeLabel="Profil"
      breadcrumbLabel="Profil"
      mainClassName="max-w-[1240px] gap-6 px-3 py-6 md:px-6 lg:px-8"
      searchPlaceholder="Cari di profil..."
      session={session}
    >
      <form action={formAction} className="space-y-8">
        <ProfileFormContent>
        <header className="flex flex-col gap-5 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">Profil</h1>
          </div>
          <SubmitButton pendingLabel="Menyimpan..." size="lg" type="submit" variant="brand">
            Simpan
          </SubmitButton>
        </header>

        {state.message ? (
          <FormNotice tone={state.status === "error" ? "danger" : "success"}>{state.message}</FormNotice>
        ) : null}

        <ProfileSection
          id="profil"
          title="Data diri"
        >
          <div className="grid gap-6 rounded-4xl border border-primary-100 bg-white p-5 shadow-[0_18px_54px_-42px_rgba(1,76,56,0.45)] md:p-6 xl:grid-cols-[minmax(0,1fr)_170px]">
            <div className="grid gap-5">
              <Field>
                <FieldLabel htmlFor="profile-full-name">Nama lengkap</FieldLabel>
                <FieldInput
                  aria-describedby={state.fieldErrors?.fullName ? "profile-full-name-error" : undefined}
                  aria-invalid={Boolean(state.fieldErrors?.fullName)}
                  onChange={(event) => setFullName(event.target.value)}
                  value={fullName}
                  id="profile-full-name"
                  name="fullName"
                  required
                />
                {state.fieldErrors?.fullName ? (
                  <p className="text-sm text-danger-700" id="profile-full-name-error">
                    {state.fieldErrors.fullName}
                  </p>
                ) : null}
              </Field>

              <Field>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <FieldInput
                  className="bg-secondary-50 text-secondary-500"
                  defaultValue={session.user.email}
                  id="profile-email"
                  readOnly
                  type="email"
                />
              </Field>
            </div>
            <ProfilePhotoEditor initials={initials} />
          </div>
        </ProfileSection>

        <ProfileSection
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
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id })),
                ]}
                value={targetExamEventId}
              />

              <SelectField
                id="profile-target-university"
                label="Kampus tujuan"
                name="targetUniversityId"
                onChange={handleUniversityChange}
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...universities.map((university) => ({
                    label: university.shortName ? `${university.shortName} — ${university.name}` : university.name,
                    value: university.id,
                  })),
                ]}
                value={targetUniversityId}
              />

              <SelectField
                id="profile-target-major"
                label="Jurusan tujuan"
                name="targetMajorId"
                onChange={setTargetMajorId}
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...availableMajors.map((major) => ({
                    label: `${major.name}${!targetUniversityId ? ` · ${major.university.shortName ?? major.university.name}` : ""}`,
                    value: major.id,
                  })),
                ]}
                value={targetMajorId}
              />
            </div>

          </div>
        </ProfileSection>

        {hasUnsavedChanges ? (
          <div
            aria-live="polite"
            className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-3xl border border-primary-200 bg-white/95 p-3 pl-4 shadow-[0_18px_48px_-24px_rgba(1,76,56,0.45)] duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            role="status"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center text-[#176b4d]">
                <AlertCircle className="size-5" strokeWidth={2.2} />
              </span>
              <p className="text-sm font-medium leading-5 text-secondary-800">Ada perubahan yang belum disimpan.</p>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
              <Button
                className="w-32 justify-center text-student-status-danger-fg hover:bg-student-status-danger-bg hover:text-student-status-danger-solid-bg"
                onClick={handleResetChanges}
                size="sm"
                type="button"
                variant="ghost"
              >
                Batal
              </Button>
              <SubmitButton className="w-32 justify-center" pendingLabel="Menyimpan..." size="sm" type="submit" variant="brand">
                Simpan
              </SubmitButton>
            </div>
          </div>
        ) : null}
        </ProfileFormContent>
      </form>
    </StudentWorkspaceShell>
  );
}

export { SettingsPageModule };
