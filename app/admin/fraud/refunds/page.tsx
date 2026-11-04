import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminSession } from "@/lib/auth/access";
import { formatRupiah } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";
import { REFUND_REASONS, REFUND_STATE_LABELS, type RefundState } from "@/lib/refunds/constants";
import { listRecentRefunds } from "@/lib/refunds/records";
import { firstParam, formatDateTime, FraudPage } from "@/modules/admin/fraud/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pengembalian dana | Admin PTN Pro" };

const TONES: Record<RefundState, "attention" | "danger" | "info" | "neutral" | "success"> = {
  approved: "info",
  cancelled: "neutral",
  completed: "success",
  failed: "danger",
  prepared: "attention",
  processing: "info",
  rejected: "neutral",
};

export default async function AdminFraudRefundsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const refunds = await listRecentRefunds(prisma);

  return (
    <FraudPage active="refunds" done={firstParam(params.done)} error={firstParam(params.error)} session={session} title="Pengembalian dana">
      <p className="mb-4 text-sm leading-6 text-secondary-700">
        Permintaan yang belum selesai ada di atas. Buka pesanannya untuk menyiapkan, menyetujui, atau mengirim pengembalian dana.
      </p>
      <div className="overflow-x-auto rounded-card border border-primary-100 bg-white">
        <Table className="min-w-[720px]">
          <caption className="sr-only">Permintaan pengembalian dana terbaru</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Disiapkan</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tenggat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {refunds.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-10 text-center text-sm text-secondary-600" colSpan={6}>Belum ada permintaan pengembalian dana.</TableCell>
              </TableRow>
            ) : refunds.map((refund) => {
              const state = refund.state as RefundState;
              const open = state === "prepared" || state === "approved" || state === "processing";
              const due = state === "prepared" ? refund.decisionDueAt : refund.payoutDueAt;
              const late = refund.overdue;
              return (
                <TableRow key={refund.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link className="font-medium text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/orders/${refund.orderId}`}>
                      {formatDateTime(refund.preparedAt)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[14rem] truncate" title={refund.buyerEmail}>{refund.buyerEmail}</TableCell>
                  <TableCell>{REFUND_REASONS[refund.reasonCode as keyof typeof REFUND_REASONS]?.label ?? refund.reasonCode}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(refund.amountRupiah)}</TableCell>
                  <TableCell><Badge size="xs" tone={TONES[state]}>{REFUND_STATE_LABELS[state]}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {open && due ? <>{formatDateTime(due)}{late ? <Badge className="ml-2" size="xs" tone="danger">Terlambat</Badge> : null}</> : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </FraudPage>
  );
}
