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
      <div aria-busy="true" aria-label="Loading admin dashboard" className="flex min-h-svh w-full bg-primary-50 text-secondary-900">
        <AdminPortalNav activeSection="overview" />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-primary-50/90 backdrop-blur-xl">
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
              <section>
                <LoadingBlock className="h-7 w-40" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Array.from({ length: 4 }, (_, index) => <LoadingBlock className="h-[88px] bg-white shadow-[0_18px_34px_-30px_rgba(1,76,56,0.45)]" key={index} />)}
                </div>
              </section>

              <section>
                <div className="flex items-start justify-between gap-4">
                  <LoadingBlock className="h-7 w-44" />
                  <LoadingBlock className="size-5 rounded-full" />
                </div>
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 10 }, (_, index) => <LoadingBlock className="h-10 w-full" key={index} />)}
                </div>
                <div className="mt-5 flex justify-center">
                  <LoadingBlock className="h-11 w-24" />
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
