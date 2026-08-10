"use client";

function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7faf8] px-4 py-10 text-[#173c2d]">
      <section aria-labelledby="admin-error-title" className="w-full max-w-lg rounded-[24px] border border-[#d6e5db] bg-white p-6 text-center shadow-[0_24px_64px_-46px_rgba(1,76,56,0.6)] sm:p-8" role="alert">
        <h1 className="text-2xl font-bold tracking-[-0.03em]" id="admin-error-title">The live snapshot is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-[#5f776a]">We could not read the current admin state. Retry the snapshot; no account action was performed.</p>
        <button className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#014c38] px-5 text-sm font-bold text-white hover:bg-[#176b4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={() => reset()} type="button">Try again</button>
      </section>
    </main>
  );
}

export default AdminError;
