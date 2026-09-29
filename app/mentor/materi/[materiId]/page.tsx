import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  canonicalContextMessage,
  parseMateriReturnTo,
  readQueryValues,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getMentorMateriByCode, getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { toKaptenMateriCatalogueView, toKaptenMateriEditorView } from "@/modules/mentor/materi-view-model";

type MentorMateriBuilderPageProps = {
  params: Promise<{
    materiId: string;
  }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
};

export const metadata: Metadata = {
  title: "Edit Materi Kapten | Vecalss LMS",
};

export default async function MentorMateriBuilderPage({
  params,
  searchParams,
}: MentorMateriBuilderPageProps) {
  const { materiId: encodedMateriId } = await params;
  let materiId: string;
  try {
    materiId = decodeURIComponent(encodedMateriId);
  } catch {
    notFound();
  }
  const session = await requireTutorSession();
  const [query, catalogue, lesson] = await Promise.all([
    searchParams,
    getMentorMateriCatalogue(),
    getMentorMateriByCode(materiId),
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const initialMateri = toKaptenMateriEditorView(lesson);
  if (!initialMateri) notFound();
  const issues: CanonicalContextIssue[] = [];
  const previewValues = readQueryValues(query, "preview");
  if (previewValues.length > 1 || (previewValues[0] !== undefined && previewValues[0] !== "1")) {
    issues.push({ code: "invalid", field: "preview", message: "Pratinjau Materi tidak tersedia.", value: previewValues[0] });
  }
  const returnContext = parseMateriReturnTo(query);
  issues.push(...returnContext.issues);
  if (returnContext.returnTo) {
    let returnToSubjectKnown = false;
    try {
      const returnPath = new URL(returnContext.returnTo, "https://vecalss.invalid").pathname;
      returnToSubjectKnown = view.subjects.some((subject) => returnPath === `/mentor/materi/subject/${subject.slug}`);
    } catch {
      returnToSubjectKnown = false;
    }
    if (!returnToSubjectKnown) {
      issues.push({ code: "unsupported", field: "returnTo", message: "Tujuan kembali materi tersebut tidak tersedia.", value: returnContext.returnTo });
    }
  }

  if (issues.length) {
    return (
      <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel="Detail Materi" searchPlaceholder="Cari materi..." session={session} sidebarAppearance="reference">
        <section aria-labelledby="materi-detail-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="materi-detail-context-unavailable">Konteks materi tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Kembali ke katalog materi untuk memilih konteks yang tersedia.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={initialMateri}
      initialPreview={previewValues[0] === "1"}
      materiId={materiId}
      mode="edit"
      returnTo={returnContext.returnTo}
      session={session}
      subjects={view.subjects}
    />
  );
}
