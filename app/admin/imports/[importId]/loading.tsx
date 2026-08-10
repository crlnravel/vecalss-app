function LoadingBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-[#dceee1] ${className}`} />;
}

function LoadingRow() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[40px_52px_minmax(140px,1fr)_110px_120px_minmax(180px,1.2fr)] items-start gap-3 border-b border-[#edf3ee] px-4 py-4 last:border-b-0">
      <LoadingBlock className="h-5 w-5" />
      <LoadingBlock className="h-4 w-8" />
      <div className="space-y-2"><LoadingBlock className="h-4 w-32" /><LoadingBlock className="h-3 w-44" /></div>
      <LoadingBlock className="h-4 w-20" />
      <LoadingBlock className="h-6 w-20 rounded-full" />
      <div className="space-y-2"><LoadingBlock className="h-3 w-36" /><LoadingBlock className="h-3 w-48" /></div>
    </div>
  );
}

export default function AdminImportDetailLoading() {
  return (
    <main aria-busy="true" aria-label="Loading import preview rows" className="min-h-screen bg-[#f7faf8] px-4 py-5 text-[#173c2d] sm:px-6 md:px-8">
      <div className="mx-auto max-w-[1100px] space-y-6">
        <div className="flex items-center justify-between"><LoadingBlock className="h-11 w-36" /><LoadingBlock className="h-11 w-32" /></div>
        <section aria-hidden="true" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><LoadingBlock className="size-9" /><div className="space-y-2"><LoadingBlock className="h-6 w-44" /><LoadingBlock className="h-4 w-72" /></div></div><LoadingBlock className="h-4 w-28" /></div></section>
        <section aria-hidden="true" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 sm:p-6"><div className="flex items-end justify-between gap-4"><div className="space-y-2"><LoadingBlock className="h-7 w-64" /><LoadingBlock className="h-4 w-48" /></div><LoadingBlock className="h-4 w-28" /></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /><LoadingBlock className="h-16 w-full" /></div></section>
        <section aria-hidden="true" className="overflow-hidden rounded-[22px] border border-[#d6e5db] bg-white"><div className="flex items-end justify-between border-b border-[#e7f0ea] px-5 py-5 sm:px-6"><div className="space-y-2"><LoadingBlock className="h-6 w-40" /><LoadingBlock className="h-4 w-80" /></div><LoadingBlock className="h-11 w-36" /></div><div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[40px_52px_minmax(140px,1fr)_110px_120px_minmax(180px,1.2fr)] gap-3 border-b border-[#e7f0ea] px-4 py-3"><LoadingBlock className="h-3 w-4" /><LoadingBlock className="h-3 w-8" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-20" /><LoadingBlock className="h-3 w-16" /><LoadingBlock className="h-3 w-24" /></div><LoadingRow /><LoadingRow /><LoadingRow /><LoadingRow /></div></div></section>
        <section aria-hidden="true" className="rounded-[22px] border border-[#d6e5db] bg-white p-5 sm:p-6"><div className="space-y-2"><LoadingBlock className="h-6 w-56" /><LoadingBlock className="h-4 w-96" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2"><LoadingBlock className="h-20 w-full" /><LoadingBlock className="h-20 w-full" /></div><div className="mt-5 flex justify-between gap-3"><LoadingBlock className="h-11 w-32" /><LoadingBlock className="h-12 w-48" /></div></section>
      </div>
    </main>
  );
}
