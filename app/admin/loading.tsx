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
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Loading admin dashboard" className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <AdminPortalNav activeSection="overview" />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header className="sticky top-0 z-20 bg-voyage-canvas/90 backdrop-blur-xl lg:rounded-3xl lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <LoadingBlock className="h-4 w-28" />
                <LoadingBlock className="hidden h-4 w-24 md:block" />
              </div>
              <LoadingBlock className="h-10 w-10 rounded-full" />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <section>
                <LoadingBlock className="h-7 w-40" />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 2 }, (_, index) => <LoadingBlock className="h-[88px] bg-white shadow-[0_18px_34px_-30px_rgba(1,76,56,0.45)]" key={index} />)}
                </div>
              </section>

              <section>
                <LoadingBlock className="h-7 w-44" />
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 10 }, (_, index) => <LoadingBlock className="h-10 w-full" key={index} />)}
                </div>
                <div className="mt-5 flex justify-center">
                  <LoadingBlock className="h-11 w-24" />
                </div>
              </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default AdminLoading;
