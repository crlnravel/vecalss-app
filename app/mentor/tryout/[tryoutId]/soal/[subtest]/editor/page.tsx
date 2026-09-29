import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { getTryoutForEdit } from "@/lib/tryout/repository";
import { KaptenTryoutQuestionEditorPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";

export const metadata: Metadata = { title: "Editor Soal Tryout Kapten | Vecalss LMS" };

const tryoutSubtests = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type TryoutSubtest = (typeof tryoutSubtests)[number];

function parseTryoutSubtest(value: string): TryoutSubtest | null {
  return tryoutSubtests.find(
    (candidate) => candidate.toLowerCase() === value.toLowerCase(),
  ) ?? null;
}

export default async function TryoutQuestionEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ subtest: string; tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const [{ subtest, tryoutId }, query, session] = await Promise.all([
    params,
    searchParams,
    requireTutorSession(),
  ]);
  const subtestCode = parseTryoutSubtest(subtest);
  if (!subtestCode) notFound();
  const parsedQuery = parseMentorTryoutContext(query);
  if (parsedQuery.issues.length) notFound();

  const [initialDraft, sourceCatalog, parentDraft] = await Promise.all([
    getTryoutForEdit(tryoutId, session.user.id),
    listQuestionBankSourcePage({
      page: 1,
      pageSize: 20,
      purpose: "tryout",
      subjectCoverage: [subtestCode],
    }),
    parsedQuery.parent
      ? getTryoutForEdit(parsedQuery.parent, session.user.id)
      : Promise.resolve(null),
  ]);
  if (!initialDraft || (parsedQuery.parent && !parentDraft)) notFound();

  const parentContext = parentDraft
    ? {
        id: parentDraft.id,
        publishedAt: parentDraft.assessmentRelease?.publishedAt,
        title: parentDraft.title,
      }
    : undefined;
  return (
    <KaptenTryoutQuestionEditorPageModule
      id={tryoutId}
      initialDraft={initialDraft}
      initialParent={parentContext}
      initialSourceBankTotal={sourceCatalog.total}
      initialSourceBanks={sourceCatalog.items.map(({ bank }) => bank)}
      initialSubtest={subtestCode}
    />
  );
}
