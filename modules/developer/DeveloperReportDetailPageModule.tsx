import Link from "next/link";

import type { SessionContext } from "@/lib/auth/types";
import type { DeveloperReportDetail } from "@/lib/reports";
import { ArrowLeft, ArrowUpRight, Download, FileText } from "@/lib/icons";

import { DeveloperWorkspaceShell } from "./components/developer-workspace-shell";

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
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const sizeInKilobytes = sizeBytes / 1024;
  if (sizeInKilobytes < 1024) {
    return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(sizeInKilobytes)} KB`;
  }

  const sizeInMegabytes = sizeInKilobytes / 1024;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(sizeInMegabytes)} MB`;
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
    <DeveloperWorkspaceShell session={session}>
      <section className="flex flex-col gap-6" aria-labelledby="developer-report-title">
        <Link
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm font-medium text-secondary-600 transition-colors hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          href="/developer/reports"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Kembali ke laporan
        </Link>

        <header className="flex flex-col gap-2">
          <h1 className="break-words text-2xl font-semibold tracking-[-0.02em] text-secondary-950" id="developer-report-title">
            {report.title}
          </h1>
          <p className="text-sm leading-6 text-secondary-600">
            Dikirim {formatSubmittedAt(report.createdAt)}
          </p>
        </header>

        <article className="rounded-2xl border border-primary-100 bg-white p-5 sm:p-7">
          <h2 className="text-base font-semibold text-secondary-900">Detail laporan</h2>

          <dl className="mt-5 grid gap-x-8 gap-y-5 border-b border-primary-100 pb-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-medium text-secondary-500">Fitur</dt>
              <dd className="mt-1 break-words text-sm font-medium text-secondary-900">{getFeatureLabel(report.feature)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-secondary-500">Pelapor</dt>
              <dd className="mt-1 break-words text-sm font-medium text-secondary-900">{report.author.name}</dd>
              <dd className="break-all text-sm text-secondary-600">{report.author.email}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2 lg:col-span-1">
              <dt className="text-xs font-medium text-secondary-500">Tautan terkait</dt>
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
                    <Link className="text-primary-800 hover:text-primary-900" href={reportUrl.href}>
                      {report.url}
                    </Link>
                  )
                ) : (
                  <span className="text-secondary-700">{report.url}</span>
                )}
              </dd>
            </div>
          </dl>

          <section className="border-b border-primary-100 py-6" aria-labelledby="report-description-heading">
            <h3 className="text-sm font-semibold text-secondary-900" id="report-description-heading">Deskripsi</h3>
            <p className="mt-3 max-w-[75ch] whitespace-pre-wrap break-words text-sm leading-6 text-secondary-700">
              {report.description}
            </p>
          </section>

          <section className="pt-6" aria-labelledby="report-attachment-heading">
            <h3 className="text-sm font-semibold text-secondary-900" id="report-attachment-heading">Lampiran</h3>
            {report.attachment ? (
              <div className="mt-3 flex flex-col gap-4 rounded-xl border border-primary-100 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                <a
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary-200 px-4 text-sm font-medium text-secondary-800 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  href={report.attachment.downloadUrl}
                >
                  <Download aria-hidden="true" className="size-4" />
                  Unduh lampiran
                </a>
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
