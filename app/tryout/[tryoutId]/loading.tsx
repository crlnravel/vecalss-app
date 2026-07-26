import { Skeleton } from "@/components/ui/skeleton";

export default function TryoutDetailLoading() {
  return (
    <main className="min-h-svh bg-[#f7faf8] px-4 py-8 md:px-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <Skeleton className="h-11 w-40 rounded-xl" />
        <Skeleton className="h-[28rem] rounded-[2rem]" />
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-96 rounded-[1.75rem]" />
          <Skeleton className="h-80 rounded-[1.75rem]" />
        </div>
      </div>
    </main>
  );
}
