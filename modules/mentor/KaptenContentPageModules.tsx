"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ImagePlus,
  LayoutList,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldInput,
  FieldLabel,
  FieldTextarea,
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
  type KaptenResource,
  type KaptenSubject,
} from "@/modules/mentor/mock-data";

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
            href="/mentor/materi#create"
            title={`Belum ada konten ${subject.code}`}
          />
        )}
      </div>
    </section>
  );
}

function KaptenMateriPageModule({ session }: { session: SessionContext }) {
  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      searchPlaceholder="Cari materi, video, atau subject..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/materi#create" label="Buat Materi" />}
        description="Kelola materi berdasarkan subject."
        title="Materi"
      />

      <div className="space-y-8">
        <SearchPanel placeholder="Cari judul materi, video, atau topik..." />
        {kaptenSubjects.map((subject) => (
          <SubjectResourceSection
            key={subject.code}
            resources={materi}
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

      <section className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SearchPanel placeholder="Cari quiz atau subject..." />
          <div className="space-y-2">
            {quizzes.map((quiz) => (
              <ResourceRow key={quiz.id} resource={quiz} />
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <SectionHeading title="Question Bank" />
          <div className="space-y-2">
            {questionBanks.slice(0, 2).map((bank) => (
              <ResourceRow key={bank.id} resource={bank} />
            ))}
          </div>
          <Button
            className="w-full"
            render={<Link href="/mentor/quiz/question-bank" />}
            variant="brandOutline"
          >
            Kelola Question Bank
            <ArrowRight />
          </Button>
        </aside>
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

function KaptenTryoutPageModule({ session }: { session: SessionContext }) {
  const wizardSteps = [
    "Basic Information",
    "Configure Subtests",
    "Select Questions",
    "Review",
    "Schedule Publication",
  ];

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

      <section className="space-y-8">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-secondary-500">
          {wizardSteps.map((step, index) => (
            <span key={step}>{index + 1}. {step}</span>
          ))}
        </div>

        <div className="space-y-4">
          <SectionHeading title="Tryout Packages" />
          <div className="space-y-3">
            {tryouts.map((tryout) => (
              <Card
                className="border border-primary-100 bg-white shadow-sm"
                id={tryout.id}
                key={tryout.id}
              >
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle className="text-xl text-secondary-900">
                      {tryout.title}
                    </CardTitle>
                    <StatusPill status={tryout.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  <div className="grid gap-3 md:grid-cols-3">
                    {tryout.sections.map((section) => (
                      <div
                        className="rounded-3xl border border-primary-100 bg-primary-50/50 p-4"
                        key={section.title}
                      >
                        <p className="text-sm font-semibold text-secondary-900">
                          {section.title}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-secondary-500">
                          {section.questionCount} soal · {section.duration}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </MentorWorkspaceShell>
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
        action={<CreateButton href="/mentor/media#upload" label="Upload Image" />}
        description="Kelola image asset untuk konten belajar."
        title="Media"
      />

      <section className="space-y-5">
        <SearchPanel placeholder="Cari nama file, format, atau pemakaian..." />
        <div className="grid gap-4 md:grid-cols-2">
          {mediaAssets.map((asset) => (
            <Card
              className="border border-primary-100 bg-white shadow-sm"
              id={asset.id}
              key={asset.id}
            >
              <CardHeader className="gap-4">
                <div className="flex h-36 items-center justify-center rounded-4xl border border-primary-100 bg-primary-50 text-primary-800">
                  <ImagePlus className="size-10" />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <CardTitle className="text-lg text-secondary-900">
                    {asset.title}
                  </CardTitle>
                  <StatusPill status={asset.status} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 pt-0 text-sm text-secondary-600 sm:grid-cols-2">
                <span>{asset.mimeType}</span>
                <span>{asset.dimensions}</span>
                <span>{asset.fileSize}</span>
                <span>{asset.usage}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

function KaptenSettingsPageModule({ session }: { session: SessionContext }) {
  return (
    <MentorWorkspaceShell
      activeLabel="Pengaturan"
      breadcrumbLabel="Pengaturan"
      searchPlaceholder="Cari pengaturan workspace..."
      session={session}
    >
      <PageIntro
        description="Preferensi workspace Kapten."
        title="Pengaturan"
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="border border-primary-100 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl text-secondary-900">
              Profil Kapten
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 pt-0 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="kapten-name">Nama</FieldLabel>
              <FieldInput id="kapten-name" defaultValue={session.user.fullName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="kapten-email">Email</FieldLabel>
              <FieldInput
                id="kapten-email"
                defaultValue={session.user.email}
                type="email"
              />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="kapten-bio">Catatan workspace</FieldLabel>
              <FieldTextarea
                id="kapten-bio"
                defaultValue="Fokus minggu ini: selesaikan draft PU dan review Tryout 17 sebelum dijadwalkan."
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="border border-primary-100 bg-primary-50/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl text-secondary-900">
              Publishing Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {[
              ["Preview sebelum publish", CheckCircle2],
              ["Jadwalkan dalam WIB", CalendarClock],
              ["Gunakan Question Bank", LayoutList],
              ["Review resource sebelum rilis", ShieldCheck],
            ].map(([label, Icon]) => (
              <label
                className="flex items-center gap-3 rounded-3xl border border-primary-100 bg-white p-3 text-sm font-medium text-secondary-800"
                key={label as string}
              >
                <input
                  className="size-4 accent-[#075f46]"
                  defaultChecked
                  type="checkbox"
                />
                <Icon className="size-4 text-primary-800" />
                {label as string}
              </label>
            ))}
          </CardContent>
        </Card>
      </section>
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
