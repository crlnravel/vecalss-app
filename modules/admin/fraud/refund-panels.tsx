import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AccessState } from "@/lib/billing/service";
import { formatRupiah } from "@/lib/pricing/schedule";
import type { CapturedPayment } from "@/lib/refunds/balance";
import {
  DESTINATION_HOLDERS,
  REFUND_REASONS,
  REFUND_STATE_LABELS,
  REQUEST_CHANNELS,
  type RefundState,
} from "@/lib/refunds/constants";
import { RULE_TEXT, type Eligibility } from "@/lib/refunds/eligibility";
import type { DisputeRecord, RefundRecord } from "@/lib/refunds/records";
import {
  acceptReviewAction,
  approveRefundAction,
  cancelRefundAction,
  executeRefundAction,
  manualTransferAction,
  prepareRefundAction,
  reconcileRefundAction,
  recordDisputeAction,
  rejectRefundAction,
  resolveDisputeAction,
} from "@/modules/admin/refund-actions";

import { Field, formatDateTime, ownerNote, Panel, ReasonForm } from "./shared";

type Authority = { isOwner: boolean; ownerConfigured: boolean };

const STATE_TONES: Record<RefundState, "attention" | "danger" | "info" | "neutral" | "success"> = {
  approved: "info",
  cancelled: "neutral",
  completed: "success",
  failed: "danger",
  prepared: "attention",
  processing: "info",
  rejected: "neutral",
};

const ACCESS_LABELS: Record<AccessState["status"], string> = {
  active: "Aktif",
  expired: "Sudah berakhir",
  none: "Belum ada",
  paused: "Dijeda",
  revoked: "Diakhiri",
};

const ACCESS_EFFECT_LABELS: Record<string, string> = {
  already_ended: "Akses sudah berakhir sebelumnya",
  kept: "Akses dipertahankan",
  none_paid_order: "Tidak mengubah akses (pesanan ini tidak memberi akses)",
  revoke_failed: "Akses gagal diakhiri, periksa manual",
  revoked: "Akses diakhiri",
};

const CONFIRMATION_LABELS: Record<string, string> = {
  owner_manual: "Pemilik mengonfirmasi transfer manual",
  provider_event: "Konfirmasi bertanda tangan dari penyedia",
  provider_status: "Status dari penyedia",
};

const METHOD_LABELS: Record<string, string> = { manual_transfer: "Transfer manual", provider: "Lewat penyedia pembayaran" };

const DISPUTE_STATE_LABELS = { lost: "Kalah", open: "Terbuka", won: "Menang" } as const;
const DISPUTE_STATE_TONES = { lost: "danger", open: "attention", won: "success" } as const;

function Select({ children, id, name, required = true }: { children: ReactNode; id: string; name: string; required?: boolean }) {
  return <select className={fieldControlClassName} id={id} name={name} required={required}>{children}</select>;
}

function OwnerButton({ authority, children, hidden, action, variant = "default" }: {
  action: (form: FormData) => Promise<void>;
  authority: Authority;
  children: ReactNode;
  hidden: Record<string, string | number>;
  variant?: "default" | "outline";
}) {
  return (
    <form action={action} className="min-w-0">
      {Object.entries(hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      <Button disabled={!authority.isOwner} type="submit" variant={variant}>{children}</Button>
    </form>
  );
}

/** A collapsed owner form, so a long page stays readable. */
function Fold({ children, title }: { children: ReactNode; title: string }) {
  return (
    <details className="group min-w-0 rounded-control border border-primary-100">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/30">{title}</summary>
      <div className="border-t border-primary-100 p-3">{children}</div>
    </details>
  );
}

function EligibilityBox({ check, title }: { check: Eligibility | null; title: string }) {
  if (!check) return null;
  return (
    <div className="min-w-0 rounded-control border border-primary-100 bg-secondary-50/60 p-3">
      <p className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-secondary-600">
        {title}
        <Badge size="xs" tone={check.eligible ? "success" : "danger"}>{check.eligible ? "Memenuhi syarat" : "Tidak memenuhi syarat"}</Badge>
      </p>
      <p className="text-sm leading-6 text-secondary-800">{RULE_TEXT[check.rule]}</p>
      {check.category === "change_of_mind" ? (
        <p className="mt-1 text-xs leading-5 text-secondary-600">
          Dibayar {formatDateTime(check.paidAt)} · batas 3 hari {formatDateTime(check.windowEndsAt)} · hari pemakaian fitur berbayar tercatat: {check.usageRows}
        </p>
      ) : null}
    </div>
  );
}

function RefundCard({ authority, record, standInEnabled, orderId }: { authority: Authority; orderId: string; record: RefundRecord; standInEnabled: boolean }) {
  const state = record.state as RefundState;
  const reason = REFUND_REASONS[record.reasonCode as keyof typeof REFUND_REASONS];
  const prepared = record.eligibilityPrepared as unknown as Eligibility;
  const approved = record.eligibilityApproved as unknown as Eligibility | null;
  const hidden = { caseId: record.id, orderId, version: record.version };
  const open = state === "prepared" || state === "approved" || state === "processing";

  return (
    <article aria-label={`Pengembalian dana ${record.reference}`} className="min-w-0 space-y-3 rounded-card border border-primary-100 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-semibold text-secondary-900">{formatRupiah(record.amountRupiah)}</h3>
        <Badge size="xs" tone={STATE_TONES[state]}>{REFUND_STATE_LABELS[state]}</Badge>
        {record.selfApproved ? <Badge size="xs" tone="attention">Disetujui oleh penyiapnya sendiri</Badge> : null}
        {record.outcomeUnknown ? <Badge size="xs" tone="danger">Hasil belum diketahui</Badge> : null}
        <span className="break-all font-mono text-xs text-secondary-600">{record.reference}</span>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Alasan">{reason?.label ?? record.reasonCode}</Field>
        {record.reasonCategory === "authority_order" ? (
          <>
            <Field label="Otoritas yang memerintahkan">{record.authorityName}</Field>
            <Field label="Nomor surat atau perintah">{record.authorityReference}</Field>
            <Field label="Perintah diterima">{REQUEST_CHANNELS[record.requestChannel as keyof typeof REQUEST_CHANNELS] ?? record.requestChannel} · {formatDateTime(record.authorityReceivedAt)}</Field>
            <Field label="Batas waktu dari otoritas">{record.authorityDeadlineAt ? formatDateTime(record.authorityDeadlineAt) : "Tidak ada batas waktu yang disebut"}</Field>
            <Field label="Ringkasan perintah">{record.requestNote}</Field>
          </>
        ) : (
          <>
            <Field label="Permintaan pembeli">{REQUEST_CHANNELS[record.requestChannel as keyof typeof REQUEST_CHANNELS] ?? record.requestChannel} · {formatDateTime(record.requestedAt)}</Field>
            <Field label="Catatan permintaan">{record.requestNote}</Field>
          </>
        )}
        <Field label="Keputusan paling lambat">{formatDateTime(record.decisionDueAt)}</Field>
        <Field label="Disiapkan oleh">{record.preparedByEmail} · {formatDateTime(record.preparedAt)}</Field>
        {record.approvedByEmail ? <Field label="Disetujui oleh">{record.approvedByEmail} · {formatDateTime(record.approvedAt)}</Field> : null}
        {record.approvalReason ? <Field label="Alasan persetujuan">{record.approvalReason}</Field> : null}
        {record.payoutDueAt ? <Field label="Uang kembali paling lambat">{formatDateTime(record.payoutDueAt)}</Field> : null}
        {record.method ? <Field label="Cara">{METHOD_LABELS[record.method] ?? record.method}</Field> : null}
        {record.revokeAccess ? <Field label="Akses">Pemilik memilih mengakhiri akses saat selesai</Field> : null}
        {record.destinationMasked ? <Field label="Tujuan transfer">{record.destinationMasked} · {DESTINATION_HOLDERS[record.destinationHolder as keyof typeof DESTINATION_HOLDERS] ?? record.destinationHolder}</Field> : null}
        {record.transferReference ? <Field label="Referensi transfer">{record.transferReference}</Field> : null}
        {record.proofNote ? <Field label="Catatan bukti">{record.proofNote}</Field> : null}
        {record.completedAt ? <Field label="Selesai">{formatDateTime(record.completedAt)} · {CONFIRMATION_LABELS[record.confirmationSource ?? ""] ?? record.confirmationSource}</Field> : null}
        {record.accessEffect ? <Field label="Dampak ke akses">{ACCESS_EFFECT_LABELS[record.accessEffect] ?? record.accessEffect}</Field> : null}
        {record.closureReason ? <Field label="Alasan ditutup">{record.closureReason}</Field> : null}
      </dl>

      <EligibilityBox check={prepared} title="Pemeriksaan sistem saat disiapkan" />
      {approved && approved.asOf !== prepared.asOf ? <EligibilityBox check={approved} title="Pemeriksaan sistem saat disetujui" /> : null}

      {state === "prepared" ? (
        <div className="grid min-w-0 gap-3">
          <ReasonForm action={approveRefundAction} disabled={!authority.isOwner || !prepared.eligible} disabledNote={!authority.isOwner ? ownerNote(authority) : "Pengembalian karena berubah pikiran yang tidak memenuhi syarat tidak bisa disetujui."} hidden={hidden} label="Setujui pengembalian dana" submit="Setujui">
            <label className="flex min-h-11 items-center gap-2 text-sm text-secondary-800">
              <input className="size-4" name="revokeAccess" type="checkbox" />
              Akhiri akses pembeli saat selesai (untuk pengembalian sebagian)
            </label>
          </ReasonForm>
          <Fold title="Tolak permintaan">
            <ReasonForm action={rejectRefundAction} disabled={!authority.isOwner} disabledNote={ownerNote(authority)} hidden={hidden} label="Tolak permintaan" submit="Tolak" tone="outline" />
          </Fold>
        </div>
      ) : null}

      {state === "approved" ? (
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap gap-2">
            <OwnerButton action={executeRefundAction} authority={authority} hidden={hidden}>Kirim ke penyedia pembayaran</OwnerButton>
          </div>
          {!authority.isOwner ? <p className="text-xs leading-5 text-secondary-600">{ownerNote(authority)}</p> : null}
          <Fold title="Catat transfer manual">
            <ReasonForm action={manualTransferAction} disabled={!authority.isOwner} disabledNote={ownerNote(authority)} hidden={hidden} label="Transfer manual" submit="Konfirmasi transfer">
              <div>
                <label className={fieldLabelClassName} htmlFor={`dest-${record.id}`}>Tujuan (nomor disamarkan, 4 digit terakhir saja)</label>
                <Input autoComplete="off" id={`dest-${record.id}`} maxLength={80} name="destinationMasked" placeholder="BCA ••••1234 a.n. Budi" required />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor={`holder-${record.id}`}>Atas nama</label>
                <Select id={`holder-${record.id}`} name="destinationHolder">
                  {Object.entries(DESTINATION_HOLDERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor={`ref-${record.id}`}>Nomor referensi transfer</label>
                <Input autoComplete="off" id={`ref-${record.id}`} maxLength={120} name="transferReference" required />
              </div>
              <div>
                <label className={fieldLabelClassName} htmlFor={`proof-${record.id}`}>Catatan bukti (di mana buktinya disimpan)</label>
                <Textarea className={fieldControlClassName} id={`proof-${record.id}`} maxLength={1000} minLength={10} name="proofNote" required />
              </div>
            </ReasonForm>
          </Fold>
          <Fold title="Batalkan">
            <ReasonForm action={cancelRefundAction} disabled={!authority.isOwner} disabledNote={ownerNote(authority)} hidden={hidden} label="Batalkan pengembalian dana" submit="Batalkan" tone="outline" />
          </Fold>
        </div>
      ) : null}

      {state === "processing" ? (
        <div className="grid min-w-0 gap-3">
          <p className="text-sm leading-6 text-secondary-800">
            {record.outcomeUnknown
              ? "Penyedia belum menjawab permintaan terakhir, jadi hasilnya belum diketahui. Periksa statusnya dulu; jangan kirim ulang sebelum itu."
              : "Permintaan sudah di penyedia. Pengembalian dana selesai setelah penyedia mengonfirmasi."}
          </p>
          <div className="flex flex-wrap gap-2">
            <OwnerButton action={reconcileRefundAction} authority={authority} hidden={hidden} variant="outline">Periksa status di penyedia</OwnerButton>
            {!record.outcomeUnknown && !record.providerRefundId ? (
              <OwnerButton action={executeRefundAction} authority={authority} hidden={hidden}>Kirim ulang</OwnerButton>
            ) : null}
            {standInEnabled ? (
              <Link className="inline-flex min-h-11 items-center rounded-control border border-primary-100 px-3 text-sm font-medium text-primary-800 hover:bg-primary-50" href={`/pay/stand-in/refund/${record.reference}`}>
                Buka konsol penyedia uji
              </Link>
            ) : null}
          </div>
          {!authority.isOwner ? <p className="text-xs leading-5 text-secondary-600">{ownerNote(authority)}</p> : null}
        </div>
      ) : null}

      {!open ? null : <p className="text-xs leading-5 text-secondary-600">Dana yang disetujui atau sedang diproses dicadangkan dan tidak bisa dipakai pengembalian lain.</p>}
    </article>
  );
}

function PreparePanel({ orderId, payments, status }: { orderId: string; payments: CapturedPayment[]; status: string }) {
  const usable = payments.filter((payment) => payment.remainingRupiah > 0);
  if ((status !== "paid" && status !== "review") || usable.length === 0) {
    return <p className="text-sm text-secondary-600">Tidak ada dana yang masih bisa dikembalikan untuk pesanan ini.</p>;
  }

  return (
    <div className="min-w-0 space-y-3">
      <form action={prepareRefundAction} className="min-w-0 space-y-3 rounded-control border border-primary-100 p-3">
        <input name="orderId" type="hidden" value={orderId} />
        <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <legend className={`${fieldLabelClassName} mb-1`}>Siapkan pengembalian dana</legend>
          <div>
            <label className={fieldLabelClassName} htmlFor="refund-reason">Alasan</label>
            <Select id="refund-reason" name="reasonCode">
              <optgroup label="Kesalahan di pihak kami">
                {Object.entries(REFUND_REASONS).filter(([, item]) => item.category === "our_fault").map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </optgroup>
              <optgroup label="Pilihan pembeli">
                {Object.entries(REFUND_REASONS).filter(([, item]) => item.category === "change_of_mind").map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </optgroup>
            </Select>
          </div>
          <div>
            <label className={fieldLabelClassName} htmlFor="refund-amount">Jumlah (rupiah, kosongkan untuk semua sisa)</label>
            <Input autoComplete="off" id="refund-amount" inputMode="numeric" name="amount" placeholder={String(Math.max(...usable.map((payment) => payment.remainingRupiah)))} />
          </div>
          {usable.length > 1 ? (
            <div>
              <label className={fieldLabelClassName} htmlFor="refund-payment">Pembayaran</label>
              <Select id="refund-payment" name="providerPaymentId">
                {usable.map((payment) => <option key={payment.providerPaymentId} value={payment.providerPaymentId}>{payment.providerPaymentId} · sisa {formatRupiah(payment.remainingRupiah)}</option>)}
              </Select>
            </div>
          ) : <input name="providerPaymentId" type="hidden" value={usable[0].providerPaymentId} />}
          <div>
            <label className={fieldLabelClassName} htmlFor="refund-channel">Permintaan masuk lewat</label>
            <Select id="refund-channel" name="requestChannel">
              {Object.entries(REQUEST_CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>
          <div>
            <label className={fieldLabelClassName} htmlFor="refund-requested">Kapan permintaan masuk (WIB, kosongkan untuk sekarang)</label>
            <Input id="refund-requested" name="requestedAt" type="datetime-local" />
          </div>
          <div className="sm:col-span-2">
            <label className={fieldLabelClassName} htmlFor="refund-note">Ringkasan permintaan pembeli</label>
            <Textarea className={fieldControlClassName} id="refund-note" maxLength={1000} minLength={3} name="requestNote" required />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">Siapkan</Button>
          </div>
        </fieldset>
        <p className="text-xs leading-5 text-secondary-600">Admin mana pun dengan verifikasi dua langkah bisa menyiapkan. Sistem yang memeriksa syaratnya, dan hanya pemilik yang bisa menyetujui.</p>
      </form>
      <Fold title="Siapkan karena perintah otoritas">
        <form action={prepareRefundAction} className="min-w-0 space-y-3 rounded-control border border-primary-100 p-3">
          <input name="orderId" type="hidden" value={orderId} />
          <input name="reasonCode" type="hidden" value="authority_order" />
          <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <legend className={`${fieldLabelClassName} mb-1`}>Pengembalian dana atas perintah regulator, acquirer, atau pengadilan</legend>
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName} htmlFor="authority-name">Otoritas yang memerintahkan</label>
              <Input autoComplete="off" id="authority-name" maxLength={200} minLength={3} name="authorityName" placeholder="Contoh: Pengadilan Negeri Jakarta Selatan" required />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="authority-reference">Nomor surat atau perintah</label>
              <Input autoComplete="off" id="authority-reference" maxLength={120} name="authorityReference" required />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="authority-received">Kapan perintah diterima (WIB)</label>
              <Input id="authority-received" name="requestedAt" required type="datetime-local" />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="authority-deadline">Batas waktu dari otoritas (WIB, kosongkan jika tidak ada)</label>
              <Input id="authority-deadline" name="authorityDeadlineAt" type="datetime-local" />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="authority-amount">Jumlah (rupiah, kosongkan untuk semua sisa)</label>
              <Input autoComplete="off" id="authority-amount" inputMode="numeric" name="amount" placeholder={String(Math.max(...usable.map((payment) => payment.remainingRupiah)))} />
            </div>
            {usable.length > 1 ? (
              <div>
                <label className={fieldLabelClassName} htmlFor="authority-payment">Pembayaran</label>
                <Select id="authority-payment" name="providerPaymentId">
                  {usable.map((payment) => <option key={payment.providerPaymentId} value={payment.providerPaymentId}>{payment.providerPaymentId} · sisa {formatRupiah(payment.remainingRupiah)}</option>)}
                </Select>
              </div>
            ) : <input name="providerPaymentId" type="hidden" value={usable[0].providerPaymentId} />}
            <div>
              <label className={fieldLabelClassName} htmlFor="authority-channel">Perintah masuk lewat</label>
              <Select id="authority-channel" name="requestChannel">
                {Object.entries(REQUEST_CHANNELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName} htmlFor="authority-note">Ringkasan isi perintah</label>
              <Textarea className={fieldControlClassName} id="authority-note" maxLength={1000} minLength={3} name="requestNote" required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Siapkan</Button>
            </div>
          </fieldset>
          <p className="text-xs leading-5 text-secondary-600">Selalu memenuhi syarat: tanpa batas 3 hari dan tanpa melihat pemakaian fitur. Hanya pemilik yang bisa menyetujui. Jika otoritas menyebut batas waktu yang lebih awal dari 14 hari, itulah batas pengembaliannya.</p>
        </form>
      </Fold>
    </div>
  );
}

function DisputeCard({ authority, orderId, record }: { authority: Authority; orderId: string; record: DisputeRecord }) {
  const state = record.state as keyof typeof DISPUTE_STATE_LABELS;
  const hidden = { disputeId: record.id, orderId, version: record.version };

  return (
    <article aria-label={`Sengketa ${record.providerDisputeId}`} className="min-w-0 space-y-3 rounded-card border border-primary-100 p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-semibold text-secondary-900">{formatRupiah(record.amountRupiah)}</h3>
        <Badge size="xs" tone={DISPUTE_STATE_TONES[state]}>{DISPUTE_STATE_LABELS[state]}</Badge>
        {record.evidenceHold ? <Badge size="xs" tone="info">Bukti ditahan</Badge> : null}
        {record.refundInFlight ? <Badge size="xs" tone="danger">Ada pengembalian dana yang sudah di penyedia</Badge> : null}
        <span className="break-all font-mono text-xs text-secondary-600">{record.providerDisputeId}</span>
      </header>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Sumber">{record.source === "provider_event" ? "Kejadian dari penyedia" : "Pemberitahuan dicatat pemilik"}</Field>
        <Field label="Diterima">{formatDateTime(record.noticeReceivedAt)}</Field>
        <Field label="Alasan menurut penyedia">{record.reasonText}</Field>
        <Field label="Jawaban paling lambat">{formatDateTime(record.responseDueAt)}</Field>
        {record.resolvedAt ? <Field label="Selesai">{formatDateTime(record.resolvedAt)} · {record.resolutionSource === "owner" ? "dicatat pemilik" : "dilaporkan penyedia"}</Field> : null}
        {record.resolutionNote ? <Field label="Catatan">{record.resolutionNote}</Field> : null}
        {record.accessEffect ? <Field label="Dampak ke akses">{record.accessEffect}</Field> : null}
      </dl>
      {state === "open" ? (
        <ReasonForm action={resolveDisputeAction} disabled={!authority.isOwner} disabledNote={ownerNote(authority)} hidden={hidden} label="Catat hasil sengketa" submit="Simpan hasil">
          <div>
            <label className={fieldLabelClassName} htmlFor={`outcome-${record.id}`}>Hasil</label>
            <Select id={`outcome-${record.id}`} name="outcome">
              <option value="won">Menang (akses dilanjutkan)</option>
              <option value="lost">Kalah (akses diakhiri)</option>
            </Select>
          </div>
        </ReasonForm>
      ) : null}
    </article>
  );
}

function RecordDisputeForm({ authority, orderId, payments }: { authority: Authority; orderId: string; payments: CapturedPayment[] }) {
  if (payments.length === 0) return <p className="text-sm text-secondary-600">Belum ada pembayaran masuk yang bisa disengketakan.</p>;

  return (
    <form action={recordDisputeAction} className="min-w-0">
      <input name="orderId" type="hidden" value={orderId} />
      <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" disabled={!authority.isOwner}>
        <legend className={`${fieldLabelClassName} mb-1`}>Catat pemberitahuan sengketa dari penyedia</legend>
        <div>
          <label className={fieldLabelClassName} htmlFor="dispute-id">Nomor sengketa dari penyedia</label>
          <Input autoComplete="off" id="dispute-id" maxLength={160} name="providerDisputeId" required />
        </div>
        <div>
          <label className={fieldLabelClassName} htmlFor="dispute-amount">Jumlah (rupiah, kosongkan untuk seluruh pembayaran)</label>
          <Input autoComplete="off" id="dispute-amount" inputMode="numeric" name="amount" />
        </div>
        {payments.length > 1 ? (
          <div>
            <label className={fieldLabelClassName} htmlFor="dispute-payment">Pembayaran</label>
            <Select id="dispute-payment" name="providerPaymentId">
              {payments.map((payment) => <option key={payment.providerPaymentId} value={payment.providerPaymentId}>{payment.providerPaymentId}</option>)}
            </Select>
          </div>
        ) : <input name="providerPaymentId" type="hidden" value={payments[0].providerPaymentId} />}
        <div>
          <label className={fieldLabelClassName} htmlFor="dispute-received">Diterima (WIB, kosongkan untuk sekarang)</label>
          <Input id="dispute-received" name="noticeReceivedAt" type="datetime-local" />
        </div>
        <div>
          <label className={fieldLabelClassName} htmlFor="dispute-due">Jawaban paling lambat (WIB, jika ada)</label>
          <Input id="dispute-due" name="responseDueAt" type="datetime-local" />
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabelClassName} htmlFor="dispute-reason-text">Alasan menurut penyedia</label>
          <Textarea className={fieldControlClassName} id="dispute-reason-text" maxLength={500} minLength={3} name="reasonText" required />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit">Catat sengketa</Button>
        </div>
      </fieldset>
      {!authority.isOwner ? <p className="mt-2 text-xs leading-5 text-secondary-600">{ownerNote(authority)}</p> : null}
      <p className="mt-2 text-xs leading-5 text-secondary-600">Sengketa yang terbuka menjeda akses pembeli dan menahan bukti pesanan ini. Pengembalian dana ditahan sampai sengketa selesai.</p>
    </form>
  );
}

export function RefundAndDisputePanels({
  access,
  authority,
  disputes,
  orderId,
  orderStatus,
  payments,
  refunds,
  reviewReason,
  standInEnabled,
}: {
  access: AccessState;
  authority: Authority;
  disputes: DisputeRecord[];
  orderId: string;
  orderStatus: string;
  payments: CapturedPayment[];
  refunds: RefundRecord[];
  reviewReason: string | null;
  standInEnabled: boolean;
}) {
  return (
    <>
      {orderStatus === "review" ? (
        <Panel title="Pesanan ini perlu diputuskan">
          <p className="mb-3 text-sm leading-6 text-secondary-800">
            Pembayaran masuk, tetapi pesanan ditahan{reviewReason ? ` (${reviewReason.replaceAll("_", " ")})` : ""} dan akses belum diberikan. Pemilik memilih satu: terima pembayarannya dan beri akses, atau siapkan pengembalian dana di bawah.
          </p>
          <ReasonForm action={acceptReviewAction} disabled={!authority.isOwner} disabledNote={ownerNote(authority)} hidden={{ orderId }} label="Terima pembayaran dan beri akses" submit="Terima dan beri akses" />
        </Panel>
      ) : null}

      <Panel title="Pengembalian dana">
        <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Akses pembeli sekarang">{ACCESS_LABELS[access.status]}</Field>
          {payments.map((payment) => (
            <Field key={payment.providerPaymentId} label={`Pembayaran ${payment.providerPaymentId.slice(0, 12)}`}>
              {formatRupiah(payment.capturedRupiah)} masuk · dikembalikan {formatRupiah(payment.refundedRupiah)} · dicadangkan {formatRupiah(payment.reservedRupiah)}
              {payment.disputedLostRupiah > 0 ? ` · hilang karena sengketa ${formatRupiah(payment.disputedLostRupiah)}` : ""} · sisa {formatRupiah(payment.remainingRupiah)}
            </Field>
          ))}
        </dl>
        <div className="space-y-4">
          {refunds.length === 0 ? <p className="text-sm text-secondary-600">Belum ada permintaan pengembalian dana untuk pesanan ini.</p> : refunds.map((record) => (
            <RefundCard authority={authority} key={record.id} orderId={orderId} record={record} standInEnabled={standInEnabled} />
          ))}
          <PreparePanel orderId={orderId} payments={payments} status={orderStatus} />
        </div>
      </Panel>

      <Panel title="Sengketa pembayaran">
        <div className="space-y-4">
          {disputes.length === 0 ? <p className="text-sm text-secondary-600">Belum ada sengketa untuk pesanan ini.</p> : disputes.map((record) => (
            <DisputeCard authority={authority} key={record.id} orderId={orderId} record={record} />
          ))}
          <RecordDisputeForm authority={authority} orderId={orderId} payments={payments} />
        </div>
      </Panel>
    </>
  );
}
