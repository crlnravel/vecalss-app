import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutHref,
  canonicalContextMessage,
  canonicalQueryEquals,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { getTryoutForEdit } from "@/lib/tryout/repository";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Tryout Kapten | Vecalss LMS" };

type ParsedTryoutContext = ReturnType<typeof parseMentorTryoutContext>;
type TryoutDraft = NonNullable<Awaited<ReturnType<typeof getTryoutForEdit>>>;
type InitialOperations = NonNullable<ReturnType<typeof toTryoutWorkspaceView>>;
type TryoutContextIssue = ParsedTryoutContext["issues"][number];

function collectTryoutContextIssues(
  parsedQuery: ParsedTryoutContext,
  parentDraft: TryoutDraft | null,
  operationsInitial: InitialOperations,
): TryoutContextIssue[] {
  const issues = [...parsedQuery.issues];
  if (parsedQuery.parent && !parentDraft) {
    issues.push({ code: "unsupported", field: "parent", message: "Tryout induk tersebut tidak tersedia untuk dipilih.", value: parsedQuery.parent });
  }
  if (parsedQuery.session && !operationsInitial.sessions.some((candidate) => candidate.id === parsedQuery.session)) {
    issues.push({ code: "unsupported", field: "session", message: "Sesi Tryout tersebut tidak tersedia untuk dipilih.", value: parsedQuery.session });
  }
  return issues;
}

function TryoutContextError({
  issues,
  session,
}: {
  issues: TryoutContextIssue[];
  session: Awaited<ReturnType<typeof requireTutorSession>>;
}) {
  return (
    <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
      <section aria-labelledby="tryout-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
        <h1 className="text-lg font-semibold" id="tryout-context-unavailable">Konteks Tryout tidak tersedia</h1>
        <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
        <p className="mt-2 text-sm leading-6">Pilih workspace atau sesi Tryout yang tersedia untuk melanjutkan.</p>
      </section>
    </MentorWorkspaceShell>
  );
}

function TryoutWorkspace({
  activeWorkspace,
  initialDraft,
  initialOperations,
  parentDraft,
  session,
  tryoutId,
}: {
  activeWorkspace: "identity" | "subtests";
  initialDraft: TryoutDraft;
  initialOperations: InitialOperations;
  parentDraft: TryoutDraft | null;
  session: Awaited<ReturnType<typeof requireTutorSession>>;
  tryoutId: string;
}) {
  const parent = parentDraft
    ? { id: parentDraft.id, publishedAt: parentDraft.assessmentRelease?.publishedAt, title: parentDraft.title }
    : undefined;

  return (
    <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Detail" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
      <KaptenTryoutBuilderPageModule
        id={tryoutId}
        initialDraft={initialDraft}
        initialParent={parent}
        initialWorkspace={activeWorkspace === "subtests" ? "subtests" : "identity"}
        operationsInitial={initialOperations}
      />
    </MentorWorkspaceShell>
  );
}

function redirectLegacyTryoutWorkspace(tryoutId: string, workspace: ParsedTryoutContext["workspace"]): never | void {
  if (workspace === "schedule" || workspace === "attempts" || workspace === "live" || workspace === "results") {
    redirect(`/mentor/tryout/${tryoutId}/operations`);
  }
}

export default async function TryoutPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }, query, session] = await Promise.all([params, searchParams, requireTutorSession()]);
  const parsedQuery = parseMentorTryoutContext(query);
  const [initialDraft, operations, parentDraft] = await Promise.all([
    getTryoutForEdit(tryoutId, session.user.id),
    getOwnedTryoutOperationsView(tryoutId, session.user.id),
    parsedQuery.parent ? getTryoutForEdit(parsedQuery.parent, session.user.id) : Promise.resolve(null),
  ]);
  // The builder only needs session schedule/release metadata and a gated
  // ParticipantView. Keep attempt details and hidden scores on separately
  // authorized detail routes so the client-bound workspace cannot inspect
  // embargoed results by walking its initial props.
  const operationsInitial = operations ? toTryoutWorkspaceView(operations) : null;
  if (!initialDraft || !operationsInitial) notFound();
  const issues = collectTryoutContextIssues(parsedQuery, parentDraft, operationsInitial);
  if (issues.length) {
    return <TryoutContextError issues={issues} session={session} />;
  }
  const normalizedContext = {
    delivery: parsedQuery.delivery ?? undefined,
    parent: parsedQuery.parent,
    returnTo: parsedQuery.returnTo,
    session: parsedQuery.session,
    workspace: parsedQuery.workspace ?? (parsedQuery.delivery ? "schedule" : undefined),
  };
  const canonicalHref = buildMentorTryoutHref(tryoutId, normalizedContext);
  if (!canonicalQueryEquals(query, canonicalHref)) redirect(canonicalHref);
  if (parsedQuery.delivery === "policy") redirect(`/mentor/tryout/${tryoutId}/operations`);
  if (parsedQuery.delivery === "participants") redirect(`/mentor/tryout/${tryoutId}/operations/participants`);
  if (parsedQuery.delivery === "sessions") redirect(`/mentor/tryout/${tryoutId}/operations`);
  redirectLegacyTryoutWorkspace(tryoutId, parsedQuery.workspace);
  return <TryoutWorkspace activeWorkspace={parsedQuery.workspace === "sections" ? "subtests" : "identity"} initialDraft={initialDraft} initialOperations={operationsInitial} parentDraft={parentDraft} session={session} tryoutId={tryoutId} />;
}
