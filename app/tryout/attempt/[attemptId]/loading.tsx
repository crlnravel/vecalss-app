import { Skeleton } from "@/components/ui/skeleton";

export default function TryoutAttemptLoading() {
  return (
    <main aria-busy="true" aria-label="Memulihkan percobaan Tryout" className="min-h-svh bg-voyage-canvas px-4 py-6 sm:px-6 lg:px-8" role="status">
      <div className="mx-auto grid max-w-6xl gap-5">
        <Skeleton className="h-16 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <Skeleton className="h-[34rem] rounded-[1.75rem]" />
          <Skeleton className="hidden h-80 rounded-[1.5rem] lg:block" />
        </div>
      </div>
    </main>
  );
}
