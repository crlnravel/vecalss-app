import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { EXPORT_LINK_MINUTES, listExportsForOrder } from "@/lib/disputes/export";
import { getOrderSummary } from "@/lib/disputes/queries";
import { getAccessState } from "@/lib/billing/service";
import { describeAuthority } from "@/lib/fraud/authority";
import { getPaymentProvider } from "@/lib/payments/provider";
import { maskIp } from "@/lib/retention/mask";
import { getBuyerIp, getOrderRetention } from "@/lib/retention/status";
import { prisma } from "@/lib/prisma";
import { listCapturedPayments } from "@/lib/refunds/balance";
import { listDisputeRecords, listRefundRecords } from "@/lib/refunds/records";
import { formatRupiah } from "@/lib/pricing/schedule";
import { createDisputeExportAction } from "@/modules/admin/fraud-actions";
import { RefundAndDisputePanels } from "@/modules/admin/fraud/refund-panels";
import { PurgedPanel, RetentionPanel } from "@/modules/admin/fraud/retention-panel";
import { Field, firstParam, formatDateTime, FraudPage, ownerNote, Panel, ReasonForm } from "@/modules/admin/fraud/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pesanan | Admin PTN Pro" };

const STATUS_LABELS: Record<string, string> = {
  expired: "Kedaluwarsa",
  failed: "Gagal",
  paid: "Dibayar",
  pending: "Menunggu pembayaran",
  review: "Ditinjau",
};

const PENDING_REASON_LABELS: Record<string, string> = {
  full_end_not_configured: "Tanggal akhir Full Access belum diatur.",
  full_end_passed: "Tanggal akhir Full Access sudah lewat.",
  grant_error: "Terjadi kesalahan saat memberi akses.",
  paused: "Akses pembeli sedang dijeda.",
  plan_unknown: "Paket pesanan tidak dikenali.",
  student_not_found: "Akun pembeli tidak ditemukan.",
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export default async function AdminFraudOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const { orderId } = await params;
  const query = await searchParams;
  const order = await getOrderSummary(orderId);
  if (!order) {
    // An order removed under the retention policy leaves a tombstone, and the page says so.
    const removed = await getOrderRetention(orderId);
    if (removed?.kind !== "purged") notFound();
    return (
      <FraudPage active="orders" done={firstParam(query.done)} error={firstParam(query.error)} session={session} title="Pesanan">
        <p className="mb-4"><Link className="text-sm font-medium text-primary-800 underline-offset-4 hover:underline" href="/admin/fraud/orders">← Kembali ke daftar pesanan</Link></p>
        <PurgedPanel purgedAt={removed.purgedAt} reference={removed.reference} />
      </FraudPage>
    );
  }

  const authority = describeAuthority(session);
  const retention = await getOrderRetention(order.id);
  const rawBuyerIp = await getBuyerIp(order.id);
  // The owner sees the address; other admins see it masked.
  const buyerIp = authority.isOwner ? rawBuyerIp : maskIp(rawBuyerIp);
  const exports = await listExportsForOrder(order.id);
  const [refunds, disputes, payments, buyerAccess, orderRow] = await Promise.all([
    listRefundRecords(prisma, order.id),
    listDisputeRecords(prisma, order.id),
    listCapturedPayments(prisma, order.id),
    getAccessState(order.buyerId),
    prisma.paymentOrder.findUnique({ select: { statusReason: true }, where: { id: order.id } }),
  ]);
  const standInEnabled = getPaymentProvider()?.id === "stand-in";
  const link = firstParam(query.link);
  const downloadHref = link && TOKEN_PATTERN.test(link) ? `/api/admin/dispute-exports/${link}` : null;

  return (
    <FraudPage active="orders" done={firstParam(query.done)} error={firstParam(query.error)} session={session} title="Pesanan">
      <p className="mb-4"><Link className="text-sm font-medium text-primary-800 underline-offset-4 hover:underline" href="/admin/fraud/orders">← Kembali ke daftar pesanan</Link></p>

      <Panel title="Ringkasan">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pembeli">{order.buyerEmail}</Field>
          <Field label="Paket">{order.packageName}</Field>
          <Field label="Jumlah">{formatRupiah(order.amountRupiah)}</Field>
          <Field label="Status pesanan">{STATUS_LABELS[order.status] ?? order.status}</Field>
          <Field label="Dibuat">{formatDateTime(order.createdAt)}</Field>
          <Field label="Nomor struk">{order.receiptNumber ?? "—"}</Field>
        </dl>
      </Panel>

      {order.status === "paid" ? (
        <Panel title="Pengiriman akses">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status">{order.deliveryStatus === "delivered" ? "Akses sudah diberikan" : "Akses belum diberikan"}</Field>
            {order.deliveryStatus === "delivered" ? (
              <>
                <Field label="Diberikan pada">{formatDateTime(order.grantedAt)}</Field>
                <Field label="Berlaku sampai">{formatDateTime(order.validUntil)}</Field>
                <Field label="Hari pemakaian tercatat">{order.usageDays}</Field>
              </>
            ) : (
              <Field label="Penyebab">{order.pendingReason ? (PENDING_REASON_LABELS[order.pendingReason] ?? order.pendingReason) : "Menunggu percobaan berikutnya."}</Field>
            )}
          </dl>
        </Panel>
      ) : null}

      <RefundAndDisputePanels
        access={buyerAccess}
        authority={authority}
        disputes={disputes}
        orderId={order.id}
        orderStatus={order.status}
        payments={payments}
        refunds={refunds}
        reviewReason={orderRow?.statusReason ?? null}
        standInEnabled={standInEnabled}
      />

      {retention?.kind === "present" ? (
        <RetentionPanel authority={authority} buyerId={order.buyerId} buyerIp={buyerIp} orderId={order.id} retention={retention} />
      ) : null}

      <Panel title="Ekspor bukti sengketa">
        <p className="mb-3 text-sm leading-6 text-secondary-700">
          Paket berisi bukti pesanan ini saja: lini waktu pembayaran, pemberian akses, struk, pemakaian, jejak alamat IP dan perangkat, syarat yang disetujui, serta catatan komunikasi. Data siswa lain tidak disertakan. Setiap ekspor dicatat.
        </p>
        {downloadHref ? (
          <p className="mb-4 rounded-control border border-primary-100 bg-primary-50 p-3 text-sm leading-6 text-secondary-900" role="status">
            Paket siap diunduh. Tautan ini hanya berlaku sekali dan habis dalam {EXPORT_LINK_MINUTES} menit.{" "}
            <a className="font-semibold text-primary-800 underline underline-offset-4" download href={downloadHref}>Unduh paket bukti</a>
          </p>
        ) : null}
        <ReasonForm
          action={createDisputeExportAction}
          disabled={!authority.isOwner}
          disabledNote={ownerNote(authority)}
          hidden={{ orderId: order.id }}
          label="Alasan ekspor"
          submit="Buat paket bukti"
        />
      </Panel>

      <Panel title="Riwayat ekspor">
        {exports.length === 0 ? <p className="text-sm text-secondary-600">Belum ada ekspor untuk pesanan ini.</p> : (
          <ol className="space-y-3">
            {exports.map((item) => (
              <li className="text-sm leading-5" key={item.id}>
                <span className="font-medium text-secondary-900">{formatDateTime(item.createdAt)}</span>
                <span className="text-secondary-600"> · {item.requestedByEmail} · {item.downloadedAt ? `diunduh ${formatDateTime(item.downloadedAt)}` : "belum diunduh"}</span>
                <p className="mt-0.5 break-words text-secondary-700">{item.reason}</p>
                <p className="mt-0.5 break-all font-mono text-xs text-secondary-600">SHA-256 {item.digestSha256}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </FraudPage>
  );
}
