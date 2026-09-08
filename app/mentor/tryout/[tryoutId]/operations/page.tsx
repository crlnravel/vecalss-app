import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutOperationsHref,
  canonicalContextMessage,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export default async function TryoutOperationsPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }, session, query] = await Promise.all([params, requireTutorSession(), searchParams]);
  const parsed = parseMentorTryoutContext(query);
  if (parsed.issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Operasional Tryout" searchPlaceholder="Cari Tryout..." session={session} showSearch={false} sidebarAppearance="reference">
        <section aria-labelledby="tryout-operations-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-operations-context-unavailable">Konteks operasional Tryout tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsed.issues)}</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  redirect(buildMentorTryoutOperationsHref(tryoutId, { delivery: parsed.delivery ?? "sessions", parent: parsed.parent, returnTo: parsed.returnTo, session: parsed.session, workspace: parsed.workspace ?? "schedule" }));
}
