/**
 * Immutable completion state supplied by the original static Materi
 * catalogue. The identity is the stable public lesson code, never a title or
 * mutable position, so it remains valid after the database cutover.
 */
const studentMateriProgressBaseline = {
  "penalaran-umum": [
    "penalaran-umum-1-1",
    "penalaran-umum-1-2",
    "penalaran-umum-2-1",
  ],
  "pengetahuan-pemahaman-umum": ["pengetahuan-pemahaman-umum-1-1"],
  "pemahaman-bacaan-menulis": [],
  "pengetahuan-kuantitatif": [
    "pengetahuan-kuantitatif-1-1",
    "pengetahuan-kuantitatif-1-2",
  ],
  "literasi-bahasa-indonesia": [],
  "literasi-bahasa-inggris": [],
  "penalaran-matematika": [],
} as const;

export { studentMateriProgressBaseline };
