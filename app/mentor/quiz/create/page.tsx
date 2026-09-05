import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  canonicalContextMessage,
  readQueryValues,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { KaptenQuizEditorPageModule } from "@/modules/mentor/KaptenQuizEditorPageModule";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = {
  title: "Buat Quiz Kapten | Vecalss LMS",
};

export default async function CreateMentorQuizPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const session = await requireTutorSession();
  const query = await searchParams;
  const subjectValues = readQueryValues(query, "subject");
  const subjectCode = subjectValues[0]?.trim() || undefined;
  const issues: CanonicalContextIssue[] = [];
  if (subjectValues.length > 1) {
    issues.push({ code: "invalid", field: "subject", message: "Subject Kuis hanya boleh dipilih satu kali.", value: subjectCode });
  }
  if (subjectValues.length === 1 && !subjectCode) {
    issues.push({ code: "invalid", field: "subject", message: "Subject Kuis tidak boleh kosong." });
  }
  if (subjectCode && !kaptenSubjects.some((subject) => subject.code === subjectCode)) {
    issues.push({ code: "unsupported", field: "subject", message: "Subject Kuis tersebut tidak tersedia.", value: subjectCode });
  }
  if (issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Kuis" breadcrumbLabel="Buat Kuis" searchPlaceholder="Cari kuis..." session={session} sidebarAppearance="reference">
        <section aria-labelledby="quiz-create-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="quiz-create-context-unavailable">Konteks pembuatan Kuis tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih subject Kuis yang tersedia untuk menjaga konteks form dan hasil.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  return <KaptenQuizEditorPageModule initialSubjectCode={subjectCode} mode="create" session={session} />;
}
