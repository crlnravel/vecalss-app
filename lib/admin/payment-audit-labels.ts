/**
 * Indonesian wording for the payment, refund, dispute, fraud and retention
 * actions that land in `audit_logs`. The general audit page and the order
 * timeline both read these, so one action is always called the same thing.
 * Plain words only: no action codes, field names or ids reach the screen.
 */

type AuditTone = "attention" | "danger" | "neutral" | "success";

type PaymentAuditLabel = { label: string; tone: AuditTone };

const PAYMENT_AUDIT_ACTIONS: Record<string, PaymentAuditLabel> = {
  // Checkout and the order
  "payment.checkout.refused": { label: "Checkout ditolak oleh batas pembelian", tone: "attention" },
  "payment.order.created": { label: "Pesanan dibuat", tone: "neutral" },
  "payment.order.paid": { label: "Pembayaran diterima, pesanan lunas", tone: "success" },
  "payment.order.failed": { label: "Pembayaran gagal", tone: "danger" },
  "payment.order.expired": { label: "Waktu pembayaran habis", tone: "neutral" },
  "payment.order.review": { label: "Pembayaran masuk setelah pesanan ditutup, perlu ditinjau", tone: "attention" },
  "payment.order.review_accepted": { label: "Pembayaran yang ditinjau diterima pemilik", tone: "success" },
  "payment.order.delivered": { label: "Akses sudah diberikan ke pembeli", tone: "success" },
  "payment.order.delivery_pending": { label: "Akses belum bisa diberikan, akan dicoba lagi", tone: "attention" },
  "risk.tier.changed": { label: "Tingkat batas pembelian akun berubah", tone: "neutral" },
  // Events from the payment provider
  "payment.event.quarantined": { label: "Kabar dari penyedia pembayaran ditahan karena datanya tidak cocok", tone: "danger" },
  "payment.event.review": { label: "Kabar dari penyedia pembayaran disimpan untuk ditinjau", tone: "attention" },
  // Refunds
  "refund.prepared": { label: "Pengembalian dana disiapkan", tone: "neutral" },
  "refund.approved": { label: "Pengembalian dana disetujui pemilik", tone: "success" },
  "refund.execution_started": { label: "Pengembalian dana dikirim ke penyedia pembayaran", tone: "neutral" },
  "refund.completed": { label: "Pengembalian dana selesai", tone: "success" },
  "refund.cancelled": { label: "Pengembalian dana dibatalkan", tone: "neutral" },
  "refund.rejected": { label: "Pengembalian dana ditolak", tone: "attention" },
  "refund.failed": { label: "Pengembalian dana gagal", tone: "danger" },
  // Disputes
  "dispute.opened": { label: "Sengketa dibuka, akses dijeda", tone: "danger" },
  "dispute.won": { label: "Sengketa dimenangkan", tone: "success" },
  "dispute.lost": { label: "Sengketa kalah", tone: "danger" },
  "dispute.export.created": { label: "Paket bukti sengketa dibuat", tone: "neutral" },
  "dispute.export.downloaded": { label: "Paket bukti sengketa diunduh", tone: "neutral" },
  "dispute.export.refused": { label: "Pembuatan paket bukti sengketa ditolak", tone: "attention" },
  // Fraud
  "fraud.case.opened": { label: "Kasus fraud dibuka", tone: "attention" },
  "fraud.case.acknowledged": { label: "Kasus fraud sudah dilihat", tone: "neutral" },
  "fraud.case.escalated": { label: "Kasus fraud dieskalasi ke pemilik", tone: "attention" },
  "fraud.case.closed": { label: "Kasus fraud ditutup", tone: "neutral" },
  "fraud.case.reopened": { label: "Kasus fraud dibuka kembali", tone: "attention" },
  "fraud.case.block_linked": { label: "Kasus fraud dikaitkan dengan blokir", tone: "neutral" },
  "fraud.block.created": { label: "Blokir dibuat", tone: "attention" },
  "fraud.block.lifted": { label: "Blokir dicabut", tone: "neutral" },
  "fraud.block.expired": { label: "Blokir berakhir", tone: "neutral" },
  "fraud.block.renewed": { label: "Blokir diperpanjang", tone: "attention" },
  "fraud.appeal.filed": { label: "Banding atas blokir diajukan", tone: "neutral" },
  "fraud.appeal.decided": { label: "Banding atas blokir diputuskan", tone: "neutral" },
  "fraud.appeal.reopened": { label: "Banding atas blokir dibuka kembali", tone: "attention" },
  "fraud.policy.published": { label: "Batas pembelian diperbarui", tone: "neutral" },
  "fraud.daily_review.completed": { label: "Tinjauan harian fraud selesai", tone: "neutral" },
  // Retention
  "retention.hold.placed": { label: "Bukti ditahan, tidak akan dihapus", tone: "attention" },
  "retention.hold.released": { label: "Penahanan bukti dilepas", tone: "neutral" },
};

function paymentAuditLabel(action: string): PaymentAuditLabel | null {
  return PAYMENT_AUDIT_ACTIONS[action] ?? null;
}

/** Fields a provider event can disagree with its order on, in words. */
const MISMATCH_FIELDS: Record<string, string> = {
  amount: "nominal",
  buyer: "pembeli",
  currency: "mata uang",
  merchant: "akun merchant",
  package: "paket",
  payment: "nomor pembayaran",
  reference: "nomor pesanan",
};

const EVENT_REASONS: Record<string, string> = {
  dispute_malformed: "Data sengketa tidak lengkap.",
  duplicate_capture: "Pembayaran yang sama sudah tercatat sebelumnya.",
  duplicate_refund_event: "Kabar pengembalian dana ini sudah tercatat sebelumnya.",
  late_success_after_expired: "Pembayaran masuk setelah waktu pembayaran habis.",
  late_success_after_failed: "Pembayaran masuk setelah pesanan dinyatakan gagal.",
  refund_amount: "Nominal pengembalian dana tidak sama dengan yang disiapkan.",
  refund_id: "Nomor pengembalian dana tidak sama dengan yang dikenal.",
  refund_malformed: "Data pengembalian dana tidak lengkap.",
  refund_not_started: "Pengembalian dana ini belum pernah dikirim ke penyedia.",
  refund_payment: "Nomor pembayaran pada kabar pengembalian dana tidak cocok.",
  second_capture: "Ada pembayaran kedua untuk pesanan yang sudah lunas.",
  unknown_refund: "Pengembalian dana yang disebut tidak dikenal.",
};

/** Why a provider event was held or ignored, from the stored reason code. Never shows the code itself. */
function paymentEventReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (EVENT_REASONS[reason]) return EVENT_REASONS[reason];
  if (reason.startsWith("order_")) return "Pesanan sudah tidak menunggu pembayaran, jadi kabar ini tidak mengubah apa pun.";
  if (reason.startsWith("refund_succeeded_after_") || reason.startsWith("refund_failed_after_")) {
    return "Kabar pengembalian dana ini bertentangan dengan kasus yang sudah selesai, jadi disimpan untuk ditinjau.";
  }
  if (reason.startsWith("refund_")) return "Kabar pengembalian dana ini tidak diterapkan.";
  const fields = reason.split(",").map((field) => MISMATCH_FIELDS[field.trim()]).filter(Boolean);
  if (fields.length > 0) return `Data tidak cocok dengan pesanan: ${fields.join(", ")}.`;
  return "Kabar ini tidak diterapkan.";
}

/** The kinds of provider event, as the timeline names them. */
const PAYMENT_EVENT_TYPE_LABELS: Record<string, string> = {
  dispute_lost: "Penyedia melaporkan sengketa kalah",
  dispute_opened: "Penyedia melaporkan sengketa dibuka",
  dispute_won: "Penyedia melaporkan sengketa dimenangkan",
  expired: "Penyedia melaporkan waktu pembayaran habis",
  failed: "Penyedia melaporkan pembayaran gagal",
  refund_failed: "Penyedia melaporkan pengembalian dana gagal",
  refund_succeeded: "Penyedia melaporkan pengembalian dana berhasil",
  succeeded: "Penyedia melaporkan pembayaran berhasil",
};

const PAYMENT_EVENT_OUTCOME_LABELS: Record<string, string> = {
  accepted: "Diterapkan",
  declined: "Diterapkan",
  expired: "Diterapkan",
  ignored: "Diabaikan",
  quarantined: "Ditahan",
  review: "Perlu ditinjau",
};

/** Why a paid order's access could not be given yet. */
const PENDING_REASON_LABELS: Record<string, string> = {
  full_end_not_configured: "Tanggal akhir Full Access belum diatur.",
  full_end_passed: "Tanggal akhir Full Access sudah lewat.",
  grant_error: "Terjadi kesalahan saat memberi akses.",
  paused: "Akses pembeli sedang dijeda.",
  plan_unknown: "Paket pesanan tidak dikenali.",
  student_not_found: "Akun pembeli tidak ditemukan.",
};

export {
  PENDING_REASON_LABELS,
  PAYMENT_EVENT_OUTCOME_LABELS,
  PAYMENT_EVENT_TYPE_LABELS,
  paymentAuditLabel,
  paymentEventReasonLabel,
};
export type { AuditTone, PaymentAuditLabel };
