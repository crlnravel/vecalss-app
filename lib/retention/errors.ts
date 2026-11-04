/** A retention action that cannot go ahead. `code` says why, for the interface and for tests. */
class RetentionError extends Error {
  readonly code: "already_held" | "already_released" | "invalid_reason" | "invalid_subject" | "not_found";

  constructor(code: RetentionError["code"], message: string) {
    super(message);
    this.name = "RetentionError";
    this.code = code;
  }
}

/** What an admin is told when a retention action does not go through. Plain Indonesian, no codes. */
function describeRetentionError(error: unknown) {
  if (error instanceof RetentionError) {
    switch (error.code) {
      case "already_held":
        return "Penahanan untuk data ini sudah aktif.";
      case "already_released":
        return "Penahanan ini sudah dilepas.";
      case "invalid_reason":
        return "Tulis alasan dengan jelas, antara 10 dan 500 karakter.";
      case "invalid_subject":
        return "Data yang mau ditahan tidak dikenali.";
      default:
        return "Penahanan yang dimaksud tidak ditemukan.";
    }
  }
  return null;
}

export { describeRetentionError, RetentionError };
