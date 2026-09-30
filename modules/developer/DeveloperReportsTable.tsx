"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DeveloperReportListItem } from "@/lib/reports";
import { ClipboardList } from "@/lib/icons";

const SUBMITTED_AT_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const SUBMITTED_DATE_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

const FEATURE_LABELS: Record<string, string> = {
  bank_soal_kuis: "Bank Soal Kuis",
  bank_soal_tryout: "Bank Soal Tryout",
  dashboard: "Dashboard",
  kuis: "Kuis",
  materi: "Materi",
  media: "Media",
  profile: "Profil",
  tryout: "Tryout",
  video: "Video",
};

function getFeatureLabel(feature: string) {
  return FEATURE_LABELS[feature] ?? feature.replaceAll("_", " ");
}

function formatSubmittedAt(date: Date) {
  return SUBMITTED_AT_FORMATTER.format(date);
}

function formatSubmittedDate(date: Date) {
  return SUBMITTED_DATE_FORMATTER.format(date);
}

function DeveloperReportsTable({ reports }: { reports: DeveloperReportListItem[] }) {
  const router = useRouter();

  return (
    <Table>
      <TableCaption className="sr-only">Daftar laporan yang dikirim oleh mentor.</TableCaption>
      <TableHeader className="bg-secondary-50/80">
        <TableRow className="border-primary-100 hover:bg-secondary-50/80">
          <TableHead className="h-11 px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5">Judul</TableHead>
          <TableHead className="hidden h-11 px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5 md:table-cell">Fitur</TableHead>
          <TableHead className="hidden h-11 px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5 md:table-cell">Pelapor</TableHead>
          <TableHead className="w-px h-11 px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5">Dikirim</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell className="px-4 py-12 text-center sm:px-5" colSpan={4}>
              <div className="mx-auto flex max-w-[calc(100vw-2rem)] flex-col items-center gap-2 text-center">
                <ClipboardList aria-hidden="true" className="mb-1 size-7 text-primary-300" />
                <p className="text-sm font-semibold text-secondary-900">Belum ada laporan</p>
                <p className="max-w-[42ch] text-sm leading-6 text-secondary-600">
                  Laporan kendala dan usulan perbaikan dari mentor akan muncul di sini.
                </p>
              </div>
            </TableCell>
          </TableRow>
        ) : reports.map((report) => {
          const detailHref = `/developer/reports/${report.id}`;

          return (
            <TableRow
              className="cursor-pointer border-primary-100 transition-colors hover:bg-secondary-50/70"
              key={report.id}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest("a, button")) return;
                router.push(detailHref);
              }}
            >
              <TableCell className="max-w-64 px-4 py-3.5 sm:px-5">
                <Link
                  className="block truncate rounded-sm font-medium text-secondary-900 outline-none hover:text-primary-800 focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
                  href={detailHref}
                  title={report.title}
                >
                  {report.title}
                </Link>
              </TableCell>
              <TableCell className="hidden max-w-44 truncate px-4 py-3.5 text-secondary-700 sm:px-5 md:table-cell" title={getFeatureLabel(report.feature)}>
                {getFeatureLabel(report.feature)}
              </TableCell>
              <TableCell className="hidden max-w-52 truncate px-4 py-3.5 text-secondary-700 sm:px-5 md:table-cell" title={report.authorName}>
                {report.authorName}
              </TableCell>
              <TableCell className="w-px px-4 py-3.5 text-secondary-700 sm:px-5" title={formatSubmittedAt(report.createdAt)}>
                <time aria-label={`Dikirim ${formatSubmittedAt(report.createdAt)}`} dateTime={report.createdAt.toISOString()}>
                  <span className="md:hidden">{formatSubmittedDate(report.createdAt)}</span>
                  <span className="hidden md:inline">{formatSubmittedAt(report.createdAt)}</span>
                </time>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export { DeveloperReportsTable };
