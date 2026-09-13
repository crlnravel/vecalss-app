import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { parseMentorTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { getTryoutForEdit } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Edit Soal Tryout Kapten | Vecalss LMS" };

const tryoutSubtests = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type TryoutSubtest = (typeof tryoutSubtests)[number];

function parseTryoutSubtest(value: string): TryoutSubtest | null {
  return tryoutSubtests.find((candidate) => candidate.toLowerCase() === value.toLowerCase()) ?? null;
}

export default async function TryoutSubtestPage({
  params,
  searchParams,
}: {
  params: Promise<{ subtest: string; tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ subtest, tryoutId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const subtestCode = parseTryoutSubtest(subtest);
  if (!subtestCode) notFound();
  const parsedQuery = parseMentorTryoutContext(query);
  if (parsedQuery.issues.length) notFound();

  const [initialDraft, operations, sourceCatalog, parentDraft] = await Promise.all([
    getTryoutForEdit(tryoutId, session.user.id),
    getOwnedTryoutOperationsView(tryoutId, session.user.id),
    listQuestionBankSourcePage({ page: 1, pageSize: 20, purpose: "tryout", subjectCoverage: [subtestCode] }),
    parsedQuery.parent ? getTryoutForEdit(parsedQuery.parent, session.user.id) : Promise.resolve(null),
  ]);
  const initialOperations = operations ? toTryoutWorkspaceView(operations) : null;
  if (!initialDraft || !initialOperations || (parsedQuery.parent && !parentDraft)) notFound();

  const parentLabel = "Detail";
  const parentHref = `/mentor/tryout/${encodeURIComponent(tryoutId)}${parsedQuery.parent ? `?parent=${encodeURIComponent(parsedQuery.parent)}` : ""}`;
  const parentContext = parentDraft
    ? { id: parentDraft.id, publishedAt: parentDraft.assessmentRelease?.publishedAt, title: parentDraft.title }
    : undefined;
  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel={`Subtes ${subtestCode}`}
      breadcrumbParent={{ href: parentHref, label: parentLabel }}
      contentElement="div"
      mainClassName="max-w-none"
      searchPlaceholder="Cari Tryout..."
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <KaptenTryoutBuilderPageModule
        id={tryoutId}
        initialDraft={initialDraft}
        initialSourceBankTotal={sourceCatalog.total}
        initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)}
        initialSubtest={subtestCode}
        initialParent={parentContext}
        operationsInitial={initialOperations}
      />
    </MentorWorkspaceShell>
  );
}
