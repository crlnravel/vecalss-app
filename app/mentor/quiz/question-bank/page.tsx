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
  listQuestionBankFolderTree,
  listQuestionBankPage,
} from "@/lib/question-bank/repository";
import type { QuestionBankSort } from "@/lib/question-bank/repository";
import { questionBankNavigationLabel } from "@/lib/question-bank/purpose";
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
  const createValues = Array.isArray(params.create)
    ? params.create
    : params.create === undefined || params.create === null
      ? []
      : [params.create];
  const initialCreateDialogOpen = createValues.length === 1 && createValues[0] === "1";
  if (parsedQuery.issues.length || parsedQuery.purpose === null) {
    const requestedPurpose = Array.isArray(params.purpose) ? params.purpose[0] : params.purpose;
    const navigationLabel = requestedPurpose === "tryout" ? questionBankNavigationLabel("tryout") : questionBankNavigationLabel("quiz");
    return (
      <MentorWorkspaceShell activeLabel={navigationLabel} breadcrumbLabel={navigationLabel} searchPlaceholder="Cari bank soal, folder, atau materi..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="question-bank-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="question-bank-context-unavailable">Konteks Bank Soal tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsedQuery.issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih tujuan, subtest, folder, dan filter yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const catalogueHref = buildQuestionBankHref(parsedQuery);
  const canonicalHref = initialCreateDialogOpen
    ? `${catalogueHref}&create=1`
    : catalogueHref;
  if (!canonicalQueryEquals(params, canonicalHref)) {
    redirect(canonicalHref);
  }
  const requestedPurpose = parsedQuery.purpose;
  const requestedSubjects = parsedQuery.subtest;
  const requestedCategories = parsedQuery.categories;
  const requestedFolder = parsedQuery.folder === "root" ? "root" : parsedQuery.folder;
  // The catalogue root is the unfiled collection. A committed search is the
  // only state that intentionally spans every folder.
  const folderId = requestedFolder === undefined ? null : requestedFolder === "root" || requestedFolder === "unfiled" ? null : requestedFolder;
  const status = parsedQuery.status ? parsedQuery.status as "published" | "archived" : undefined;
  const page = parsedQuery.page;
  const search = parsedQuery.q;
  const requestedSort = parsedQuery.sort as QuestionBankSort;
  const [banks, folderTree] = await Promise.all([
    listQuestionBankPage({ categoryIds: requestedCategories, folderId: search.trim() ? undefined : folderId, page, pageSize: 25, purpose: requestedPurpose, search, sort: requestedSort, status, subjectCoverage: requestedSubjects }),
    listQuestionBankFolderTree(requestedPurpose),
  ]);

  return (
    <KaptenQuestionBankPageModule
      key={JSON.stringify({ category: requestedCategories, create: initialCreateDialogOpen, folder: requestedFolder, page, purpose: requestedPurpose, q: search, sort: requestedSort, status, subtest: requestedSubjects })}
      initialEntries={banks.items}
      initialFolderTree={folderTree}
      initialCreateDialogOpen={initialCreateDialogOpen}
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
