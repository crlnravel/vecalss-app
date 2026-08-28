"use client";

import Link from "next/link";
import { Plus } from "@/lib/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { getQuizWithStoredDrafts } from "@/modules/mentor/quiz-draft-storage";
import { getQuestionBankCatalog } from "@/modules/mentor/question-bank-draft-storage";
import {
  Field,
  FieldInput,
  FieldLabel,
} from "@/components/ui/field";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import type { SessionContext } from "@/lib/auth/types";
import {
  DropdownField,
  PageIntro,
  ResourceRow,
  SearchPanel,
  StatusPill,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  questionBanks,
  quizzes,
  tryouts,
  type KaptenQuiz,
  type KaptenTryout,
} from "@/modules/mentor/mock-data";
import { ProfilePhotoEditor } from "@/modules/student/components/profile-photo-editor";

function CreateButton({ href, label }: { href: string; label: string }) {
  return (
    <Button render={<Link href={href} />} variant="brand">
      <Plus />
      {label}
    </Button>
  );
}

function KaptenQuizPageModule({ persistedQuizzes, session }: { persistedQuizzes: KaptenQuiz[]; session: SessionContext }) {
  const baseQuizzes = useMemo(() => [...persistedQuizzes, ...quizzes], [persistedQuizzes]);
  const [displayQuizzes, setDisplayQuizzes] = useState(baseQuizzes);

  useEffect(() => {
    const syncStoredDrafts = () => setDisplayQuizzes(getQuizWithStoredDrafts(session.user.id, baseQuizzes));

    syncStoredDrafts();
    window.addEventListener("storage", syncStoredDrafts);
    return () => window.removeEventListener("storage", syncStoredDrafts);
  }, [baseQuizzes, session.user.id]);

  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      searchPlaceholder="Cari kuis, subjek, atau bank soal..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/quiz/create" label="Buat Quiz" />}
        title="Quiz"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari kuis atau subjek..." />
        <div className="space-y-2">
          {displayQuizzes.map((quiz) => (
            <ResourceRow key={quiz.id} resource={quiz} />
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

function KaptenQuestionBankPageModule({
  session,
}: {
  session: SessionContext;
}) {
  const [displayBanks, setDisplayBanks] = useState(() =>
    questionBanks.map((bank) => ({
      ...bank,
      href: `/mentor/quiz/question-bank/${bank.id}`,
    })),
  );

  useEffect(() => {
    const syncStoredDrafts = () => {
      setDisplayBanks(
        getQuestionBankCatalog().map(({ bank }) => ({
          ...bank,
          href: `/mentor/quiz/question-bank/${bank.id}`,
        })),
      );
    };

    syncStoredDrafts();
    window.addEventListener("storage", syncStoredDrafts);
    window.addEventListener("vecalss-question-bank-drafts-change", syncStoredDrafts);
    return () => {
      window.removeEventListener("storage", syncStoredDrafts);
      window.removeEventListener("vecalss-question-bank-drafts-change", syncStoredDrafts);
    };
  }, []);

  return (
    <MentorWorkspaceShell
      activeLabel="Bank Soal"
      breadcrumbLabel="Bank Soal"
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
    >
      <PageIntro
        action={
          <CreateButton
            href="/mentor/quiz/question-bank/create"
            label="Buat Bank Soal"
          />
        }
        title="Bank Soal"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari bank soal, topik, atau sumber..." />
        <div className="space-y-2">
          {displayBanks.map((bank) => (
            <ResourceRow key={bank.id} resource={bank} />
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

function TryoutRow({ tryout }: { tryout: KaptenTryout }) {
  return (
    <div
      className="border-t border-primary-100 py-5 first:border-t-0 first:pt-0"
      id={tryout.id}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-xl leading-tight font-semibold text-secondary-900">
              {tryout.title}
            </h2>
            <StatusPill status={tryout.status} />
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-500">
            {tryout.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-secondary-600">
            {tryout.sections.map((section) => (
              <span key={section.title}>
                {section.title}: {section.questionCount} soal, {section.duration}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-5 lg:text-right">
          <p className="text-sm font-semibold text-secondary-900">
            {tryout.primaryMetric}
          </p>
          <Button render={<Link href={tryout.href} />} size="sm" variant="brandOutline">
            Buka
          </Button>
        </div>
      </div>
    </div>
  );
}

function KaptenTryoutPageModule({ session }: { session: SessionContext }) {

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      searchPlaceholder="Cari tryout, subtest, atau paket..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/tryout#create" label="Buat Tryout" />}
        title="Tryout"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari tryout, subtest, atau paket..." />
        <div className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm">
          {tryouts.map((tryout) => (
            <TryoutRow key={tryout.id} tryout={tryout} />
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ") || "",
  };
}

function getInitials(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function SettingsSection({
  children,
  description,
  id,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  title: string;
}) {
  const titleId = `${id}-title`;

  return (
    <ReferenceSurface
      aria-labelledby={titleId}
      as="section"
      className="grid gap-6 p-5 sm:p-6"
      id={id}
    >
      <div className="max-w-xl">
        <h2
          className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900 md:text-2xl"
          id={titleId}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-secondary-500">{description}</p>
      </div>
      <div>{children}</div>
    </ReferenceSurface>
  );
}

function KaptenSettingsPageModule({ session }: { session: SessionContext }) {
  const initials = getInitials(session.user.fullName);
  const { firstName, lastName } = splitName(session.user.fullName);

  return (
    <MentorWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      mainClassName="max-w-[1200px] gap-8 px-4 py-6 md:px-6 lg:py-8"
      searchPlaceholder="Cari pengaturan workspace..."
      session={session}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader
        description="Kelola profil dan workspace konten Kapten."
        title="Pengaturan"
      />

      <div className="grid min-w-0 gap-6">
          <SettingsSection
            description="Atur detail akun Kapten."
            id="akun"
            title="Profil"
          >
            <div className="grid gap-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-first-name">
                    Nama depan
                  </FieldLabel>
                  <FieldInput
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    defaultValue={firstName}
                    id="kapten-first-name"
                  />
                </Field>

                <Field>
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-last-name">
                    Nama belakang
                  </FieldLabel>
                  <FieldInput
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    defaultValue={lastName}
                    id="kapten-last-name"
                  />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-email">
                    Email
                  </FieldLabel>
                  <FieldInput
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    defaultValue={session.user.email}
                    id="kapten-email"
                    type="email"
                  />
                </Field>
              </div>

              <div className="grid w-fit max-w-full min-w-0 gap-2">
                <p className="text-xs font-semibold leading-5 tracking-[0.04em] text-secondary-600">
                  Profile picture
                </p>
                <div className="flex w-fit max-w-full min-w-0 justify-start rounded-3xl border border-primary-100/80 bg-primary-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_8px_rgba(23,107,77,0.08)]">
                  <ProfilePhotoEditor initials={initials} showLabel={false} />
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            description="Sesuaikan area kerja konten."
            id="workspace"
            title="Workspace"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-default-subject">
                  Subjek utama
                </FieldLabel>
                <DropdownField
                  className={REFERENCE_CONTROL_CLASS_NAMES.select}
                  id="kapten-default-subject"
                  onValueChange={() => undefined}
                  options={kaptenSubjects.map((subject) => ({ label: `${subject.code} - ${subject.name}`, value: subject.code }))}
                  placeholder="Pilih subjek"
                  value="PU"
                />
              </Field>

              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-language">
                  Bahasa konten
                </FieldLabel>
                <DropdownField
                  className={REFERENCE_CONTROL_CLASS_NAMES.select}
                  id="kapten-language"
                  onValueChange={() => undefined}
                  options={[{ label: "Indonesia", value: "id" }, { label: "Inggris", value: "en" }]}
                  placeholder="Pilih bahasa"
                  value="id"
                />
              </Field>
            </div>
          </SettingsSection>
      </div>
    </MentorWorkspaceShell>
  );
}

export {
  KaptenQuestionBankPageModule,
  KaptenQuizPageModule,
  KaptenSettingsPageModule,
  KaptenTryoutPageModule,
};
