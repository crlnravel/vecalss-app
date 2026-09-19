import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutCreateHref,
  canonicalContextMessage,
  canonicalQueryEquals,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [session, query] = await Promise.all([
    requireTutorSession(),
    searchParams,
  ]);
  const parsedQuery = parseMentorTryoutContext(query);
  if (parsedQuery.issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} sidebarAppearance="reference">
        <section aria-labelledby="tryout-create-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="tryout-create-context-unavailable">Konteks pembuatan Tryout tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsedQuery.issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih workspace Tryout yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }
  const canonicalHref = buildMentorTryoutCreateHref({
    delivery: parsedQuery.delivery ?? undefined,
    parent: parsedQuery.parent,
    returnTo: parsedQuery.returnTo,
    session: parsedQuery.session,
    workspace: parsedQuery.workspace ?? (parsedQuery.delivery ? "operations" : undefined),
  });
  if (!canonicalQueryEquals(query, canonicalHref)) redirect(canonicalHref);
  return <MentorWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Buat Tryout" contentElement="div" mainClassName="max-w-none" searchPlaceholder="Cari Tryout..." session={session} sidebarAppearance="reference"><KaptenTryoutBuilderPageModule /></MentorWorkspaceShell>;
}
