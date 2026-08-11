import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function AdminLoading() {
  return (
    <SidebarProvider>
      <div aria-busy="true" aria-label="Loading admin dashboard" className="flex min-h-svh w-full bg-secondary-50 text-secondary-900">
        <AdminPortalNav activeSection="overview" />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-secondary-50/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LoadingBlock className="h-4 w-28" />
                <LoadingBlock className="hidden h-4 w-24 md:block" />
              </div>
              <LoadingBlock className="h-10 w-10 rounded-full" />
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <section className="overflow-hidden rounded-5xl bg-primary-700 p-5 shadow-[0_28px_68px_-44px_rgba(1,76,56,0.72)] sm:p-6 lg:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-[50ch]">
                    <LoadingBlock className="h-10 w-64 bg-primary-600 sm:h-12 sm:w-80" />
                    <LoadingBlock className="mt-4 h-3 w-40 bg-primary-500" />
                    <LoadingBlock className="mt-4 h-4 w-full max-w-[420px] bg-primary-600" />
                  </div>
                  <LoadingBlock className="h-11 w-full max-w-[250px] bg-primary-600" />
                </div>
                <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-white/15 bg-white/[0.075] px-3 py-4 sm:px-5" key={index}>
                      <LoadingBlock className="h-3 w-3/5 bg-primary-500" />
                      <LoadingBlock className="mt-4 h-8 w-1/2 bg-primary-600" />
                      <LoadingBlock className="mt-3 h-3 w-4/5 bg-primary-600" />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <LoadingBlock className="h-7 w-40" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => <LoadingBlock className="h-[88px] bg-white shadow-[0_18px_34px_-30px_rgba(1,76,56,0.45)]" key={index} />)}
                </div>
              </section>
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default AdminLoading;
