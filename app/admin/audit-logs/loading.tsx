import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function AuditLogEventSkeleton({ expanded = false }: { expanded?: boolean }) {
  return (
    <div aria-hidden="true" className="group/event relative pb-6 pl-10 last:pb-0">
      <span className="absolute bottom-1.5 left-3 top-7 w-px bg-primary-100 group-last/event:hidden" />
      <LoadingBlock className="absolute left-0 top-0 size-6 rounded-full" />
      <div className="flex min-h-6 flex-wrap items-center gap-2">
        <LoadingBlock className="h-4 w-40" /><LoadingBlock className="h-4 w-12" /><LoadingBlock className="h-3 w-14" />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-primary-100 bg-secondary-50/60">
        <div className="flex min-h-11 items-center gap-2 px-3"><LoadingBlock className="size-5 rounded-full" /><LoadingBlock className="h-4 w-3/5" /></div>
        {expanded ? (
          <div className="space-y-4 border-t border-primary-100 bg-white px-3 py-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map(value => <div className="space-y-1" key={value}><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-4 w-3/4" /></div>)}
            </div>
            <LoadingBlock className="h-3 w-4/5" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary-100 pt-3"><LoadingBlock className="h-4 w-32" /><LoadingBlock className="h-11 w-32" /></div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AuditLogsLoading() {
  return (
    <SidebarProvider className="workspace-page-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Memuat log audit" className="flex min-h-svh w-full bg-transparent text-secondary-900 lg:gap-2">
        <AdminPortalNav activeSection="audit-logs" />

        <SidebarInset className="min-h-svh min-w-0 !bg-transparent lg:rounded-3xl">
          <header className="sticky top-0 z-20 rounded-control bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LoadingBlock className="h-4 w-24" />
                <LoadingBlock className="hidden h-4 w-20 md:block" />
              </div>
              <LoadingBlock className="h-10 w-10 rounded-full" />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
            <div aria-hidden="true" className="mx-auto w-full max-w-2xl">
              <div className="mb-6 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-2"><LoadingBlock className="h-7 w-40" /><LoadingBlock className="h-4 w-52" /></div>
                  <div className="flex gap-2"><LoadingBlock className="h-11 w-36" /><LoadingBlock className="h-11 w-32" /></div>
                </div>
                <div className="flex gap-2 overflow-hidden pb-2">{[1, 2, 3, 4, 5, 6].map(value => <LoadingBlock className="h-11 w-20 shrink-0" key={value} />)}</div>
              </div>
              <LoadingBlock className="mb-4 h-3 w-32" />
              <AuditLogEventSkeleton expanded /><AuditLogEventSkeleton expanded /><AuditLogEventSkeleton /><AuditLogEventSkeleton />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
