import Link from "next/link";

import { ArrowRight, Check, ChevronLeft, CircleAlert, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import type { ReusableQuestionPackageUseContext } from "@/lib/tryout/repository";

function handoffQuery(context: ReusableQuestionPackageUseContext, tryoutId?: string) {
  const params = new URLSearchParams({
    packageId: context.package.id,
    packageVersionId: context.version.id,
    subtest: context.package.subtest,
    workspace: "sections",
  });
  return `/mentor/tryout/${tryoutId ? `${tryoutId}?` : "create?"}${params.toString()}`;
}

function KaptenPackageUsePageModule({ context }: { context: ReusableQuestionPackageUseContext }) {
  const eligibleTargets = context.targets.filter((target) => target.eligible);
  return (
    <div className="min-w-0 w-full px-4 py-5 sm:px-6 lg:px-8">
      <Button aria-label="Kembali ke Paket Soal" nativeButton={false} render={<Link href={`/mentor/packages/${context.package.id}`} />} size="icon" title="Kembali ke Paket Soal" variant="ghost">
        <ChevronLeft />
      </Button>
      <header className="mt-3 grid gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary-800">Gunakan Paket Soal di Tryout</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-secondary-900 sm:text-3xl">{context.package.title}</h1>
          {context.package.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-600">{context.package.description}</p> : null}
        </div>
        <dl className="grid gap-3 border-t border-primary-100 pt-4 text-sm sm:grid-cols-3">
          <div><dt className="text-secondary-500">Versi yang dipakai</dt><dd className="mt-1 font-semibold text-secondary-900">{context.version.label}</dd></div>
          <div><dt className="text-secondary-500">Subtest</dt><dd className="mt-1 font-semibold text-secondary-900">{context.package.subtest} · {context.package.sourceBankName}</dd></div>
          <div><dt className="text-secondary-500">Isi versi</dt><dd className="mt-1 font-semibold text-secondary-900">{context.version.itemCount} soal · {context.version.testType === "cat" ? "CAT" : "CBT"}</dd></div>
        </dl>
        <p className="rounded-2xl border border-primary-100 bg-primary-50/55 px-4 py-3 text-sm leading-6 text-secondary-700" role="status">
          Versi Ready ini immutable. Perubahan Paket Soal setelah handoff tidak mengubah sumber yang dipilih di Tryout.
        </p>
      </header>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="grid content-start gap-4 rounded-3xl border border-primary-200 bg-primary-50/45 p-5 sm:p-6" aria-labelledby="new-tryout-title">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-white text-primary-800"><Plus aria-hidden="true" /></div>
          <div>
            <h2 className="text-xl font-semibold text-secondary-900" id="new-tryout-title">Tryout baru</h2>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Buat draf Tryout baru dengan versi Paket Soal ini dipilih untuk Test {context.package.subtest}.</p>
          </div>
          <Button className="w-fit" nativeButton={false} render={<Link href={handoffQuery(context)} />} variant="brand"><ArrowRight />Buat Tryout baru</Button>
        </section>

        <section className="grid content-start gap-4 rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(16,36,29,0.18)] sm:p-6" aria-labelledby="existing-tryout-title">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-800"><Check aria-hidden="true" /></div>
          <div>
            <h2 className="text-xl font-semibold text-secondary-900" id="existing-tryout-title">Tryout yang sudah ada</h2>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Pilih draf Tryout milik Anda untuk melanjutkan pengaturan Test.</p>
          </div>
          {eligibleTargets.length ? (
            <div className="grid gap-2" role="list" aria-label="Tryout draf yang dapat digunakan">
              {context.targets.map((target) => target.eligible ? (
                <Link className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-primary-100 bg-white px-4 py-3 text-sm transition hover:border-primary-300 hover:bg-primary-50/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-700/20" href={handoffQuery(context, target.id)} key={target.id} role="listitem">
                  <span className="min-w-0"><span className="block truncate font-semibold text-secondary-900">{target.title}</span><span className="mt-1 block text-xs text-secondary-500">Draf · Test {context.package.subtest} siap dipilih</span></span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-primary-700" />
                </Link>
              ) : (
                <div className="grid gap-1 rounded-2xl border border-secondary-100 bg-secondary-50/45 px-4 py-3 text-sm" key={target.id} role="listitem">
                  <div className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate font-semibold text-secondary-700">{target.title}</span><span className="shrink-0 text-xs text-secondary-500">Tidak tersedia</span></div>
                  <p className="flex items-start gap-2 text-xs leading-5 text-secondary-600"><CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[#8a5e00]" />{target.disabledReason ?? "Tryout ini belum dapat menerima versi Paket Soal tersebut."}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-sm leading-6 text-secondary-600">Belum ada draf Tryout yang dapat dipilih. Gunakan Tryout baru untuk melanjutkan.</p>
          )}
        </section>
      </div>
    </div>
  );
}

export { KaptenPackageUsePageModule };
