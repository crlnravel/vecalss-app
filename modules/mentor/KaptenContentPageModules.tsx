"use client";

import Link from "next/link";
import { Plus } from "@/lib/icons";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getQuizWithStoredDrafts } from "@/modules/mentor/quiz-draft-storage";
import { getQuestionBankCatalog } from "@/modules/mentor/question-bank-draft-storage";
import type { SessionContext } from "@/lib/auth/types";
import {
  PageIntro,
  ResourceRow,
  SearchPanel,
  StatusPill,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { QuizCreateDialogTrigger } from "@/modules/mentor/KaptenQuizEditorPageModule";
import {
  questionBanks,
  quizzes,
  tryouts,
  type KaptenQuiz,
  type KaptenTryout,
} from "@/modules/mentor/mock-data";

function CreateButton({ href, label }: { href: string; label: string }) {
  return (
    <Button render={<Link href={href} />} variant="default">
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
      searchPlaceholder="Cari kuis, subtes, atau Bank Soal..."
      session={session}
    >
      <PageIntro
        action={
          <QuizCreateDialogTrigger ariaLabel="Buat Kuis">
            <Plus />
            Buat Kuis
          </QuizCreateDialogTrigger>
        }
        title="Kuis"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari kuis atau subtes..." />
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
          <Button render={<Link href={tryout.href} />} size="default" variant="outline">
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
      searchPlaceholder="Cari Tryout, subtes, atau paket soal..."
      session={session}
    >
      <PageIntro
        action={<CreateButton href="/mentor/tryout#create" label="Buat Tryout" />}
        title="Tryout"
      />

      <section className="space-y-4">
        <SearchPanel placeholder="Cari Tryout, subtes, atau paket soal..." />
        <div className="rounded-3xl border border-primary-100 bg-white px-5 py-5 shadow-sm">
          {tryouts.map((tryout) => (
            <TryoutRow key={tryout.id} tryout={tryout} />
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}


export {
  KaptenQuestionBankPageModule,
  KaptenQuizPageModule,
  KaptenTryoutPageModule,
};
