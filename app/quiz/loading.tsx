import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { StudentPageLoadingHeader } from "@/modules/student/components/student-page-loading-header";
import { StudentSidebar } from "@/modules/student/components/student-sidebar";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`motion-safe:animate-pulse rounded-2xl bg-primary-100/70 ${className}`} />;
}

function QuizCardSkeleton() {
  return (
    <article aria-hidden="true" className="min-h-[246px] rounded-[2rem] border border-primary-100 bg-white p-6 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] md:min-h-[270px] md:p-7">
      <div className="flex items-start justify-between gap-4">
        <LoadingBlock className="size-14 rounded-[1.25rem] md:size-20 md:rounded-[1.6rem]" />
        <LoadingBlock className="h-8 w-14 rounded-full" />
      </div>
      <LoadingBlock className="mt-8 h-14 w-32 rounded-xl" />
      <LoadingBlock className="mt-4 h-4 w-48 max-w-full rounded-full" />
      <div className="mt-8 flex items-end justify-between gap-4">
        <div className="flex gap-4">
          <LoadingBlock className="h-4 w-16 rounded-full" />
          <LoadingBlock className="h-4 w-16 rounded-full" />
        </div>
        <LoadingBlock className="size-11 rounded-full" />
      </div>
    </article>
  );
}

export default function QuizLoading() {
  return (
    <SidebarProvider className="student-page-canvas lg:gap-2 lg:p-6">
      <div aria-busy="true" aria-label="Memuat Kuis" className="flex min-h-svh w-full text-secondary-900 lg:gap-2" role="status">
        <StudentSidebar activeLabel="Kuis" appearance="reference" />

        <SidebarInset className="!bg-transparent min-h-svh min-w-0 lg:rounded-3xl">
          <StudentPageLoadingHeader label="Kuis" />

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
            <section aria-hidden="true" className="min-h-[15rem] rounded-[2rem] bg-white shadow-[0_26px_80px_-46px_color-mix(in_oklab,var(--voyage-deep)_24%,transparent)] motion-safe:animate-pulse md:min-h-[18rem]" />

            <div className="flex flex-col gap-10">
              <section aria-hidden="true" className="flex flex-col gap-4">
                <div className="flex items-center gap-4 px-1">
                  <LoadingBlock className="h-6 w-28 rounded-full" />
                  <span className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <QuizCardSkeleton />
                  <QuizCardSkeleton />
                  <QuizCardSkeleton />
                </div>
              </section>

              <section aria-hidden="true" className="flex flex-col gap-4">
                <div className="flex items-center gap-4 px-1">
                  <LoadingBlock className="h-6 w-24 rounded-full" />
                  <span className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
                </div>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  <QuizCardSkeleton />
                  <QuizCardSkeleton />
                  <QuizCardSkeleton />
                </div>
              </section>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
