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
import { questionBankNavigationLabel } from "@/lib/question-bank/purpose";
import { KaptenQuestionBankBuilderPageModule } from "@/modules/mentor/KaptenQuestionBankBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = {
  title: "Buat Question Bank Kapten | Vecalss LMS",
};

const QUESTION_BANK_FOLDER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CreateMentorQuestionBankPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const session = await requireTutorSession();
  const query = await searchParams;
  const purposeValues = readQueryValues(query, "purpose");
  const requestedPurpose = purposeValues[0]?.trim();
  const folderValues = readQueryValues(query, "folder");
  const requestedFolder = folderValues[0]?.trim();
  const issues: CanonicalContextIssue[] = [];
  if (purposeValues.length > 1) issues.push({ code: "invalid", field: "purpose", message: "Tujuan Bank Soal hanya boleh dipilih satu kali.", value: requestedPurpose });
  if (purposeValues.length === 1 && !requestedPurpose) issues.push({ code: "invalid", field: "purpose", message: "Tujuan Bank Soal tidak boleh kosong." });
  if (requestedPurpose && !QUESTION_BANK_PURPOSES.includes(requestedPurpose as QuestionBankPurpose)) issues.push({ code: "unsupported", field: "purpose", message: "Pilih tujuan Bank Soal: Kuis atau Tryout.", value: requestedPurpose });
  if (folderValues.length > 1) issues.push({ code: "invalid", field: "folder", message: "Folder Bank Soal hanya boleh dipilih satu kali.", value: requestedFolder });
  if (folderValues.length === 1 && !requestedFolder) issues.push({ code: "invalid", field: "folder", message: "Folder Bank Soal tidak boleh kosong." });
  if (requestedFolder && requestedFolder !== "root" && requestedFolder !== "unfiled" && !QUESTION_BANK_FOLDER_UUID_PATTERN.test(requestedFolder)) {
    issues.push({ code: "unsupported", field: "folder", message: "Folder Bank Soal tidak tersedia.", value: requestedFolder });
  }
  if (issues.length) {
    const navigationLabel = requestedPurpose === "tryout" ? questionBankNavigationLabel("tryout") : questionBankNavigationLabel("quiz");
    return (
      <MentorWorkspaceShell activeLabel={navigationLabel} breadcrumbLabel={`Buat ${navigationLabel}`} searchPlaceholder="Cari bank soal..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="question-bank-create-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="question-bank-create-context-unavailable">Konteks pembuatan Bank Soal tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih tujuan Kuis atau Tryout yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const purpose = (requestedPurpose as QuestionBankPurpose | undefined) ?? "quiz";
  const initialFolderId = requestedFolder && requestedFolder !== "root" && requestedFolder !== "unfiled" ? requestedFolder : null;

  return <KaptenQuestionBankBuilderPageModule initialFolderId={initialFolderId} mode="create" purpose={purpose} session={session} />;
}
