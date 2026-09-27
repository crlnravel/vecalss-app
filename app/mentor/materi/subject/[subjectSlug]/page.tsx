import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorMateriSubjectHref,
  canonicalContextMessage,
  canonicalQueryEquals,
  parseMateriSubjectQuery,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriSubjectPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

type MentorMateriSubjectPageProps = {
  params: Promise<{ subjectSlug: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
};

export const metadata: Metadata = {
  title: "Subject Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriSubjectPage({
  params,
  searchParams,
}: MentorMateriSubjectPageProps) {
  const [{ subjectSlug }, paramsFromSearch, session, catalogue] = await Promise.all([
    params,
    searchParams,
    requireTutorSession(),
    getMentorMateriCatalogue(),
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const subject = view.subjects.find((item) => item.slug === subjectSlug);

  if (!subject) {
    notFound();
  }

  const parsedQuery = parseMateriSubjectQuery(paramsFromSearch);
  if (parsedQuery.issues.length) {
    return (
      <MentorWorkspaceShell
        activeLabel="Materi"
        breadcrumbLabel={subject.code}
        searchPlaceholder="Cari lesson..."
        session={session}
        sidebarAppearance="reference"
      >
        <section
          aria-labelledby="materi-context-unavailable"
          className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8"
          role="alert"
        >
          <h1 className="text-lg font-semibold" id="materi-context-unavailable">Konteks materi tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsedQuery.issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih filter atau halaman materi yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }

  const canonicalHref = buildMentorMateriSubjectHref(subject.slug, parsedQuery);
  if (!canonicalQueryEquals(paramsFromSearch, canonicalHref)) {
    redirect(canonicalHref);
  }

  return (
    <KaptenMateriSubjectPageModule
      catalogue={view.lessons}
      initialPage={parsedQuery.page}
      initialQuery={parsedQuery.q}
      initialSort={parsedQuery.sort}
      initialSortDirection={parsedQuery.direction}
      initialStatusFilter={parsedQuery.status}
      key={JSON.stringify({ direction: parsedQuery.direction, page: parsedQuery.page, q: parsedQuery.q, sort: parsedQuery.sort, status: parsedQuery.status, subjectSlug })}
      session={session}
      subjects={view.subjects}
      subject={subject}
    />
  );
}
