import { BrandLogo } from "@/modules/home/components/home-primitives";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-[#dceee1] ${className}`} />;
}

function AdminLoading() {
  return (
    <main aria-busy="true" aria-label="Loading operations console" className="min-h-screen bg-[#f7faf8] text-[#173c2d]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 md:px-8 md:py-6">
        <div className="flex min-h-[calc(100vh-2rem)] flex-1 gap-5 md:min-h-[calc(100vh-3rem)] md:gap-6">
          <AdminPortalNav activeSection="overview" />

          <div className="min-w-0 flex-1">
            <header className="rounded-[24px] border border-[#d6e5db] bg-white px-4 py-4 shadow-[0_20px_54px_-42px_rgba(1,76,56,0.55)] sm:px-6 md:px-7 md:py-5">
              <div className="flex items-start gap-3 md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-5">
                  <div className="md:hidden">
                    <AdminPortalNav activeSection="overview" mobileOnly />
                  </div>
                  <div className="hidden shrink-0 items-center md:inline-flex">
                    <BrandLogo compact />
                  </div>
                  <div className="hidden h-10 w-px bg-[#d6e5db] md:block" />
                  <div className="min-w-0">
                    <LoadingBlock className="h-3 w-32 bg-[#b8d8c0]" />
                    <LoadingBlock className="mt-2 h-6 w-48 bg-[#c9dfd0] sm:w-60" />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <LoadingBlock className="hidden h-9 w-36 rounded-full bg-[#eef8f1] lg:block" />
                  <LoadingBlock className="h-11 w-20 bg-[#c9dfd0]" />
                </div>
              </div>
              <LoadingBlock className="mt-4 h-4 w-full max-w-[620px] bg-[#eef8f1] md:mt-3" />
              <LoadingBlock className="mt-2 h-4 w-4/5 max-w-[520px] bg-[#eef8f1]" />
            </header>

            <div className="space-y-6 py-5 md:py-7">
              <section className="overflow-hidden rounded-[26px] bg-[#014c38] p-5 shadow-[0_28px_68px_-44px_rgba(1,76,56,0.72)] sm:p-6 lg:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-[62ch]">
                    <LoadingBlock className="h-9 w-64 bg-[#176b4d] sm:h-11 sm:w-80" />
                    <LoadingBlock className="mt-4 h-3 w-40 bg-[#2f8a5d]" />
                    <LoadingBlock className="mt-4 h-4 w-full max-w-[520px] bg-[#176b4d]" />
                    <LoadingBlock className="mt-2 h-4 w-4/5 max-w-[440px] bg-[#176b4d]" />
                  </div>
                  <LoadingBlock className="h-11 w-full max-w-[250px] bg-[#176b4d]" />
                </div>
                <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-white/[0.075] px-3 py-4 sm:px-5" key={index}>
                      <LoadingBlock className="h-3 w-3/5 bg-[#2f8a5d]" />
                      <LoadingBlock className="mt-4 h-8 w-1/2 bg-[#176b4d]" />
                      <LoadingBlock className="mt-3 h-3 w-4/5 bg-[#176b4d]" />
                      <LoadingBlock className="mt-2 h-3 w-3/5 bg-[#176b4d]" />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <LoadingBlock className="h-6 w-56 bg-[#c9dfd0]" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => <LoadingBlock className="h-[88px] bg-white shadow-[0_18px_34px_-30px_rgba(1,76,56,0.45)]" key={index} />)}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default AdminLoading;
