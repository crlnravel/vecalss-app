"use client";

import { ADMIN_CARD_CLASS_NAME } from "@/modules/admin/admin-ui-contract";

function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-secondary-50 px-4 py-10 text-secondary-900">
      <section aria-labelledby="admin-error-title" className={`${ADMIN_CARD_CLASS_NAME} w-full max-w-lg p-6 text-center sm:p-8`} role="alert">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]" id="admin-error-title">The live snapshot is unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-secondary-600">We could not read the current admin state. Retry the snapshot; no account action was performed.</p>
        <button className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300" onClick={() => reset()} type="button">Try again</button>
      </section>
    </main>
  );
}

export default AdminError;
