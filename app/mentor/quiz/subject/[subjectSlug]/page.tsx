import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuizzes, getSubjectMetadataBySlug } from "@/lib/quiz/repository";
import { KaptenQuizSubjectPageModule } from "@/modules/mentor/KaptenQuizCataloguePageModules";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type MentorQuizSubjectPageProps = { params: Promise<{ subjectSlug: string }> };

export const metadata: Metadata = { title: "Subtes Kuis Kapten | Vecalss LMS" };

export default async function MentorQuizSubjectPage({ params }: MentorQuizSubjectPageProps) {
  const [{ subjectSlug }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  const subject = getSubjectMetadataBySlug(subjectSlug);
  if (!subject) {
    return (
      <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Subtes tidak tersedia" searchPlaceholder="Cari kuis atau subtes..." session={session} sidebarAppearance="reference">
        <section aria-labelledby="quiz-subject-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="quiz-subject-unavailable">Subtes Kuis tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">Subtes ini tidak ditemukan. Pilih subtes Kuis yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const catalogue = await getMentorStandaloneQuizzes(session.user.id);
  return <KaptenQuizSubjectPageModule catalogue={catalogue} session={session} subject={subject} />;
}
