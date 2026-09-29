import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StudentPageLoadingHeader } from "@/modules/student/components/student-page-loading-header";
import { StudentSidebar } from "@/modules/student/components/student-sidebar";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`motion-safe:animate-pulse rounded-2xl bg-primary-100/70 ${className}`} />;
}

function MateriRowSkeleton() {
  return (
    <article aria-hidden="true" className="grid min-h-[10.5rem] grid-cols-1 rounded-[2rem] border border-primary-100 bg-white p-5 text-secondary-900 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] md:grid-cols-[5rem_minmax(0,1fr)_3rem] md:items-center md:gap-7 md:p-7">
      <LoadingBlock className="size-14 rounded-[1.25rem] md:size-20 md:rounded-[1.6rem]" />
      <div className="mt-4 min-w-0 space-y-3 md:mt-0">
        <div className="flex items-center gap-2">
          <LoadingBlock className="h-3 w-10 rounded-full" />
          <LoadingBlock className="size-1 rounded-full" />
          <LoadingBlock className="h-3 w-12 rounded-full" />
        </div>
        <LoadingBlock className="h-6 w-[min(28rem,90%)] rounded-xl" />
        <div className="flex gap-4">
          <LoadingBlock className="h-4 w-16 rounded-full" />
          <LoadingBlock className="h-4 w-24 rounded-full" />
        </div>
        <LoadingBlock className="h-2.5 w-full rounded-full" />
      </div>
      <div className="mt-4 flex justify-end border-t border-primary-100 pt-4 md:mt-0 md:border-t-0 md:pt-0">
        <LoadingBlock className="size-11 rounded-full" />
      </div>
    </article>
  );
}

export default function MateriLoading() {
  return (
    <SidebarProvider className="student-page-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Memuat Materi" className="flex min-h-svh w-full text-secondary-900 lg:gap-2" role="status">
        <StudentSidebar activeLabel="Materi" appearance="reference" />

        <SidebarInset className="!bg-transparent min-h-svh min-w-0 lg:rounded-3xl">
          <StudentPageLoadingHeader label="Materi" />

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
            <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
              <section aria-hidden="true" className="min-h-[15rem] rounded-[2rem] bg-white shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] motion-safe:animate-pulse md:min-h-[18rem]" />

              <section aria-hidden="true" className="flex flex-col gap-4">
                <div className="flex items-center gap-4 px-1">
                  <LoadingBlock className="h-6 w-20 rounded-full" />
                  <LoadingBlock className="h-8 w-10 rounded-xl" />
                  <span className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
                </div>

                <div className="flex flex-col gap-4">
                  <MateriRowSkeleton />
                  <MateriRowSkeleton />
                  <MateriRowSkeleton />
                  <MateriRowSkeleton />
                  <MateriRowSkeleton />
                </div>
              </section>
            </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
