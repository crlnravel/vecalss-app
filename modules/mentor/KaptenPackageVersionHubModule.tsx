import Link from "next/link";
import { ChevronLeft, Pencil, Plus } from "@/lib/icons";

import { Button } from "@/components/ui/button";

type Hub = {
  description: string;
  id: string;
  sourceBankName: string;
  subtest: string;
  title: string;
  versions: Array<{ itemCount: number; testCount: number; versionNo: number }>;
};

function KaptenPackageVersionHubModule({ hub }: { hub: Hub }) {
  return <div>
    <div>
      <Button aria-label="Kembali ke Paket Soal" render={<Link href="/mentor/packages" />} size="icon" title="Kembali ke Paket Soal" variant="ghost"><ChevronLeft /></Button>
    </div>
    <header className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em] text-secondary-900">{hub.title}</h1><Button aria-label="Edit informasi Paket" render={<Link href={`/mentor/packages/${hub.id}/edit`} />} size="icon" title="Edit informasi Paket" variant="brandOutline"><Pencil /></Button></div>
      {hub.description ? <p className="mt-2 text-sm text-secondary-500">{hub.description}</p> : null}
      <div className="mt-4"><span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-800">{hub.subtest}</span></div>
    </header>
    <section aria-label="Versi Paket" className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {hub.versions.map((version) => <Link aria-label={`Buka versi ${version.versionNo}`} className="group rounded-2xl border border-primary-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-[0_18px_38px_-28px_rgba(1,76,56,0.38)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20" href={`/mentor/packages/${hub.id}/versions/${version.versionNo}`} key={version.versionNo}>
        <span className="inline-flex rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800">v{version.versionNo}</span>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-secondary-500">Soal</dt><dd className="mt-1 font-semibold text-secondary-900">{version.itemCount}</dd></div><div><dt className="text-secondary-500">Test</dt><dd className="mt-1 font-semibold text-secondary-900">{version.testCount}</dd></div></dl>
      </Link>)}
      <Link aria-label="Siapkan versi berikutnya" className="grid min-h-32 place-items-center rounded-2xl border border-dashed border-primary-300 bg-primary-50/35 p-4 text-center text-primary-800 transition hover:border-primary-600 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20" href={`/mentor/packages/${hub.id}/versions/new`}><span><Plus className="mx-auto size-5" /><span className="mt-2 block text-sm font-semibold">Siapkan versi berikutnya</span></span></Link>
    </section>
  </div>;
}

export { KaptenPackageVersionHubModule };
