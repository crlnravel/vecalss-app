import Link from "next/link";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  AffiliatorConversionLog,
  AffiliatorConversionLogData,
} from "@/lib/affiliator/service";
import { ChartColumnBig } from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import { AffiliatorWorkspaceShell } from "./components/affiliator-workspace-shell";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function ConversionLogRow({ conversion }: { conversion: AffiliatorConversionLog }) {
  return (
    <TableRow className="border-primary-100/80 hover:bg-primary-50/40">
      <TableCell
        className="max-w-[20rem] truncate px-4 py-3.5 font-semibold text-secondary-900 sm:px-5"
        title={conversion.packageName}
      >
        {conversion.packageName}
      </TableCell>
      <TableCell
        className="max-w-[15rem] truncate px-4 py-3.5 text-secondary-700 sm:px-5"
        title={conversion.studentName}
      >
        {conversion.studentName}
      </TableCell>
      <TableCell className="px-4 py-3.5 text-secondary-600 sm:px-5">
        <time dateTime={conversion.completedAt.toISOString()}>
          {formatDate(conversion.completedAt)}
        </time>
      </TableCell>
      <TableCell className="px-4 py-3.5 sm:px-5">
        <Badge size="sm" tone="success">
          Berhasil
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function ConversionLogTable({
  conversionLog,
}: {
  conversionLog: AffiliatorConversionLog[];
}) {
  return (
    <Table aria-label="Daftar pembelian paket yang berhasil" className="min-w-[680px] border-collapse text-left text-sm">
      <TableHeader className="bg-primary-50/70 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">
        <TableRow className="border-primary-100/80 hover:bg-transparent">
          <TableHead className="px-4 py-3.5 sm:px-5" scope="col">
            Paket
          </TableHead>
          <TableHead className="px-4 py-3.5 sm:px-5" scope="col">
            Siswa
          </TableHead>
          <TableHead className="px-4 py-3.5 sm:px-5" scope="col">
            Waktu
          </TableHead>
          <TableHead className="px-4 py-3.5 sm:px-5" scope="col">
            Status
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {conversionLog.length ? (
          conversionLog.map((conversion) => (
            <ConversionLogRow conversion={conversion} key={conversion.id} />
          ))
        ) : (
          <TableRow className="hover:bg-transparent">
            <TableCell className="p-0" colSpan={4}>
              <ReferenceEmptyState
                description="Pembelian berhasil akan muncul di sini."
                icon={ChartColumnBig}
                title="Belum ada pembelian"
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function ConversionLogPagination({
  page,
  pageCount,
  pageSize,
  total,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  if (pageCount <= 1) return null;

  const pageHref = (nextPage: number) => `/affiliator/log-pembelian?logPage=${nextPage}`;
  const visibleStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleEnd = Math.min(total, page * pageSize);

  return (
    <footer className="flex flex-col gap-3 border-t border-primary-100 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <p className="text-xs text-secondary-600">
        Menampilkan {visibleStart}–{visibleEnd} dari {total.toLocaleString("id-ID")}
      </p>
      <nav aria-label="Halaman riwayat pembelian" className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            className={buttonVariants({ className: "min-h-11", size: "sm", variant: "outline" })}
            href={pageHref(page - 1)}
          >
            Sebelumnya
          </Link>
        ) : null}
        <span
          aria-current="page"
          className="inline-flex min-h-11 items-center rounded-xl bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-800"
        >
          Halaman {page} dari {pageCount}
        </span>
        {page < pageCount ? (
          <Link
            className={buttonVariants({ className: "min-h-11", size: "sm", variant: "outline" })}
            href={pageHref(page + 1)}
          >
            Berikutnya
          </Link>
        ) : null}
      </nav>
    </footer>
  );
}

function AffiliatorPurchaseLogPageModule({
  log,
  session,
}: {
  log: AffiliatorConversionLogData;
  session: SessionContext;
}) {
  return (
    <AffiliatorWorkspaceShell
      activeLabel="Riwayat pembelian"
      breadcrumbLabel="Riwayat pembelian"
      mainClassName="gap-8 lg:gap-10"
      session={session}
    >
      <ReferencePageHeader title="Riwayat pembelian" />

      <section aria-label="Daftar pembelian" className="min-w-0 space-y-4">
        <ReferenceSurface className="overflow-hidden p-0">
          <ConversionLogTable conversionLog={log.conversionLog} />
          <ConversionLogPagination
            page={log.conversionLogPage}
            pageCount={log.conversionLogPageCount}
            pageSize={log.conversionLogPageSize}
            total={log.conversionLogTotal}
          />
        </ReferenceSurface>
      </section>
    </AffiliatorWorkspaceShell>
  );
}

export { AffiliatorPurchaseLogPageModule };
