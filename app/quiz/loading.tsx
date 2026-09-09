import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
          <header className="sticky top-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[calc(1420px-2rem)] overflow-hidden border-primary-100/80 bg-[rgba(247,250,248,0.58)] shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] backdrop-blur-3xl backdrop-saturate-150 md:w-[calc(100%-4rem)] md:max-w-[calc(1420px-4rem)] lg:top-6 lg:w-[calc(100%-5rem)] lg:max-w-[calc(1420px-5rem)] lg:rounded-3xl lg:border">
            <div className="relative z-10 flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />
              <div className="hidden min-w-0 flex-1 md:block">
                <span className="text-sm font-medium text-secondary-500">Kuis</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <LoadingBlock className="size-10 rounded-full" />
                <LoadingBlock className="size-10 rounded-full" />
              </div>
            </div>
          </header>

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
