import { OWNER_INPUTS as owner } from "./owner-inputs";
import type { LegalDocument } from "./types";

/**
 * "Kebijakan Privasi": what the system actually collects and does, written for a
 * student and a parent. It states only facts the code and the owner's recorded
 * decisions back up; everything the owner has not decided yet is a placeholder
 * from owner-inputs.ts. A lawyer reads it before the owner approves it.
 *
 * Retention numbers stated here: payment and order records 10 years, buyer IP and
 * device evidence 12 months, fraud review records 2 years after the case closes,
 * unfinished checkout intents 30 days, app logs 30 days, unverified signups 7 days
 * (all decided by the owner), and security logs 90 days (the daily job's cleanup,
 * lib/maintenance/retention.ts). Change a number here only when the register or the
 * job changes with it.
 */
const PRIVACY_POLICY_2026_11_09: LegalDocument = {
  draftedOn: "2026-11-09",
  intro: [
    "Kebijakan Privasi ini menjelaskan data pribadi apa yang PTN Pro kumpulkan, untuk apa kami memakainya, siapa saja yang ikut memprosesnya, berapa lama kami menyimpannya, dan apa yang bisa kamu lakukan atas datamu.",
    `PTN Pro dijalankan oleh ${owner.legalEntityName}, beralamat di ${owner.legalEntityAddress}. Di sini, “kami” berarti badan usaha itu dan “kamu” berarti siswa atau calon siswa yang memakai PTN Pro.`,
    `Kebijakan ini mengacu pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP). Versi ini berlaku sejak ${owner.effectiveDate}.`,
  ],
  sections: [
    {
      heading: "Pasal 1. Data yang kami kumpulkan",
      items: [
        "Saat mendaftar: nama dan email. Kamu membuat kata sandi setelah membuka tautan verifikasi di emailmu. Kata sandi disimpan dalam bentuk acak satu arah, jadi kami sendiri tidak bisa membacanya. Kami juga menyimpan pernyataan usiamu, versi Syarat dan Ketentuan serta Kebijakan Privasi yang kamu setujui, waktunya, dan alamat IP saat itu.",
        "Saat kamu mengisi profil: target ujian, kampus, dan jurusan tujuan di onboarding. Nomor telepon dan foto profil hanya kalau kamu mengisinya di pengaturan.",
        "Aktivitas belajar: Materi yang kamu buka, progres, jawaban, skor Kuis dan Tryout, riwayat dan analisis performa, notifikasi, dan data kebiasaan belajar seperti streak.",
        "Percakapanmu dengan Vera: pesan yang kamu tulis, jawaban Vera, dan Materi atau soal yang kamu sebut di pesan.",
        "Pembelian: paket yang kamu pilih, jumlah, status pembayaran, nomor referensi dari penyedia pembayaran, dan bukti pembayaran. Saat checkout kami juga mencatat alamat IP dan penanda perangkat untuk mencegah penipuan.",
        "Data keamanan: percobaan masuk (email, alamat IP, jenis peramban), permintaan atur ulang kata sandi, dan catatan sesi masuk.",
        "Isi pesan yang kamu kirim kalau menghubungi kami.",
      ],
      paragraphs: [
        "Kami mengumpulkan data dari yang kamu isi sendiri, dari cara kamu memakai PTN Pro, dan dari penyedia pembayaran.",
      ],
      after: [
        "Saat mendaftar, kami tidak meminta tanggal lahir, nomor identitas, atau alamat rumah. Rincian akun dompet digital atau QRIS-mu kamu masukkan di layanan penyedia pembayaran, bukan di PTN Pro. Dari mereka kami hanya menerima status pembayaran dan nomor referensi. PTN Pro tidak menerima pembayaran kartu.",
      ],
    },
    {
      heading: "Pasal 2. Untuk apa kami memakai datamu",
      items: [
        "Membuat akunmu, memastikan emailnya milikmu, dan menjaga akun itu tetap aman.",
        "Menyediakan fitur belajar: Materi, Kuis, Tryout, hasil, dan Vera.",
        "Memproses pembayaran, mengaktifkan akses, mengirim bukti pembayaran, dan menangani pengembalian dana atau sengketa.",
        "Mencegah penyalahgunaan dan penipuan, termasuk membatasi percobaan masuk dan jumlah pembelian.",
        "Menjawab pertanyaan dan permintaan bantuanmu.",
        "Memenuhi kewajiban hukum kami, seperti pencatatan keuangan.",
      ],
      paragraphs: [
        "Kami memakai datamu hanya untuk tujuan berikut.",
      ],
      after: [
        "Dasar kami memproses datamu adalah persetujuanmu, kebutuhan untuk menjalankan layanan yang kamu pakai, dan kewajiban hukum kami.",
      ],
    },
    {
      heading: "Pasal 3. Pihak yang ikut memproses datamu",
      items: [
        "Vercel: menjalankan dan mengirimkan aplikasi PTN Pro.",
        "Neon: basis data tempat akun dan data belajarmu disimpan.",
        "Cloudflare: penyimpanan file (R2) dan pemeriksaan keamanan formulir pendaftaran (Turnstile).",
        "Resend: mengirim email, seperti tautan verifikasi, atur ulang kata sandi, dan bukti pembayaran.",
        "OpenAI: memproses pesan yang kamu kirim ke Vera.",
        "E2Pay: memproses pembayaran QRIS dan dompet digital.",
        `${owner.redisProvider}: penyimpanan sementara untuk menjaga aplikasi tetap cepat dan membatasi percobaan berulang.`,
      ],
      paragraphs: [
        "Kami memakai penyedia layanan berikut. Masing-masing hanya menerima data yang ia perlukan untuk tugasnya.",
      ],
      after: [
        `Analitik: ${owner.analyticsNote}`,
        "Di luar daftar ini, kami hanya membuka datamu kalau hukum mewajibkannya atau pihak yang berwenang memintanya secara sah.",
      ],
    },
    {
      heading: "Pasal 4. Data diproses di luar Indonesia",
      paragraphs: [
        "Sebagian penyedia di Pasal 3 menjalankan server di luar Indonesia, jadi datamu bisa diproses dan disimpan di sana. Pesan yang kamu kirim ke Vera, misalnya, diproses oleh OpenAI.",
        `Server Redis kami ada di ${owner.redisRegions}.`,
      ],
    },
    {
      heading: "Pasal 5. Vera dan OpenAI",
      items: [
        "Pesan yang kamu tulis, dan Materi atau soal yang kamu sebut di pesan itu, dikirim ke OpenAI supaya Vera bisa menyusun jawaban.",
        "Jangan menulis kata sandi, nomor identitas, atau data pribadi lain yang tidak perlu di percakapan dengan Vera.",
        `Riwayat percakapanmu disimpan di akunmu selama ${owner.veraChatRetention}.`,
        "Jawaban Vera dibuat oleh AI dan bisa keliru. Lihat Pasal 5 pada Syarat dan Ketentuan.",
      ],
      paragraphs: [
        "Vera adalah asisten belajar berbasis AI. Cara kerjanya memengaruhi datamu:",
      ],
    },
    {
      heading: "Pasal 6. Cookie dan penyimpanan di peramban",
      items: [
        "Cookie masuk: menjaga kamu tetap masuk. Aktif sampai 7 hari atau sampai kamu keluar.",
        "Cookie perangkat: kode acak yang membantu kami mengenali peramban yang sama saat checkout, untuk mencegah penipuan. Berlaku 1 tahun. Yang kami simpan hanya kode turunan yang tidak bisa dibalik menjadi kode aslinya.",
        "Pemeriksaan keamanan formulir pendaftaran dari Cloudflare, yang bisa memakai penyimpanan di peramban untuk membedakan manusia dari bot.",
      ],
      paragraphs: [
        "PTN Pro memakai cookie dan penyimpanan di peramban untuk hal-hal berikut. Kami tidak memasang cookie iklan.",
      ],
      after: [
        `Analitik: ${owner.analyticsNote}`,
      ],
    },
    {
      heading: "Pasal 7. Berapa lama kami menyimpan datamu",
      items: [
        "Akun dan data belajar: selama akunmu ada. Kalau kamu meminta penghapusan, kami menutup akunmu dan menghapus data yang tidak wajib kami simpan.",
        "Pendaftaran yang belum diverifikasi: dihapus 7 hari setelah pendaftaran. Tautan verifikasinya berlaku 24 jam.",
        "Catatan pesanan, pembayaran, pengembalian dana, bukti pembayaran, dan jejak auditnya: 10 tahun.",
        "Alamat IP dan bukti perangkat saat transaksi: 12 bulan setelah transaksi, lalu dibersihkan.",
        "Catatan peninjauan penipuan: 2 tahun setelah kasusnya ditutup.",
        "Niat checkout yang tidak jadi pesanan: 30 hari.",
        "Log keamanan (percobaan masuk, permintaan atur ulang kata sandi, sesi masuk yang sudah berakhir): 90 hari.",
        "Log aplikasi di server: 30 hari.",
        `Riwayat percakapan Vera: ${owner.veraChatRetention}.`,
        `Catatan persetujuan saat mendaftar: ${owner.consentRecordRetention}.`,
      ],
      paragraphs: [
        "Setiap jenis data punya masa simpan sendiri:",
      ],
      after: [
        "Kalau ada sengketa atau pemeriksaan yang masih berjalan, kami menahan penghapusan data yang terkait sampai urusannya selesai.",
      ],
    },
    {
      heading: "Pasal 8. Keamanan dan kebocoran data",
      items: [
        "Kata sandi disimpan dalam bentuk acak satu arah.",
        "Koneksi ke PTN Pro memakai HTTPS.",
        "Akun admin dan pengembang memakai verifikasi dua langkah.",
        "Percobaan masuk yang berulang dibatasi, dan akses ke data pembayaran dibatasi untuk yang berwenang.",
      ],
      paragraphs: [
        "Kami menjaga datamu dengan langkah-langkah berikut:",
      ],
      after: [
        "Tidak ada sistem yang sepenuhnya kebal. Kalau terjadi kegagalan pelindungan data pribadi yang bisa merugikanmu, kami akan memberi tahu kamu secara tertulis lewat email akunmu dan melaporkannya kepada lembaga yang berwenang, dalam batas waktu yang ditentukan UU PDP. Pemberitahuan itu menjelaskan data apa yang terdampak, kapan kejadiannya, apa yang sudah kami lakukan, dan apa yang bisa kamu lakukan.",
      ],
    },
    {
      heading: "Pasal 9. Anak dan izin orang tua atau wali",
      paragraphs: [
        "Banyak pengguna PTN Pro masih berusia di bawah 18 tahun. UU PDP memberi perlindungan khusus pada data pribadi anak.",
        "Karena itu, saat mendaftar kamu wajib menyatakan bahwa kamu berusia 18 tahun ke atas, atau sudah mendapat izin orang tua atau wali untuk memakai PTN Pro dan mengolah datamu seperti dijelaskan di sini. Kami menyimpan pernyataan itu bersama versi dokumen yang kamu setujui. Kami tidak meminta tanggal lahir dan belum memeriksa izin itu langsung kepada orang tua atau wali.",
        `Kalau kamu orang tua atau wali dan ingin bertanya, atau meminta data anakmu dihapus, hubungi ${owner.privacyContactEmail}.`,
      ],
    },
    {
      heading: "Pasal 10. Hak kamu atas datamu",
      items: [
        "mengetahui bagaimana datamu diproses dan untuk apa;",
        "melihat dan meminta salinan datamu;",
        "memperbaiki atau melengkapi data yang keliru;",
        "meminta datamu dihapus atau pemrosesannya dihentikan;",
        "menarik persetujuan yang pernah kamu berikan;",
        "menyampaikan keberatan atau meminta pemrosesan dibatasi.",
      ],
      paragraphs: [
        "UU PDP memberi kamu hak atas data pribadimu, antara lain untuk:",
      ],
      after: [
        `Untuk memakai hak itu, kirim email ke ${owner.privacyContactEmail} dari alamat email akunmu, dan sebutkan hak yang ingin kamu pakai. Kami memeriksa dulu bahwa permintaan itu benar dari pemilik akun, lalu menjawab dalam ${owner.responseTime}.`,
        "Catatan pembayaran dan bukti terkait tetap kami simpan selama masa simpan wajibnya (Pasal 7), jadi permintaan penghapusan tidak berlaku untuk catatan itu. Kalau kamu menarik persetujuan yang kami butuhkan untuk menjalankan akunmu, kami mungkin tidak bisa lagi menyediakan layanan.",
      ],
    },
    {
      heading: "Pasal 11. Perubahan kebijakan ini",
      paragraphs: [
        "Kami bisa mengubah kebijakan ini. Setiap versi punya tanggal berlaku, dan kami menyimpan versi mana yang kamu setujui saat mendaftar. Kalau ada perubahan penting, kami memberi tahu kamu lewat email atau pemberitahuan di PTN Pro sebelum perubahan itu berlaku.",
      ],
    },
    {
      heading: "Pasal 12. Cara menghubungi kami",
      items: [
        `Nama badan usaha: ${owner.legalEntityName}`,
        `Alamat: ${owner.legalEntityAddress}`,
        `Email privasi: ${owner.privacyContactEmail}`,
        `Email bantuan: ${owner.supportContactEmail}`,
        `WhatsApp bantuan: ${owner.supportWhatsapp}`,
      ],
      paragraphs: [
        `Pertanyaan tentang privasi dan permintaan atas datamu kami jawab dalam ${owner.responseTime}.`,
      ],
    },
  ],
  status: "draft",
  title: "Kebijakan Privasi",
  version: "2026-11-09",
};

/** Oldest first. The last entry is the current one. An old version is never edited once anyone has agreed to it. */
const PRIVACY_POLICY_VERSIONS: readonly LegalDocument[] = [PRIVACY_POLICY_2026_11_09];

export { PRIVACY_POLICY_VERSIONS };
