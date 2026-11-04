/** Version of the signal rules below. A case records it, so a later change is visible. */
const FRAUD_RULE_VERSION = 1;

type Severity = "low" | "medium" | "high" | "critical";

/**
 * Every signal that can open a case. `capture_without_access` (MS-08) and
 * `refund_stalled` (MS-09) are declared here so those tickets only need to call
 * `openFraudCase` with them; nothing in this ticket raises them.
 */
const FRAUD_SIGNALS = {
  block_appeal: { label: "Banding atas blokir", severity: "low" },
  block_ending: { label: "Blokir segera berakhir", severity: "low" },
  blocked_attempt: { label: "Percobaan dari pengenal yang diblokir", severity: "medium" },
  capture_without_access: { label: "Pembayaran masuk, akses belum diberikan", severity: "critical" },
  device_multi_account: { label: "Satu perangkat, banyak akun membayar", severity: "high" },
  ip_multi_account: { label: "Satu IP, banyak akun membayar", severity: "medium" },
  payment_quarantined: { label: "Kejadian pembayaran ditahan", severity: "critical" },
  payment_review: { label: "Pembayaran perlu ditinjau", severity: "high" },
  refund_stalled: { label: "Pengembalian dana tertahan", severity: "high" },
  repeated_payment_failures: { label: "Pembayaran gagal berulang", severity: "medium" },
  volume_spike: { label: "Volume harian melonjak", severity: "medium" },
} as const satisfies Record<string, { label: string; severity: Severity }>;

type FraudSignal = keyof typeof FRAUD_SIGNALS;

const SIGNAL_NAMES = Object.keys(FRAUD_SIGNALS) as FraudSignal[];

function isFraudSignal(value: string): value is FraudSignal {
  return value in FRAUD_SIGNALS;
}

/** Daily-job thresholds (decision "Fraud operations rules"). Tuned after the first month of traffic. */
const DAILY_RULES = {
  /** Accounts paying from one IP or device within an hour. */
  accountsPerIdentifier: 3,
  /** Failed or expired payments for one account in a day. */
  failedPaymentsPerAccount: 3,
  /** Blocks ending within this many days need a fresh written reason to renew. */
  endingSoonDays: 3,
  /** Volume that counts as a spike, against the previous seven days' daily average. */
  spikeFactor: 3,
  /** A spike needs at least this many orders, so a quiet week cannot trip it on two orders. */
  spikeMinimumOrders: 6,
} as const;

const BLOCK_REASONS = {
  account_abuse: "Penyalahgunaan akun",
  failed_payments: "Pembayaran gagal berulang",
  multi_account: "Banyak akun dari satu sumber",
  other: "Lainnya",
  payment_fraud: "Dugaan penipuan pembayaran",
} as const;

type BlockReasonCode = keyof typeof BLOCK_REASONS;

function isBlockReasonCode(value: string): value is BlockReasonCode {
  return value in BLOCK_REASONS;
}

const CLOSURE_REASONS = {
  confirmed_fraud: "Penipuan terbukti",
  duplicate: "Duplikat kasus lain",
  false_positive: "Salah deteksi",
  no_action_needed: "Tidak perlu tindakan",
  other: "Lainnya",
} as const;

type ClosureReasonCode = keyof typeof CLOSURE_REASONS;

function isClosureReasonCode(value: string): value is ClosureReasonCode {
  return value in CLOSURE_REASONS;
}

type FraudBlockType = "account" | "device" | "email" | "ip" | "phone";

const BLOCK_TYPES: readonly FraudBlockType[] = ["account", "email", "phone", "device", "ip"];

const BLOCK_TYPE_LABELS: Record<FraudBlockType, string> = {
  account: "Akun",
  device: "Perangkat",
  email: "Email",
  ip: "Alamat IP",
  phone: "Nomor telepon",
};

/** Longest a block of each type may last, in days (null: until lifted). */
const MAX_BLOCK_DAYS: Record<FraudBlockType, number | null> = {
  account: null,
  device: 30,
  email: null,
  ip: 7,
  phone: null,
};

/** Days a block with no end date goes before it must be reviewed. */
const REVIEW_INTERVAL_DAYS = 30;

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

/** Working days an appeal may wait for the owner's decision. */
const APPEAL_WORKING_DAYS = 3;

export {
  APPEAL_WORKING_DAYS,
  BLOCK_REASONS,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  CLOSURE_REASONS,
  DAILY_RULES,
  FRAUD_RULE_VERSION,
  FRAUD_SIGNALS,
  isBlockReasonCode,
  isClosureReasonCode,
  isFraudSignal,
  MAX_BLOCK_DAYS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  REVIEW_INTERVAL_DAYS,
  SIGNAL_NAMES,
};
export type { BlockReasonCode, ClosureReasonCode, FraudBlockType, FraudSignal, Severity };
