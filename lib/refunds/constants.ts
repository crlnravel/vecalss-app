/**
 * Refund and dispute rules recorded in MS-00 ("Refund eligibility", closed
 * 4 November 2026). Working days are Monday to Friday in Asia/Jakarta with no
 * holiday list, the same as appeals.
 */

type RefundReasonCategory = "change_of_mind" | "our_fault";

const REFUND_REASONS = {
  access_not_delivered: { category: "our_fault", label: "Sudah bayar, tetapi akses tidak sampai" },
  change_of_mind: { category: "change_of_mind", label: "Berubah pikiran" },
  double_charge: { category: "our_fault", label: "Tertagih dua kali" },
  service_unavailable: { category: "our_fault", label: "Layanan tidak bisa kami sediakan" },
  wrong_amount: { category: "our_fault", label: "Nominal tertagih salah" },
} as const satisfies Record<string, { category: RefundReasonCategory; label: string }>;

type RefundReasonCode = keyof typeof REFUND_REASONS;

function isRefundReasonCode(value: unknown): value is RefundReasonCode {
  return typeof value === "string" && value in REFUND_REASONS;
}

/** A change-of-mind refund must be requested within this many days of payment. */
const CHANGE_OF_MIND_WINDOW_DAYS = 3;

/** The owner decides within this many working days of the request. */
const REFUND_DECISION_WORKING_DAYS = 3;

/** Approved money goes back within this many calendar days. */
const REFUND_PAYOUT_DAYS = 14;

const REFUND_STATES = ["prepared", "approved", "processing", "completed", "rejected", "cancelled", "failed"] as const;
type RefundState = (typeof REFUND_STATES)[number];

/** States in which a case still has work to do. */
const OPEN_REFUND_STATES: readonly RefundState[] = ["prepared", "approved", "processing"];

const REFUND_STATE_LABELS: Record<RefundState, string> = {
  approved: "Disetujui",
  cancelled: "Dibatalkan",
  completed: "Selesai",
  failed: "Gagal",
  prepared: "Disiapkan",
  processing: "Diproses penyedia",
  rejected: "Ditolak",
};

const REQUEST_CHANNELS = {
  email: "Email",
  instagram: "Instagram",
  other: "Lainnya",
  whatsapp: "WhatsApp",
} as const;

type RequestChannel = keyof typeof REQUEST_CHANNELS;

function isRequestChannel(value: unknown): value is RequestChannel {
  return typeof value === "string" && value in REQUEST_CHANNELS;
}

const DESTINATION_HOLDERS = {
  buyer: "Atas nama pembeli",
  parent: "Atas nama orang tua atau wali (pembeli di bawah 18 tahun)",
} as const;

type DestinationHolder = keyof typeof DESTINATION_HOLDERS;

function isDestinationHolder(value: unknown): value is DestinationHolder {
  return typeof value === "string" && value in DESTINATION_HOLDERS;
}

const MIN_NOTE_LENGTH = 3;
const MAX_REQUEST_NOTE_LENGTH = 1000;
const MAX_PROOF_NOTE_LENGTH = 1000;

/** Disputes. */
const DISPUTE_RESOLUTIONS = ["won", "lost"] as const;
type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number];

export {
  CHANGE_OF_MIND_WINDOW_DAYS,
  DESTINATION_HOLDERS,
  DISPUTE_RESOLUTIONS,
  isDestinationHolder,
  isRefundReasonCode,
  isRequestChannel,
  MAX_PROOF_NOTE_LENGTH,
  MAX_REQUEST_NOTE_LENGTH,
  MIN_NOTE_LENGTH,
  OPEN_REFUND_STATES,
  REFUND_DECISION_WORKING_DAYS,
  REFUND_PAYOUT_DAYS,
  REFUND_REASONS,
  REFUND_STATE_LABELS,
  REFUND_STATES,
  REQUEST_CHANNELS,
};
export type { DestinationHolder, DisputeResolution, RefundReasonCategory, RefundReasonCode, RefundState, RequestChannel };
