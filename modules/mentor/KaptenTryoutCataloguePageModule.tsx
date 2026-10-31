"use client";

import Link from "next/link";
import {
  Archive,
  ClipboardList,
  Eye,
  EyeOff,
  Lock,
  MoreHorizontal,
  Plus,
} from "@/lib/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";

import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { showToast } from "@/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserCardPopover } from "@/components/ui/user-card-popover";
import type { SessionContext } from "@/lib/auth/types";
import {
  MentorAssessmentFeedback,
  MentorAssessmentGrid,
  MentorAssessmentPagination,
  MentorAssessmentPanel,
  MentorAssessmentSearch,
  MentorAssessmentToolbar,
  MentorBulkMenu,
  MentorFilterChips,
  MentorGridMenu,
  MentorStatusFilterMenu,
  mentorSelectionColumn,
} from "@/modules/mentor/components/mentor-assessment-table";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import styles from "@/modules/mentor/quiz-dashboard.module.css";
import { archiveTryoutAction, setTryoutHiddenAction } from "@/modules/mentor/tryout-actions";
import { MentorTryoutCreateDialog } from "@/modules/mentor/KaptenTryoutBuilderPageModule";
import { buildTryoutCatalogueHref, readTryoutCatalogueContext, withTryoutCatalogueReturn, type TryoutCatalogueStatus } from "@/lib/navigation/mentor-tryout-continuity";

type TryoutItem = {
  creator: { avatarSrc: string | null; name: string; subject: string | null } | null;
  description: string;
  id: string;
  isHidden?: boolean;
  locked: boolean;
  sections: readonly unknown[];
  status: "draft" | "published" | "archived";
  title: string;
};

type TryoutMutation = "archive" | "hide" | "show";

/** The single status a Tryout shows: archived > hidden > published > draft. */
function displayStatus(item: TryoutItem): TryoutCatalogueStatus {
  if (item.status === "archived") return "archived";
  if (item.isHidden) return "hidden";
  return item.status;
}

const statusLabels: Record<TryoutCatalogueStatus, string> = {
  archived: "Diarsipkan",
  draft: "Draf",
  hidden: "Disembunyikan",
  published: "Diterbitkan",
};
const statusTones = {
  archived: "neutral",
  draft: "neutral",
  hidden: "attention",
  published: "success",
} as const;
const columnLabels: Record<string, string> = {
  title: "Tryout",
  creator: "Pembuat",
  sections: "Subtes",
  status: "Status",
};
const mutationLabels: Record<TryoutMutation, string> = {
  archive: "diarsipkan",
  hide: "disembunyikan",
  show: "ditampilkan kembali",
};

function tryoutColumns({
  busy,
  onArchive,
  onToggleHidden,
  returnTo,
}: {
  busy: boolean;
  onArchive: (item: TryoutItem) => void;
  onToggleHidden: (item: TryoutItem) => void;
  returnTo: string;
}): ColumnDef<TryoutItem>[] {
  return [
    {
      accessorKey: "title",
      size: 350,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList
              aria-hidden="true"
              className="size-4 shrink-0 text-primary-800"
            />
            <Link
              aria-label={
                item.status === "archived"
                  ? `Buka riwayat ${item.title}`
                  : `Buka ${item.title}`
              }
              className={`${styles.quizTitle} min-w-0 motion-reduce:transition-none`}
              href={withTryoutCatalogueReturn(
                `/mentor/tryout/${item.id}`,
                returnTo,
              )}
              title={item.title}
            >
              {item.title}
            </Link>
            {item.locked ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        aria-label="Tryout terkunci"
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-secondary-500 outline-none transition-colors hover:bg-primary-50 hover:text-secondary-900 focus-visible:ring-2 focus-visible:ring-primary-700/40 motion-reduce:transition-none"
                        role="img"
                        tabIndex={0}
                      />
                    }
                  >
                    <Lock aria-hidden="true" className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>
                    Tryout terkunci karena peserta sudah mulai mengerjakannya.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "creator",
      size: 88,
      cell: ({ row }) =>
        row.original.creator ? (
          <UserCardPopover {...row.original.creator} />
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "sections",
      size: 115,
      cell: ({ row }) => row.original.sections.length,
    },
    {
      accessorKey: "status",
      size: 140,
      cell: ({ row }) => {
        const status = displayStatus(row.original);
        return (
          <Badge size="sm" tone={statusTones[status]}>
            {statusLabels[status]}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      size: 60,
      enableHiding: false,
      enableSorting: false,
      header: () => <span className={styles.srOnly}>Tindakan</span>,
      cell: ({ row }) => {
        const item = row.original;
        if (item.status === "archived") return null;
        return (
          <MentorGridMenu
            className={styles.iconButton}
            disabled={busy}
            label={`Tindakan untuk ${item.title}`}
            trigger={<MoreHorizontal size={16} />}
          >
            {item.status === "published" ? (
              <DropdownMenuItem
                disabled={busy}
                onClick={() => onToggleHidden(item)}
                size="sm"
              >
                {item.isHidden ? <Eye /> : <EyeOff />}
                {item.isHidden ? "Tampilkan" : "Sembunyikan"}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={busy}
              onClick={() => onArchive(item)}
              size="sm"
              variant="destructive"
            >
              <Archive />
              Arsipkan
            </DropdownMenuItem>
          </MentorGridMenu>
        );
      },
    },
  ];
}

function KaptenTryoutCataloguePageModule({
  initialCreateDialogOpen = false,
  initialItems,
  session,
}: {
  initialCreateDialogOpen?: boolean;
  initialItems: TryoutItem[];
  session: SessionContext;
}) {
  "use no memo"; // TanStack Table's mutable table API cannot be safely memoized by the React Compiler.

  const router = useRouter();
  const searchParams = useSearchParams();
  const [createDialogOpen, setCreateDialogOpen] = useState(
    initialCreateDialogOpen,
  );
  const [pageSize, setPageSize] = useState(10);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string[] | null>(null);
  const [archiveTargets, setArchiveTargets] = useState<TryoutItem[] | null>(
    null,
  );
  const mutationInFlight = useRef(false);
  const context = readTryoutCatalogueContext(new URLSearchParams(searchParams.toString()));
  const { q: query, status: statusFilter, page } = context;
  function updateContext(patch: Partial<typeof context>, replace = false) {
    const href = buildTryoutCatalogueHref({ ...context, ...patch });
    window.history[replace ? "replaceState" : "pushState"](null, "", href);
  }
  function navigate(patch: Partial<typeof context>) {
    if (saving) return;
    setSelection({});
    updateContext({ page: 1, ...patch });
  }

  const filteredItems = initialItems.filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    return (
      (!needle ||
        [
          item.title,
          item.description,
          statusLabels[displayStatus(item)],
          item.locked ? "terkunci" : "",
        ].some((value) => value.toLocaleLowerCase().includes(needle))) &&
      (!statusFilter || displayStatus(item) === statusFilter)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleItems = filteredItems.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize,
  );
  const returnTo = buildTryoutCatalogueHref({ ...context, page: visiblePage });
  const clearFilters = () => navigate({ q: "", status: "" });

  async function mutate(items: TryoutItem[], action: TryoutMutation) {
    if (mutationInFlight.current || !items.length) return false;
    mutationInFlight.current = true;
    setSaving(true);
    setFeedback(null);
    const succeeded: string[] = [];
    const failures: string[] = [];
    try {
      for (const item of items) {
        try {
          const result =
            action === "archive"
              ? await archiveTryoutAction(item.id)
              : await setTryoutHiddenAction(item.id, action === "hide");
          if (result.ok) succeeded.push(item.id);
          else failures.push(`${item.title}: ${result.message}`);
        } catch {
          failures.push(`${item.title}: Perubahan belum berhasil disimpan.`);
        }
      }
      setSelection((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(([id]) => !succeeded.includes(id)),
        ),
      );
      setFeedback(failures.length ? failures : null);
      const noun = items.length === 1 ? "Tryout" : `${succeeded.length} Tryout`;
      if (succeeded.length && failures.length) {
        showToast(
          `${succeeded.length} Tryout berhasil ${mutationLabels[action]}; ${failures.length} belum berhasil. Lihat rincian di halaman.`,
          { variant: "warning" },
        );
      } else if (succeeded.length) {
        showToast(`${noun} berhasil ${mutationLabels[action]}.`, {
          variant: "success",
        });
      } else {
        showToast(
          failures.length === 1 && items.length === 1
            ? failures[0].replace(`${items[0].title}: `, "")
            : "Perubahan belum berhasil disimpan. Lihat rincian dan coba lagi.",
          { variant: "error" },
        );
      }
      if (succeeded.length) router.refresh();
      return failures.length === 0;
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }
  async function confirmArchive() {
    if (!archiveTargets) return;
    await mutate(archiveTargets, "archive");
    setArchiveTargets(null);
  }
  function toggleHidden(item: TryoutItem) {
    void mutate([item], item.isHidden ? "show" : "hide");
  }

  const columns = [
    mentorSelectionColumn<TryoutItem>({
      allLabel: "Pilih semua Tryout di halaman ini",
      disabled: saving,
      hasRows: visibleItems.length > 0,
      rowLabel: (item) => `Pilih ${item.title}`,
    }),
    ...tryoutColumns({
      busy: saving,
      onArchive: (item) => setArchiveTargets([item]),
      onToggleHidden: toggleHidden,
      returnTo,
    }),
  ];
  // TanStack's mutable table API intentionally opts out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library -- The compiler skips this supported TanStack integration.
  const table = useReactTable({
    data: visibleItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (item) => item.id,
    manualPagination: true,
    enableRowSelection: true,
    enableSorting: false,
    onRowSelectionChange: setSelection,
    pageCount,
    state: {
      pagination: { pageIndex: visiblePage - 1, pageSize },
      rowSelection: selection,
    },
  });
  const selectedItems = table.getSelectedRowModel().rows.map((row) => row.original);
  const hasArchivedSelection = selectedItems.some(
    (item) => item.status === "archived",
  );
  const hasUnpublishedSelection = selectedItems.some(
    (item) => item.status !== "published",
  );

  function handleCreateDialogOpenChange(open: boolean) {
    setCreateDialogOpen(open);
    if (!open && initialCreateDialogOpen) {
      router.replace(returnTo, { scroll: false });
    }
  }

  return (
    <MentorWorkspaceShell
      activeLabel="Tryout"
      breadcrumbLabel="Tryout"
      mainClassName={styles.canvas}
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader
        actions={
          <Button
            aria-label="Buat Tryout"
            onClick={() => setCreateDialogOpen(true)}
            size="default"
            type="button"
            variant="default"
          >
            <Plus />
            Buat Tryout
          </Button>
        }
        className={styles.pageHeader}
        title="Tryout"
        titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
      />

      <MentorAssessmentPanel label="Daftar Tryout" busy={saving}>
        <MentorAssessmentToolbar
          hasSelection={selectedItems.length > 0}
          search={
            <MentorAssessmentSearch
              disabled={saving}
              label="Cari Tryout berdasarkan judul, deskripsi, atau status"
              onSearch={(q) => navigate({ q })}
              placeholder="Cari Tryout…"
              value={query}
            />
          }
          filters={
            <MentorStatusFilterMenu
              activeCount={statusFilter ? 1 : 0}
              options={[
                {
                  key: "all",
                  label: "Semua",
                  active: !statusFilter,
                  onSelect: () => navigate({ status: "" }),
                },
                ...(
                  ["published", "hidden", "draft", "archived"] as const
                ).map((value) => ({
                  key: value,
                  label: statusLabels[value],
                  active: statusFilter === value,
                  onSelect: () => navigate({ status: value }),
                })),
              ]}
            />
          }
          bulk={
            selectedItems.length > 0 ? (
              <MentorBulkMenu
                disabled={saving}
                label={`Tindakan ${selectedItems.length} Tryout terpilih`}
              >
                <DropdownMenuItem
                  size="sm"
                  disabled={hasUnpublishedSelection || saving}
                  onClick={() => void mutate(selectedItems, "hide")}
                >
                  <EyeOff />
                  Sembunyikan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  size="sm"
                  variant="destructive"
                  disabled={hasArchivedSelection || saving}
                  onClick={() => setArchiveTargets(selectedItems)}
                >
                  <Archive />
                  Arsipkan
                </DropdownMenuItem>
              </MentorBulkMenu>
            ) : null
          }
        />
        <MentorFilterChips
          chips={
            statusFilter
              ? [
                  {
                    key: "status",
                    label: statusLabels[statusFilter],
                    onRemove: () => navigate({ status: "" }),
                  },
                ]
              : []
          }
          onClearAll={() => navigate({ status: "" })}
        />
        {feedback && (
          <MentorAssessmentFeedback
            heading="Tryout berikut belum berhasil diproses:"
            items={feedback}
            onClose={() => setFeedback(null)}
          />
        )}
        <MentorAssessmentGrid
          caption="Daftar Tryout beserta pembuat, jumlah subtes, dan statusnya."
          columnLabels={columnLabels}
          emptyState={
            initialItems.length === 0 ? (
              <>
                <strong>Belum ada Tryout</strong>
                Buat simulasi pertama untuk membantu siswa berlatih dan
                mengukur kesiapan mereka.
                <div>
                  <Button
                    onClick={() => setCreateDialogOpen(true)}
                    size="default"
                    type="button"
                    variant="default"
                  >
                    <Plus />
                    Buat Tryout pertama
                  </Button>
                </div>
              </>
            ) : (
              <>
                <strong>Tidak ada Tryout yang cocok</strong>
                Coba kata kunci lain atau tampilkan semua status Tryout.
                <div>
                  <Button
                    onClick={clearFilters}
                    size="default"
                    type="button"
                    variant="outline"
                  >
                    Hapus pencarian dan filter
                  </Button>
                </div>
              </>
            )
          }
          label="Tabel Tryout, geser untuk melihat semua kolom"
          numericColumns={["sections"]}
          table={table}
        />
        <MentorAssessmentPagination
          disabled={saving}
          label="Halaman Tryout"
          onPageChange={(nextPage) => {
            setSelection({});
            updateContext({ page: nextPage });
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            navigate({});
          }}
          page={visiblePage}
          pageCount={pageCount}
          pageSize={pageSize}
          total={filteredItems.length}
        />
      </MentorAssessmentPanel>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !saving) setArchiveTargets(null);
        }}
        open={Boolean(archiveTargets)}
      >
        <AlertDialogContent pending={saving} variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              <Archive />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {archiveTargets && archiveTargets.length > 1
                ? `Arsipkan ${archiveTargets.length} Tryout?`
                : "Arsipkan Tryout?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTargets && archiveTargets.length > 1
                ? `${archiveTargets.length} Tryout yang dipilih akan dipindahkan ke arsip dan tidak tersedia untuk akses baru.`
                : `“${archiveTargets?.[0]?.title ?? ""}” akan dipindahkan ke arsip dan tidak tersedia untuk akses baru.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void confirmArchive();
              }}
              variant="destructive"
            >
              {saving ? "Memproses…" : "Arsipkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MentorTryoutCreateDialog
        onOpenChange={handleCreateDialogOpenChange}
        open={createDialogOpen}
      />
    </MentorWorkspaceShell>
  );
}

export { KaptenTryoutCataloguePageModule };
