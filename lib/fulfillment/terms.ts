/**
 * "Syarat Pembelian": the plain-language terms a buyer agrees to at checkout.
 *
 * The text is built only from decisions already recorded in MS-00: digital
 * access, no auto-renewal, Monthly is one calendar month, Full Access runs to
 * the exam date, when and how money is refunded ("Refund eligibility", closed
 * 4 November 2026), a full refund ends access, an open dispute pauses it, and
 * where to reach support.
 *
 * Versions: an order keeps the version its buyer agreed to, and the dispute
 * export prints that version's text, so an old version is never edited. A change
 * is a new entry in `TERMS_VERSIONS` with a new version string. The last entry is
 * the current one.
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

/** What buyers agreed to before refund rules were written down. Kept word for word. */
const TERMS_2026_11_04: PurchaseTerms = {
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

/** Adds the refund rules (MS-00 "Refund eligibility"). Everything else is as in the earlier version. */
const TERMS_2026_11_05: PurchaseTerms = {
  ...TERMS_2026_11_04,
  draftedOn: "2026-11-05",
  sections: [
    ...TERMS_2026_11_04.sections.filter((section) => section.heading !== "Pengembalian dana dan sengketa" && section.heading !== "Bantuan"),
    {
      body: [
        "Kalau kesalahannya ada di pihak kami, uangmu dikembalikan penuh. Itu berlaku kalau kamu tertagih dua kali, nominal yang tertagih salah, kamu sudah bayar tetapi aksesmu tidak sampai, atau ada layanan yang tidak bisa kami sediakan.",
        "Kalau kamu berubah pikiran, uangmu dikembalikan penuh asalkan kamu memintanya dalam 3 hari sejak pembayaran dan belum memakai fitur berbayar apa pun.",
        "Setelah 3 hari, atau setelah kamu memakai fitur berbayar, pembelian tidak bisa dikembalikan. Itu berlaku juga untuk Full Access. Satu-satunya pengecualian adalah kesalahan di pihak kami.",
      ],
      heading: "Kapan uangmu dikembalikan",
    },
    {
      body: [
        "Permintaanmu kami putuskan paling lama 3 hari kerja. Kalau disetujui, uangmu kembali paling lama 14 hari kalender, dan bisa lebih lama kalau penyedia pembayaran lambat memprosesnya.",
        "Uang kembali ke QRIS atau e-wallet yang kamu pakai kalau penyedia pembayaran bisa memprosesnya. Kalau tidak bisa, kami transfer ke rekening bank atau e-wallet atas namamu, atau atas nama orang tua atau walimu kalau kamu belum 18 tahun. Bukti transfernya kami simpan.",
      ],
      heading: "Berapa lama dan lewat mana",
    },
    TERMS_2026_11_04.sections.filter((section) => section.heading === "Pengembalian dana dan sengketa")[0],
    TERMS_2026_11_04.sections.filter((section) => section.heading === "Bantuan")[0],
  ],
  version: "2026-11-05.1",
};

/** Every version that has been in force, oldest first. The last one is current. */
const TERMS_VERSIONS: readonly PurchaseTerms[] = [TERMS_2026_11_04, TERMS_2026_11_05];

const PURCHASE_TERMS: PurchaseTerms = TERMS_VERSIONS[TERMS_VERSIONS.length - 1];

/** The text of the version an order agreed to. Old versions stay readable for old orders. */
function getTermsByVersion(version: string): PurchaseTerms | null {
  return TERMS_VERSIONS.find((terms) => terms.version === version) ?? null;
}

/**
 * Whether the terms in force may be accepted at checkout (MS-19 M-05). A real
 * provider needs approved terms: a buyer must not agree to text the owner has
 * not signed off. The local stand-in provider moves no money, so development
 * and the suites keep working with draft terms. Approving the terms stays a
 * go-live action for the owner.
 */
function termsOpenForCheckout(providerId: string | null | undefined, terms: PurchaseTerms = PURCHASE_TERMS) {
  return terms.status === "approved" || providerId === "stand-in";
}

export { PURCHASE_TERMS, TERMS_VERSIONS, getTermsByVersion, termsOpenForCheckout };
export type { PurchaseTerms, TermsSection };
