"use client";

import { Button } from "@/components/ui/button";
import { ADMIN_CARD_CLASS_NAME } from "@/modules/admin/admin-ui-contract";

function AdminError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-secondary-50 px-4 py-10 text-secondary-900">
      <section aria-labelledby="admin-error-title" className={`${ADMIN_CARD_CLASS_NAME} w-full max-w-lg p-6 text-center sm:p-8`} role="alert">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]" id="admin-error-title">Snapshot live tidak tersedia</h1>
        <p className="mt-3 text-sm leading-6 text-secondary-600">Status admin saat ini tidak dapat dibaca. Coba muat ulang snapshot; tidak ada tindakan akun yang dilakukan.</p>
        <Button className="mt-6" onClick={() => reset()} type="button" variant="brand">Coba lagi</Button>
      </section>
    </main>
  );
}

export default AdminError;
