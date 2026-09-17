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
import { ChartColumnBig, ChevronLeft, ChevronRight } from "@/lib/icons";
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
    <tr className="border-t border-primary-100/80 align-top">
      <td className="px-4 py-3.5 sm:px-5">
        <div className="font-semibold text-secondary-900">{conversion.studentName}</div>
        <div className="mt-1 text-xs leading-5 text-secondary-500">{conversion.studentEmail}</div>
      </td>
      <td className="px-4 py-3.5 sm:px-5">
        <div className="font-medium text-secondary-900">{conversion.packageName}</div>
        <code className="mt-1 block text-xs text-secondary-500">{conversion.packageCode}</code>
      </td>
      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-secondary-600 sm:px-5">
        <time dateTime={conversion.completedAt.toISOString()}>
          {formatDate(conversion.completedAt)}
        </time>
      </td>
      <td className="px-4 py-3.5 sm:px-5">
        <StudentBadge size="sm" tone="success">
          Berhasil
        </StudentBadge>
      </td>
    </tr>
  );
}

function ConversionLogTable({
  conversionLog,
}: {
  conversionLog: AffiliatorConversionLog[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <caption className="sr-only">Daftar pembelian paket yang berhasil</caption>
        <thead className="bg-primary-50/70 text-xs font-semibold tracking-[0.08em] text-secondary-500 uppercase">
          <tr>
            <th className="px-4 py-3.5 sm:px-5" scope="col">Siswa</th>
            <th className="px-4 py-3.5 sm:px-5" scope="col">Paket</th>
            <th className="px-4 py-3.5 sm:px-5" scope="col">Waktu</th>
            <th className="px-4 py-3.5 sm:px-5" scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {conversionLog.length ? (
            conversionLog.map((conversion) => (
              <ConversionLogRow conversion={conversion} key={conversion.id} />
            ))
          ) : (
            <tr className="hover:bg-transparent">
              <td className="p-0" colSpan={4}>
                <ReferenceEmptyState
                  description="Pembelian berhasil akan muncul di sini."
                  icon={ChartColumnBig}
                  title="Belum ada pembelian"
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ConversionLogPagination({
  page,
  pageCount,
}: {
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const pageHref = (nextPage: number) => `/affiliator/log-pembelian?logPage=${nextPage}`;

  return (
    <nav aria-label="Halaman log pembelian" className="flex items-center justify-end gap-2">
      <span className="mr-1 text-xs font-semibold tabular-nums text-secondary-600">
        {page} / {pageCount}
      </span>
      {page > 1 ? (
        <Link
          aria-label="Log pembelian sebelumnya"
          className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })}
          href={pageHref(page - 1)}
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </Link>
      ) : null}
      {page < pageCount ? (
        <Link
          aria-label="Log pembelian berikutnya"
          className={buttonVariants({ className: "size-10 rounded-2xl p-0", size: "icon-sm", variant: "reference" })}
          href={pageHref(page + 1)}
        >
          <ChevronRight aria-hidden="true" size={16} />
        </Link>
      ) : null}
    </nav>
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
          <ConversionLogTable conversionLog={log.conversionLog} />
        </ReferenceSurface>
        <ConversionLogPagination
          page={log.conversionLogPage}
          pageCount={log.conversionLogPageCount}
        />
      </section>
    </AffiliatorWorkspaceShell>
  );
}

export { AffiliatorPurchaseLogPageModule };
