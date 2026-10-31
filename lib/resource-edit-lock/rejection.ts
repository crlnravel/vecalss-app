/**
 * Save rejections that mean "this tab no longer matches the server": another tab
 * or device took the lease, the lease lapsed, or the content moved on. Shared by
 * the server actions (which pick the message) and the editors (which pause).
 * Kept free of server imports so client modules can use it.
 */
const SAVE_REJECTION_CODES = [
  "lease_taken_over",
  "lease_superseded",
  "lease_expired",
  "stale_content",
] as const;

type SaveRejectionCode = (typeof SAVE_REJECTION_CODES)[number];

const SAVE_REJECTION_MESSAGES: Record<SaveRejectionCode, string> = {
  lease_taken_over: "Halaman ini sedang dibuka di tab atau perangkat lain, jadi perubahan belum bisa disimpan.",
  lease_superseded: "Izin mengedit halaman ini berubah, jadi perubahan belum bisa disimpan.",
  lease_expired: "Sesi pengeditan berakhir, jadi perubahan belum bisa disimpan.",
  stale_content: "Isinya sudah diubah dari tab atau perangkat lain, jadi perubahan belum bisa disimpan.",
};

function isSaveRejectionCode(code: unknown): code is SaveRejectionCode {
  return typeof code === "string" && (SAVE_REJECTION_CODES as readonly string[]).includes(code);
}

export { SAVE_REJECTION_CODES, SAVE_REJECTION_MESSAGES, isSaveRejectionCode };
export type { SaveRejectionCode };
