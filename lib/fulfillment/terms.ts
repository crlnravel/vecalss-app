/**
 * "Syarat Pembelian": the plain-language terms a buyer agrees to at checkout.
 *
 * The text is built only from decisions already recorded in MS-00 and MS-08:
 * digital access, no auto-renewal, Monthly is one calendar month, Full Access
 * runs to the exam date, a full refund ends access, an open dispute pauses it,
 * and where to reach support. It does not say when a refund is granted, because
 * that is not decided.
 *
 * The version is stored on the checkout intent and the order. Change the text
 * and the version together: an order keeps the version its buyer agreed to, and
 * the dispute export prints that version's text. While `status` is "draft" the
 * page says so; the owner approves the terms before go-live.
 */

type TermsSection = { body: readonly string[]; heading: string };

type PurchaseTerms = {
  /** The day this text was written, shown to readers. */
  draftedOn: string;
  sections: readonly TermsSection[];
  /** "draft" until the owner approves the text. */
  status: "approved" | "draft";
  title: string;
  /** Stored with every intent and order. Never shown to buyers. */
  version: string;
};

const PURCHASE_TERMS: PurchaseTerms = {
  draftedOn: "2026-11-04",
  sections: [
    {
      body: [
        "Kamu membeli akses digital ke fitur belajar di Vecalss untuk satu periode. Tidak ada barang yang dikirim ke alamatmu.",
        "Akses aktif di akunmu setelah pembayaran kami terima. Kamu bisa melihat statusnya di halaman pembayaran dan di notifikasi.",
      ],
      heading: "Yang kamu beli",
    },
    {
      body: [
        "Paket Vecalss tidak diperpanjang otomatis. Setiap pembelian berlaku untuk satu periode saja, dan kamu memutuskan sendiri kapan membeli lagi.",
      ],
      heading: "Tanpa perpanjangan otomatis",
    },
    {
      body: [
        "Monthly Access berlaku 1 bulan kalender sejak aksesmu aktif. Kalau aksesmu masih berjalan saat kamu membeli lagi, bulan baru disambung dari tanggal akses berakhir.",
        "Full Access berlaku sampai tanggal ujian target paket yang kamu pilih (UTBK-SNBT atau Ujian Mandiri).",
        "Selama Full Access-mu masih berjalan, Monthly Access tidak bisa dibeli karena sudah termasuk.",
      ],
      heading: "Lama akses",
    },
    {
      body: [
        "Pembayaran dilakukan lewat QRIS atau e-wallet. Harga yang berlaku adalah harga yang tampil di halaman checkout saat kamu membayar.",
      ],
      heading: "Pembayaran",
    },
    {
      body: [
        "Kalau uangmu dikembalikan penuh, aksesmu berakhir saat pengembalian itu dilakukan. Pengembalian sebagian tidak otomatis mengakhiri akses; tim Vecalss yang memutuskannya.",
        "Kalau ada sengketa pembayaran yang masih terbuka, aksesmu dijeda sampai sengketa itu selesai.",
        "Hasil belajar dan riwayatmu tidak dihapus dalam kedua keadaan itu.",
      ],
      heading: "Pengembalian dana dan sengketa",
    },
    {
      body: ["Ada yang kurang jelas atau pembayaranmu bermasalah? Hubungi tim Vecalss lewat kontak di bawah ini."],
      heading: "Bantuan",
    },
  ],
  status: "draft",
  title: "Syarat Pembelian",
  version: "2026-11-04.1",
};

/** The text of the version an order agreed to. Only the current version exists so far. */
function getTermsByVersion(version: string): PurchaseTerms | null {
  return version === PURCHASE_TERMS.version ? PURCHASE_TERMS : null;
}

export { PURCHASE_TERMS, getTermsByVersion };
export type { PurchaseTerms, TermsSection };
