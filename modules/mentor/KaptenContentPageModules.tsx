"use client";

import Link from "next/link";
import {
  ChevronDown,
  FileImage,
  Folder,
  MoreVertical,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  getMateriWithStoredDrafts,
} from "@/modules/mentor/materi-draft-storage";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
  fieldControlClassName,
} from "@/components/ui/field";
import type { SessionContext } from "@/lib/auth/types";
import {
  EmptyState,
  PageIntro,
  ResourceRow,
  SearchPanel,
  SectionHeading,
  StatusPill,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  kaptenSubjects,
  mediaAssets,
  materi,
  questionBanks,
  quizzes,
  tryouts,
  type KaptenMediaAsset,
  type KaptenResource,
  type KaptenSubject,
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

function SubjectResourceSection({
  resources,
  subject,
}: {
  resources: KaptenResource[];
  subject: KaptenSubject;
}) {
  const subjectResources = resources.filter(
    (resource) => resource.subjectCode === subject.code,
  );

  return (
    <section className="space-y-3" id={subject.slug}>
      <SectionHeading title={`${subject.code} · ${subject.name}`} />
      <div className="space-y-2">
        {subjectResources.length > 0 ? (
          subjectResources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))
        ) : (
          <EmptyState
            actionLabel={`Buat ${subject.code}`}
            description="Subject ini belum punya resource dalam mock data."
            href="/mentor/materi/create"
            title={`Belum ada konten ${subject.code}`}
          />
        )}
      </div>
    </section>
  );
}

function KaptenMateriPageModule({ session }: { session: SessionContext }) {
  const [displayMateri, setDisplayMateri] = useState(materi);

  useEffect(() => {
    const syncStoredDrafts = () => setDisplayMateri(getMateriWithStoredDrafts(materi));

    syncStoredDrafts();
    window.addEventListener("storage", syncStoredDrafts);
    return () => window.removeEventListener("storage", syncStoredDrafts);
  }, []);

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      searchPlaceholder="Cari materi, video, atau subject..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/materi/create" label="Buat Materi" />}
        description="Kelola materi berdasarkan subject."
        title="Materi"
      />

      <div className="space-y-8">
        <SearchPanel placeholder="Cari judul materi, video, atau topik..." />
        {kaptenSubjects.map((subject) => (
          <SubjectResourceSection
            key={subject.code}
            resources={displayMateri}
            subject={subject}
          />
        ))}
      </div>
    </MentorWorkspaceShell>
  );
}

function KaptenQuizPageModule({ session }: { session: SessionContext }) {
  return (
    <MentorWorkspaceShell
      activeLabel="Quiz"
      breadcrumbLabel="Quiz"
      searchPlaceholder="Cari quiz, subject, atau question bank..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/quiz#create" label="Buat Quiz" />}
        description="Kelola quiz dan hubungkan ke question bank."
        title="Quiz"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari quiz atau subject..." />
        <div className="space-y-2">
          {quizzes.map((quiz) => (
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
  return (
    <MentorWorkspaceShell
      activeLabel="Question Bank"
      breadcrumbLabel="Question Bank"
      searchPlaceholder="Cari bank soal, topik, atau tingkat kesulitan..."
      session={session}
    >
      <PageIntro
        action={
          <CreateButton
            href="/mentor/quiz/question-bank#create"
            label="Buat Bank Soal"
          />
        }
        description="Soal reusable untuk quiz dan tryout."
        title="Question Bank"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari question bank, topic, atau source..." />
        <div className="space-y-2">
          {questionBanks.map((bank) => (
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
          <div>
            <p className="text-sm font-semibold text-secondary-900">
              {tryout.primaryMetric}
            </p>
            <p className="mt-1 text-xs text-secondary-500">
              {tryout.progress}% siap
            </p>
          </div>
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
        description="Susun paket tryout dan jadwal publikasi."
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

function MediaFolderButton({ label, count }: { count: string; label: string }) {
  return (
    <button
      className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3 text-left text-sm transition-colors hover:border-primary-200 hover:bg-primary-50/40"
      type="button"
    >
      <Folder className="size-5 text-primary-800" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-secondary-900">{label}</span>
        <span className="block text-xs text-secondary-500">{count}</span>
      </span>
    </button>
  );
}

function MediaFileRow({ asset }: { asset: KaptenMediaAsset }) {
  return (
    <Link
      className="grid gap-3 border-t border-primary-100 px-4 py-3 text-sm transition-colors first:border-t-0 hover:bg-primary-50/45 md:grid-cols-[minmax(0,1.45fr)_0.7fr_0.55fr_0.75fr_0.8fr_36px] md:items-center"
      href={asset.href}
      id={asset.id}
    >
      <div className="flex min-w-0 items-center gap-3">
        <FileImage className="size-5 shrink-0 text-primary-800" />
        <span className="truncate font-semibold text-secondary-900">
          {asset.title}
        </span>
      </div>
      <span className="text-secondary-500">{asset.mimeType}</span>
      <span className="text-secondary-500">{asset.fileSize}</span>
      <span className="text-secondary-500">{asset.dimensions}</span>
      <span className="text-secondary-500">{asset.updatedAt}</span>
      <span className="hidden justify-self-end text-secondary-400 md:block">
        <MoreVertical className="size-4" />
      </span>
    </Link>
  );
}

function KaptenMediaPageModule({ session }: { session: SessionContext }) {
  return (
    <MentorWorkspaceShell
      activeLabel="Media"
      breadcrumbLabel="Media"
      searchPlaceholder="Cari image asset..."
      session={session}
    >
      <PageIntro
        action={
          <Button render={<Link href="/mentor/media#upload" />} variant="brand">
            <Upload />
            Upload
          </Button>
        }
        title="Media"
      />

      <section className="space-y-6">
        <SearchPanel placeholder="Cari nama file, format, atau pemakaian..." />

        <div className="grid gap-3 md:grid-cols-3">
          <MediaFolderButton count="Materi thumbnails" label="Materi" />
          <MediaFolderButton count="Tryout covers" label="Tryout" />
          <MediaFolderButton count="Unused assets" label="Belum dipakai" />
        </div>

        <div className="overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[minmax(0,1.45fr)_0.7fr_0.55fr_0.75fr_0.8fr_36px] gap-3 border-b border-primary-100 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-secondary-400 md:grid">
            <span>Nama</span>
            <span>Format</span>
            <span>Ukuran</span>
            <span>Dimensi</span>
            <span>Terakhir</span>
            <span />
          </div>
          <div>
            {mediaAssets.map((asset) => (
              <MediaFileRow asset={asset} key={asset.id} />
            ))}
          </div>
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

const settingsTabs = [
  { label: "Akun", active: true },
  { label: "Workspace" },
  { label: "Publikasi" },
  { label: "Notifikasi" },
  { label: "Keamanan" },
];

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
  return (
    <section
      className="grid gap-6 border-t border-primary-100 py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10"
      id={id}
    >
      <div>
        <h2 className="text-xl leading-tight font-semibold text-secondary-900">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-secondary-500">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function KaptenSettingsPageModule({ session }: { session: SessionContext }) {
  const initials = getInitials(session.user.fullName);
  const { firstName, lastName } = splitName(session.user.fullName);

  return (
    <MentorWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      mainClassName="max-w-[1460px] gap-6 px-3 py-6 md:px-6 lg:px-8"
      searchPlaceholder="Cari pengaturan workspace..."
      session={session}
    >
      <div>
        <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
          Pengaturan
        </h1>
        <p className="mt-2 text-sm leading-6 text-secondary-500">
          Atur akun dan preferensi workspace.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {settingsTabs.map((tab) => (
            <button
              className={[
                "inline-flex rounded-full px-4 py-2 text-sm font-medium transition-colors",
                tab.active
                  ? "bg-primary-700 text-white"
                  : "bg-secondary-100 text-secondary-700 hover:bg-primary-50 hover:text-primary-800",
              ].join(" ")}
              key={tab.label}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <SettingsSection
          description="Atur detail akun Kapten."
          id="akun"
          title="Profil"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_180px]">
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="kapten-first-name">Nama depan</FieldLabel>
                <FieldInput defaultValue={firstName} id="kapten-first-name" />
              </Field>

              <Field>
                <FieldLabel htmlFor="kapten-last-name">Nama belakang</FieldLabel>
                <FieldInput defaultValue={lastName} id="kapten-last-name" />
              </Field>

              <Field className="md:col-span-2">
                <FieldLabel htmlFor="kapten-email">Email</FieldLabel>
                <FieldInput
                  className="border-primary-300/60 shadow-[0_0_0_2px_rgba(122,189,168,0.16)]"
                  defaultValue={session.user.email}
                  id="kapten-email"
                  type="email"
                />
              </Field>
            </div>

            <ProfilePhotoEditor initials={initials} />
          </div>
        </SettingsSection>

        <SettingsSection
          description="Sesuaikan area kerja konten."
          id="workspace"
          title="Workspace"
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="kapten-default-subject">Subject utama</FieldLabel>
              <div className="relative">
                <select
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  defaultValue="PU"
                  id="kapten-default-subject"
                >
                  {kaptenSubjects.map((subject) => (
                    <option key={subject.code} value={subject.code}>
                      {subject.code} - {subject.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="kapten-timezone">Zona waktu</FieldLabel>
              <div className="relative">
                <select
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  defaultValue="Asia/Jakarta"
                  id="kapten-timezone"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta</option>
                  <option value="Asia/Makassar">Asia/Makassar</option>
                  <option value="Asia/Jayapura">Asia/Jayapura</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="kapten-language">Bahasa konten</FieldLabel>
              <div className="relative">
                <select
                  className={`${fieldControlClassName} appearance-none pr-12`}
                  defaultValue="id"
                  id="kapten-language"
                >
                  <option value="id">Indonesia</option>
                  <option value="en">English</option>
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-secondary-400" />
              </div>
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Default saat resource siap rilis."
          id="publikasi"
          title="Publikasi"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex items-center justify-between gap-4 px-1 py-2 text-sm font-medium text-secondary-900">
              Preview sebelum publish
              <input
                className="size-4 accent-[#075f46]"
                defaultChecked
                type="checkbox"
              />
            </label>
            <label className="flex items-center justify-between gap-4 px-1 py-2 text-sm font-medium text-secondary-900">
              Jadwalkan dalam WIB
              <input
                className="size-4 accent-[#075f46]"
                defaultChecked
                type="checkbox"
              />
            </label>
            <label className="flex items-center justify-between gap-4 px-1 py-2 text-sm font-medium text-secondary-900">
              Gunakan Question Bank
              <input
                className="size-4 accent-[#075f46]"
                defaultChecked
                type="checkbox"
              />
            </label>
            <label className="flex items-center justify-between gap-4 px-1 py-2 text-sm font-medium text-secondary-900">
              Review sebelum rilis
              <input
                className="size-4 accent-[#075f46]"
                defaultChecked
                type="checkbox"
              />
            </label>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Catatan internal untuk fokus kerja."
          id="catatan"
          title="Catatan"
        >
          <div className="grid gap-5">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="kapten-note">Catatan workspace</FieldLabel>
              <FieldTextarea
                className="min-h-[170px]"
                defaultValue="Fokus minggu ini: selesaikan draft PU dan review Tryout 17 sebelum dijadwalkan."
                id="kapten-note"
              />
            </Field>
          </div>
        </SettingsSection>
      </div>
    </MentorWorkspaceShell>
  );
}

export {
  KaptenMateriPageModule,
  KaptenMediaPageModule,
  KaptenQuestionBankPageModule,
  KaptenQuizPageModule,
  KaptenSettingsPageModule,
  KaptenTryoutPageModule,
};
