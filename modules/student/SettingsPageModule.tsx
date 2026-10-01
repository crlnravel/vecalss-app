"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Target, UserRound, type AppIcon } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import {
  ReferenceSelectField,
  ReferenceSurface,
} from "@/components/dashboard";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
} from "@/components/ui/field";
import { useActionToast } from "@/components/ui/use-action-toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
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
  icon: Icon,
  id,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  icon: AppIcon;
  id: string;
  title: string;
}) {
  return (
    <section
      className="grid gap-5 py-2 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8"
      id={id}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-voyage-sea-glass text-voyage-deep">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-xl leading-tight font-extrabold tracking-[-0.025em] text-voyage-ink">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-6 text-learning-muted-ink">{description}</p> : null}
        </div>
      </div>
      <div>{children}</div>
    </section>
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
  const [state, formAction, isPending] = useActionState(saveProfileAction, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const keepMessageInline = useActionToast(state);
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

  usePageStatusToast({
    active: hasUnsavedChanges || isPending,
    message: isPending ? "Menyimpan perubahan…" : "Ada perubahan yang belum disimpan",
    variant: "info",
    action: hasUnsavedChanges && !isPending
      ? { label: "Simpan", onClick: () => formRef.current?.requestSubmit() }
      : undefined,
    cancel: hasUnsavedChanges && !isPending
      ? { label: "Batal", onClick: handleResetChanges }
      : undefined,
  });

  return (
    <StudentWorkspaceShell
      activeLabel="Profil"
      breadcrumbLabel="Profil"
      mainClassName="max-w-[1240px] gap-6 px-3 py-6 md:px-6 lg:px-8"
      notificationFeed={notificationFeed}
      searchPlaceholder="Cari di profil..."
      session={session}
    >
      <form action={formAction} className="space-y-8" ref={formRef}>
        <ProfileFormContent>
        <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-extrabold tracking-[-0.035em] text-voyage-ink">Profil</h1>
          <div className="flex flex-wrap items-center gap-2">
            {returnToHref ? (
              <Button
                nativeButton={false}
                render={<Link href={returnToHref} />}
                size="default"
                variant="outline"
              >
                Kembali
              </Button>
            ) : null}
            <SubmitButton
              className="bg-student-status-attention-solid-bg text-student-status-attention-solid-fg hover:bg-voyage-warm-sun/90"
              pendingLabel="Menyimpan…"
              size="default"
              type="submit"
              variant="default"
            >
              Simpan perubahan
            </SubmitButton>
          </div>
        </header>

        {state.message && keepMessageInline ? (
          <FormNotice tone={state.status === "error" ? "danger" : "success"}>{state.message}</FormNotice>
        ) : null}

        <ProfileSection
          description="Pastikan nama dan foto profil tetap mudah dikenali."
          icon={UserRound}
          id="profil"
          title="Data diri"
        >
          <ReferenceSurface className="grid gap-6 border-learning-card-border p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_170px]">
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
                <FieldError error={state.fieldErrors?.fullName} id="profile-full-name-error" />
              </Field>

              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="profile-email">Email</FieldLabel>
                <FieldInput
                  className={REFERENCE_CONTROL_CLASS_NAMES.input}
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
          description="Pilih tujuan yang menjadi acuan ritme dan prioritas belajarmu."
          icon={Target}
          id="target-belajar"
          title="Target belajar"
        >
          <ReferenceSurface className="border-learning-card-border p-5 md:p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <ReferenceSelectField
                className="font-normal"
                id="profile-target-exam"
                label="Ujian target"
                name="targetExamEventId"
                onValueChange={setTargetExamEventId}
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...examEvents.map((examEvent) => ({ label: examEvent.name, value: examEvent.id })),
                ]}
                value={targetExamEventId}
              />

              <ReferenceSelectField
                className="font-normal"
                id="profile-target-university"
                label="Kampus tujuan"
                name="targetUniversityId"
                onValueChange={handleUniversityChange}
                options={[
                  { label: "Pilih nanti", value: "" },
                  ...universities.map((university) => ({
                    label: university.shortName ? `${university.shortName} — ${university.name}` : university.name,
                    value: university.id,
                  })),
                ]}
                value={targetUniversityId}
              />

              <ReferenceSelectField
                className="font-normal"
                id="profile-target-major"
                label="Jurusan tujuan"
                name="targetMajorId"
                onValueChange={setTargetMajorId}
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

        </ProfileFormContent>
      </form>
    </StudentWorkspaceShell>
  );
}

export { SettingsPageModule };
