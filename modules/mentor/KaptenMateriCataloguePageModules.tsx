"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  Eye,
  FilePenLine,
  FileText,
  Plus,
  Trash2,
  Upload,
} from "@/lib/icons";
import { useReducer, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { DataTableColumn } from "@/components/ui/data-table";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import { Badge } from "@/components/ui/badge";
import { showToast } from "@/components/ui/toast";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
  ReferenceStatusBadge,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_SURFACE_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import type { SessionContext } from "@/lib/auth/types";
import {
  buildMentorMateriDetailHref as buildCanonicalMateriDetailHref,
  buildMentorMateriSubjectHref as buildCanonicalMateriSubjectHref,
  type MateriSubjectQuery,
} from "@/lib/navigation/canonical-context";
import { MentorMateriCreateDialog } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { MentorCatalogueTable } from "@/modules/mentor/components/mentor-catalogue-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  PaginationLinks,
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
import { cn } from "@/lib/utils";

type MateriSortKey = "" | "status" | "title";
type MateriSortDirection = "asc" | "desc";
type MateriStatusFilter = "" | "archived" | "draft" | "published" | "scheduled";

type MateriCatalogueQuery = {
  direction?: MateriSortDirection;
  page?: number;
  q?: string;
  sort?: MateriSortKey;
  status?: MateriStatusFilter;
};

function buildEditorHref(
  lesson: KaptenMateriView,
  returnTo: string,
  preview = false,
) {
  return buildCanonicalMateriDetailHref(lesson.code, { preview, returnTo });
}

function buildMateriSubjectHref(
  subjectSlug: string,
  query: MateriCatalogueQuery = {},
) {
  return buildCanonicalMateriSubjectHref(subjectSlug, {
    direction: query.direction,
    page: query.page,
    q: query.q,
    sort: query.sort as MateriSubjectQuery["sort"],
    status: query.status as MateriSubjectQuery["status"],
  });
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
    const comparison =
      sort === "title"
        ? left.title.localeCompare(right.title, "id", { sensitivity: "base" })
        : statusOrder[left.status] - statusOrder[right.status];

    return (
      comparison ||
      left.position - right.position ||
      left.code.localeCompare(right.code)
    );
  });

  return direction === "desc" ? sorted.reverse() : sorted;
}

type MateriCatalogueState = {
  isBulkPending: boolean;
  lessons: KaptenMateriView[];
  page: number;
  query: string;
  sort: MateriSortKey;
  sortDirection: MateriSortDirection;
  statusFilter: MateriStatusFilter;
  tableVersion: number;
};

type MateriCatalogueAction =
  | { type: "bulkPendingChanged"; pending: boolean }
  | { lessons: KaptenMateriView[]; type: "lessonsChanged" }
  | { type: "tableVersionChanged" };

function materiCatalogueReducer(
  state: MateriCatalogueState,
  action: MateriCatalogueAction,
): MateriCatalogueState {
  switch (action.type) {
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

function SubjectCard({ subject }: { subject: KaptenMateriSubjectView }) {
  const subjectCategory = getSubjectCategory(subject.code);

  return (
    <Link
      className={cn(
        REFERENCE_SURFACE_CLASS_NAMES.raised,
        REFERENCE_SURFACE_CLASS_NAMES.raisedStableInteractive,
        "group flex min-w-0 flex-col p-4",
      )}
      href={buildMateriSubjectHref(subject.slug)}
    >
      <div className="flex items-start gap-4">
        <Badge
          className="bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] !font-normal text-[var(--voyage-forest)]"
          size="sm"
          tone="category"
        >
          {subjectCategory}
        </Badge>
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-secondary-900">
        {subject.code}
      </h2>
      <p className="mt-1 text-sm leading-6 text-secondary-600">
        {subject.name}
      </p>
    </Link>
  );
}

function KaptenMateriPageModule({
  initialCreateDialogOpen = false,
  initialReturnTo,
  initialSubjectSlug,
  session,
  subjects,
}: {
  catalogue: KaptenMateriView[];
  initialCreateDialogOpen?: boolean;
  initialReturnTo?: string;
  initialSubjectSlug?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  const router = useRouter();
  const [createDialogOpen, setCreateDialogOpen] = useState(
    initialCreateDialogOpen,
  );

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open && initialCreateDialogOpen) {
      router.replace("/mentor/materi", { scroll: false });
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel="Materi"
      searchPlaceholder="Cari materi..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            subjects.length ? (
              <Button
                onClick={() => setCreateDialogOpen(true)}
                size="default"
                type="button"
                variant="default"
              >
                <Plus />
                Buat Materi
              </Button>
            ) : undefined
          }
          title="Materi"
          titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        />

        {subjects.length ? (
          <section
      aria-label="Daftar subtes Materi"
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {subjects.map((subject) => (
              <SubjectCard key={subject.slug} subject={subject} />
            ))}
          </section>
        ) : (
          <ReferenceSurface className="min-h-56" variant="inset">
            <ReferenceEmptyState
              description="Belum ada subtes untuk menampung bacaan dan video pendamping."
              icon={FileText}
              title="Belum ada subtes Materi"
            />
          </ReferenceSurface>
        )}
      </div>
      <MentorMateriCreateDialog
        initialSubjectSlug={initialSubjectSlug}
        onOpenChange={handleCreateDialogOpenChange}
        open={createDialogOpen}
        returnTo={initialReturnTo}
        session={session}
        subjects={subjects}
      />
    </MentorWorkspaceShell>
  );
}

function KaptenMateriSubjectPageModule({
  catalogue,
  initialPage = 1,
  initialQuery = "",
  initialSort = "",
  initialSortDirection = "asc",
  initialStatusFilter = "",
  session,
  subjects,
  subject,
}: {
  catalogue: KaptenMateriView[];
  initialPage?: number;
  initialQuery?: string;
  initialSort?: MateriSortKey;
  initialSortDirection?: MateriSortDirection;
  initialStatusFilter?: MateriStatusFilter;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
  subject: KaptenMateriSubjectView;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    materiCatalogueReducer,
    undefined,
    () => ({
      isBulkPending: false,
      lessons: catalogue
        .filter((lesson) => lesson.subjectSlug === subject.slug)
        .sort(
          (a, b) => a.position - b.position || a.code.localeCompare(b.code),
        ),
      page: initialPage,
      query: initialQuery,
      sort: initialSort,
      sortDirection: initialSortDirection,
      statusFilter: initialStatusFilter,
      tableVersion: 0,
    }),
  );
  const {
    isBulkPending,
    lessons,
    page,
    query,
    sort,
    sortDirection,
    statusFilter,
  } = state;
  const returnTo = buildMateriSubjectHref(subject.slug, {
    direction: sortDirection,
    page,
    q: query,
    sort,
    status: statusFilter,
  });

  function navigateCatalogue(next: MateriCatalogueQuery = {}) {
    router.push(
      buildMateriSubjectHref(subject.slug, {
        direction: next.direction ?? sortDirection,
        page: next.page ?? 1,
        q: next.q ?? query,
        sort: next.sort ?? sort,
        status: next.status ?? statusFilter,
      }),
    );
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
          ].some((candidate) =>
            candidate.toLocaleLowerCase().includes(normalizedValue),
          )) &&
        (!statusFilter || lesson.status === statusFilter),
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

  async function applyLessonAction(
    lesson: KaptenMateriView,
    action: "archive" | "delete" | "publish" | "restore" | "unpublish",
  ) {
    if (isBulkPending || action === "delete") return;
    dispatch({ pending: true, type: "bulkPendingChanged" });
    try {
      if (action === "publish" || action === "unpublish") {
        const result =
          action === "publish"
            ? await bulkPublishMateriLessonsAction(subject.slug, [lesson.code])
            : await bulkUnpublishMateriLessonsAction(subject.slug, [
                lesson.code,
              ]);
        if (!result.ok) {
          showToast(result.message, { variant: "error" });
          return;
        }
        dispatch({
          lessons: lessons.map((item) =>
            item.code === lesson.code
              ? {
                  ...item,
                  lifecycleStatus: result.status,
                  status: result.status,
                }
              : item,
          ),
          type: "lessonsChanged",
        });
        showToast(result.message, { variant: "success" });
      } else {
        const result =
          action === "archive"
            ? await archiveMateriLessonAction(lesson.code)
            : await returnMateriLessonToDraftAction(lesson.code);
        if (!result.ok) {
          showToast(result.message, { variant: "error" });
          return;
        }
        dispatch({
          lessons: lessons.map((item) =>
            item.code === lesson.code ? result.lesson : item,
          ),
          type: "lessonsChanged",
        });
        showToast(result.message, { variant: "success" });
      }
      dispatch({ type: "tableVersionChanged" });
      router.refresh();
    } catch {
      showToast(
        "Status materi belum dapat diubah. Periksa koneksi lalu coba lagi.",
        { variant: "error" },
      );
    } finally {
      dispatch({ pending: false, type: "bulkPendingChanged" });
    }
  }

  return (
    <MateriSubjectCatalogueScreen
      actions={{
        onApplyLessonAction: (lesson, action) => {
          void applyLessonAction(lesson, action);
        },
        onStatusFilterChange: (value) => navigateCatalogue({ status: value }),
      }}
      data={{
        pageCount,
        pagedLessons,
        rowNumberOffset: (visiblePage - 1) * pageSize,
        visiblePage,
      }}
      returnTo={returnTo}
      session={session}
      state={state}
      subjects={subjects}
      subject={subject}
    />
  );
}

type MateriSubjectCatalogueActions = {
  onApplyLessonAction: (
    lesson: KaptenMateriView,
    action: "archive" | "delete" | "publish" | "restore" | "unpublish",
  ) => void;
  onStatusFilterChange: (value: MateriStatusFilter) => void;
};

type MateriSubjectCatalogueData = {
  pageCount: number;
  pagedLessons: KaptenMateriView[];
  rowNumberOffset: number;
  visiblePage: number;
};

const materiStatusTabs: Array<{
  label: string;
  value: MateriStatusFilter;
}> = [
  { label: "Semua", value: "" },
  { label: "Draf", value: "draft" },
  { label: "Diterbitkan", value: "published" },
  { label: "Terjadwal", value: "scheduled" },
  { label: "Diarsipkan", value: "archived" },
];

function MateriStatusTabs({
  items,
  onChange,
  value,
}: {
  items: readonly KaptenMateriView[];
  onChange: (value: MateriStatusFilter) => void;
  value: MateriStatusFilter;
}) {
  const counts = {
    "": items.length,
    archived: items.filter((item) => item.status === "archived").length,
    draft: items.filter((item) => item.status === "draft").length,
    published: items.filter((item) => item.status === "published").length,
    scheduled: items.filter((item) => item.status === "scheduled").length,
  };

  return (
    <CompactFilterTabs
      aria-label="Filter status Materi"
      className="w-full"
      items={materiStatusTabs.map((tab) => ({
        label: (
          <>
            <span>{tab.label}</span>
            <span className="text-xs font-medium opacity-70">
              ({counts[tab.value]})
            </span>
          </>
        ),
        value: tab.value,
      }))}
      onValueChange={onChange}
      value={value}
    />
  );
}

function MateriSubjectCatalogueEmptyState({
  clearFiltersHref,
  hasActiveFilters,
}: {
  clearFiltersHref: string;
  hasActiveFilters: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center sm:px-8 sm:py-10">
      <FileText aria-hidden="true" className="size-7 text-primary-300" />
      <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-secondary-900">
        {hasActiveFilters ? "Tidak ada materi yang cocok" : "Belum ada materi"}
      </h2>
      <p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">
        {hasActiveFilters
          ? "Coba ubah kata kunci atau filter untuk menemukan materi lain."
          : "Buat materi baru untuk mulai mengisi subtes ini."}
      </p>
      {hasActiveFilters ? (
        <Button
          className="mt-5"
          render={<Link href={clearFiltersHref} />}
          size="default"
          variant="outline"
        >
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}

function MateriCreateDialogTrigger({
  ariaLabel,
  children,
  initialSubjectSlug,
  returnTo,
  session,
  subjects,
}: {
  ariaLabel?: string;
  children: ReactNode;
  initialSubjectSlug?: string;
  returnTo?: string;
  session: SessionContext;
  subjects: KaptenMateriSubjectView[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        size="default"
        type="button"
        variant="default"
      >
        {children}
      </Button>
      <MentorMateriCreateDialog
        initialSubjectSlug={initialSubjectSlug}
        onOpenChange={setOpen}
        open={open}
        returnTo={returnTo}
        session={session}
        subjects={subjects}
      />
    </>
  );
}

function MateriSubjectCatalogueScreen({
  actions,
  data,
  returnTo,
  session,
  state,
  subjects,
  subject,
}: {
  actions: MateriSubjectCatalogueActions;
  data: MateriSubjectCatalogueData;
  returnTo: string;
  session: SessionContext;
  state: MateriCatalogueState;
  subjects: KaptenMateriSubjectView[];
  subject: KaptenMateriSubjectView;
}) {
  const router = useRouter();
  const {
    lessons,
    query,
    sort,
    sortDirection,
    statusFilter,
    tableVersion,
  } = state;
  const { pageCount, pagedLessons, rowNumberOffset, visiblePage } = data;

  const buildHref = (next: MateriCatalogueQuery = {}) =>
    buildMateriSubjectHref(subject.slug, {
      direction: next.direction ?? sortDirection,
      page: next.page ?? 1,
      q: next.q ?? query,
      sort: next.sort ?? sort,
      status: next.status ?? statusFilter,
    });
  const clearFiltersHref = buildMateriSubjectHref(subject.slug, {
    sort,
    direction: sortDirection,
  });
  const hasActiveFilters = Boolean(query || statusFilter);
  const columns: DataTableColumn<KaptenMateriView>[] = [
    {
      cell: (lesson) => (
        <span
          className="block min-w-0 max-w-full truncate font-semibold text-secondary-900"
          title={lesson.title}
        >
          {lesson.title}
        </span>
      ),
      headerClassName: "min-w-[20rem]",
      id: "materi",
      label: "Materi",
      sortKey: "title",
      width: 68,
    },
    {
      cell: (lesson) => (
        <ReferenceStatusBadge
          size="sm"
          status={lesson.status}
        />
      ),
      headerClassName: "min-w-[8rem]",
      id: "status",
      label: "Status",
      sortKey: "status",
      width: 20,
    },
  ];

  const materiRowContextMenu = (lesson: KaptenMateriView) => (
    <ContextMenuContent className="w-52">
      <ContextMenuGroup>
        <ContextMenuItem
          onClick={() => router.push(buildEditorHref(lesson, returnTo, true))}
        >
          <Eye />
          Pratinjau
        </ContextMenuItem>
        {lesson.status === "draft" ? (
          <ContextMenuItem
            disabled={lesson.readiness !== "ready"}
            onClick={() => actions.onApplyLessonAction(lesson, "publish")}
          >
            <Upload />
            Terbitkan
          </ContextMenuItem>
        ) : null}
        {lesson.status === "published" ? (
          <ContextMenuItem
            onClick={() => actions.onApplyLessonAction(lesson, "unpublish")}
          >
            <FilePenLine />
            Batalkan terbit
          </ContextMenuItem>
        ) : null}
        {lesson.status !== "archived" ? (
          <ContextMenuItem
            onClick={() => actions.onApplyLessonAction(lesson, "archive")}
          >
            <Archive />
            Arsipkan
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => actions.onApplyLessonAction(lesson, "restore")}
          >
            <Upload />
            Pulihkan
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem disabled variant="destructive">
          <Trash2 />
          Hapus
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  const previousHref =
    visiblePage > 1 ? buildHref({ page: visiblePage - 1 }) : undefined;
  const nextHref =
    visiblePage < pageCount ? buildHref({ page: visiblePage + 1 }) : undefined;

  return (
    <MentorWorkspaceShell
      activeLabel="Materi"
      breadcrumbLabel={subject.code}
      searchPlaceholder="Cari materi..."
      session={session}
      sidebarAppearance="reference"
    >
      <div className="space-y-8">
        <ReferencePageHeader
          actions={
            <MateriCreateDialogTrigger
              ariaLabel="Buat materi baru"
              initialSubjectSlug={subject.slug}
              returnTo={returnTo}
              session={session}
              subjects={subjects}
            >
              <Plus />
              Buat Materi
            </MateriCreateDialogTrigger>
          }
          title={subject.code}
        />

        <section className="min-w-0 space-y-3">
          <MentorCatalogueTable
            caption={`Daftar materi subject ${subject.name}`}
            clearFiltersHref={clearFiltersHref}
            columns={columns}
            emptyState={
              <MateriSubjectCatalogueEmptyState
                clearFiltersHref={clearFiltersHref}
                hasActiveFilters={hasActiveFilters}
              />
            }
            getRowId={(lesson) => lesson.code}
            key={tableVersion}
            onRowClick={(lesson) =>
              router.push(buildEditorHref(lesson, returnTo))
            }
            rowContextMenu={materiRowContextMenu}
            rowNumberOffset={rowNumberOffset}
            rows={pagedLessons}
            search={{
              action: `/mentor/materi/subject/${subject.slug}`,
              clearHref: buildHref({ q: "" }),
              hiddenFields: {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(sort ? { sort } : {}),
                direction: sortDirection,
              },
              label: "Cari materi",
              placeholder: "Cari judul atau status...",
              value: query,
            }}
            showRowNumbers
            sort={{
              direction: sortDirection,
              href: (nextSortKey, nextDirection) =>
                buildHref({
                  direction: nextDirection,
                  page: 1,
                  sort: (nextSortKey ?? "") as MateriSortKey,
                }),
              key: sort || null,
            }}
            tableClassName="min-w-[760px]"
            toolbarBelowSearch={
              <MateriStatusTabs
                items={lessons}
                onChange={actions.onStatusFilterChange}
                value={statusFilter}
              />
            }
            wrapperClassName={cn(
              REFERENCE_SURFACE_CLASS_NAMES.raised,
              "min-w-0",
            )}
          />
          <PaginationLinks
            nextHref={nextHref}
            page={visiblePage}
            pageCount={pageCount}
            previousHref={previousHref}
          />
        </section>
      </div>
    </MentorWorkspaceShell>
  );
}

export { KaptenMateriPageModule, KaptenMateriSubjectPageModule };
