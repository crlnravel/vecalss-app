import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionContext } from "@/lib/auth/types";
import type { DeveloperReportDetail } from "@/lib/reports";
import { ChevronLeft, ArrowUpRight, Download, FileText } from "@/lib/icons";

import { DeveloperWorkspaceShell } from "./components/developer-workspace-shell";

const SUBMITTED_AT_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const FILE_SIZE_FORMATTER = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 1,
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

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const sizeInKilobytes = sizeBytes / 1024;
  if (sizeInKilobytes < 1024) {
    return `${FILE_SIZE_FORMATTER.format(sizeInKilobytes)} KB`;
  }

  const sizeInMegabytes = sizeInKilobytes / 1024;
  return `${FILE_SIZE_FORMATTER.format(sizeInMegabytes)} MB`;
}

function getFriendlyAttachmentType(contentType: string) {
  if (contentType === "application/pdf") return "PDF";
  if (contentType.startsWith("image/")) return "Gambar";
  return "Lampiran";
}

function getSafeReportUrl(url: string) {
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return { external: false, href: url };
  }

  try {
    const parsed = new URL(url);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password) {
      return { external: true, href: url };
    }
  } catch {
    return null;
  }

  return null;
}

function DeveloperReportDetailPageModule({
  report,
  session,
}: {
  report: DeveloperReportDetail;
  session: SessionContext;
}) {
  const reportUrl = getSafeReportUrl(report.url);

  return (
    <DeveloperWorkspaceShell isDetailPage accountUser={{ id: session.user.id, email: session.user.email, fullName: session.user.fullName }}>
      <section className="flex min-w-0 flex-col gap-7" aria-labelledby="developer-report-title">
        <header className="flex items-start gap-4">
          <Tooltip>
            <TooltipTrigger render={<Button aria-label="Kembali ke laporan" className="size-11 shrink-0" render={<Link href="/developer/reports" />} variant="brandOutline" />}>
              <ChevronLeft aria-hidden="true" className="size-5" />
            </TooltipTrigger>
            <TooltipContent>Kembali ke laporan</TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            <h1 className="max-w-[32ch] break-words font-heading text-2xl leading-tight font-semibold tracking-[-0.03em] text-balance text-voyage-ink sm:text-3xl" id="developer-report-title">
              {report.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-secondary-600">
              Dikirim {formatSubmittedAt(report.createdAt)}
            </p>
          </div>
        </header>

        <article className="rounded-2xl border border-primary-100 bg-white p-5 sm:p-8">
          <h2 className="text-lg font-semibold text-secondary-900">Detail laporan</h2>

          <dl className="mt-6 grid gap-x-8 gap-y-6 border-b border-primary-100 pb-8 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-secondary-600">Fitur</dt>
              <dd className="mt-1 break-words text-sm font-medium text-secondary-900">{getFeatureLabel(report.feature)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-secondary-600">Pelapor</dt>
              <dd className="mt-1 break-words text-sm font-medium text-secondary-900">{report.author.name}</dd>
              <dd className="break-all text-sm text-secondary-600">{report.author.email}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <dt className="text-xs font-semibold text-secondary-600">Tautan terkait</dt>
              <dd className="mt-1 break-all text-sm">
                {reportUrl ? (
                  reportUrl.external ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary-800 hover:text-primary-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                      href={reportUrl.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <span>{report.url}</span>
                      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
                    </a>
                  ) : (
                    <Link className="rounded-sm text-primary-800 underline-offset-4 hover:text-primary-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500" href={reportUrl.href}>
                      {report.url}
                    </Link>
                  )
                ) : (
                  <span className="text-secondary-700">{report.url}</span>
                )}
              </dd>
            </div>
          </dl>

          <section className="border-b border-primary-100 py-8" aria-labelledby="report-description-heading">
            <h3 className="text-sm font-semibold text-secondary-900" id="report-description-heading">Deskripsi</h3>
            <p className="mt-3 max-w-[65ch] whitespace-pre-wrap break-words text-base leading-7 text-secondary-700">
              {report.description}
            </p>
          </section>

          <section className="pt-8" aria-labelledby="report-attachment-heading">
            <h3 className="text-sm font-semibold text-secondary-900" id="report-attachment-heading">Lampiran</h3>
            {report.attachment ? (
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-700" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-secondary-900" title={report.attachment.fileName}>
                      {report.attachment.fileName}
                    </p>
                    <p className="mt-1 text-xs text-secondary-600">
                      {getFriendlyAttachmentType(report.attachment.contentType)} · {formatFileSize(report.attachment.sizeBytes)}
                    </p>
                  </div>
                </div>
                <Button
                  className="min-h-11 shrink-0"
                  render={<a href={report.attachment.downloadUrl} />}
                  variant="brandOutline"
                >
                  <Download aria-hidden="true" className="size-4" />
                  Unduh lampiran
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-secondary-600">Tidak ada lampiran.</p>
            )}
          </section>
        </article>
      </section>
    </DeveloperWorkspaceShell>
  );
}

export { DeveloperReportDetailPageModule };
