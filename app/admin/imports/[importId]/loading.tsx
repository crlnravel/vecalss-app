import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function LoadingRow() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[40px_52px_minmax(140px,1fr)_110px_120px_minmax(180px,1.2fr)] items-start gap-3 border-b border-secondary-100 px-4 py-4 last:border-b-0">
      <LoadingBlock className="h-5 w-5" />
      <LoadingBlock className="h-4 w-8" />
      <div className="space-y-2"><LoadingBlock className="h-4 w-32" /><LoadingBlock className="h-3 w-44" /></div>
      <LoadingBlock className="h-4 w-20" />
      <LoadingBlock className="h-6 w-20 rounded-full" />
      <div className="space-y-2"><LoadingBlock className="h-3 w-36" /><LoadingBlock className="h-3 w-48" /></div>
    </div>
  );
}

export default function AdminImportDetailLoading() {
  return (
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Memuat pratinjau data impor" className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <AdminPortalNav activeSection="students" />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header className="sticky top-0 z-20 bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:rounded-3xl lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LoadingBlock className="h-4 w-24" />
                <LoadingBlock className="hidden h-4 w-28 md:block" />
              </div>
              <LoadingBlock className="h-10 w-10 rounded-full" />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <div className="flex items-center justify-between"><LoadingBlock className="h-11 w-36" /><LoadingBlock className="h-11 w-32" /></div>
              <section aria-hidden="true" className="rounded-3xl border border-primary-100 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><LoadingBlock className="size-9" /><div className="space-y-2"><LoadingBlock className="h-6 w-44" /><LoadingBlock className="h-4 w-72" /></div></div><LoadingBlock className="h-4 w-28" /></div></section>
              <section aria-hidden="true" className="rounded-3xl border border-primary-100 bg-white p-5 sm:p-6"><div className="flex items-end justify-between gap-4"><div className="space-y-2"><LoadingBlock className="h-7 w-64" /><LoadingBlock className="h-4 w-48" /></div><LoadingBlock className="h-4 w-28" /></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /></div></section>
              <section aria-hidden="true" className="overflow-hidden rounded-3xl border border-primary-100 bg-white"><div className="flex items-end justify-between border-b border-secondary-100 px-5 py-5 sm:px-6"><div className="space-y-2"><LoadingBlock className="h-6 w-40" /><LoadingBlock className="h-4 w-80" /></div><LoadingBlock className="h-11 w-36" /></div><div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[40px_52px_minmax(140px,1fr)_110px_120px_minmax(180px,1.2fr)] gap-3 border-b border-secondary-100 px-4 py-3"><LoadingBlock className="h-3 w-4" /><LoadingBlock className="h-3 w-8" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-20" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-24" /></div><LoadingRow /><LoadingRow /><LoadingRow /><LoadingRow /></div></div></section>
              <section aria-hidden="true" className="rounded-3xl border border-primary-100 bg-white p-5 sm:p-6"><div className="space-y-2"><LoadingBlock className="h-6 w-56" /><LoadingBlock className="h-4 w-96" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2"><LoadingBlock className="h-20 w-full" /><LoadingBlock className="h-20 w-full" /></div><div className="mt-5 flex justify-between gap-3"><LoadingBlock className="h-11 w-32" /><LoadingBlock className="h-12 w-48" /></div></section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
