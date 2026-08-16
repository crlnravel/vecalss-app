import { Skeleton } from "@/components/ui/skeleton";

export default function TryoutDetailLoading() {
  return (
    <main className="min-h-svh bg-[#f7faf8] px-4 py-8 md:px-8">
      <div className="mx-auto grid w-full max-w-[42rem] gap-4 sm:gap-5">
        <Skeleton className="size-11 rounded-xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-[31rem] rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-xl sm:w-44" />
      </div>
    </main>
  );
}
