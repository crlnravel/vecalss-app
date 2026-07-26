import { Skeleton } from "@/components/ui/skeleton";

export default function TryoutOperationsLoading() {
  return (
    <main className="grid w-full gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-3xl" />
      <Skeleton className="h-48 w-full rounded-3xl" />
    </main>
  );
}
