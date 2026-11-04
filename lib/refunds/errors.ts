import { describeFraudError } from "@/lib/fraud/messages";

type RefundErrorCode =
  | "balance_exceeded"
  | "dispute_open"
  | "ineligible"
  | "invalid_input"
  | "no_provider"
  | "not_found"
  | "not_refundable"
  | "outcome_unknown"
  | "provider_rejected"
  | "provider_unavailable"
  | "stale_version"
  | "wrong_state";

/** Something about the refund or dispute stops the step. `code` says why, for the interface and for tests. */
class RefundError extends Error {
  readonly code: RefundErrorCode;

  constructor(code: RefundErrorCode, message: string) {
    super(message);
    this.name = "RefundError";
    this.code = code;
  }
}

/** What an admin is told when a refund or dispute action does not go through. Plain Indonesian, no codes. */
function describeRefundError(error: unknown) {
  if (error instanceof RefundError) {
    switch (error.code) {
      case "balance_exceeded":
        return "Jumlah ini melebihi sisa dana yang masih bisa dikembalikan untuk pembayaran tersebut.";
      case "dispute_open":
        return "Ada sengketa yang masih terbuka untuk pembayaran ini, jadi pengembalian dana ditahan sampai sengketa selesai.";
      case "ineligible":
        return "Pengembalian karena berubah pikiran tidak memenuhi syarat: sudah lewat 3 hari sejak pembayaran atau fitur berbayar sudah dipakai.";
      case "invalid_input":
        return error.message;
      case "no_provider":
        return "Penyedia pembayaran belum diatur, jadi pengembalian lewat penyedia belum bisa dijalankan. Gunakan transfer manual.";
      case "not_refundable":
        return "Pesanan ini belum punya pembayaran masuk yang bisa dikembalikan.";
      case "outcome_unknown":
        return "Hasil permintaan sebelumnya ke penyedia belum diketahui. Periksa statusnya dulu sebelum mencoba lagi.";
      case "provider_rejected":
        return "Penyedia menolak permintaan pengembalian dana ini.";
      case "provider_unavailable":
        return "Penyedia pembayaran belum menjawab. Hasilnya belum diketahui, jadi periksa statusnya sebelum mencoba lagi.";
      case "stale_version":
        return "Data ini sudah diubah orang lain. Muat ulang halaman, lalu coba lagi.";
      case "wrong_state":
        return "Langkah ini tidak bisa dilakukan pada status sekarang.";
      default:
        return "Data yang dimaksud tidak ditemukan.";
    }
  }
  return describeFraudError(error);
}

export { describeRefundError, RefundError };
export type { RefundErrorCode };
