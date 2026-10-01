import type { Metadata } from "next";

import { ReferencePageHeader } from "@/components/dashboard/reference-dashboard-primitives";
import { requireAdminSession } from "@/lib/auth/access";
import { TransactionGridDemo } from "@/modules/admin/table-demo/transaction-grid-demo";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const metadata: Metadata = { title: "Demo tabel | Vecalss LMS" };

export default async function TableDemoPage() {
  const session = await requireAdminSession();
  return (
    <PortalShell activeAdminSection="table-demo" audience="admin" description="Contoh tabel transaksi dengan data simulasi." session={session} title="Demo tabel">
      <ReferencePageHeader title="Demo tabel" />
      <p className="-mt-3 text-sm text-secondary-600">Seluruh transaksi di halaman ini adalah data simulasi.</p>
      <TransactionGridDemo />
    </PortalShell>
  );
}
