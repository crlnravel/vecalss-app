"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

function EmptyReportsMessage() {
  return (
    <Empty className="mx-auto w-full max-w-[calc(100vw-2rem)] gap-0 rounded-none border-0 p-0">
      <EmptyHeader className="max-w-sm gap-0">
        <EmptyMedia className="mb-0 text-primary-300" variant="default">
          <ClipboardList aria-hidden="true" className="size-7" />
        </EmptyMedia>
        <EmptyTitle className="mt-3 font-semibold text-secondary-900">
          Belum ada laporan
        </EmptyTitle>
        <EmptyDescription className="mt-2 max-w-[42ch] leading-6 text-secondary-600">
          Saat mentor mengirim laporan, detail kendala dan usulan perbaikannya akan muncul di sini.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function DeveloperReportsTable({ reports }: { reports: DeveloperReportListItem[] }) {
  const router = useRouter();

  return (
    <Table className="table-fixed">
      <TableCaption className="sr-only">Daftar laporan yang dikirim oleh mentor.</TableCaption>
      <TableHeader className="bg-secondary-50/80">
        <TableRow className="border-primary-100 hover:bg-secondary-50/80">
          <TableHead className="h-11 px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5">Judul</TableHead>
          <TableHead className="hidden h-11 w-[22%] px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5 lg:table-cell">Fitur</TableHead>
          <TableHead className="hidden h-11 w-[20%] px-4 py-3 text-xs font-semibold text-secondary-700 sm:px-5 xl:table-cell">Pelapor</TableHead>
          <TableHead className="h-11 w-28 px-4 py-3 text-right text-xs font-semibold text-secondary-700 sm:px-5 xl:w-48">Dikirim</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell className="whitespace-normal px-4 py-16 text-center sm:px-5 sm:py-20 lg:hidden" colSpan={2}>
              <EmptyReportsMessage />
            </TableCell>
            <TableCell className="hidden whitespace-normal px-5 py-20 text-center lg:table-cell xl:hidden" colSpan={3}>
              <EmptyReportsMessage />
            </TableCell>
            <TableCell className="hidden whitespace-normal px-5 py-20 text-center xl:table-cell" colSpan={4}>
              <EmptyReportsMessage />
            </TableCell>
          </TableRow>
        ) : reports.map((report) => {
          const detailHref = `/developer/reports/${report.id}`;

          return (
            <TableRow
              className="cursor-pointer border-primary-100 transition-colors hover:bg-secondary-50/70 focus-within:bg-primary-50/60 motion-reduce:transition-none"
              key={report.id}
              onClick={(event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest("a, button")) return;
                router.push(detailHref);
              }}
            >
              <TableCell className="px-4 py-3.5 sm:px-5">
                <Link
                  className="block truncate rounded-sm font-semibold text-secondary-900 underline-offset-4 outline-none hover:text-primary-800 hover:underline focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2"
                  href={detailHref}
                  title={report.title}
                >
                  {report.title}
                </Link>
              </TableCell>
              <TableCell className="hidden truncate px-4 py-3.5 text-secondary-700 sm:px-5 lg:table-cell" title={getFeatureLabel(report.feature)}>
                <Badge className="max-w-full" size="xs" tone="category">
                  <span className="min-w-0 truncate">{getFeatureLabel(report.feature)}</span>
                </Badge>
              </TableCell>
              <TableCell className="hidden truncate px-4 py-3.5 text-secondary-700 sm:px-5 xl:table-cell" title={report.authorName}>
                {report.authorName}
              </TableCell>
              <TableCell className="px-4 py-3.5 text-right text-secondary-600 tabular-nums sm:px-5" title={formatSubmittedAt(report.createdAt)}>
                <time aria-label={`Dikirim ${formatSubmittedAt(report.createdAt)}`} dateTime={report.createdAt.toISOString()}>
                  <span className="xl:hidden">{formatSubmittedDate(report.createdAt)}</span>
                  <span className="hidden xl:inline">{formatSubmittedAt(report.createdAt)}</span>
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
