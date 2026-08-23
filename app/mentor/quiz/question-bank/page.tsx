import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankPage,
} from "@/lib/question-bank/repository";
import { KaptenQuestionBankPageModule } from "@/modules/mentor/KaptenQuestionBankCataloguePageModules";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

export const metadata: Metadata = {
  title: "Question Bank Kapten | Vecalss LMS",
};

export default async function MentorQuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireTutorSession();
  const params = await searchParams;
  const requestedSubjects = (typeof params.subtest === "string" ? [params.subtest] : Array.isArray(params.subtest) ? params.subtest : [])
    .filter((code) => kaptenSubjects.some((subject) => subject.code === code));
  const requestedCategories = typeof params.category === "string" ? [params.category] : Array.isArray(params.category) ? params.category : [];
  const requestedFolder = typeof params.folder === "string" ? params.folder : undefined;
  const folderId = requestedFolder === undefined ? undefined : requestedFolder === "unfiled" ? null : requestedFolder;
  const requestedStatus = typeof params.status === "string" ? params.status : "";
  const status = ["draft", "scheduled", "published", "archived"].includes(requestedStatus) ? requestedStatus as "draft" | "scheduled" | "published" | "archived" : undefined;
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const search = typeof params.q === "string" ? params.q : "";
  const [banks, folderTree, categories] = await Promise.all([
    listQuestionBankPage({ categoryIds: requestedCategories, folderId: search.trim() ? undefined : folderId, page, pageSize: 25, search, status, subjectCoverage: requestedSubjects }),
    listQuestionBankFolderTree(),
    listQuestionBankCategories(),
  ]);

  return (
    <KaptenQuestionBankPageModule
      key={JSON.stringify({ category: requestedCategories, folder: requestedFolder, page, q: search, status, subtest: requestedSubjects })}
      initialCategories={categories}
      initialEntries={banks.items}
      initialFolderTree={folderTree}
      initialPage={banks.page}
      initialPageSize={banks.pageSize}
      initialSearch={search}
      initialSelectedCategories={requestedCategories}
      initialSelectedFolder={requestedFolder === undefined ? "all" : folderId}
      initialSelectedSubjects={requestedSubjects}
      initialStatusFilter={status ?? ""}
      initialTotal={banks.total}
      session={session}
    />
  );
}
