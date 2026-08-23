import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ADMIN_CARD_CLASS_NAME } from "@/modules/admin/admin-ui-contract";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function AuditLogRowSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[45%_30%_25%] items-center border-b border-primary-100/55 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 pr-3"><LoadingBlock className="h-4 w-3/4 max-w-52" /></div>
      <div className="min-w-0 pr-3"><LoadingBlock className="h-4 w-4/5 max-w-32" /></div>
      <div className="min-w-0"><LoadingBlock className="h-4 w-3/4 max-w-36" /></div>
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
                <div className="flex items-baseline justify-between gap-3">
                  <LoadingBlock className="h-9 w-52" />
                  <LoadingBlock className="h-4 w-16" />
                </div>
              </section>

              <section aria-hidden="true" className={`${ADMIN_CARD_CLASS_NAME} overflow-hidden`}>
                <div className="space-y-2 border-b border-primary-100 px-5 py-4 sm:px-6"><LoadingBlock className="h-5 w-36" /><LoadingBlock className="h-3 w-48" /></div>
                <div className="flex items-center gap-3 border-b border-primary-100 px-4 pb-3 pt-4 sm:px-5 sm:pt-5"><LoadingBlock className="h-10 min-w-0 flex-1" /><LoadingBlock className="size-9 rounded-lg" /><LoadingBlock className="size-9 rounded-lg" /></div>
                <div className="grid grid-cols-[45%_30%_25%] items-center bg-secondary-50/80 px-4 py-2.5 sm:px-5"><LoadingBlock className="h-3 w-14" /><LoadingBlock className="h-3 w-12" /><LoadingBlock className="h-3 w-14" /></div>
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
