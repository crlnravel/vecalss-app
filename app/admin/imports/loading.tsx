import { BrandLogo } from "@/modules/home/components/home-primitives";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-[#dceee1] ${className}`} />;
}

function LoadingImportRow() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[minmax(220px,1.4fr)_110px_70px_130px_150px_100px] items-center gap-3 border-b border-[#edf3ee] px-4 py-4 last:border-b-0">
      <div className="space-y-2"><LoadingBlock className="h-4 w-40" /><LoadingBlock className="h-3 w-24" /></div>
      <LoadingBlock className="h-4 w-16" />
      <LoadingBlock className="h-4 w-8" />
      <LoadingBlock className="h-6 w-24 rounded-full" />
      <LoadingBlock className="h-3 w-28" />
      <LoadingBlock className="h-10 w-20" />
    </div>
  );
}

export default function AdminImportsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading imports workspace" className="min-h-screen bg-[#f7faf8] text-[#173c2d]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 md:px-8 md:py-6">
        <div className="flex min-h-[calc(100vh-2rem)] flex-1 gap-5 md:min-h-[calc(100vh-3rem)] md:gap-6">
          <AdminPortalNav activeSection="imports" />

          <div className="min-w-0 flex-1">
            <header className="rounded-[24px] border border-[#d6e5db] bg-white px-4 py-4 shadow-[0_20px_54px_-42px_rgba(1,76,56,0.55)] sm:px-6 md:px-7 md:py-5">
              <div className="flex items-start gap-3 md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-5">
                  <div className="md:hidden"><AdminPortalNav activeSection="imports" mobileOnly /></div>
                  <div className="hidden shrink-0 items-center md:inline-flex"><BrandLogo compact /></div>
                  <div className="hidden h-10 w-px bg-[#d6e5db] md:block" />
                  <div className="min-w-0"><LoadingBlock className="h-3 w-28 bg-[#b8d8c0]" /><LoadingBlock className="mt-2 h-6 w-40 bg-[#c9dfd0] sm:w-52" /></div>
                </div>
                <LoadingBlock className="h-11 w-20 bg-[#c9dfd0]" />
              </div>
              <LoadingBlock className="mt-4 h-4 w-full max-w-[660px] bg-[#eef8f1] md:mt-3" />
              <LoadingBlock className="mt-2 h-4 w-4/5 max-w-[520px] bg-[#eef8f1]" />
            </header>

            <div className="space-y-6 py-5 md:py-7">
              <section aria-hidden="true" aria-label="Loading roster import intake" className="rounded-[24px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><LoadingBlock className="h-6 w-56" /><LoadingBlock className="h-4 w-full max-w-[560px]" /></div><LoadingBlock className="h-4 w-28" /></div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div><LoadingBlock className="h-4 w-28" /><div className="mt-2 grid gap-2 sm:grid-cols-2"><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /></div><LoadingBlock className="mt-4 h-16 w-full" /><LoadingBlock className="mt-3 h-11 w-44" /></div>
                  <div className="rounded-2xl border border-dashed border-[#b7ddc3] bg-[#f8fcf9] p-4 sm:p-5"><LoadingBlock className="h-4 w-36" /><LoadingBlock className="mt-2 h-3 w-full max-w-[420px]" /><LoadingBlock className="mt-4 h-11 w-full" /><LoadingBlock className="mt-4 h-11 w-full" /><LoadingBlock className="mt-3 h-4 w-4/5" /></div>
                </div>
              </section>

              <section aria-hidden="true" className="overflow-hidden rounded-[24px] border border-[#d6e5db] bg-white shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)]">
                <div className="flex flex-col gap-2 border-b border-[#e7f0ea] px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div className="space-y-2"><LoadingBlock className="h-6 w-48" /><LoadingBlock className="h-4 w-80 max-w-full" /></div><LoadingBlock className="h-7 w-20 rounded-full" /></div>
                <div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[minmax(220px,1.4fr)_110px_70px_130px_150px_100px] gap-3 border-b border-[#e7f0ea] px-4 py-3"><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-12" /><LoadingBlock className="h-3 w-8" /><LoadingBlock className="h-3 w-14" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-12" /></div><LoadingImportRow /><LoadingImportRow /><LoadingImportRow /><LoadingImportRow /></div></div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
