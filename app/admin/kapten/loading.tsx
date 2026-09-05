import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminPortalNav } from "@/modules/portal/components/admin-portal-nav";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function KaptenRowSkeleton() {
  return (
    <div aria-hidden="true" className="grid min-w-[760px] grid-cols-[minmax(220px,28%)_minmax(220px,28%)_minmax(130px,17%)_minmax(130px,17%)_100px] items-center gap-0 border-b border-primary-100/55 px-4 py-3.5 last:border-b-0 sm:px-5">
      <div className="flex items-center gap-3"><LoadingBlock className="size-8 shrink-0 rounded-full" /><LoadingBlock className="h-4 w-32 max-w-[calc(100%-2.75rem)]" /></div>
      <LoadingBlock className="h-4 w-44 max-w-[calc(100%-1rem)]" />
      <LoadingBlock className="h-4 w-20" />
      <LoadingBlock className="h-4 w-16" />
      <div className="flex justify-end"><LoadingBlock className="h-4 w-10" /></div>
    </div>
  );
}

export default function KaptenLoading() {
  return (
    <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Loading Kapten directory" className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
        <AdminPortalNav activeSection="kapten" />

        <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
          <header className="sticky top-0 z-20 bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:rounded-3xl lg:border">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />
              <div className="flex min-w-0 flex-1 items-center gap-3"><LoadingBlock className="h-4 w-24" /></div>
              <LoadingBlock className="size-10 rounded-full" />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <section aria-hidden="true" className="flex items-start justify-between gap-5"><LoadingBlock className="h-10 w-40" /><LoadingBlock className="size-11 rounded-lg" /></section>
              <section aria-hidden="true" className="overflow-hidden rounded-2xl bg-white">
                <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5"><div className="h-10 min-w-[min(100%,18rem)] flex-1 border-b border-primary-100/90 py-2.5"><LoadingBlock className="h-4 w-52 max-w-full" /></div><LoadingBlock className="size-9 rounded-lg" /></div>
                <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[minmax(220px,28%)_minmax(220px,28%)_minmax(130px,17%)_minmax(130px,17%)_100px] items-center gap-0 bg-secondary-50/80 px-4 py-2.5 sm:px-5"><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-12" /><LoadingBlock className="h-3 w-12" /><LoadingBlock className="h-3 w-14" /><div className="flex justify-end"><LoadingBlock className="h-3 w-12" /></div></div><KaptenRowSkeleton /><KaptenRowSkeleton /><KaptenRowSkeleton /><KaptenRowSkeleton /><KaptenRowSkeleton /><KaptenRowSkeleton /></div></div>
                <div className="flex flex-col gap-3 border-t border-primary-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><LoadingBlock className="h-3 w-24" /><div className="flex items-center gap-1"><LoadingBlock className="h-3 w-12" /><LoadingBlock className="size-9 rounded-lg" /><LoadingBlock className="size-9 rounded-lg" /></div></div>
              </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
