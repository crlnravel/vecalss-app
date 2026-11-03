/** Indonesian copy for the two-step verification screens. No technical terms. */
const MFA_COPY = {
  challenge: {
    description: "Buka aplikasi autentikator di ponselmu, lalu masukkan kode 6 angka untuk akun ini.",
    title: "Masukkan kode verifikasi",
  },
  codeInvalid: "Kodenya belum cocok. Periksa kode di aplikasi autentikator, lalu coba lagi.",
  enrollmentExpired:
    "Pendaftaran ini sudah kedaluwarsa. Minta kode pendaftaran baru dari pengelola sistem, lalu mulai lagi.",
  recovery: {
    description:
      "Masukkan salah satu kode pemulihan yang kamu simpan saat mendaftar. Setiap kode hanya berlaku sekali.",
    title: "Gunakan kode pemulihan",
  },
  recoveryInvalid: "Kode pemulihan belum cocok atau sudah pernah dipakai.",
  recoveryCodes: {
    acknowledge: "Saya sudah menyimpan kode pemulihan ini",
    description:
      "Verifikasi dua langkah sudah aktif. Simpan 10 kode ini di tempat yang aman, misalnya pengelola kata sandi. Kode hanya ditampilkan sekali dan masing-masing hanya berlaku sekali.",
    title: "Simpan kode pemulihan",
  },
  scan: {
    description:
      "Buka aplikasi autentikator, pilih tambah akun, lalu pindai kode di bawah. Setelah itu masukkan kode 6 angka yang muncul di aplikasi.",
    manualKey: "Tidak bisa memindai? Ketik kunci ini di aplikasi:",
    title: "Pindai kode QR",
  },
  setup: {
    description:
      "Akun admin dan developer wajib memakai verifikasi dua langkah. Kamu butuh kode pendaftaran dari pengelola sistem.",
    hint: "Kode ini berlaku 30 menit dan hanya bisa dipakai sekali.",
    title: "Aktifkan verifikasi dua langkah",
  },
  setupInvalid:
    "Kode pendaftaran tidak cocok, sudah dipakai, atau sudah kedaluwarsa. Minta kode baru dari pengelola sistem.",
  signOut: "Keluar dari akun",
  throttled: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.",
  unavailable: {
    description:
      "Layanan verifikasi dua langkah sedang tidak bisa dipakai, jadi akses admin ditutup sementara. Hubungi pengelola sistem.",
    title: "Verifikasi belum bisa dipakai",
  },
  unexpected: "Verifikasi belum berhasil. Coba lagi beberapa saat lagi.",
} as const;

export { MFA_COPY };
