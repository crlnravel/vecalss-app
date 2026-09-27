import { SidebarTrigger } from "@/components/ui/sidebar";

function LoadingBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-2xl bg-primary-100/70 ${className}`}
    />
  );
}

function StudentPageLoadingHeader({ label }: { label: string }) {
  return (
    <header className="sticky top-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[calc(1420px-2rem)] overflow-hidden border-primary-100/80 bg-[rgba(247,250,248,0.58)] shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] backdrop-blur-3xl backdrop-saturate-150 md:w-[calc(100%-4rem)] md:max-w-[calc(1420px-4rem)] lg:top-6 lg:w-[calc(100%-5rem)] lg:max-w-[calc(1420px-5rem)] lg:rounded-3xl lg:border">
      <div className="relative z-10 flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
        <SidebarTrigger className="shrink-0 lg:hidden" />
        <div className="hidden min-w-0 flex-1 md:block">
          <span className="text-sm font-medium text-secondary-500">{label}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LoadingBlock className="size-10 rounded-full" />
          <LoadingBlock className="size-10 rounded-full" />
        </div>
      </div>
    </header>
  );
}

export { StudentPageLoadingHeader };
