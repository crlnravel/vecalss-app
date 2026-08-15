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

function AuditLogRowSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] items-center gap-1 border-b border-primary-100/80 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_150px_minmax(180px,0.8fr)_130px] sm:gap-3 sm:px-6">
      <div className="min-w-0 space-y-2"><LoadingBlock className="h-4 w-full max-w-52" /><LoadingBlock className="h-3 w-full max-w-24" /></div>
      <div className="min-w-0 space-y-2"><LoadingBlock className="h-4 w-full max-w-20" /><LoadingBlock className="h-3 w-full max-w-16" /></div>
      <div className="min-w-0 space-y-2"><LoadingBlock className="h-4 w-full max-w-32" /><LoadingBlock className="h-3 w-full max-w-28" /></div>
      <div className="flex justify-end"><LoadingBlock className="h-9 w-10 sm:w-24" /></div>
    </div>
  );
}

export default function AuditLogsLoading() {
  return (
    <SidebarProvider>
      <div aria-busy="true" aria-label="Loading audit logs" className="flex min-h-svh w-full bg-secondary-50 text-secondary-900">
        <AdminPortalNav activeSection="audit-logs" />

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
              <section aria-hidden="true" className="space-y-3">
                <LoadingBlock className="h-9 w-52" />
                <LoadingBlock className="h-4 w-full max-w-[620px]" />
              </section>

              <section aria-hidden="true" className="overflow-hidden rounded-4xl border border-primary-100 bg-white shadow-[0_20px_52px_-42px_rgba(1,76,56,0.42)]">
                <div className="space-y-2 border-b border-primary-100 px-5 py-4 sm:px-6"><LoadingBlock className="h-5 w-36" /><LoadingBlock className="h-3 w-48" /></div>
                <div><AuditLogRowSkeleton /><AuditLogRowSkeleton /><AuditLogRowSkeleton /><AuditLogRowSkeleton /><AuditLogRowSkeleton /></div>
                <div className="flex items-center justify-between border-t border-primary-100 px-5 py-4 sm:px-6"><LoadingBlock className="h-3 w-32" /><LoadingBlock className="h-9 w-28" /></div>
              </section>
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
