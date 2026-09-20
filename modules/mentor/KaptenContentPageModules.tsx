"use client";

import Link from "next/link";
import { Plus } from "@/lib/icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ReferencePageHeader, ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
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
import { saveKaptenSettingsAction } from "@/modules/mentor/settings-actions";
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

type KaptenSettings = {
  contentLanguage: "id" | "en";
  email: string;
  profileName: string;
  savedAt: string | null;
  subjectCode: "PU" | "PPU" | "PBM" | "PK" | "LBI" | "LBE" | "PM";
  userId: string;
};

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
      href: `/mentor/quiz/question-bank/${bank.id}?purpose=quiz`,
    })),
  );

  useEffect(() => {
    const syncStoredDrafts = () => {
      setDisplayBanks(
        getQuestionBankCatalog().map(({ bank }) => ({
          ...bank,
          href: `/mentor/quiz/question-bank/${bank.id}?purpose=quiz`,
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
      activeLabel="Bank Soal Kuis"
      breadcrumbLabel="Bank Soal Kuis"
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
    >
      <PageIntro
        action={
          <CreateButton
            href="/mentor/quiz/question-bank/create?purpose=quiz"
            label="Buat Bank Soal"
          />
        }
        title="Bank Soal Kuis"
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
          <Button render={<Link href={tryout.href} />} size="default" variant="brandOutline">
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

function KaptenSettingsPageModule({
  initialSettings,
  session,
}: {
  initialSettings: KaptenSettings;
  session: SessionContext;
}) {
  const [savedSettings, setSavedSettings] = useState(() => initialSettings);
  const [draft, setDraft] = useState(() => initialSettings);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const dirty =
    draft.profileName !== savedSettings.profileName ||
    draft.email !== savedSettings.email ||
    draft.subjectCode !== savedSettings.subjectCode ||
    draft.contentLanguage !== savedSettings.contentLanguage;
  const saving = status === "saving";

  const updateDraft = <K extends "profileName" | "email" | "subjectCode" | "contentLanguage">(
    key: K,
    value: KaptenSettings[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving) return;

    setStatus("saving");
    let result: Awaited<ReturnType<typeof saveKaptenSettingsAction>>;
    try {
      result = await saveKaptenSettingsAction({
        contentLanguage: draft.contentLanguage,
        email: draft.email,
        profileName: draft.profileName,
        subjectCode: draft.subjectCode,
      });
    } catch {
      setStatus("idle");
      showToast("Pengaturan belum tersimpan. Coba lagi.", { variant: "error" });
      return;
    }

    if (!result.ok) {
      setStatus("idle");
      showToast(result.message, { variant: "error" });
      return;
    }

    setSavedSettings(result.settings);
    setDraft(result.settings);
    setStatus("idle");
    showToast(result.message, { variant: "success" });
  };

  const handleCancel = () => {
    setDraft(savedSettings);
    setStatus("idle");
  };

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

      <form className="grid min-w-0 gap-6" onSubmit={handleSubmit}>
          <SettingsSection
            description="Atur detail akun Kapten."
            id="akun"
            title="Profil"
          >
            <div className="grid gap-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-profile-name" required>
                    Nama profil
                  </FieldLabel>
                  <FieldInput
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    id="kapten-profile-name"
                    onChange={(event) => updateDraft("profileName", event.target.value)}
                    value={draft.profileName}
                  />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-tutor-email" required>
                    Email tutor
                  </FieldLabel>
                  <FieldInput
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    id="kapten-tutor-email"
                    onChange={(event) => updateDraft("email", event.target.value)}
                    type="email"
                    value={draft.email}
                  />
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-user-id">
                    User ID
                  </FieldLabel>
                  <FieldInput
                    aria-describedby="kapten-user-id-help"
                    className={REFERENCE_CONTROL_CLASS_NAMES.input}
                    disabled
                    id="kapten-user-id"
                    readOnly
                    value={draft.userId}
                  />
                  <p className="text-xs leading-5 text-secondary-500" id="kapten-user-id-help">
                    User ID hanya untuk referensi dan tidak dapat diubah.
                  </p>
                </Field>
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
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-default-subject" required>
                  Subjek utama
                </FieldLabel>
                <DropdownField
                  className={REFERENCE_CONTROL_CLASS_NAMES.select}
                  id="kapten-default-subject"
                  onValueChange={(value) => updateDraft("subjectCode", value as KaptenSettings["subjectCode"])}
                  options={kaptenSubjects.map((subject) => ({ label: `${subject.code} - ${subject.name}`, value: subject.code }))}
                  placeholder="Pilih subjek"
                  value={draft.subjectCode}
                />
              </Field>

              <Field>
                <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor="kapten-language" required>
                  Bahasa konten
                </FieldLabel>
                <DropdownField
                  className={REFERENCE_CONTROL_CLASS_NAMES.select}
                  id="kapten-language"
                  onValueChange={(value) => updateDraft("contentLanguage", value as KaptenSettings["contentLanguage"])}
                  options={[{ label: "Indonesia", value: "id" }, { label: "Inggris", value: "en" }]}
                  placeholder="Pilih bahasa"
                  value={draft.contentLanguage}
                />
              </Field>
            </div>
          </SettingsSection>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm leading-6 text-secondary-600">
              {dirty ? "Perubahan belum disimpan." : "Tidak ada perubahan."}
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button disabled={!dirty || saving} onClick={handleCancel} type="button" variant="brandOutline">
                Batal
              </Button>
              <Button disabled={!dirty || saving} type="submit" variant="reference">
                {saving ? "Menyimpan…" : "Simpan pengaturan"}
              </Button>
            </div>
          </div>
      </form>
    </MentorWorkspaceShell>
  );
}

export {
  KaptenQuestionBankPageModule,
  KaptenQuizPageModule,
  KaptenSettingsPageModule,
  KaptenTryoutPageModule,
};
