import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminSession } from "@/lib/auth/access";
import { listRecentOrders } from "@/lib/disputes/queries";
import { formatRupiah } from "@/lib/pricing/schedule";
import { firstParam, formatDateTime, FraudPage } from "@/modules/admin/fraud/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesanan | Admin PTN Pro" };

const STATUS_LABELS: Record<string, string> = {
  expired: "Kedaluwarsa",
  failed: "Gagal",
  paid: "Dibayar",
  pending: "Menunggu",
  review: "Ditinjau",
};

export default async function AdminFraudOrdersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const orders = await listRecentOrders();

  return (
    <FraudPage active="orders" done={firstParam(params.done)} error={firstParam(params.error)} session={session} title="Pesanan">
      <p className="mb-4 text-sm leading-6 text-secondary-700">
        Pilih pesanan untuk melihat status pengiriman aksesnya atau membuat paket bukti sengketa.
      </p>
      <div className="overflow-x-auto rounded-card border border-primary-100 bg-white">
        <Table className="min-w-[680px]">
          <caption className="sr-only">Pesanan terbaru</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Dibuat</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Akses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-10 text-center text-sm text-secondary-600" colSpan={6}>Belum ada pesanan.</TableCell>
              </TableRow>
            ) : orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <Link className="font-medium text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/orders/${order.id}`}>
                    {formatDateTime(order.createdAt)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[14rem] truncate" title={order.buyerEmail}>{order.buyerEmail}</TableCell>
                <TableCell className="max-w-[14rem] truncate" title={order.packageName}>{order.packageName}</TableCell>
                <TableCell className="text-right tabular-nums">{formatRupiah(order.amountRupiah)}</TableCell>
                <TableCell>{STATUS_LABELS[order.status] ?? order.status}</TableCell>
                <TableCell>
                  {order.status !== "paid" ? "—" : order.deliveryStatus === "delivered"
                    ? <Badge size="xs" tone="success">Aktif</Badge>
                    : <Badge size="xs" tone="danger">Belum diberikan</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </FraudPage>
  );
}
