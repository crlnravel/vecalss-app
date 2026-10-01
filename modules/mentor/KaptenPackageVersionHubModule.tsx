import Link from "next/link";

import {
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Pencil } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";

type PackageVersionHistory = {
  createdAt: number;
  itemCount: number;
  readyAt?: number;
  versionNo: number;
};

type Hub = {
  activeItemCount: number;
  activeTotalPoints: number;
  activeVersionId?: string;
  activeVersionNo?: number;
  availability: "draft" | "ready";
  description: string;
  draftItemCount: number;
  draftTotalPoints: number;
  hasDraftChanges: boolean;
  id: string;
  lifecycle: {
    active: {
      itemCount: number;
      totalPoints: number;
      versionId: string;
      versionNo: number;
    } | null;
    availability: "draft" | "ready";
    draft: { itemCount: number; totalPoints: number };
    hasDraftChanges: boolean;
  };
  sourceBankName: string;
  subtest: string;
  title: string;
  usageCount: number;
  versions: PackageVersionHistory[];
};

type HubFeedback = {
  released?: boolean;
  savedDraft?: boolean;
};

const packageDateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const packagePointsFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function packagePointsLabel(points: number) {
  return packagePointsFormatter.format(points);
}

function PackageAvailabilityPill({ availability }: { availability: Hub["availability"] }) {
  return <ReferenceStatusBadge label={availability === "ready" ? "Siap" : "Draf"} size="xs" status={availability} tone={availability === "ready" ? "success" : "attention"} />;
}

function PackageCompletionState({ hub }: { hub: Hub }) {
  if (!hub.activeVersionNo) return null;

  return (
    <ReferenceSurface as="section" aria-labelledby="package-release-complete-heading" className="p-5 sm:p-6" role="status" variant="inset">
      <h2 className="text-xl font-semibold text-secondary-900" id="package-release-complete-heading">Versi aktif tersimpan</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-700">{hub.title} · {packageReleaseLabel(hub.activeVersionNo)} sudah menjadi versi aktif.</p>
      <p className="mt-3 text-sm font-semibold text-secondary-900">{hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</p>
    </ReferenceSurface>
  );
}

function PackageOverviewFeedback({ feedback, hub }: { feedback: HubFeedback; hub: Hub }) {
  if (feedback.released) return <PackageCompletionState hub={hub} />;
  if (!feedback.savedDraft) return null;

  return (
    <ReferenceSurface as="section" aria-live="polite" className="p-5 sm:p-6" role="status" variant="inset">
      <h2 className="text-xl font-semibold text-secondary-900">Draf tersimpan</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-700">Perubahan Paket Soal tersimpan sebagai draf. {hub.activeVersionNo ? `${packageReleaseLabel(hub.activeVersionNo)} tetap menjadi versi aktif sampai perubahan diterapkan.` : "Siapkan versi pertama saat Anda sudah selesai meninjau soal dan poin."}</p>
    </ReferenceSurface>
  );
}

function PackageVersionHistory({ hub }: { hub: Hub }) {
  return (
    <ReferenceSurface as="section" aria-labelledby="package-version-history-heading" className="mt-6 p-5 sm:p-7">
      <ReferenceSectionHeading
        action={<span className="text-xs font-semibold text-secondary-500">{hub.versions.length} versi</span>}
        description="Buka versi tersimpan untuk melihat soal. Membuka riwayat tidak mengubah versi aktif."
        id="package-version-history-heading"
        title="Riwayat versi"
      />
      {hub.versions.length ? (
        <ol className="mt-5 divide-y divide-primary-100 border-y border-primary-100">
          {hub.versions.map((version) => {
            const versionDate = version.readyAt ?? version.createdAt;
            const isActive = version.versionNo === hub.activeVersionNo;
            return (
              <li key={version.versionNo}>
                <Link aria-label={`Buka detail ${packageReleaseLabel(version.versionNo)}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-1 py-4 transition hover:bg-primary-50/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20" href={`/mentor/packages/${hub.id}/versions/${version.versionNo}`}>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-secondary-900">
                      <span>{packageReleaseLabel(version.versionNo)}</span>
                      {isActive ? <Badge size="xs" tone="active">Versi aktif</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs text-secondary-500">{packageDateFormatter.format(new Date(versionDate))} · {version.itemCount} soal</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-600">Belum ada versi Ready. Siapkan versi pertama saat soal dan poin sudah siap.</p>}
    </ReferenceSurface>
  );
}

function KaptenPackageVersionHubModule({ feedback = {}, hub }: { feedback?: HubFeedback; hub: Hub }) {
  const editorHref = `/mentor/packages/${hub.id}/versions/new`;
  const editorLabel = hub.availability === "draft" ? "Siapkan versi pertama" : hub.hasDraftChanges ? "Lanjutkan perubahan" : "Edit soal dan poin";

  return (
    <div className="w-full min-w-0 space-y-5">
      <Button aria-label="Kembali ke daftar Paket Soal" nativeButton={false} render={<Link href="/mentor/packages" />} size="icon" title="Kembali ke daftar Paket Soal" variant="outline"><ChevronLeft /></Button>

      <ReferencePageHeader
        actions={<div className="flex flex-wrap items-center gap-2"><PackageAvailabilityPill availability={hub.availability} />{hub.hasDraftChanges ? <ReferenceStatusBadge label="Perubahan draf" size="xs" status="need_help" /> : null}<Button aria-label="Edit nama dan deskripsi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${hub.id}/edit`} />} size="icon" title="Edit nama dan deskripsi Paket" variant="outline"><Pencil /></Button></div>}
        title={hub.title}
      />
      <ReferenceSurface as="section" aria-label="Ringkasan Paket Soal" className="p-5 sm:p-7">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-secondary-500">Bank sumber</dt><dd className="mt-1 truncate font-semibold text-secondary-900" title={hub.sourceBankName}>{hub.sourceBankName}</dd></div>
          <div><dt className="text-secondary-500">Subtes</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.subtest}</dd></div>
          {hub.activeVersionNo ? <div><dt className="text-secondary-500">Versi aktif</dt><dd className="mt-1 font-semibold text-secondary-900">{packageReleaseLabel(hub.activeVersionNo)} · {hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</dd></div> : <div><dt className="text-secondary-500">Isi draf</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin</dd></div>}
        </dl>
        {hub.hasDraftChanges && hub.activeVersionNo ? (
          <ReferenceSurface as="div" className="mt-5 px-4 py-3 text-sm leading-6 text-student-status-attention-fg" role="note" variant="inset">
            <p><span className="font-semibold">{packageReleaseLabel(hub.activeVersionNo)} tetap aktif.</span> {hub.usageCount > 0 ? "Tryout yang sudah ada tetap menggunakan versi aktif sampai perubahan diterapkan." : "Versi aktif tetap tidak berubah sampai perubahan diterapkan."}</p>
            <p className="mt-1">Perubahan draf: {hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin. Pilih <span className="font-semibold">Terapkan perubahan</span> di editor saat sudah siap.</p>
          </ReferenceSurface>
        ) : null}
      </ReferenceSurface>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.55fr)]">
        <ReferenceSurface as="section" aria-labelledby="package-actions-heading" className="p-5 sm:p-6" variant="inset">
          <h2 className="text-xl font-semibold text-secondary-900" id="package-actions-heading">Langkah berikutnya</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">{hub.availability === "draft" ? "Tinjau soal dan poin, lalu siapkan versi pertama." : hub.hasDraftChanges ? "Lanjutkan perubahan yang tersimpan." : "Edit soal dan poin untuk menyiapkan pembaruan."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href={editorHref} />} size="sm" variant="outline">{editorLabel}<ChevronRight /></Button>
          </div>
        </ReferenceSurface>

        {hub.hasDraftChanges && hub.activeVersionNo ? (
          <ReferenceSurface as="section" aria-labelledby="package-draft-summary-heading" className="p-5 sm:p-6" variant="inset">
            <h2 className="font-semibold text-secondary-900" id="package-draft-summary-heading">Perubahan draf</h2>
            <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-secondary-500">Versi aktif · {packageReleaseLabel(hub.activeVersionNo)}</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</dd></div><div><dt className="text-secondary-500">Perubahan draf</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin</dd></div></dl>
          </ReferenceSurface>
        ) : null}
      </div>

      <div><PackageOverviewFeedback feedback={feedback} hub={hub} /></div>
      <PackageVersionHistory hub={hub} />
    </div>
  );
}

export { KaptenPackageVersionHubModule };
