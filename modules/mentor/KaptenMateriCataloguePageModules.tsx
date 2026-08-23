"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronLeft,
  Ellipsis,
  Eye,
  FilePenLine,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useReducer } from "react";

import { Button } from "@/components/ui/button";
import type { DataTableColumn, DataTableFilter } from "@/components/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  CatalogueFilter,
  PageIntro,
  PaginationLinks,
  StatusPill,
} from "@/modules/mentor/components/kapten-ui";
import { getSubjectCategory } from "@/modules/mentor/subject-category";
import {
  bulkPublishMateriLessonsAction,
  bulkUnpublishMateriLessonsAction,
  archiveMateriLessonAction,
  returnMateriLessonToDraftAction,
} from "@/modules/mentor/materi-actions";
import type {
  KaptenMateriSubjectView,
  KaptenMateriView,
} from "@/modules/mentor/materi-view-model";

type MateriSortKey = "" | "status" | "title";
type MateriSortDirection = "asc" | "desc";

type MateriCatalogueQuery = {
  direction?: MateriSortDirection;
  page?: number;
  q?: string;
  readiness?: string;
  sort?: MateriSortKey;
  status?: string;
  video?: string;
};

function buildCreateHref(subjectSlug?: string) {
  return subjectSlug
    ? `/mentor/materi/create?${new URLSearchParams({ subject: subjectSlug })}`
    : "/mentor/materi/create";
}

function buildEditorHref(
  lesson: KaptenMateriView,
  returnTo: string,
  preview = false,
) {
  const query = new URLSearchParams({ returnTo });
  if (preview) query.set("preview", "1");
  return `/mentor/materi/${lesson.code}?${query.toString()}`;
}

function buildMateriSubjectHref(
  subjectSlug: string,
  query: MateriCatalogueQuery = {},
) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.status) params.set("status", query.status);
  if (query.readiness) params.set("readiness", query.readiness);
  if (query.video) params.set("video", query.video);
  if (query.sort) params.set("sort", query.sort);
  if (query.direction === "desc") params.set("direction", query.direction);
  if (query.page && query.page > 1) params.set("page", String(query.page));

  const serialized = params.toString();
  return `/mentor/materi/subject/${subjectSlug}${serialized ? `?${serialized}` : ""}`;
}

function statusLabel(status: KaptenMateriView["status"]) {
  return status === "published"
    ? "Diterbitkan"
    : status === "archived"
      ? "Diarsipkan"
      : status === "scheduled"
        ? "Terjadwal"
        : "Draf";
}

function readinessLabel(readiness: KaptenMateriView["readiness"]) {
  return readiness === "ready" ? "PDF siap" : "PDF belum siap";
}

function videoLabel(lesson: KaptenMateriView) {
  if (!lesson.hasOptionalVideo) return "Tanpa video";
  return lesson.duration
    ? `Video opsional · ${lesson.duration}`
    : "Video opsional";
}

function sortLessons(
  lessons: readonly KaptenMateriView[],
  sort: MateriSortKey,
  direction: MateriSortDirection,
) {
  if (!sort) return [...lessons];

  const statusOrder: Record<KaptenMateriView["status"], number> = {
    draft: 0,
    scheduled: 1,
    published: 2,
    archived: 3,
  };
  const sorted = [...lessons].sort((left, right) => {
    const comparison = sort === "title"
      ? left.title.localeCompare(right.title, "id", { sensitivity: "base" })
      : statusOrder[left.status] - statusOrder[right.status];

    return comparison || left.position - right.position || left.code.localeCompare(right.code);
  });

  return direction === "desc" ? sorted.reverse() : sorted;
}

type MateriCatalogueState = {
  bulkError: string | null;
  bulkIntent: "publish" | "unpublish" | null;
  bulkNotice: string | null;
  bulkSelection: KaptenMateriView[];
  isBulkPending: boolean;
  lessons: KaptenMateriView[];
  page: number;
  query: string;
  readinessFilter: string;
  sort: MateriSortKey;
  sortDirection: MateriSortDirection;
  statusFilter: string;
  tableVersion: number;
  videoFilter: string;
};

type MateriCatalogueAction =
  | { type: "bulkErrorChanged"; error: string | null }
  | { type: "bulkIntentChanged"; intent: "publish" | "unpublish" | null }
  | { lessons: KaptenMateriView[]; type: "bulkSelectionChanged" }
  | { type: "bulkNoticeChanged"; notice: string | null }
  | { type: "bulkPendingChanged"; pending: boolean }
  | { lessons: KaptenMateriView[]; type: "lessonsChanged" }
  | { type: "tableVersionChanged" };

function materiCatalogueReducer(
  state: MateriCatalogueState,
  action: MateriCatalogueAction,
): MateriCatalogueState {
  switch (action.type) {
    case "bulkErrorChanged":
      return { ...state, bulkError: action.error };
    case "bulkIntentChanged":
      return { ...state, bulkIntent: action.intent };
    case "bulkSelectionChanged":
      return { ...state, bulkSelection: action.lessons };
    case "bulkNoticeChanged":
      return { ...state, bulkNotice: action.notice };
    case "bulkPendingChanged":
      return { ...state, isBulkPending: action.pending };
    case "lessonsChanged":
      return { ...state, lessons: action.lessons };
    case "tableVersionChanged":
      return { ...state, tableVersion: state.tableVersion + 1 };
    default:
      return state;
  }
}

function MateriBulkActions({
  onRequest,
  rows,
}: {
  onRequest: (intent: "publish" | "unpublish", lessons: KaptenMateriView[]) => void;
  rows: readonly KaptenMateriView[];
}) {
  const selectedLessons = [...rows];
  const publishEligible = selectedLessons.length > 0 && selectedLessons.every(
    (lesson) => lesson.status === "draft" && lesson.readiness === "ready",
  );
  const unpublishEligible = selectedLessons.length > 0 && selectedLessons.every(
    (lesson) => lesson.status === "published",
  );
  const eligibilityReason = selectedLessons.length > 0 && !publishEligible && !unpublishEligible
    ? "Pilih hanya lesson draf dengan PDF siap atau lesson yang sudah diterbitkan."
    : null;

  return (
    <>
      <DropdownMenuLabel className="font-semibold text-secondary-900">
        {selectedLessons.length} lesson dipilih
      </DropdownMenuLabel>
      <DropdownMenuItem
        disabled={!publishEligible}
        onClick={() => onRequest("publish", selectedLessons)}
      >
        <Upload />
        Terbitkan
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!unpublishEligible}
        onClick={() => onRequest("unpublish", selectedLessons)}
      >
        <FilePenLine />
        Batalkan terbit
      </DropdownMenuItem>
      {eligibilityReason ? (
        <DropdownMenuLabel className="whitespace-normal text-xs font-normal leading-5 text-secondary-500">
          {eligibilityReason}
        </DropdownMenuLabel>
      ) : null}
    </>
  );
}

function SubjectCard({ subject }: { subject: KaptenMateriSubjectView }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className="group flex min-h-32 flex-col rounded-3xl border border-primary-200 bg-white p-5 shadow-sm transition-[transform,border-color,background-color,box-shadow] duration-200 motion-safe:hover:-translate-y-0.5 hover:border-primary-500 hover:bg-primary-50/40 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.42)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/35"
      href={`/mentor/materi/subject/${subject.slug}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="inline-flex rounded-xl bg-primary-100 px-3 py-1.5 text-sm font-bold text-primary-900">
          {subjectCategory}
        </span>
        <FileText className="size-5 text-primary-800" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-secondary-900">
        {subject.name}
      </h2>
    </Link>
  );
}

function KaptenMateriPageModule({
  session,
  subjects,
}: {
  catalogue: KaptenMateriView[];
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      searchPlaceholder="Cari materi..."
      session={session}
    >
      <PageIntro description="Susun bacaan PDF untuk siswa, lalu tambahkan video pendamping bila diperlukan." title="Materi" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {subjects.map((subject) => (
          <SubjectCard key={subject.slug} subject={subject} />
        ))}
      </div>
    </MentorWorkspaceShell>
  );
}

function KaptenMateriSubjectPageModule({
  catalogue,
  initialPage = 1,
  initialQuery = "",
  initialReadinessFilter = "",
  initialSort = "",
  initialSortDirection = "asc",
  initialStatusFilter = "",
  initialVideoFilter = "",
  session,
  subject,
}: {
  catalogue: KaptenMateriView[];
  initialPage?: number;
  initialQuery?: string;
  initialReadinessFilter?: string;
  initialSort?: MateriSortKey;
  initialSortDirection?: MateriSortDirection;
  initialStatusFilter?: string;
  initialVideoFilter?: string;
  session: SessionContext;
  subject: KaptenMateriSubjectView;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(materiCatalogueReducer, undefined, () => ({
    bulkError: null,
    bulkIntent: null,
    bulkNotice: null,
    bulkSelection: [],
    isBulkPending: false,
    lessons: catalogue
      .filter((lesson) => lesson.subjectSlug === subject.slug)
      .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code)),
    page: initialPage,
    query: initialQuery,
    readinessFilter: initialReadinessFilter,
    sort: initialSort,
    sortDirection: initialSortDirection,
    statusFilter: initialStatusFilter,
    tableVersion: 0,
    videoFilter: initialVideoFilter,
  }));
  const {
    bulkIntent,
    bulkSelection,
    isBulkPending,
    lessons,
    page,
    query,
    readinessFilter,
    sort,
    sortDirection,
    statusFilter,
    videoFilter,
  } = state;
  const returnTo = `/mentor/materi/subject/${subject.slug}`;

  function navigateCatalogue(next: MateriCatalogueQuery = {}) {
    router.push(buildMateriSubjectHref(subject.slug, {
      direction: next.direction ?? sortDirection,
      page: next.page ?? 1,
      q: next.q ?? query,
      readiness: next.readiness ?? readinessFilter,
      sort: next.sort ?? sort,
      status: next.status ?? statusFilter,
      video: next.video ?? videoFilter,
    }));
  }

  function filterVisibleLessons(value: string) {
    const normalizedValue = value.trim().toLocaleLowerCase();
    return lessons.filter(
      (lesson) =>
        (!normalizedValue ||
          [
            lesson.title,
            lesson.primaryMetric,
            lesson.documentName,
            lesson.hasOptionalVideo ? "video opsional" : "tanpa video",
            lesson.status,
            lesson.readiness === "incomplete" ? "belum siap" : "",
          ].some((candidate) => candidate.toLocaleLowerCase().includes(normalizedValue))) &&
        (!statusFilter || lesson.status === statusFilter) &&
        (!readinessFilter || lesson.readiness === readinessFilter) &&
        (!videoFilter || (videoFilter === "with-video" ? lesson.hasOptionalVideo : !lesson.hasOptionalVideo)),
    );
  }

  const filteredLessons = filterVisibleLessons(query);
  const sortedLessons = sortLessons(filteredLessons, sort, sortDirection);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(sortedLessons.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const pagedLessons = sortedLessons.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize,
  );
  const publishEligible = bulkSelection.length > 0 && bulkSelection.every(
    (lesson) => lesson.status === "draft" && lesson.readiness === "ready",
  );
  const unpublishEligible = bulkSelection.length > 0 && bulkSelection.every(
    (lesson) => lesson.status === "published",
  );
  const confirmation = bulkIntent === "publish"
    ? {
        confirm: "Terbitkan semua",
        description: `${bulkSelection.length} lesson akan tersedia untuk siswa.`,
        title: "Terbitkan lesson terpilih?",
      }
    : {
        confirm: "Batalkan terbit",
        description: `${bulkSelection.length} lesson tidak lagi tersedia untuk siswa dan kembali menjadi draf.`,
        title: "Batalkan penerbitan lesson?",
      };

  async function confirmBulkLifecycle() {
    if (!bulkIntent || isBulkPending || bulkSelection.length === 0) return;
    dispatch({ pending: true, type: "bulkPendingChanged" });
    dispatch({ error: null, type: "bulkErrorChanged" });
    const codes = bulkSelection.map((lesson) => lesson.code);
    try {
      const result = bulkIntent === "publish"
        ? await bulkPublishMateriLessonsAction(subject.slug, codes)
        : await bulkUnpublishMateriLessonsAction(subject.slug, codes);
      if (!result.ok) {
        dispatch({ error: result.message, type: "bulkErrorChanged" });
        return;
      }
      const affected = new Set(result.affectedCodes);
      dispatch({
        lessons: lessons.map((lesson) =>
          affected.has(lesson.code)
            ? { ...lesson, lifecycleStatus: result.status, status: result.status }
            : lesson,
        ),
        type: "lessonsChanged",
      });
      dispatch({ lessons: [], type: "bulkSelectionChanged" });
      dispatch({ intent: null, type: "bulkIntentChanged" });
      dispatch({ notice: result.message, type: "bulkNoticeChanged" });
      dispatch({ type: "tableVersionChanged" });
      router.refresh();
    } catch (error) {
      dispatch({
        error: error instanceof Error
          ? error.message
          : "Status lesson tidak dapat diubah saat ini. Coba lagi.",
        type: "bulkErrorChanged",
      });
    } finally {
      dispatch({ pending: false, type: "bulkPendingChanged" });
    }
  }

  async function applyLessonAction(
    lesson: KaptenMateriView,
    action: "archive" | "delete" | "publish" | "restore" | "unpublish",
  ) {
    if (isBulkPending || action === "delete") return;
    dispatch({ pending: true, type: "bulkPendingChanged" });
    dispatch({ error: null, type: "bulkErrorChanged" });
    try {
      if (action === "publish" || action === "unpublish") {
        const result = action === "publish"
          ? await bulkPublishMateriLessonsAction(subject.slug, [lesson.code])
          : await bulkUnpublishMateriLessonsAction(subject.slug, [lesson.code]);
        if (!result.ok) {
          dispatch({ error: result.message, type: "bulkErrorChanged" });
          return;
        }
        dispatch({
          lessons: lessons.map((item) =>
            item.code === lesson.code
              ? { ...item, lifecycleStatus: result.status, status: result.status }
              : item,
          ),
          type: "lessonsChanged",
        });
        dispatch({ notice: result.message, type: "bulkNoticeChanged" });
      } else {
        const result = action === "archive"
          ? await archiveMateriLessonAction(lesson.code)
          : await returnMateriLessonToDraftAction(lesson.code);
        if (!result.ok) {
          dispatch({ error: result.message, type: "bulkErrorChanged" });
          return;
        }
        dispatch({
          lessons: lessons.map((item) => item.code === lesson.code ? result.lesson : item),
          type: "lessonsChanged",
        });
        dispatch({ notice: result.message, type: "bulkNoticeChanged" });
      }
      dispatch({ type: "tableVersionChanged" });
      router.refresh();
    } catch (error) {
      dispatch({
        error: error instanceof Error
          ? error.message
          : "Status lesson tidak dapat diubah saat ini. Coba lagi.",
        type: "bulkErrorChanged",
      });
    } finally {
      dispatch({ pending: false, type: "bulkPendingChanged" });
    }
  }

  return (
    <MateriSubjectCatalogueScreen
      actions={{
        onApplyLessonAction: (lesson, action) => { void applyLessonAction(lesson, action); },
        onBulkIntent: (intent, selected) => {
          dispatch({ lessons: selected, type: "bulkSelectionChanged" });
          dispatch({ intent, type: "bulkIntentChanged" });
        },
        onClearBulkError: () => dispatch({ error: null, type: "bulkErrorChanged" }),
        onCloseBulkDialog: () => {
          if (!isBulkPending) {
            dispatch({ error: null, type: "bulkErrorChanged" });
            dispatch({ intent: null, type: "bulkIntentChanged" });
            dispatch({ lessons: [], type: "bulkSelectionChanged" });
          }
        },
        onConfirmBulkLifecycle: () => { void confirmBulkLifecycle(); },
        onReadinessFilterChange: (value) => navigateCatalogue({ readiness: value }),
        onStatusFilterChange: (value) => navigateCatalogue({ status: value }),
        onVideoFilterChange: (value) => navigateCatalogue({ video: value }),
      }}
      data={{
        confirmation,
        filteredCount: filteredLessons.length,
        pageCount,
        pagedLessons,
        publishEligible,
        unpublishEligible,
        visiblePage,
      }}
      returnTo={returnTo}
      session={session}
      state={state}
      subject={subject}
    />
  );
}

type MateriSubjectCatalogueActions = {
  onApplyLessonAction: (lesson: KaptenMateriView, action: "archive" | "delete" | "publish" | "restore" | "unpublish") => void;
  onBulkIntent: (intent: "publish" | "unpublish", lessons: KaptenMateriView[]) => void;
  onClearBulkError: () => void;
  onCloseBulkDialog: () => void;
  onConfirmBulkLifecycle: () => void;
  onReadinessFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onVideoFilterChange: (value: string) => void;
};

type MateriSubjectCatalogueData = {
  confirmation: { confirm: string; description: string; title: string };
  filteredCount: number;
  pageCount: number;
  pagedLessons: KaptenMateriView[];
  publishEligible: boolean;
  unpublishEligible: boolean;
  visiblePage: number;
};

function MateriSubjectCatalogueScreen({
  actions,
  data,
  returnTo,
  session,
  state,
  subject,
}: {
  actions: MateriSubjectCatalogueActions;
  data: MateriSubjectCatalogueData;
  returnTo: string;
  session: SessionContext;
  state: MateriCatalogueState;
  subject: KaptenMateriSubjectView;
}) {
  const {
    bulkError,
    bulkIntent,
    bulkNotice,
    isBulkPending,
    query,
    readinessFilter,
    sort,
    sortDirection,
    statusFilter,
    tableVersion,
    videoFilter,
  } = state;
  const {
    confirmation,
    filteredCount,
    pageCount,
    pagedLessons,
    publishEligible,
    unpublishEligible,
    visiblePage,
  } = data;

  const buildHref = (next: MateriCatalogueQuery = {}) => buildMateriSubjectHref(subject.slug, {
    direction: next.direction ?? sortDirection,
    page: next.page ?? 1,
    q: next.q ?? query,
    readiness: next.readiness ?? readinessFilter,
    sort: next.sort ?? sort,
    status: next.status ?? statusFilter,
    video: next.video ?? videoFilter,
  });
  const clearFiltersHref = buildMateriSubjectHref(subject.slug, { sort, direction: sortDirection });
  const hasActiveFilters = Boolean(query || readinessFilter || statusFilter || videoFilter);
  const activeFilters: DataTableFilter[] = [
    ...(statusFilter ? [{ id: "status", label: "Status", value: statusLabel(statusFilter as KaptenMateriView["status"]), href: buildHref({ status: "" }) }] : []),
    ...(readinessFilter ? [{ id: "readiness", label: "Kesiapan", value: readinessLabel(readinessFilter as KaptenMateriView["readiness"]), href: buildHref({ readiness: "" }) }] : []),
    ...(videoFilter ? [{ id: "video", label: "Video", value: videoFilter === "with-video" ? "Dengan video opsional" : "Tanpa video", href: buildHref({ video: "" }) }] : []),
  ];
  const filterPanel = (
    <div className="space-y-3 p-1">
      <p className="px-2 text-xs font-semibold tracking-[0.02em] text-secondary-500">Filter lesson</p>
      <CatalogueFilter
        label="Filter status"
        onValueChange={actions.onStatusFilterChange}
        options={[
          { label: "Semua status", value: "" },
          { label: "Draf", value: "draft" },
          { label: "Diterbitkan", value: "published" },
          { label: "Diarsipkan", value: "archived" },
          { label: "Terjadwal", value: "scheduled" },
        ]}
        value={statusFilter}
      />
      <CatalogueFilter
        label="Filter kesiapan PDF"
        onValueChange={actions.onReadinessFilterChange}
        options={[
          { label: "Semua kesiapan PDF", value: "" },
          { label: "PDF siap", value: "ready" },
          { label: "PDF belum siap", value: "incomplete" },
        ]}
        value={readinessFilter}
      />
      <CatalogueFilter
        label="Filter video opsional"
        onValueChange={actions.onVideoFilterChange}
        options={[
          { label: "Semua video", value: "" },
          { label: "Dengan video opsional", value: "with-video" },
          { label: "Tanpa video", value: "without-video" },
        ]}
        value={videoFilter}
      />
    </div>
  );
  const columns: DataTableColumn<KaptenMateriView>[] = [
    {
      cell: (lesson) => (
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <Link
              className="block min-w-0 max-w-full truncate font-semibold text-secondary-900 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20"
              href={buildEditorHref(lesson, returnTo)}
              title={lesson.title}
            >
              {lesson.title}
            </Link>
            <span className="mt-1 block max-w-full truncate text-xs text-secondary-500" title={lesson.primaryMetric}>
              {lesson.primaryMetric}
            </span>
          </div>
        </div>
      ),
      headerClassName: "min-w-[18rem]",
      hideable: false,
      id: "materi",
      label: "Materi",
      sortKey: "title",
      width: 36,
    },
    {
      cell: (lesson) => (
        <div className="min-w-0 max-w-full">
          <span className="block max-w-full truncate text-sm text-secondary-700" title={lesson.documentName}>
            {lesson.documentName}
          </span>
          <span className="mt-1 block text-xs font-semibold text-secondary-500">
            {readinessLabel(lesson.readiness)}
          </span>
        </div>
      ),
      headerClassName: "min-w-[14rem]",
      id: "document",
      label: "Dokumen",
      width: 25,
    },
    {
      cell: (lesson) => (
        <span className={lesson.hasOptionalVideo ? "font-medium text-secondary-700" : "text-secondary-500"}>
          {videoLabel(lesson)}
        </span>
      ),
      headerClassName: "min-w-[9rem]",
      id: "video",
      label: "Video",
      width: 16,
    },
    {
      cell: (lesson) => <StatusPill status={lesson.status} />,
      headerClassName: "min-w-[8rem]",
      id: "status",
      label: "Status",
      sortKey: "status",
      width: 13,
    },
    {
      cell: (lesson) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label={`Preview ${lesson.title}`}
            render={<Link href={buildEditorHref(lesson, returnTo, true)} />}
            size="icon-sm"
            title="Preview"
            variant="brandOutline"
          >
            <Eye />
          </Button>
          <Button
            aria-label={`Edit ${lesson.title}`}
            render={<Link href={buildEditorHref(lesson, returnTo)} />}
            size="icon-sm"
            title="Edit materi"
            variant="brand"
          >
            <Pencil />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button aria-label={`Aksi untuk ${lesson.title}`} size="icon-sm" type="button" variant="ghost" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                {lesson.status === "draft" ? (
                  <DropdownMenuItem disabled={lesson.readiness !== "ready"} onClick={() => actions.onApplyLessonAction(lesson, "publish")}>
                    <Upload />
                    Terbitkan
                  </DropdownMenuItem>
                ) : null}
                {lesson.status === "published" ? (
                  <DropdownMenuItem onClick={() => actions.onApplyLessonAction(lesson, "unpublish")}>
                    <FilePenLine />
                    Batalkan terbit
                  </DropdownMenuItem>
                ) : null}
                {lesson.status !== "archived" ? (
                  <DropdownMenuItem onClick={() => actions.onApplyLessonAction(lesson, "archive")}>
                    <Archive />
                    Arsipkan
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => actions.onApplyLessonAction(lesson, "restore")}>
                    <Upload />
                    Pulihkan
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled variant="destructive">
                  <Trash2 />
                  Hapus
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      cellClassName: "text-right",
      headerClassName: "min-w-[8.5rem] text-right",
      id: "actions",
      label: "Aksi",
      width: 10,
    },
  ];
  const emptyState = (
    <div className="px-5 py-8 text-left sm:px-8 sm:py-10">
      <FileText aria-hidden="true" className="size-7 text-primary-300" />
      <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-secondary-900">
        {hasActiveFilters ? "Tidak ada lesson yang cocok" : "Belum ada lesson"}
      </h2>
      <p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">
        {hasActiveFilters
          ? "Coba ubah kata kunci atau filter untuk menemukan lesson lain."
          : "Buat materi baru untuk mulai mengisi subject ini."}
      </p>
      {hasActiveFilters ? (
        <Button
          className="mt-5"
          render={<Link href={clearFiltersHref} />}
          size="sm"
          variant="brandOutline"
        >
          Reset filter
        </Button>
      ) : null}
    </div>
  );
  const previousHref = visiblePage > 1 ? buildHref({ page: visiblePage - 1 }) : undefined;
  const nextHref = visiblePage < pageCount ? buildHref({ page: visiblePage + 1 }) : undefined;

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={`${subject.code} · Materi`}
      searchPlaceholder="Cari lesson..."
      session={session}
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <Button
            aria-label="Kembali ke semua materi"
            render={<Link href="/mentor/materi" />}
            size="icon-sm"
            title="Kembali ke semua materi"
            variant="ghost"
          >
            <ChevronLeft />
          </Button>
          <PageIntro
            action={
              <Button
                aria-label="Buat materi baru"
                render={<Link href={buildCreateHref(subject.slug)} />}
                size="icon"
                title="Buat materi baru"
                variant="brand"
              >
                <Plus />
              </Button>
            }
            title={subject.name}
          />
        </section>

        {bulkNotice ? (
          <p className="rounded-2xl border border-primary-200 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-900" role="status">
            {bulkNotice}
          </p>
        ) : null}
        {bulkError && !bulkIntent ? (
          <p aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {bulkError}
          </p>
        ) : null}

        <section className="space-y-3">
          <MentorCatalogueTable
            caption={`Daftar materi subject ${subject.name}`}
            clearFiltersHref={clearFiltersHref}
            columns={columns}
            emptyState={emptyState}
            filterPanel={filterPanel}
            filters={activeFilters}
            getRowId={(lesson) => lesson.code}
            headerActions={<span className="text-sm text-secondary-500">{filteredCount} lesson</span>}
            headingIcon={<FileText size={18} />}
            key={tableVersion}
            onRowClick={undefined}
            rows={pagedLessons}
            search={{
              action: `/mentor/materi/subject/${subject.slug}`,
              clearHref: buildHref({ q: "" }),
              hiddenFields: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(readinessFilter ? { readiness: readinessFilter } : {}),
                ...(videoFilter ? { video: videoFilter } : {}),
                ...(sort ? { sort } : {}),
                ...(sort && sortDirection === "desc" ? { direction: sortDirection } : {}),
              },
              label: "Cari materi",
              placeholder: "Cari judul, PDF, video, atau status...",
              value: query,
            }}
            selection
            selectionActions={({ rows }) => (
              <MateriBulkActions
                onRequest={actions.onBulkIntent}
                rows={rows}
              />
            )}
            sort={{
              direction: sortDirection,
              href: (nextSortKey, nextDirection) => buildHref({
                direction: nextDirection,
                page: 1,
                sort: (nextSortKey ?? "") as MateriSortKey,
              }),
              key: sort || null,
            }}
            tableClassName="min-w-[760px]"
            wrapperClassName="border border-primary-100 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]"
          />
          <PaginationLinks
            nextHref={nextHref}
            page={visiblePage}
            pageCount={pageCount}
            previousHref={previousHref}
          />
        </section>
      </div>

      <Dialog onOpenChange={actions.onCloseBulkDialog} open={Boolean(bulkIntent)}>
        <DialogContent pending={isBulkPending} showCloseButton={!isBulkPending} variant="info">
          <DialogHeader>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription>{confirmation.description}</DialogDescription>
          </DialogHeader>
          {bulkError ? (
            <div aria-live="assertive" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {bulkError}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose disabled={isBulkPending} render={<Button type="button" variant="brandOutline" />}>
              Batal
            </DialogClose>
            <Button
              disabled={isBulkPending || (bulkIntent === "publish" ? !publishEligible : !unpublishEligible)}
              onClick={actions.onConfirmBulkLifecycle}
              type="button"
              variant="brand"
            >
              {isBulkPending ? "Memproses..." : confirmation.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriPageModule, KaptenMateriSubjectPageModule };
