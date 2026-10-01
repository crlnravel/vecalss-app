"use client";

import { Fragment, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  BackButton,
} from "@/components/ui/back-button";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import { DataTableFilterMenu } from "@/components/ui/data-table-filter-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SidebarTrigger } from "@/components/ui/sidebar";

type ProgrammeStatus = "Aktif" | "Segera";

type ProgrammeRow = {
  id: string;
  name: string;
  focus: string;
  status: ProgrammeStatus;
};

const programmeRows: ProgrammeRow[] = [
  { id: "p-peluang", name: "Peluang dan kejadian", focus: "Matematika", status: "Aktif" },
  { id: "p-logika", name: "Logika dasar", focus: "Penalaran", status: "Segera" },
  { id: "p-bacaan", name: "Membaca kritis", focus: "Literasi", status: "Aktif" },
  { id: "p-aljabar", name: "Aljabar lanjutan", focus: "Matematika", status: "Segera" },
];

const programmeColumns: DataTableColumn<ProgrammeRow>[] = [
  {
    id: "name",
    label: "Program",
    width: 48,
    cell: (row) => <span className="font-medium text-secondary-900">{row.name}</span>,
  },
  {
    id: "focus",
    label: "Bidang",
    width: 27,
    cell: (row) => row.focus,
  },
  {
    id: "status",
    label: "Status",
    width: 25,
    cell: (row) => row.status,
  },
];

const programmeStatuses: ProgrammeStatus[] = ["Aktif", "Segera"];

export function BreadcrumbsPaginationPreview() {
  const [page, setPage] = useState(1);
  const pageNumbers = page <= 3 ? [1, 2, 3] : page >= 6 ? [6, 7, 8] : [page - 1, page, page + 1];
  const visiblePages = Array.from(new Set([1, ...pageNumbers, 8])).sort((left, right) => left - right);

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <p className="text-sm font-semibold text-secondary-800">Breadcrumb</p>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/developer/reports">Developer</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="#breadcrumbs-pagination">Laporan</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Komponen</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
          <BackButton href="/developer/reports" label="Kembali ke laporan" />
          <span className="text-xs text-secondary-600">Tombol kembali dengan ikon chevron</span>
        </div>
      </div>

      <div className="space-y-4 border-t border-voyage-soft-border pt-6">
        <div>
          <p className="text-sm font-semibold text-secondary-800">Pagination</p>
          <p aria-live="polite" className="mt-1 text-sm text-secondary-600">Halaman {page} dari 8</p>
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))} />
            </PaginationItem>
            {visiblePages.map((pageNumber, index) => {
              const previousPage = visiblePages[index - 1];
              const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

              return (
                <Fragment key={pageNumber}>
                  {hasGap ? <PaginationItem><PaginationEllipsis /></PaginationItem> : null}
                  <PaginationItem>
                    <Button
                      aria-current={page === pageNumber ? "page" : undefined}
                      aria-label={`Halaman ${pageNumber}`}
                      onClick={() => setPage(pageNumber)}
                      size="icon-sm"
                      type="button"
                      variant={page === pageNumber ? "default" : "outline"}
                    >
                      {pageNumber}
                    </Button>
                  </PaginationItem>
                </Fragment>
              );
            })}
            <PaginationItem>
              <PaginationNext disabled={page === 8} onClick={() => setPage((current) => Math.min(8, current + 1))} />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

function ProgrammeFilterMenu({
  selectedStatuses,
  onStatusChange,
  onClear,
}: {
  selectedStatuses: ReadonlySet<ProgrammeStatus>;
  onStatusChange: (status: ProgrammeStatus, checked: boolean) => void;
  onClear: () => void;
}) {
  const summary = selectedStatuses.size ? `${selectedStatuses.size} dipilih` : "Semua program";

  return (
    <DataTableFilterMenu
      filters={[
        {
          id: "status",
          label: "Status",
          summary,
          content: (
            <fieldset className="grid gap-3">
              <legend className="text-xs font-semibold text-secondary-700">Pilih status</legend>
              {programmeStatuses.map((status) => (
                <label className="flex min-h-10 items-center gap-3 text-sm text-secondary-800" key={status}>
                  <Checkbox
                    checked={selectedStatuses.has(status)}
                    onCheckedChange={(checked) => onStatusChange(status, checked === true)}
                  />
                  {status}
                </label>
              ))}
            </fieldset>
          ),
        },
      ]}
    >
      <Button onClick={onClear} size="sm" type="button" variant="outline">
        Hapus semua filter
      </Button>
    </DataTableFilterMenu>
  );
}

export function DataTablesPreview() {
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ProgrammeStatus>>(() => new Set());

  const toggleStatus = (status: ProgrammeStatus, checked: boolean) => {
    setSelectedStatuses((current) => {
      const next = new Set(current);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  };

  const visibleRows = programmeRows.filter((row) => {
    const matchesSearch = `${row.name} ${row.focus} ${row.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = selectedStatuses.size === 0 || selectedStatuses.has(row.status);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Table · tabel semantik</p>
        <div className="overflow-hidden rounded-2xl border border-voyage-soft-border bg-white">
          <Table>
            <TableCaption className="sr-only">Contoh jadwal program belajar.</TableCaption>
            <TableHeader>
              <TableRow className="bg-secondary-50/80 hover:bg-secondary-50/80">
                <TableHead>Program</TableHead>
                <TableHead>Bidang</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Peluang dan kejadian</TableCell>
                <TableCell>Matematika</TableCell>
                <TableCell>Aktif</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Logika dasar</TableCell>
                <TableCell>Penalaran</TableCell>
                <TableCell>Segera</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-secondary-800">DataTable · cari dan saring</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Pencarian, filter status, tabel responsif, dan keadaan tanpa hasil memakai data lokal contoh.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-voyage-soft-border bg-white">
          <DataTable
            caption="Daftar contoh program belajar"
            columns={programmeColumns}
            emptyState={<p className="mx-auto max-w-sm text-sm leading-6 text-secondary-600">Tidak ada program yang cocok. Coba ubah pencarian atau filter.</p>}
            filterPanel={
              <ProgrammeFilterMenu
                onClear={() => setSelectedStatuses(new Set())}
                onStatusChange={toggleStatus}
                selectedStatuses={selectedStatuses}
              />
            }
            filters={Array.from(selectedStatuses).map((status) => ({
              id: `status-${status}`,
              label: "Status",
              value: status,
            }))}
            getRowId={(row) => row.id}
            rows={visibleRows}
            search={{
              label: "Cari program",
              onValueChange: setQuery,
              placeholder: "Cari program atau bidang",
              value: query,
            }}
          />
        </div>
      </div>
    </div>
  );
}

const studyItems = [
  "Peluang dan kejadian",
  "Logika dasar",
  "Membaca kritis",
  "Aljabar lanjutan",
  "Statistika",
  "Fungsi dan grafik",
  "Penalaran umum",
  "Pemahaman bacaan",
];

export function CalendarScrollAreaPreview() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());

  return (
    <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(17rem,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Calendar · pilih satu tanggal</p>
        <div className="w-fit max-w-full rounded-2xl border border-voyage-soft-border bg-white p-4">
          <Calendar
            mode="single"
            onSelect={setSelectedDate}
            selected={selectedDate}
          />
        </div>
        <p aria-live="polite" className="text-sm text-secondary-600">
          Pilihan: {selectedDate ? selectedDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "belum ada"}
        </p>
      </div>

      <div className="min-w-0 space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-secondary-800">ScrollArea · vertical</p>
          <ScrollArea className="h-44 rounded-2xl border border-voyage-soft-border bg-white">
            <ul className="grid gap-1 p-3">
              {studyItems.map((item, index) => (
                <li className="rounded-xl px-3 py-2.5 text-sm text-secondary-700 hover:bg-primary-50" key={item}>
                  Bagian {index + 1} · {item}
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-secondary-800">ScrollArea · horizontal</p>
          <ScrollArea className="h-14 w-full rounded-2xl border border-voyage-soft-border bg-white">
            <div className="flex w-max min-w-full items-center gap-2 p-2">
              {studyItems.map((item) => (
                <span className="shrink-0 rounded-xl bg-voyage-sea-glass-wash px-3 py-2 text-xs font-medium text-voyage-deep" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

const studyChartConfig = {
  materi: { label: "Materi", color: "var(--chart-1)" },
  latihan: { label: "Latihan", color: "var(--chart-2)" },
} satisfies ChartConfig;

const studyChartData = [
  { minggu: "1–7 Sep", materi: 3, latihan: 2 },
  { minggu: "8–14 Sep", materi: 4, latihan: 3 },
  { minggu: "15–21 Sep", materi: 2, latihan: 4 },
  { minggu: "22–28 Sep", materi: 5, latihan: 3 },
];

export function ChartsPreview() {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-secondary-800">Chart · diagram batang interaktif</p>
        <p className="mt-1 text-sm text-secondary-600">Data contoh; arahkan kursor atau fokuskan grafik untuk melihat tooltip.</p>
      </div>
      <ChartContainer
        aria-label="Diagram contoh aktivitas materi dan latihan per minggu"
        className="h-[260px] w-full max-w-full aspect-auto rounded-2xl border border-voyage-soft-border bg-white p-3 sm:p-5"
        config={studyChartConfig}
      >
        <BarChart
          accessibilityLayer
          data={studyChartData}
          desc="Jumlah bagian materi dan latihan pada empat minggu contoh."
          margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
          role="img"
          title="Aktivitas belajar per minggu"
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis axisLine={false} dataKey="minggu" tick={{ fontSize: 10 }} tickLine={false} tickMargin={8} />
          <YAxis allowDecimals={false} axisLine={false} tick={{ fontSize: 10 }} tickLine={false} width={30} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={false} />
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-2" />} />
          <Bar dataKey="materi" fill="var(--color-materi)" maxBarSize={34} radius={5} />
          <Bar dataKey="latihan" fill="var(--color-latihan)" maxBarSize={34} radius={5} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

export function SidebarPreview() {
  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <p className="text-sm leading-6 text-secondary-700">
          Galeri ini memakai DeveloperWorkspaceShell yang sama dengan halaman. Tombol berikut membuka atau menciutkan navigasi yang membingkai halaman. Pratinjau terpisah di bawah menampilkan semua posisi, tampilan, serta perilaku ciut Sidebar tanpa menumpuk sidebar di dalam shell.
        </p>
        <SidebarTrigger
          aria-label="Ciutkan atau buka navigasi Developer"
          className="min-h-[44px] rounded-xl border border-primary-100 bg-white px-4 text-sm font-medium text-secondary-800 hover:bg-primary-50 focus-visible:ring-3 focus-visible:ring-primary-700/25"
        />
      </div>
      <iframe
        className="h-[700px] w-full rounded-3xl border border-voyage-soft-border bg-white"
        loading="lazy"
        src="/developer/components?preview=sidebar"
        title="Pratinjau interaktif posisi, tampilan, dan ukuran Sidebar"
      >
        Pratinjau Sidebar interaktif.
      </iframe>
    </div>
  );
}
