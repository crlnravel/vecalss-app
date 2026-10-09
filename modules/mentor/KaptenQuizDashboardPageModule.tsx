"use client";

import { Funnel } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { QuizDashboardMutation } from "@/lib/quiz/mentor-dashboard-repository";
import { UserCardPopover } from "@/components/ui/user-card-popover";
import { Input } from "@/components/ui/input";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  Archive,
  Trash2,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Search,
  X,
} from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import { showToast } from "@/components/ui/toast";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { MentorQuizCreateDialog } from "@/modules/mentor/KaptenQuizEditorPageModule";
import { manageQuizDashboardAction } from "@/modules/mentor/quiz-dashboard-actions";
import {
  quizDashboardHref,
  type QuizDashboardQuery,
  type QuizDashboardResult,
  type QuizDashboardRow,
} from "@/modules/mentor/quiz-dashboard-contract";
import { MentorGridMenu, MentorAssessmentGrid, MentorAssessmentPagination } from "./components/mentor-assessment-table";
import styles from "./quiz-dashboard.module.css";

const publicationLabels = {
  published: "Terbit",
  archived: "Arsip",
};
const columnLabels: Record<string, string> = {
  title: "Kuis",
  subjectCode: "Subtes",
  completedAttempts: "Pengerjaan",
  averageScore: "Rata-rata",
  publication: "Status",
  creator: "Pembuat",
};
const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

export function KaptenQuizDashboardPageModule({
  session,
  result,
  counts,
  subjects,
  initialCreateDialogOpen = false,
}: {
  session: SessionContext;
  result: QuizDashboardResult;
  counts: { total: number };
  subjects: { code: string; name: string }[];
  initialCreateDialogOpen?: boolean;
}) {
  "use no memo"; // TanStack Table's mutable table API cannot be safely memoized by the React Compiler.

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(initialCreateDialogOpen);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [confirmation, setConfirmation] = useState<{
    action: "archive" | "delete";
    ids: string[];
    label: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const mutationInFlight = useRef(false);
  const [feedback, setFeedback] = useState<string[] | null>(null);
  const query = result.query;
  const returnHref = quizDashboardHref(query);
  function navigate(patch: Partial<QuizDashboardQuery>) {
    if (pending || saving) return;
    setSelection({});
    startTransition(() =>
      router.push(quizDashboardHref({ ...query, page: 1, ...patch }), {
        scroll: false,
      }),
    );
  }
  function detailHref(row: QuizDashboardRow, tab?: string) {
    const params = new URLSearchParams({ returnTo: returnHref });
    if (tab) params.set("tab", tab);
    return `/mentor/quiz/${row.id}?${params}`;
  }
  async function mutate(ids: string[], action: QuizDashboardMutation) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await manageQuizDashboardAction(ids, action);
      const actionLabel =
        action === "hide"
          ? "disembunyikan"
          : action === "show"
            ? "ditampilkan"
            : action === "archive"
              ? "diarsipkan"
              : "dihapus";
      setSelection((previous) =>
        Object.fromEntries(
          Object.entries(previous).filter(
            ([id]) => !response.succeeded.includes(id),
          ),
        ),
      );
      const failures = response.failed.map(
        (item) =>
          `${result.rows.find((row) => row.id === item.id)?.title ?? "Kuis"}: ${item.message}`,
      );
      setFeedback(failures.length ? failures : null);
      if (response.succeeded.length && failures.length) {
        showToast(
          `${response.succeeded.length} kuis berhasil ${actionLabel}; ${failures.length} belum berhasil. Lihat rincian di halaman.`,
          { variant: "warning" },
        );
      } else if (response.succeeded.length) {
        showToast(
          `${response.succeeded.length} kuis berhasil ${actionLabel}.`,
          {
            variant: "success",
          },
        );
      } else if (failures.length) {
        showToast(
          action === "delete"
            ? "Kuis belum berhasil dihapus. Lihat rincian dan coba lagi."
            : "Perubahan belum berhasil disimpan. Lihat rincian dan coba lagi.",
          {
            variant: "error",
          },
        );
      }
      if (response.succeeded.length) router.refresh();
      setConfirmation(null);
    } catch {
      setFeedback(null);
      showToast(
        action === "delete"
          ? "Kuis belum berhasil dihapus. Coba lagi."
          : "Perubahan belum berhasil disimpan. Coba lagi.",
        { variant: "error" },
      );
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }
  const columns: ColumnDef<QuizDashboardRow>[] = [
    {
      id: "select",
      size: 40,
      header: ({ table }) => (
        <Checkbox
          aria-label="Pilih semua kuis di halaman ini"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
          disabled={pending || saving || !result.rows.length}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Pilih ${row.original.title}`}
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
          disabled={pending || saving}
        />
      ),
    },
    {
      accessorKey: "title",
      size: 350,
      enableHiding: false,
      cell: ({ row }) => (
        <>
          <Link
            className={styles.quizTitle}
            href={detailHref(row.original)}
            title={row.original.title}
          >
            {row.original.title}
          </Link>
        </>
      ),
    },
    {
      accessorKey: "subjectCode",
      size: 100,
      cell: ({ row }) => (
        <strong className="font-bold text-xs" title={row.original.subjectName}>
          {row.original.subjectCode}
        </strong>
      ),
    },
    {
      accessorKey: "creator",
      size: 88,
      cell: ({ row }) => <UserCardPopover {...row.original.creator} />,
    },
    {
      accessorKey: "completedAttempts",
      size: 115,
      cell: ({ getValue }) => numberFormatter.format(getValue<number>()),
    },
    {
      accessorKey: "averageScore",
      size: 115,
      cell: ({ getValue }) =>
        getValue<number | null>() === null
          ? "—"
          : numberFormatter.format(getValue<number>()),
    },
    {
      accessorKey: "publication",
      size: 140,
      cell: ({ row }) => (
        <>
          <Badge
            size="sm"
            tone={
              row.original.publication === "published" ? "success" : "neutral"
            }
          >
            {publicationLabels[row.original.publication]}
          </Badge>
          {row.original.isHidden && (
            <span className={styles.secondary}>Disembunyikan</span>
          )}
        </>
      ),
    },
    {
      id: "actions",
      size: 60,
      enableHiding: false,
      enableSorting: false,
      header: () => <span className={styles.srOnly}>Tindakan</span>,
      cell: ({ row }) => (
        <MentorGridMenu
          className={styles.iconButton}
          label={`Tindakan untuk ${row.original.title}`}
          trigger={<MoreHorizontal size={16} />}
        >
          {row.original.publication !== "archived" && (
            <>
              <DropdownMenuItem
                size="sm"
                disabled={pending || saving}
                onClick={() =>
                  mutate(
                    [row.original.id],
                    row.original.isHidden ? "show" : "hide",
                  )
                }
              >
                {row.original.isHidden ? <Eye /> : <EyeOff />}
                {row.original.isHidden ? "Tampilkan" : "Sembunyikan"}
              </DropdownMenuItem>
              <DropdownMenuItem
                size="sm"
                variant="destructive"
                disabled={saving}
                onClick={() =>
                  setConfirmation({
                    action: "archive",
                    ids: [row.original.id],
                    label: `“${row.original.title}”`,
                  })
                }
              >
                <Archive />
                Arsipkan
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem
            size="sm"
            variant="destructive"
            disabled={pending || saving}
            onClick={() =>
              setConfirmation({
                action: "delete",
                ids: [row.original.id],
                label: `“${row.original.title}”`,
              })
            }
          >
            <Trash2 />
            Hapus
          </DropdownMenuItem>
        </MentorGridMenu>
      ),
    },
  ];
  // TanStack's mutable table API intentionally opts out of React Compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library -- The compiler skips this supported TanStack integration.
  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: {
      rowSelection: selection,
      pagination: { pageIndex: query.page - 1, pageSize: query.pageSize },
    },
    enableRowSelection: true,
    onRowSelectionChange: setSelection,
    manualPagination: true,
    enableSorting: false,
    manualFiltering: true,
    pageCount: result.pageCount,
    autoResetPageIndex: false,
  });
  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = selectedRows.map((row) => row.id);
  const hasArchivedSelection = selectedRows.some(
    (row) => row.original.publication === "archived",
  );
  const activeFilters = [
    ...(query.subject && query.subject !== "all"
      ? [
          {
            key: "subject" as const,
            label:
              subjects.find((subject) => subject.code === query.subject)
                ?.code ?? query.subject,
            reset: "all",
          },
        ]
      : []),
    ...(query.status
      ? [
          {
            key: "status" as const,
            label: publicationLabels[query.status],
            reset: "",
          },
        ]
      : []),
    ...(query.hidden
      ? [{ key: "hidden" as const, label: "Disembunyikan", reset: false }]
      : []),
    ...(query.changed
      ? [{ key: "changed" as const, label: "Ada perubahan", reset: false }]
      : []),
  ];
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <ReferencePageHeader
        className={styles.pageHeader}
        title="Kuis"
        titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
        actions={
          <Button
            type="button"
            size="default"
            variant="default"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            Buat kuis
          </Button>
        }
      />
      <section
        className={styles.panel}
        aria-label="Daftar kuis"
        aria-busy={pending || saving}
        data-quiz-dashboard
      >
        <div className={styles.toolbar} data-selected={selectedIds.length > 0}>
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              navigate({
                q: String(new FormData(event.currentTarget).get("q") ?? ""),
              });
            }}
          >
            <Search aria-hidden="true" />
            <Input
              className="pl-9"
              name="q"
              key={query.q}
              defaultValue={query.q}
              placeholder="Cari kuis…"
              aria-label="Cari kuis berdasarkan judul atau subtes"
              type="search"
              disabled={pending}
            />
          </form>
          <div className={styles.filters}>
            <MentorGridMenu
              className={styles.subject}
              label="Filter subtes"
              trigger={
                <>
                  {query.subject && query.subject !== "all"
                    ? query.subject
                    : "Semua subtes"}
                  <ChevronDown />
                </>
              }
            >
              <DropdownMenuItem
                size="sm"
                onClick={() => navigate({ subject: "all" })}
              >
                Semua subtes
              </DropdownMenuItem>
              {subjects.map((subject) => (
                <DropdownMenuItem
                  size="sm"
                  key={subject.code}
                  onClick={() => navigate({ subject: subject.code })}
                >
                  {subject.code} — {subject.name}
                  {query.subject === subject.code && <Check />}
                </DropdownMenuItem>
              ))}
            </MentorGridMenu>
            <MentorGridMenu
              label="Filter status"
              trigger={
                <>
                  <Funnel />
                  Status
                  {activeFilters.filter((filter) => filter.key !== "subject")
                    .length > 0 && (
                    <Badge size="xs" tone="neutral">
                      {
                        activeFilters.filter(
                          (filter) => filter.key !== "subject",
                        ).length
                      }
                    </Badge>
                  )}
                </>
              }
            >
              <DropdownMenuItem
                size="sm"
                onClick={() =>
                  navigate({ status: "", hidden: false, changed: false })
                }
              >
                Semua{!query.status && <Check />}
              </DropdownMenuItem>
              {Object.entries(publicationLabels).map(([value, label]) => (
                <DropdownMenuItem
                  size="sm"
                  key={value}
                  onClick={() =>
                    navigate({
                      status: value as QuizDashboardQuery["status"],
                      hidden: false,
                      changed: false,
                    })
                  }
                >
                  {label}
                  {query.status === value && <Check />}
                </DropdownMenuItem>
              ))}
            </MentorGridMenu>
          </div>
          {selectedIds.length > 0 && (
            <div className={styles.bulkTools}>
              <MentorGridMenu
                className={styles.iconButton}
                disabled={pending || saving}
                label={`Tindakan ${selectedIds.length} kuis terpilih`}
                trigger={<MoreHorizontal size={16} />}
              >
                <DropdownMenuItem
                  size="sm"
                  disabled={hasArchivedSelection || pending || saving}
                  onClick={() => mutate(selectedIds, "hide")}
                >
                  <EyeOff />
                  Sembunyikan
                </DropdownMenuItem>
                <DropdownMenuItem
                  size="sm"
                  disabled={hasArchivedSelection || pending || saving}
                  onClick={() =>
                    setConfirmation({
                      action: "archive",
                      ids: selectedIds,
                      label: `${selectedIds.length} kuis yang dipilih`,
                    })
                  }
                >
                  <Archive />
                  Arsipkan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  size="sm"
                  variant="destructive"
                  disabled={pending || saving}
                  onClick={() =>
                    setConfirmation({
                      action: "delete",
                      ids: selectedIds,
                      label: `${selectedIds.length} kuis yang dipilih`,
                    })
                  }
                >
                  <Trash2 />
                  Hapus
                </DropdownMenuItem>
              </MentorGridMenu>
            </div>
          )}
        </div>
        {activeFilters.length > 0 && (
          <div className={styles.chips} aria-label="Filter aktif">
            {activeFilters.map((filter) => (
              <Button
                key={filter.key}
                type="button"
                size="sm"
                variant="quiet"
                className="px-0"
                aria-label={`Hapus filter ${filter.label}`}
                onClick={() => navigate({ [filter.key]: filter.reset })}
              >
                <Badge size="sm" tone="category">
                  {filter.label}
                  <X className="size-3" aria-hidden="true" />
                </Badge>
              </Button>
            ))}
            <Button
              size="sm"
              variant="quiet"
              type="button"
              onClick={() =>
                navigate({
                  subject: "all",
                  status: "",
                  hidden: false,
                  changed: false,
                })
              }
            >
              Hapus semua
            </Button>
          </div>
        )}
        {feedback && (
          <div className={styles.feedback} role="status">
            <div>
              <p>Kuis berikut belum berhasil diproses:</p>
              <ul>
                {feedback.map((failure, index) => (
                  <li key={index}>{failure}</li>
                ))}
              </ul>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="quiet"
              aria-label="Tutup pemberitahuan"
              onClick={() => setFeedback(null)}
            >
              <X size={16} />
            </Button>
          </div>
        )}
        <MentorAssessmentGrid
          table={table}
          caption="Daftar kuis lintas subtes. Pengerjaan menghitung upaya selesai. Rata-rata memakai nilai akhir setiap siswa sesuai aturan kuis."
          label="Tabel kuis, geser untuk melihat semua kolom"
          columnLabels={columnLabels}
          numericColumns={["completedAttempts", "averageScore"]}
          headerTitles={{
            completedAttempts: "Jumlah pengerjaan yang sudah selesai",
            averageScore: "Rata-rata nilai akhir siswa yang sudah selesai",
          }}
          emptyState={<>
                    <strong>
                      {counts.total
                        ? "Tidak ada kuis yang cocok"
                        : "Belum ada kuis"}
                    </strong>
                    {counts.total
                      ? "Coba judul lain atau ubah filter."
                      : "Buat kuis pertama untuk mulai menyusun soal."}
                    <div>
                      {counts.total ? (
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() =>
                            navigate({
                              q: "",
                              subject: "all",
                              status: "",
                              hidden: false,
                              changed: false,
                            })
                          }
                        >
                          Hapus pencarian dan filter
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="default"
                          type="button"
                          onClick={() => setCreateOpen(true)}
                        >
                          <Plus />
                          Buat kuis
                        </Button>
                      )}
                    </div>

          </>}
        />
        <MentorAssessmentPagination
          page={query.page}
          pageSize={query.pageSize}
          pageCount={result.pageCount}
          total={result.total}
          disabled={pending || saving}
          label="Halaman kuis"
          onPageChange={(page) => navigate({ page })}
          onPageSizeChange={(pageSize) => navigate({ pageSize })}
        />
      </section>
      <MentorQuizCreateDialog
        initialSubjectCode={
          query.subject && query.subject !== "all" ? query.subject : undefined
        }
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open && initialCreateDialogOpen)
            router.replace(returnHref, { scroll: false });
        }}
      />
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirmation(null);
        }}
      >
        <AlertDialogContent pending={saving} variant="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation?.action === "delete" ? "Hapus" : "Arsipkan"}{" "}
              {confirmation && confirmation.ids.length > 1
                ? `${confirmation.ids.length} kuis`
                : "kuis"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.label}
              {confirmation?.action === "delete"
                ? " beserta soal, hasil, dan riwayat pengerjaannya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan."
                : " tidak lagi muncul di daftar siswa atau menerima pengerjaan baru. Siswa yang sudah mulai tetap bisa melanjutkan dan mengirim jawaban. Riwayat pengerjaan tetap tersimpan. Kuis yang diarsipkan tidak bisa diaktifkan kembali."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={() =>
                confirmation && mutate(confirmation.ids, confirmation.action)
              }
            >
              {saving
                ? confirmation?.action === "delete"
                  ? "Menghapus…"
                  : "Mengarsipkan…"
                : confirmation?.action === "delete"
                  ? "Hapus kuis"
                  : "Arsipkan kuis"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MentorWorkspaceShell>
  );
}

/** Expected catalogue read failures retain the authenticated workspace and query URL. */
export function QuizDashboardUnavailable({
  session,
}: {
  session: SessionContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <MentorWorkspaceShell
      session={session}
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <ReferencePageHeader
        className={styles.pageHeader}
        title="Kuis"
        titleClassName="font-display text-4xl font-extrabold tracking-[-0.04em] text-voyage-ink text-balance md:text-5xl"
      />
      <section className={styles.panel}>
        <div className={styles.empty} role="alert">
          <strong>Daftar kuis belum dapat dimuat</strong>
          <p>Coba lagi untuk membuka daftar kuis.</p>
          <Button
            size="sm"
            variant="default"
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {pending ? "Memuat…" : "Coba lagi"}
          </Button>
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}
