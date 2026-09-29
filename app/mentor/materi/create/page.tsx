import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorMateriSubjectHref,
  canonicalContextMessage,
  parseMateriReturnTo,
  readQueryValues,
  type CanonicalContextIssue,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

export const metadata: Metadata = {
  title: "Buat Materi Kapten | Vecalss LMS",
};

type CreateMentorMateriPageProps = {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
};

export default async function CreateMentorMateriPage({
  searchParams,
}: CreateMentorMateriPageProps) {
  const [session, catalogue, query] = await Promise.all([
    requireTutorSession(),
    getMentorMateriCatalogue(),
    searchParams,
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const issues: CanonicalContextIssue[] = [];
  const subjectValues = readQueryValues(query, "subject");
  const subjectSlug = subjectValues[0]?.trim() || undefined;
  if (subjectValues.length > 1) {
    issues.push({ code: "invalid", field: "subject", message: "Subtes materi hanya boleh dipilih satu kali.", value: subjectSlug });
  }
  if (subjectValues.length === 1 && !subjectSlug) {
    issues.push({ code: "invalid", field: "subject", message: "Subtes materi tidak boleh kosong." });
  }
  if (subjectSlug && !view.subjects.some((subject) => subject.slug === subjectSlug)) {
    issues.push({ code: "unsupported", field: "subject", message: "Subtes materi tersebut tidak tersedia.", value: subjectSlug });
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
      <MentorWorkspaceShell activeLabel="Materi" breadcrumbLabel="Buat Materi" searchPlaceholder="Cari materi..." session={session} sidebarAppearance="reference">
        <section aria-labelledby="materi-create-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg sm:px-8" role="alert">
          <h1 className="text-lg font-semibold" id="materi-create-context-unavailable">Konteks pembuatan materi tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(issues)}</p>
          <p className="mt-2 text-sm leading-6">Pilih subject dan tujuan kembali materi yang tersedia untuk melanjutkan.</p>
        </section>
      </MentorWorkspaceShell>
    );
  }

  const returnTo = returnContext.returnTo ?? (subjectSlug ? buildMentorMateriSubjectHref(subjectSlug) : undefined);
  const dialogQuery = new URLSearchParams({ create: "1" });
  if (subjectSlug) dialogQuery.set("subject", subjectSlug);
  if (returnTo) dialogQuery.set("returnTo", returnTo);

  redirect(`/mentor/materi?${dialogQuery.toString()}`);
}
