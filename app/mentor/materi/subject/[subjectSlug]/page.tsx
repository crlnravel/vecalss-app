import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorMateriCatalogue } from "@/lib/materi/repository";
import { KaptenMateriSubjectPageModule } from "@/modules/mentor/KaptenMateriCataloguePageModules";
import { toKaptenMateriCatalogueView } from "@/modules/mentor/materi-view-model";

type MentorMateriSubjectPageProps = {
  params: Promise<{ subjectSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const MATERI_STATUSES = ["draft", "published", "archived", "scheduled"] as const;
const MATERI_READINESS = ["ready", "incomplete"] as const;
const MATERI_VIDEO_FILTERS = ["with-video", "without-video"] as const;
const MATERI_SORT_KEYS = ["title", "status"] as const;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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

  const requestedStatus = readSearchParam(paramsFromSearch.status);
  const requestedReadiness = readSearchParam(paramsFromSearch.readiness);
  const requestedVideo = readSearchParam(paramsFromSearch.video);
  const requestedSort = readSearchParam(paramsFromSearch.sort);
  const requestedDirection = readSearchParam(paramsFromSearch.direction);
  const requestedPage = Number.parseInt(readSearchParam(paramsFromSearch.page), 10);

  const statusFilter = MATERI_STATUSES.includes(requestedStatus as (typeof MATERI_STATUSES)[number])
    ? requestedStatus
    : "";
  const readinessFilter = MATERI_READINESS.includes(requestedReadiness as (typeof MATERI_READINESS)[number])
    ? requestedReadiness
    : "";
  const videoFilter = MATERI_VIDEO_FILTERS.includes(requestedVideo as (typeof MATERI_VIDEO_FILTERS)[number])
    ? requestedVideo
    : "";
  const sort = MATERI_SORT_KEYS.includes(requestedSort as (typeof MATERI_SORT_KEYS)[number])
    ? requestedSort as (typeof MATERI_SORT_KEYS)[number]
    : "";
  const sortDirection = requestedDirection === "desc" ? "desc" : "asc";
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const query = readSearchParam(paramsFromSearch.q);

  return (
    <KaptenMateriSubjectPageModule
      catalogue={view.lessons}
      initialPage={page}
      initialQuery={query}
      initialReadinessFilter={readinessFilter}
      initialSort={sort}
      initialSortDirection={sortDirection}
      initialStatusFilter={statusFilter}
      initialVideoFilter={videoFilter}
      key={JSON.stringify({ direction: sortDirection, page, q: query, readiness: readinessFilter, sort, status: statusFilter, subjectSlug, video: videoFilter })}
      session={session}
      subject={subject}
    />
  );
}
