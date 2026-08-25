import Link from "next/link";
import { Check, ChevronLeft } from "@/lib/icons";
import { packageReleaseLabel } from "@/lib/tryout/version-label";

import { Button } from "@/components/ui/button";

type Detail = {
  items: Array<{ difficulty: string; options: Array<{ choiceKey: string; content: string; isCorrect: boolean }>; pointValue: number; prompt: string; sortOrder: number }>;
  packageId: string;
  packageTitle: string;
  sourceBankName: string;
  subtest: string;
  versionNo: number;
};

function KaptenPackageVersionDetailModule({ detail }: { detail: Detail }) {
  return <div>
    <Button aria-label="Kembali ke versi Paket" nativeButton={false} render={<Link href={`/mentor/packages/${detail.packageId}`} />} size="icon" title="Kembali ke versi Paket" variant="ghost"><ChevronLeft /></Button>
    <header className="mt-3 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-3xl font-semibold tracking-[-0.03em] text-secondary-900">{detail.packageTitle}</h1><span className="rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800">{packageReleaseLabel(detail.versionNo)}</span></div>
      <dl className="mt-6 grid gap-4 border-t border-primary-100 pt-5 text-sm sm:grid-cols-3"><div><dt className="text-secondary-500">Bank</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.sourceBankName}</dd></div><div><dt className="text-secondary-500">Subtest</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.subtest}</dd></div><div><dt className="text-secondary-500">Soal</dt><dd className="mt-1 font-semibold text-secondary-900">{detail.items.length}</dd></div></dl>
    </header>
    <section className="mt-5 rounded-3xl border border-primary-100 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-secondary-900">Soal</h2><span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">{detail.items.length} soal</span></div>{detail.items.length ? <ol className="mt-5 grid gap-4">{detail.items.map((item) => <li className="rounded-2xl border border-primary-100 p-4" key={item.sortOrder}><div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-50 text-xs font-bold text-primary-800">{item.sortOrder}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm leading-6 text-secondary-900">{item.prompt}</p><span className="shrink-0 text-sm font-semibold text-primary-800">{item.pointValue} poin</span></div><ul className="mt-3 grid gap-2">{item.options.map((option) => <li className={option.isCorrect ? "flex gap-2 rounded-xl bg-primary-50 px-3 py-2 text-sm text-primary-900" : "flex gap-2 rounded-xl bg-secondary-50 px-3 py-2 text-sm text-secondary-700"} key={option.choiceKey}><span className="font-semibold">{option.choiceKey}.</span><span>{option.content}</span>{option.isCorrect ? <Check aria-label="Jawaban benar" className="ml-auto size-4 shrink-0 text-primary-700" /> : null}</li>)}</ul></div></div></li>)}</ol> : <p className="mt-4 text-sm text-secondary-500">Versi ini belum memiliki soal.</p>}</section>
  </div>;
}

export { KaptenPackageVersionDetailModule };
