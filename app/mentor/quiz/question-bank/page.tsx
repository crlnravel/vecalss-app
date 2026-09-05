import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildQuestionBankHref,
  canonicalContextMessage,
  canonicalQueryEquals,
  parseQuestionBankQuery,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import {
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankPage,
} from "@/lib/question-bank/repository";
import type { QuestionBankSort } from "@/lib/question-bank/repository";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const session = await requireTutorSession();
  const params = await searchParams;
  const parsedQuery = parseQuestionBankQuery(params);
  if (parsedQuery.issues.length || parsedQuery.purpose === null) {
    return (
      <MentorWorkspaceShell activeLabel="Bank Soal" breadcrumbLabel="Bank Soal" searchPlaceholder="Cari bank soal, folder, atau kategori..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="question-bank-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="question-bank-context-unavailable">Konteks Bank Soal tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsedQuery.issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih tujuan, subtest, folder, kategori, dan filter yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  if (!canonicalQueryEquals(params, buildQuestionBankHref(parsedQuery))) {
    redirect(buildQuestionBankHref(parsedQuery));
  }
  const requestedPurpose = parsedQuery.purpose;
  const requestedSubjects = parsedQuery.subtest;
  const requestedCategories = parsedQuery.categories;
  const requestedFolder = parsedQuery.folder === "root" ? "root" : parsedQuery.folder;
  // The catalogue root is the unfiled collection. A committed search is the
  // only state that intentionally spans every folder.
  const folderId = requestedFolder === "root" || requestedFolder === "unfiled" ? null : requestedFolder;
  const status = parsedQuery.status ? parsedQuery.status as "draft" | "scheduled" | "published" | "archived" : undefined;
  const page = parsedQuery.page;
  const search = parsedQuery.q;
  const requestedSort = parsedQuery.sort as QuestionBankSort;
  const [banks, folderTree, categories] = await Promise.all([
    listQuestionBankPage({ categoryIds: requestedCategories, folderId: search.trim() ? undefined : folderId, page, pageSize: 25, purpose: requestedPurpose, search, sort: requestedSort, status, subjectCoverage: requestedSubjects }),
    listQuestionBankFolderTree(requestedPurpose),
    listQuestionBankCategories(requestedPurpose),
  ]);

  return (
    <KaptenQuestionBankPageModule
      key={JSON.stringify({ category: requestedCategories, folder: requestedFolder, page, purpose: requestedPurpose, q: search, sort: requestedSort, status, subtest: requestedSubjects })}
      initialCategories={categories}
      initialEntries={banks.items}
      initialFolderTree={folderTree}
      initialPage={banks.page}
      initialPageSize={banks.pageSize}
      initialPurpose={requestedPurpose}
      initialSearch={search}
      initialSelectedCategories={requestedCategories}
      initialSelectedFolder={requestedFolder === "root" ? "root" : folderId}
      initialSelectedSubjects={requestedSubjects}
      initialSort={requestedSort}
      initialStatusFilter={status ?? ""}
      initialTotal={banks.total}
      session={session}
    />
  );
}
