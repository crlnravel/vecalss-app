import { FraudAuthorityError, FraudConfigError, FraudConflictError, FraudValidationError } from "./errors";

/** What an admin is told when a fraud action does not go through. Plain Indonesian, no codes. */
function describeFraudError(error: unknown) {
  if (error instanceof FraudAuthorityError) {
    switch (error.code) {
      case "owner_unset":
        return "Pemilik belum ditetapkan di pengaturan server, jadi tindakan ini belum bisa dilakukan.";
      case "not_owner":
        return "Hanya pemilik yang bisa melakukan tindakan ini.";
      default:
        return "Sesi kamu belum memenuhi syarat untuk tindakan ini. Masuk lagi dan selesaikan verifikasi dua langkah.";
    }
  }
  if (error instanceof FraudConflictError) {
    switch (error.code) {
      case "stale_version":
        return "Data ini sudah diubah orang lain. Muat ulang halaman, lalu coba lagi.";
      case "already_blocked":
        return "Pengenal ini sudah diblokir.";
      case "appeal_exists":
        return "Blokir ini sudah punya banding.";
      case "not_in_force":
        return "Blokir ini sudah tidak berlaku.";
      default:
        return "Langkah ini tidak bisa dilakukan pada status sekarang.";
    }
  }
  if (error instanceof FraudValidationError) {
    switch (error.code) {
      case "invalid_reason":
        return "Tulis alasan dengan jelas, antara 10 dan 500 karakter.";
      case "invalid_identifier":
        return "Nilai itu tidak valid untuk jenis blokir ini.";
      case "invalid_duration":
        return "Lama blokir di luar batas untuk jenis ini.";
      case "protected_account":
        return "Akun admin tidak bisa diblokir.";
      default:
        return "Data yang dimaksud tidak ditemukan.";
    }
  }
  if (error instanceof FraudConfigError) {
    return "Kunci pencarian fraud belum diatur di server, jadi blokir belum bisa dipakai.";
  }
  return "Tindakan belum berhasil. Coba lagi beberapa saat lagi.";
}

export { describeFraudError };
