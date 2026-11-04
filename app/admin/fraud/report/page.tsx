import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminSession } from "@/lib/auth/access";
import { BLOCK_TYPE_LABELS, FRAUD_SIGNALS, isFraudSignal } from "@/lib/fraud/constants";
import { buildMonthlyReport, currentReportMonth, isReportMonth } from "@/lib/fraud/report";
import { formatRupiah } from "@/lib/pricing/schedule";
import { Field, firstParam, FraudPage, Panel, SEVERITY_LABELS } from "@/modules/admin/fraud/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Laporan fraud | Admin PTN Pro" };

const REFUSAL_LABELS: Record<string, string> = {
  amount_mismatch: "Nominal tidak sesuai",
  blocked: "Pengenal diblokir",
  blocks_unavailable: "Pemeriksaan blokir tidak tersedia",
  daily_limit: "Batas harian",
  hourly_attempts: "Terlalu sering per jam",
  ip_attempts: "Terlalu sering dari satu IP",
  missing_ip: "IP tidak tercatat",
  no_policy: "Tanpa aturan batas",
  open_payment: "Masih ada pembayaran terbuka",
};

export default async function AdminFraudReportPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const requested = firstParam(params.month);
  const month = requested && isReportMonth(requested) ? requested : await currentReportMonth();
  const report = await buildMonthlyReport(month);

  return (
    <FraudPage active="report" session={session} title={`Laporan bulan ${month}`}>
      <form className="mb-6 flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="font-heading text-xs font-semibold tracking-[0.04em] text-secondary-600" htmlFor="report-month">Bulan</label>
          <input className="block min-h-[44px] rounded-control border border-primary-100/80 bg-secondary-50 px-3 text-sm" defaultValue={month} id="report-month" name="month" type="month" />
        </div>
        <button className="min-h-[44px] rounded-control border border-primary-700 px-4 text-sm font-medium text-primary-900 hover:bg-primary-50" type="submit">Tampilkan</button>
      </form>
      <p className="mb-6 text-sm leading-6 text-secondary-600">Laporan ini hanya berisi jumlah dan total. Tidak ada alamat IP, email, nomor telepon, kode perangkat, atau nama pembeli. Bulan dihitung menurut waktu Jakarta.</p>

      <Panel title="Pembayaran">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pembayaran dimulai">{report.orders.started.count} ({formatRupiah(report.orders.started.rupiah)})</Field>
          <Field label="Diterima">{report.orders.accepted.count} ({formatRupiah(report.orders.accepted.rupiah)})</Field>
          <Field label="Perlu ditinjau">{report.orders.inReview.count} ({formatRupiah(report.orders.inReview.rupiah)})</Field>
          <Field label="Gagal / kedaluwarsa">{report.orders.failed} / {report.orders.expired}</Field>
        </dl>
        <h3 className="mb-1 mt-4 text-sm font-semibold text-secondary-900">Checkout yang ditolak</h3>
        {report.refusedCheckouts.length === 0 ? <p className="text-sm text-secondary-600">Tidak ada.</p> : (
          <ul className="text-sm leading-6 text-secondary-800">
            {report.refusedCheckouts.map((row) => <li key={row.reason}>{REFUSAL_LABELS[row.reason] ?? row.reason}: {row.count}</li>)}
          </ul>
        )}
      </Panel>

      <Panel title="Kasus">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Belum selesai sekarang">{report.cases.unresolvedNow}</Field>
          <Field label="Ditutup bulan ini">{report.cases.closed}</Field>
          <Field label="Rata-rata waktu sampai dilihat">{report.cases.averageHoursToAcknowledge === null ? "—" : `${report.cases.averageHoursToAcknowledge} jam`}</Field>
          <Field label="Rata-rata waktu sampai ditutup">{report.cases.averageHoursToClose === null ? "—" : `${report.cases.averageHoursToClose} jam`}</Field>
        </dl>
        <h3 className="mb-1 mt-4 text-sm font-semibold text-secondary-900">Dibuka menurut sinyal</h3>
        {report.cases.openedBySignal.length === 0 ? <p className="text-sm text-secondary-600">Tidak ada kasus baru.</p> : (
          <ul className="text-sm leading-6 text-secondary-800">
            {report.cases.openedBySignal.map((row) => <li key={row.signal}>{isFraudSignal(row.signal) ? FRAUD_SIGNALS[row.signal].label : row.signal}: {row.count}</li>)}
          </ul>
        )}
        <h3 className="mb-1 mt-4 text-sm font-semibold text-secondary-900">Dibuka menurut tingkat</h3>
        <p className="text-sm leading-6 text-secondary-800">
          {(["critical", "high", "medium", "low"] as const).map((level) => `${SEVERITY_LABELS[level]} ${report.cases.openedBySeverity[level] ?? 0}`).join(" · ")}
        </p>
      </Panel>

      <Panel title="Blokir">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dicabut bulan ini">{report.blocks.lifted}</Field>
          <Field label="Berakhir sendiri bulan ini">{report.blocks.expired}</Field>
        </dl>
        <h3 className="mb-1 mt-4 text-sm font-semibold text-secondary-900">Dibuat bulan ini</h3>
        {report.blocks.createdByTypeAndSource.length === 0 ? <p className="text-sm text-secondary-600">Tidak ada.</p> : (
          <ul className="text-sm leading-6 text-secondary-800">
            {report.blocks.createdByTypeAndSource.map((row) => (
              <li key={`${row.type}-${row.source}`}>{BLOCK_TYPE_LABELS[row.type as keyof typeof BLOCK_TYPE_LABELS] ?? row.type} ({row.source === "automatic" ? "otomatis" : "manual"}): {row.count}</li>
            ))}
          </ul>
        )}
        <h3 className="mb-1 mt-4 text-sm font-semibold text-secondary-900">Sedang berlaku sekarang</h3>
        <p className="text-sm leading-6 text-secondary-800">
          {Object.keys(report.blocks.activeNow).length === 0 ? "Tidak ada." : Object.entries(report.blocks.activeNow).map(([type, count]) => `${BLOCK_TYPE_LABELS[type as keyof typeof BLOCK_TYPE_LABELS] ?? type} ${count}`).join(" · ")}
        </p>
      </Panel>

      <Panel title="Banding">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Diterima bulan ini">{report.appeals.received}</Field>
          <Field label="Dikabulkan / ditolak">{report.appeals.granted} / {report.appeals.denied}</Field>
          <Field label="Menunggu keputusan">{report.appeals.pending}</Field>
          <Field label="Lewat batas 3 hari kerja">{report.appeals.overdue}</Field>
        </dl>
      </Panel>
      <p className="text-xs text-secondary-600"><Link className="underline-offset-4 hover:underline" href="/admin/fraud">Kembali ke antrean kasus</Link></p>
    </FraudPage>
  );
}
