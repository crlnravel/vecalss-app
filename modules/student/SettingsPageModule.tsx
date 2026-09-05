"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ChevronDown } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
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
import type { StudentNotificationFeed } from "@/lib/notifications/types";
import { saveProfileAction } from "@/modules/student/actions";
import { ProfilePhotoEditor } from "@/modules/student/components/profile-photo-editor";
import { StudentWorkspaceShell } from "@/modules/student/components/student-workspace-shell";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";
import { cn } from "@/lib/utils";

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
      className="grid gap-5 py-2 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8"
      id={id}
    >
      <div>
        <h2 className="text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900">{title}</h2>
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
      <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={id}>{label}</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          id={id}
          render={<Button className={cn(REFERENCE_CONTROL_CLASS_NAMES.select, "font-normal")} variant="context" />}
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
  notificationFeed,
  profile,
  returnToHref,
  session,
  universities,
}: ProfileOptionData & {
  profile: ProfileData;
  notificationFeed?: StudentNotificationFeed;
  session: SessionContext;
  returnToHref?: string;
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
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari di profil..."
      session={session}
    >
      <form action={formAction} className="space-y-8">
        <ProfileFormContent>
        <ReferencePageHeader
          actions={<div className="flex flex-wrap items-center gap-2">{returnToHref ? <Button nativeButton={false} render={<Link href={returnToHref} />} size="lg" variant="ghost">Kembali</Button> : null}<SubmitButton pendingLabel="Menyimpan..." size="lg" type="submit" variant="brand">Simpan</SubmitButton></div>}
          title="Profil"
        />

        {state.message ? (
          <FormNotice tone={state.status === "error" ? "danger" : "success"}>{state.message}</FormNotice>
        ) : null}

        <ProfileSection
          id="profil"
          title="Data diri"
        >
          <ReferenceSurface className="grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_170px]">
            <div className="grid gap-5">
              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="profile-full-name">Nama lengkap</FieldLabel>
                <FieldInput
                  className={REFERENCE_CONTROL_CLASS_NAMES.input}
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
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="profile-email">Email</FieldLabel>
                <FieldInput
                  className={cn(REFERENCE_CONTROL_CLASS_NAMES.input, "bg-secondary-50 text-secondary-500")}
                  defaultValue={session.user.email}
                  id="profile-email"
                  readOnly
                  type="email"
                />
              </Field>
            </div>
            <ProfilePhotoEditor initials={initials} />
          </ReferenceSurface>
        </ProfileSection>

        <ProfileSection
          id="target-belajar"
          title="Target belajar"
        >
          <ReferenceSurface className="p-5 md:p-6">
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

          </ReferenceSurface>
        </ProfileSection>

        {hasUnsavedChanges ? (
          <div
            aria-live="polite"
            className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-3xl border border-primary-200 bg-white/95 p-3 pl-4 shadow-[0_18px_48px_-24px_rgba(1,76,56,0.45)] transition-opacity transition-transform duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
