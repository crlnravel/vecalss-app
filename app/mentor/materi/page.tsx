import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorMateriSubjectHref,
  parseMateriReturnTo,
  readQueryValues,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

export const metadata: Metadata = {
  title: "Materi Kapten | Vecalss LMS",
};

type MentorMateriPageProps = {
  searchParams: Promise<Record<string, NavigationQueryValue>>;
};

export default async function MentorMateriPage({
  searchParams,
}: MentorMateriPageProps) {
  const [session, catalogue, query] = await Promise.all([
    requireTutorSession(),
    getMentorMateriCatalogue(),
    searchParams,
  ]);
  const view = toKaptenMateriCatalogueView(catalogue);
  const createValues = readQueryValues(query, "create");
  const subjectValues = readQueryValues(query, "subject");
  const requestedSubjectSlug = subjectValues[0]?.trim();
  const subjectQueryIsValid =
    subjectValues.length <= 1 &&
    (subjectValues.length === 0 ||
      (Boolean(requestedSubjectSlug) &&
        view.subjects.some((subject) => subject.slug === requestedSubjectSlug)));
  const initialSubjectSlug = subjectQueryIsValid
    ? requestedSubjectSlug
    : undefined;
  const returnContext = parseMateriReturnTo(query);
  let returnToIsValid = returnContext.issues.length === 0;
  if (returnToIsValid && returnContext.returnTo) {
    try {
      const returnPath = new URL(
        returnContext.returnTo,
        "https://vecalss.invalid",
      ).pathname;
      returnToIsValid = view.subjects.some(
        (subject) => returnPath === `/mentor/materi/subject/${subject.slug}`,
      );
    } catch {
      returnToIsValid = false;
    }
  }
  const initialCreateDialogOpen =
    createValues.length === 1 &&
    createValues[0] === "1" &&
    subjectQueryIsValid &&
    returnToIsValid;
  const initialReturnTo = initialCreateDialogOpen && returnToIsValid
    ? returnContext.returnTo ??
      (initialSubjectSlug
        ? buildMentorMateriSubjectHref(initialSubjectSlug)
        : undefined)
    : undefined;

  return (
    <KaptenMateriPageModule
      catalogue={view.lessons}
      key={initialCreateDialogOpen ? "create" : "catalogue"}
      initialCreateDialogOpen={initialCreateDialogOpen}
      initialReturnTo={initialReturnTo}
      initialSubjectSlug={initialSubjectSlug}
      session={session}
      subjects={view.subjects}
    />
  );
}
