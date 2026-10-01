import { SidebarTrigger } from "@/components/ui/sidebar";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

function AdminLoadingHeader() {
  return (
    <header className="sticky top-0 z-20 bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:rounded-control lg:border">
      <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
        <SidebarTrigger className="shrink-0 lg:hidden" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <LoadingBlock className="h-4 w-24" />
        </div>
        <LoadingBlock className="size-10 rounded-full" />
      </div>
    </header>
  );
}

export { AdminLoadingHeader, LoadingBlock };
