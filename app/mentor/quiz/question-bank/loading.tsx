import { LoaderCircle } from "@/lib/icons";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MentorSidebar } from "@/modules/mentor/components/mentor-sidebar";

function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-primary-100 ${className}`} />;
}

export default function QuestionBankLoading() {
  return (
    <SidebarProvider>
      <div aria-busy="true" aria-label="Memuat Bank Soal" className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <MentorSidebar activeLabel="Bank Soal" />

        <SidebarInset className="min-w-0 bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />
              <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
                <span className="text-sm font-medium text-secondary-500">Bank Soal</span>
              </div>
              <LoadingBlock className="ml-auto size-10 rounded-full" />
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
            <section aria-hidden="true" className="flex items-start justify-between gap-5">
              <LoadingBlock className="h-10 w-40" />
              <div className="flex items-center gap-2">
                <LoadingBlock className="size-9 rounded-lg" />
                <LoadingBlock className="size-9 rounded-lg" />
                <LoadingBlock className="size-9 rounded-lg" />
              </div>
            </section>

            <section aria-busy="true" className="overflow-hidden rounded-2xl bg-white">
              <div aria-hidden="true" className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
                <div className="h-10 min-w-[min(100%,18rem)] flex-1 border-b border-primary-100/90 py-2.5">
                  <LoadingBlock className="h-4 w-52 max-w-full" />
                </div>
                <div className="flex items-center gap-2">
                  <LoadingBlock className="size-9 rounded-lg" />
                  <LoadingBlock className="size-9 rounded-lg" />
                </div>
              </div>

              <Table className="min-w-[760px] table-fixed border-separate border-spacing-y-0">
                <caption className="sr-only">Daftar folder dan bank soal</caption>
                <TableHeader>
                  <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
                    <TableHead className="h-11 min-w-[14rem] rounded-l-xl px-4 py-2.5 text-xs font-medium text-secondary-500 sm:px-5">Nama</TableHead>
                    <TableHead className="h-11 min-w-[12rem] px-4 py-2.5 text-xs font-medium text-secondary-500 sm:px-5">Kategori</TableHead>
                    <TableHead className="h-11 min-w-[7rem] px-4 py-2.5 text-xs font-medium text-secondary-500 sm:px-5">Status</TableHead>
                    <TableHead className="h-11 min-w-[5rem] rounded-r-xl px-4 py-2.5 text-right text-xs font-medium text-secondary-500 sm:px-5">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="px-5 py-10 text-center" colSpan={4}>
                      <div aria-live="polite" className="flex items-center justify-center gap-2 text-sm text-secondary-500" role="status">
                        <LoaderCircle aria-hidden="true" className="motion-safe:animate-spin" size={17} />
                        Memuat bank soal…
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
