import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  canonicalContextMessage,
  QUESTION_BANK_PURPOSES,
  readQueryValues,
  type CanonicalContextIssue,
  type NavigationQueryValue,
  type QuestionBankPurpose,
} from "@/lib/navigation/canonical-context";
import { listQuestionBankCategories } from "@/lib/question-bank/repository";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = {
  title: "Buat Question Bank Kapten | Vecalss LMS",
};

export default async function CreateMentorQuestionBankPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const session = await requireTutorSession();
  const query = await searchParams;
  const purposeValues = readQueryValues(query, "purpose");
  const requestedPurpose = purposeValues[0]?.trim();
  const issues: CanonicalContextIssue[] = [];
  if (purposeValues.length > 1) issues.push({ code: "invalid", field: "purpose", message: "Tujuan Bank Soal hanya boleh dipilih satu kali.", value: requestedPurpose });
  if (purposeValues.length === 1 && !requestedPurpose) issues.push({ code: "invalid", field: "purpose", message: "Tujuan Bank Soal tidak boleh kosong." });
  if (requestedPurpose && !QUESTION_BANK_PURPOSES.includes(requestedPurpose as QuestionBankPurpose)) issues.push({ code: "unsupported", field: "purpose", message: "Pilih tujuan Bank Soal: Kuis atau Tryout.", value: requestedPurpose });
  if (issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Buat Bank Soal" searchPlaceholder="Cari bank soal..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="question-bank-create-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="question-bank-create-context-unavailable">Konteks pembuatan Bank Soal tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih tujuan Kuis atau Tryout yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const purpose = (requestedPurpose as QuestionBankPurpose | undefined) ?? "quiz";
  const initialCategories = await listQuestionBankCategories(purpose);

  return <KaptenQuestionBankBuilderPageModule initialCategories={initialCategories} mode="create" purpose={purpose} session={session} />;
}
