import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Pencil } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";

type PackageVersionHistory = {
  createdAt: number;
  itemCount: number;
  readyAt?: number;
  testCount: number;
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
    usageCount: number;
  };
  sourceBankName: string;
  subtest: string;
  title: string;
  tryoutUsageCount: number;
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
  return (
    <span className={availability === "ready" ? "inline-flex rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800" : "inline-flex rounded-full border border-[#ead9a5] bg-[#fff8df] px-3 py-1 text-xs font-semibold text-[#856300]"}>
      {availability === "ready" ? "Siap" : "Draf"}
    </span>
  );
}

function PackageCompletionState({ hub }: { hub: Hub }) {
  if (!hub.activeVersionNo) return null;

  return (
    <section aria-labelledby="package-release-complete-heading" className="rounded-3xl border border-primary-200 bg-primary-50/60 p-5 sm:p-6" role="status">
      <h2 className="text-xl font-semibold text-secondary-900" id="package-release-complete-heading">Paket Soal siap digunakan</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-700">{hub.title} · {packageReleaseLabel(hub.activeVersionNo)} sudah menjadi versi aktif.</p>
      <p className="mt-3 text-sm font-semibold text-secondary-900">{hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href={`/mentor/packages/${hub.id}/use`} />} size="sm" variant="brand"><ChevronRight />Gunakan di Tryout</Button>
        <Button nativeButton={false} render={<Link href={`/mentor/packages/${hub.id}`} />} size="sm" variant="brandOutline">Lihat ikhtisar Paket</Button>
      </div>
    </section>
  );
}

function PackageOverviewFeedback({ feedback, hub }: { feedback: HubFeedback; hub: Hub }) {
  if (feedback.released) return <PackageCompletionState hub={hub} />;
  if (!feedback.savedDraft) return null;

  return (
    <section aria-live="polite" className="rounded-3xl border border-primary-200 bg-primary-50/60 p-5 sm:p-6" role="status">
      <h2 className="text-xl font-semibold text-secondary-900">Draf tersimpan</h2>
      <p className="mt-1 text-sm leading-6 text-secondary-700">Perubahan Paket Soal tersimpan sebagai draf. {hub.activeVersionNo ? `${packageReleaseLabel(hub.activeVersionNo)} tetap menjadi versi aktif sampai perubahan diterapkan.` : "Siapkan versi pertama saat Anda sudah selesai meninjau soal dan poin."}</p>
    </section>
  );
}

function PackageVersionHistory({ hub }: { hub: Hub }) {
  return (
    <section aria-labelledby="package-version-history-heading" className="mt-6 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-secondary-900" id="package-version-history-heading">Riwayat versi</h2>
          <p className="mt-1 text-sm leading-6 text-secondary-500">Buka versi tersimpan untuk melihat soal dan Tryout yang menggunakannya. Membuka riwayat tidak mengubah versi aktif.</p>
        </div>
        <span className="text-xs font-semibold text-secondary-500">{hub.versions.length} versi</span>
      </div>
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
                      {isActive ? <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800">Versi aktif</span> : null}
                    </span>
                    <span className="mt-1 block text-xs text-secondary-500">{packageDateFormatter.format(new Date(versionDate))} · {version.itemCount} soal · {version.testCount} Test Tryout</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-5 rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-600">Belum ada versi Ready. Siapkan versi pertama untuk mulai menggunakan paket di Tryout.</p>}
    </section>
  );
}

function KaptenPackageVersionHubModule({ feedback = {}, hub }: { feedback?: HubFeedback; hub: Hub }) {
  const editorHref = `/mentor/packages/${hub.id}/versions/new`;
  const editorLabel = hub.availability === "draft" ? "Siapkan untuk Tryout" : hub.hasDraftChanges ? "Lanjutkan perubahan" : "Edit soal dan poin";

  return (
    <div className="w-full min-w-0">
      <Button aria-label="Kembali ke daftar Paket Soal" nativeButton={false} render={<Link href="/mentor/packages" />} size="icon" title="Kembali ke daftar Paket Soal" variant="ghost"><ChevronLeft /></Button>

      <header className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-[-0.03em] text-secondary-900">{hub.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PackageAvailabilityPill availability={hub.availability} />
              <span className="text-sm text-secondary-600">{hub.availability === "ready" ? "Bisa digunakan di Tryout" : "Belum tersedia di Tryout"}</span>
              {hub.hasDraftChanges ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">Perubahan draf</span> : null}
            </div>
          </div>
          <Button aria-label="Edit nama dan deskripsi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${hub.id}/edit`} />} size="icon" title="Edit nama dan deskripsi Paket" variant="brandOutline"><Pencil /></Button>
        </div>
        {hub.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-secondary-600">{hub.description}</p> : null}
        <dl className="mt-6 grid gap-4 border-t border-primary-100 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-secondary-500">Bank sumber</dt><dd className="mt-1 truncate font-semibold text-secondary-900" title={hub.sourceBankName}>{hub.sourceBankName}</dd></div>
          <div><dt className="text-secondary-500">Subtest</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.subtest}</dd></div>
          {hub.activeVersionNo ? <div><dt className="text-secondary-500">Versi aktif</dt><dd className="mt-1 font-semibold text-secondary-900">{packageReleaseLabel(hub.activeVersionNo)} · {hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</dd></div> : <div><dt className="text-secondary-500">Isi draf</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin</dd></div>}
          <div><dt className="text-secondary-500">Digunakan di</dt><dd className="mt-1 font-semibold text-secondary-900">{hub.usageCount} Tryout</dd></div>
        </dl>
        {hub.hasDraftChanges && hub.activeVersionNo ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="note">
            <p><span className="font-semibold">{packageReleaseLabel(hub.activeVersionNo)} tetap aman.</span> Tryout yang sudah ada tetap menggunakan versi aktif sampai perubahan diterapkan.</p>
            <p className="mt-1">Perubahan draf: {hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin. Pilih <span className="font-semibold">Terapkan perubahan</span> di editor saat sudah siap.</p>
          </div>
        ) : null}
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.55fr)]">
        <section aria-labelledby="package-actions-heading" className="rounded-3xl border border-primary-200 bg-primary-50/45 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-secondary-900" id="package-actions-heading">Langkah berikutnya</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">{hub.availability === "draft" ? "Tinjau soal dan poin, lalu siapkan versi pertama agar paket dapat dipilih di Tryout." : hub.hasDraftChanges ? "Lanjutkan perubahan yang tersimpan atau gunakan versi aktif untuk Tryout baru." : "Edit soal dan poin untuk menyiapkan pembaruan, atau gunakan versi aktif di Tryout."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button nativeButton={false} render={<Link href={editorHref} />} size="sm" variant="brand">{editorLabel}<ChevronRight /></Button>
            {hub.activeVersionNo ? <Button nativeButton={false} render={<Link href={`/mentor/packages/${hub.id}/use`} />} size="sm" variant="brandOutline">Gunakan di Tryout<ChevronRight /></Button> : <div><Button aria-describedby="package-handoff-unavailable" disabled size="sm" variant="brandOutline">Gunakan di Tryout<ChevronRight /></Button><p className="mt-2 max-w-xs text-xs leading-5 text-secondary-600" id="package-handoff-unavailable">Belum tersedia sampai versi pertama siap.</p></div>}
          </div>
        </section>

        {hub.hasDraftChanges && hub.activeVersionNo ? (
          <section aria-labelledby="package-draft-summary-heading" className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6">
            <h2 className="font-semibold text-amber-950" id="package-draft-summary-heading">Perubahan draf</h2>
            <dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-amber-900/75">Versi aktif · {packageReleaseLabel(hub.activeVersionNo)}</dt><dd className="mt-1 font-semibold text-amber-950">{hub.activeItemCount} soal · {packagePointsLabel(hub.activeTotalPoints)} poin</dd></div><div><dt className="text-amber-900/75">Perubahan draf</dt><dd className="mt-1 font-semibold text-amber-950">{hub.draftItemCount} soal · {packagePointsLabel(hub.draftTotalPoints)} poin</dd></div></dl>
          </section>
        ) : null}
      </div>

      <div className="mt-6"><PackageOverviewFeedback feedback={feedback} hub={hub} /></div>
      <PackageVersionHistory hub={hub} />
    </div>
  );
}

export { KaptenPackageVersionHubModule };
