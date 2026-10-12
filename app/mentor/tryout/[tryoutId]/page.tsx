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
import { KaptenTryoutArchivedHistoryPageModule } from "@/modules/mentor/KaptenTryoutArchivedHistoryPageModule";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { queryTryoutParticipants } from "@/lib/tryout/participant-list";
import { KaptenTryoutRegistrationListPageModule } from "@/modules/mentor/KaptenTryoutRegistrationListPageModule";
import { KaptenTryoutWorkspaceFrame } from "@/modules/mentor/KaptenTryoutWorkspaceFrame";
import { KaptenTryoutAccessPageModule } from "@/modules/mentor/KaptenTryoutAccessPageModule";

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
  activeWorkspace: "subtests" | "operations" | "participants" | "settings";
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
        initialWorkspace={activeWorkspace}
        operationsInitial={initialOperations}
      />
    </MentorWorkspaceShell>
  );
}

function redirectLegacyTryoutWorkspace(tryoutId: string, workspace: ParsedTryoutContext["workspace"]): never | void {
  if (workspace === "results") redirect(buildMentorTryoutHref(tryoutId, { workspace: "participants" }));
  if (workspace === "schedule" || workspace === "attempts" || workspace === "live") {
    redirect(buildMentorTryoutHref(tryoutId, { workspace: "operations" }));
  }
}

function initialWorkspaceForContext(parsedQuery: ParsedTryoutContext): "subtests" | "operations" | "participants" | "settings" {
  if (parsedQuery.workspace === "participants") return "participants";
  if (parsedQuery.workspace === "settings") return "settings";
  if (parsedQuery.workspace === "operations" || parsedQuery.delivery) return "operations";
  if (parsedQuery.workspace === "sections") return "subtests";
  return "subtests";
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
  if (!operationsInitial || (!initialDraft && operationsInitial.status !== "archived")) notFound();
  const issues = collectTryoutContextIssues(parsedQuery, parentDraft, operationsInitial);
  if (issues.length) {
    return <TryoutContextError issues={issues} session={session} />;
  }
  const normalizedContext = {
    q: parsedQuery.q,
    status: parsedQuery.status,
    access: parsedQuery.access,
    page: parsedQuery.page,
    delivery: parsedQuery.delivery ?? undefined,
    parent: parsedQuery.parent,
    returnTo: parsedQuery.returnTo,
    session: parsedQuery.session,
    workspace: parsedQuery.workspace ?? (parsedQuery.delivery ? "operations" : undefined),
  };
  const canonicalHref = buildMentorTryoutHref(tryoutId, normalizedContext);
  if (!canonicalQueryEquals(query, canonicalHref)) redirect(canonicalHref);
  redirectLegacyTryoutWorkspace(tryoutId, parsedQuery.workspace);
  if (parsedQuery.delivery === "participants") {
    return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Peserta" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
      <KaptenTryoutWorkspaceFrame activeTab="operations" initial={operationsInitial} parentId={parsedQuery.parent}>
        <KaptenTryoutRegistrationListPageModule key={canonicalHref} context={normalizedContext} initial={operationsInitial} initialList={queryTryoutParticipants(operationsInitial, parsedQuery)} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>;
  }
  if (parsedQuery.delivery === "policy" && operationsInitial.status !== "draft") {
    return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Akses peserta" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
      <KaptenTryoutWorkspaceFrame activeTab="operations" initial={operationsInitial} parentId={parsedQuery.parent}>
        <KaptenTryoutAccessPageModule key={canonicalHref} initial={operationsInitial} parentId={parsedQuery.parent} />
      </KaptenTryoutWorkspaceFrame>
    </MentorWorkspaceShell>;
  }
  if (operationsInitial.status === "archived") {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Riwayat" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <KaptenTryoutArchivedHistoryPageModule initial={operationsInitial} />
      </MentorWorkspaceShell>
    );
  }
  if (!initialDraft) notFound();
  return <TryoutWorkspace activeWorkspace={initialWorkspaceForContext(parsedQuery)} initialDraft={initialDraft} initialOperations={operationsInitial} parentDraft={parentDraft} session={session} tryoutId={tryoutId} />;
}
