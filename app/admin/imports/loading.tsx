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

function LoadingImportRow() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[minmax(220px,1.4fr)_110px_70px_130px_150px_100px] items-center gap-3 border-b border-secondary-100 px-4 py-4 last:border-b-0">
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
    <SidebarProvider>
      <div aria-busy="true" aria-label="Loading imports workspace" className="flex min-h-svh w-full bg-secondary-50 text-secondary-900">
        <AdminPortalNav activeSection="imports" />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-secondary-50/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LoadingBlock className="h-4 w-24" />
                <LoadingBlock className="hidden h-4 w-20 md:block" />
              </div>
              <LoadingBlock className="h-10 w-10 rounded-full" />
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <section aria-hidden="true" aria-label="Loading roster import intake" className="rounded-3xl border border-primary-100 bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between"><div className="space-y-2"><LoadingBlock className="h-7 w-56" /><LoadingBlock className="h-4 w-full max-w-[560px]" /></div><LoadingBlock className="h-4 w-28" /></div>
                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div><LoadingBlock className="h-4 w-28" /><div className="mt-2 grid gap-2 sm:grid-cols-2"><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /></div><LoadingBlock className="mt-4 h-16 w-full" /><LoadingBlock className="mt-3 h-11 w-44" /></div>
                  <div className="rounded-2xl border border-dashed border-primary-200 bg-secondary-50 p-4 sm:p-5"><LoadingBlock className="h-4 w-36" /><LoadingBlock className="mt-2 h-3 w-full max-w-[420px]" /><LoadingBlock className="mt-4 h-11 w-full" /><LoadingBlock className="mt-4 h-11 w-full" /><LoadingBlock className="mt-3 h-4 w-4/5" /></div>
                </div>
              </section>

              <section aria-hidden="true" className="overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)]">
                <div className="flex flex-col gap-2 border-b border-secondary-100 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div className="space-y-2"><LoadingBlock className="h-7 w-48" /><LoadingBlock className="h-4 w-80 max-w-full" /></div><LoadingBlock className="h-7 w-20 rounded-full" /></div>
                <div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[minmax(220px,1.4fr)_110px_70px_130px_150px_100px] gap-3 border-b border-secondary-100 px-4 py-3"><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-12" /><LoadingBlock className="h-3 w-8" /><LoadingBlock className="h-3 w-14" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-12" /></div><LoadingImportRow /><LoadingImportRow /><LoadingImportRow /><LoadingImportRow /></div></div>
              </section>
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
