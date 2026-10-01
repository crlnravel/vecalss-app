"use client";

import { CaretUpDown, Funnel } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
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
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import styles from "./quiz-dashboard.module.css";

const publicationLabels = {
  published: "Terbit",
  unpublished: "Draf",
  archived: "Arsip",
};
const columnLabels: Record<string, string> = {
  title: "Kuis",
  subjectCode: "Subtes",
  questionCount: "Soal",
  completedAttempts: "Pengerjaan",
  averageScore: "Rata-rata",
  publication: "Status",
};
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});
const timestampFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
});

function GridMenu({
  children,
  trigger,
  label,
  className,
}: {
  children: ReactNode;
  trigger: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={
              className === styles.iconButton || className === styles.sort
                ? "quiet"
                : "outline"
            }
            size={className === styles.iconButton ? "icon-sm" : "sm"}
          />
        }
        className={className}
        aria-label={label}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
function GridCheckbox({
  checked,
  mixed = false,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      indeterminate={mixed}
      disabled={disabled}
      onCheckedChange={onChange}
    />
  );
}

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
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [createOpen, setCreateOpen] = useState(initialCreateDialogOpen);
  const [archiving, setArchiving] = useState<QuizDashboardRow | null>(null);
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
  async function mutate(ids: string[], action: "hide" | "show" | "archive") {
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
            : "diarsipkan";
      setSelection(
        Object.fromEntries(
          response.failed
            .filter((item) => item.id)
            .map((item) => [item.id, true]),
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
          "Perubahan belum berhasil disimpan. Lihat rincian dan coba lagi.",
          {
            variant: "error",
          },
        );
      }
      if (response.succeeded.length) router.refresh();
      setArchiving(null);
    } catch {
      setFeedback(null);
      showToast("Perubahan belum berhasil disimpan. Coba lagi.", {
        variant: "error",
      });
    } finally {
      mutationInFlight.current = false;
      setSaving(false);
    }
  }
  const isActiveSort = (id: string) =>
    query.sort === id || (id === "title" && query.sort === "updatedAt");
  const isNumeric = (id: string) =>
    ["questionCount", "completedAttempts", "averageScore"].includes(id);
  const columns: ColumnDef<QuizDashboardRow>[] = [
    {
      id: "select",
      size: 48,
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <GridCheckbox
          checked={table.getIsAllPageRowsSelected()}
          mixed={table.getIsSomePageRowsSelected()}
          onChange={(checked) => table.toggleAllPageRowsSelected(checked)}
          label="Pilih semua kuis di halaman ini"
          disabled={
            saving || !result.rows.some((row) => row.publication !== "archived")
          }
        />
      ),
      cell: ({ row }) => (
        <GridCheckbox
          checked={row.getIsSelected()}
          onChange={(checked) => row.toggleSelected(checked)}
          label={`Pilih ${row.original.title}`}
          disabled={!row.getCanSelect() || saving}
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
          <span className={styles.secondary}>
            Diperbarui{" "}
            <time
              dateTime={row.original.updatedAt}
              title={`${timestampFormatter.format(new Date(row.original.updatedAt))} WIB`}
              aria-label={`${timestampFormatter.format(new Date(row.original.updatedAt))} WIB`}
            >
              {dateFormatter.format(new Date(row.original.updatedAt))}
            </time>
            {row.original.hasUnpublishedChanges && (
              <span className={styles.change}> · Ada perubahan</span>
            )}
          </span>
        </>
      ),
    },
    {
      accessorKey: "subjectCode",
      size: 160,
      cell: ({ row }) => (
        <>
          <Badge tone="category" size="xs">
            {row.original.subjectCode}
          </Badge>
          <span className={styles.secondary} title={row.original.subjectName}>
            {row.original.subjectName}
          </span>
        </>
      ),
    },
    {
      accessorKey: "questionCount",
      size: 85,
      cell: ({ getValue }) => numberFormatter.format(getValue<number>()),
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
            size="xs"
            tone={
              row.original.publication === "published"
                ? "success"
                : row.original.publication === "unpublished"
                  ? "attention"
                  : "neutral"
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
        <GridMenu
          className={styles.iconButton}
          label={`Tindakan untuk ${row.original.title}`}
          trigger={<MoreHorizontal size={16} />}
        >
          <DropdownMenuItem render={<Link href={detailHref(row.original)} />}>
            Buka kuis
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href={detailHref(row.original, "hasil")} />}
          >
            Lihat hasil
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href={detailHref(row.original, "pengaturan")} />}
          >
            Pengaturan
          </DropdownMenuItem>
          {row.original.publication !== "archived" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={saving}
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
                variant="destructive"
                disabled={saving}
                onClick={() => setArchiving(row.original)}
              >
                <Archive />
                Arsipkan
              </DropdownMenuItem>
            </>
          )}
        </GridMenu>
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
      sorting: [{ id: query.sort, desc: query.direction === "desc" }],
      pagination: { pageIndex: query.page - 1, pageSize: query.pageSize },
    },
    onRowSelectionChange: setSelection,
    enableRowSelection: (row) => row.original.publication !== "archived",
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount: result.pageCount,
    autoResetPageIndex: false,
  });
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
  const pages = Array.from(
    new Set([
      1,
      ...Array.from({ length: 3 }, (_, index) => query.page - 1 + index).filter(
        (page) => page > 0 && page <= result.pageCount,
      ),
      result.pageCount,
    ]),
  ).sort((a, b) => a - b);
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel="Kuis"
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
      mainClassName={styles.canvas}
    >
      <section
        className={styles.panel}
        aria-labelledby="quiz-dashboard-title"
        aria-busy={pending || saving}
        data-quiz-dashboard
      >
        <div className={styles.header}>
          <div>
            <h1 className={styles.title} id="quiz-dashboard-title">
              Kuis
            </h1>
            <p className={styles.summary}>
              <span>{result.total} kuis</span>
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            Buat kuis
          </Button>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.filters}>
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
            <GridMenu
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
              <DropdownMenuItem onClick={() => navigate({ subject: "all" })}>
                Semua subtes
              </DropdownMenuItem>
              {subjects.map((subject) => (
                <DropdownMenuItem
                  key={subject.code}
                  onClick={() => navigate({ subject: subject.code })}
                >
                  {subject.code} — {subject.name}
                  {query.subject === subject.code && <Check />}
                </DropdownMenuItem>
              ))}
            </GridMenu>
            <GridMenu
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
                onClick={() =>
                  navigate({ status: "", hidden: false, changed: false })
                }
              >
                Semua{!query.status && <Check />}
              </DropdownMenuItem>
              {Object.entries(publicationLabels).map(([value, label]) => (
                <DropdownMenuItem
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
            </GridMenu>
          </div>
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
              <p>Kuis berikut belum berhasil diperbarui:</p>
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
        <div
          className={styles.viewport}
          tabIndex={0}
          role="region"
          aria-label="Tabel kuis, geser untuk melihat semua kolom"
        >
          <Table className={styles.table}>
            <TableCaption className={styles.srOnly}>
              Daftar kuis lintas subtes. Pengerjaan menghitung upaya selesai.
              Rata-rata memakai nilai akhir setiap siswa sesuai aturan kuis.
            </TableCaption>
            <colgroup>
              {table.getVisibleLeafColumns().map((column) => (
                <col
                  key={column.id}
                  style={{
                    width: column.id === "title" ? undefined : column.getSize(),
                  }}
                />
              ))}
            </colgroup>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="bg-voyage-surface">
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      scope="col"
                      data-numeric={isNumeric(header.column.id)}
                      aria-sort={
                        header.column.getCanSort()
                          ? isActiveSort(header.column.id)
                            ? query.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                      title={
                        header.column.id === "completedAttempts"
                          ? "Jumlah pengerjaan yang sudah selesai"
                          : header.column.id === "averageScore"
                            ? "Rata-rata nilai akhir siswa yang sudah selesai"
                            : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <GridMenu
                          className={styles.sort}
                          label={`Urutkan ${columnLabels[header.column.id]}`}
                          trigger={
                            <>
                              {columnLabels[header.column.id]}
                              {isActiveSort(header.column.id) ? (
                                query.direction === "desc" ? (
                                  <ArrowDown />
                                ) : (
                                  <ArrowUp />
                                )
                              ) : (
                                <CaretUpDown />
                              )}
                            </>
                          }
                        >
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                sort: header.column
                                  .id as QuizDashboardQuery["sort"],
                                direction: "asc",
                              })
                            }
                          >
                            <ArrowUp />
                            Urutkan naik
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              navigate({
                                sort: header.column
                                  .id as QuizDashboardQuery["sort"],
                                direction: "desc",
                              })
                            }
                          >
                            <ArrowDown />
                            Urutkan turun
                          </DropdownMenuItem>
                          {header.column.id === "title" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate({
                                    sort: "updatedAt",
                                    direction: "desc",
                                  })
                                }
                              >
                                <ArrowDown />
                                Terakhir diubah
                                {query.sort === "updatedAt" && <Check />}
                              </DropdownMenuItem>
                            </>
                          )}
                        </GridMenu>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="bg-voyage-surface"
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      data-numeric={isNumeric(cell.column.id)}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {!result.rows.length && (
                <TableRow>
                  <TableCell
                    className={styles.empty}
                    colSpan={table.getVisibleLeafColumns().length}
                  >
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
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className={styles.footer}>
          <div className={styles.pageSize}>
            <span>Baris per halaman</span>
            <GridMenu
              label="Baris per halaman"
              trigger={
                <>
                  {query.pageSize}
                  <ChevronDown size={14} />
                </>
              }
            >
              {[6, 10, 20, 50].map((size) => (
                <DropdownMenuItem
                  key={size}
                  onClick={() => navigate({ pageSize: size })}
                >
                  {size}
                  {query.pageSize === size && <Check />}
                </DropdownMenuItem>
              ))}
            </GridMenu>
          </div>
          <nav className={styles.pagination} aria-label="Halaman kuis">
            <span className={styles.range}>
              {result.total ? (query.page - 1) * query.pageSize + 1 : 0} -{" "}
              {Math.min(query.page * query.pageSize, result.total)} dari{" "}
              {result.total}
            </span>
            <Button
              size="icon-sm"
              variant="quiet"
              type="button"
              aria-label="Halaman sebelumnya"
              disabled={pending || query.page === 1}
              onClick={() => navigate({ page: query.page - 1 })}
            >
              <ChevronLeft size={16} />
            </Button>
            {pages.map((page, index) => (
              <span key={page}>
                {index > 0 && page - pages[index - 1] > 1 && (
                  <span aria-hidden="true">…</span>
                )}
                <Button
                  size="icon-sm"
                  variant={query.page === page ? "default" : "quiet"}
                  aria-label={`Halaman ${page}`}
                  aria-current={query.page === page ? "page" : undefined}
                  disabled={pending}
                  type="button"
                  onClick={() => navigate({ page })}
                >
                  {page}
                </Button>
              </span>
            ))}
            <Button
              size="icon-sm"
              variant="quiet"
              type="button"
              aria-label="Halaman berikutnya"
              disabled={pending || query.page === result.pageCount}
              onClick={() => navigate({ page: query.page + 1 })}
            >
              <ChevronRight size={16} />
            </Button>
          </nav>
        </div>
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
        open={Boolean(archiving)}
        onOpenChange={(open) => {
          if (!open && !saving) setArchiving(null);
        }}
      >
        <AlertDialogContent pending={saving} variant="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Arsipkan kuis?</AlertDialogTitle>
            <AlertDialogDescription>
              “{archiving?.title}” tidak akan tersedia lagi untuk siswa. Kuis
              yang diarsipkan tidak bisa diaktifkan kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={() => archiving && mutate([archiving.id], "archive")}
            >
              {saving ? "Mengarsipkan…" : "Arsipkan kuis"}
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
      <section className={styles.panel}>
        <div className={styles.header}>
          <h1 className={styles.title}>Kuis</h1>
        </div>
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
