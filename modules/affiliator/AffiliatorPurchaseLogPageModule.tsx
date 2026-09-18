import Link from "next/link";

import {
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSurface,
} from "@/components/dashboard";
import { buttonVariants } from "@/components/ui/button-variants";
import { StudentBadge } from "@/components/ui/student-badge";
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
    <li className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <p className="truncate font-semibold text-secondary-900">{conversion.packageName}</p>
        <p className="mt-1 truncate text-sm text-secondary-700">{conversion.studentName}</p>
        <p className="mt-1 truncate text-xs text-secondary-500">{conversion.studentEmail}</p>
      </div>
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
        <StudentBadge size="sm" tone="success">
          Berhasil
        </StudentBadge>
        <time
          className="text-xs text-secondary-500"
          dateTime={conversion.completedAt.toISOString()}
        >
          {formatDate(conversion.completedAt)}
        </time>
      </div>
    </li>
  );
}

function ConversionLogList({
  conversionLog,
}: {
  conversionLog: AffiliatorConversionLog[];
}) {
  return (
    conversionLog.length ? (
      <ol aria-label="Daftar pembelian paket yang berhasil" className="divide-y divide-primary-100/80">
        {conversionLog.map((conversion) => (
          <ConversionLogRow conversion={conversion} key={conversion.id} />
        ))}
      </ol>
    ) : (
      <ReferenceEmptyState
        description="Pembelian berhasil akan muncul di sini."
        icon={ChartColumnBig}
        title="Belum ada pembelian"
      />
    )
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
      <nav aria-label="Halaman log pembelian" className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })}
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
            className={buttonVariants({ className: "min-h-11", size: "sm", variant: "brandOutline" })}
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
      activeLabel="Log pembelian"
      breadcrumbLabel="Log pembelian"
      mainClassName="gap-8 lg:gap-10"
      session={session}
    >
      <ReferencePageHeader title="Log pembelian" />

      <section aria-label="Daftar pembelian" className="min-w-0 space-y-4">
        <ReferenceSurface className="overflow-hidden p-0">
          <ConversionLogList conversionLog={log.conversionLog} />
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
