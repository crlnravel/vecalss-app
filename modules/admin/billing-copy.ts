import type { BillingAccessErrorCode, AccessStatus } from "@/lib/billing/service";

/** Indonesian copy for the paid-access panel on the admin student page. */
const ACCESS_STATUS_LABEL: Record<AccessStatus, string> = {
  active: "Aktif",
  expired: "Berakhir",
  none: "Belum punya paket",
  paused: "Dijeda",
  revoked: "Dicabut",
};

const ACCESS_OPERATION_LABEL = {
  extend: "Perpanjang akses",
  grant: "Beri akses",
  pause: "Jeda akses",
  resume: "Lanjutkan akses",
  revoke: "Cabut akses",
} as const;

type AccessOperation = keyof typeof ACCESS_OPERATION_LABEL;

const ACCESS_OPERATION_HINT: Record<AccessOperation, string> = {
  extend: "Menambah waktu. Paket bulanan menambah satu bulan dari tanggal akhir yang berjalan.",
  grant: "Memulai akses sekarang untuk siswa yang belum punya akses aktif.",
  pause: "Menahan akses selama ada sengketa pembayaran. Tanggal akhir tidak berubah.",
  resume: "Mengaktifkan lagi akses yang sedang dijeda.",
  revoke: "Menghentikan akses sekarang, misalnya setelah pengembalian dana penuh. Hasil belajar siswa tetap tersimpan.",
};

const ACCESS_EVENT_LABEL = {
  extend: "Diperpanjang",
  grant: "Diberi akses",
  pause: "Dijeda",
  resume: "Dilanjutkan",
  revoke: "Dicabut",
} as const;

const ACCESS_ERROR_MESSAGE: Record<BillingAccessErrorCode, string> = {
  already_active: "Siswa ini sudah punya akses aktif. Pilih Perpanjang akses kalau ingin menambah waktu.",
  full_end_not_configured: "Tanggal akhir paket Full untuk target ini belum ditetapkan, jadi paket ini belum bisa diberikan.",
  full_end_passed: "Tanggal akhir paket Full untuk target ini sudah lewat.",
  idempotency_conflict: "Formulir ini sudah dipakai untuk perubahan lain. Muat ulang halaman, lalu coba lagi.",
  invalid_key: "Formulir ini sudah tidak berlaku. Muat ulang halaman, lalu coba lagi.",
  invalid_reason: "Tulis alasan perubahan, maksimal 500 karakter.",
  no_access: "Siswa ini belum punya akses untuk diperpanjang. Pilih Beri akses.",
  not_active: "Hanya akses yang sedang berjalan yang bisa dijeda.",
  nothing_to_extend: "Akses siswa sudah berlaku sampai atau melewati tanggal akhir paket ini.",
  paused: "Akses sedang dijeda. Lanjutkan akses dulu.",
  revoked: "Akses sudah dicabut. Pilih Beri akses untuk memulai lagi.",
  student_not_found: "Akun siswa tidak ditemukan. Kembali ke daftar siswa lalu pilih akun lagi.",
  unknown_plan: "Pilih paketnya dulu.",
};

const ACCESS_GENERIC_ERROR = "Perubahan akses belum berhasil disimpan. Muat ulang halaman, lalu coba lagi.";

export {
  ACCESS_ERROR_MESSAGE,
  ACCESS_EVENT_LABEL,
  ACCESS_GENERIC_ERROR,
  ACCESS_OPERATION_HINT,
  ACCESS_OPERATION_LABEL,
  ACCESS_STATUS_LABEL,
};
export type { AccessOperation };
