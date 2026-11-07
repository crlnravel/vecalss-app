import { OWNER_INPUTS as owner } from "./owner-inputs";
import type { LegalDocument } from "./types";

/**
 * "Syarat dan Ketentuan": the general rules for having a PTN Pro account. It
 * says nothing about buying or refunds beyond pointing to /syarat-pembelian, which
 * stays the one place those rules live (lib/fulfillment/terms.ts). Everything the
 * owner has not decided yet is a placeholder from owner-inputs.ts. A lawyer reads
 * it before the owner approves it.
 */
const TERMS_OF_SERVICE_2026_11_09: LegalDocument = {
  draftedOn: "2026-11-09",
  intro: [
    "Syarat dan Ketentuan ini adalah aturan untuk memakai akun PTN Pro. Dengan mendaftar, kamu menyatakan sudah membaca dan menyetujuinya, juga Kebijakan Privasi kami.",
    `PTN Pro dijalankan oleh ${owner.legalEntityName}, beralamat di ${owner.legalEntityAddress}. Di sini, “kami” berarti badan usaha itu dan “kamu” berarti orang yang memakai akun PTN Pro. Versi ini berlaku sejak ${owner.effectiveDate}.`,
  ],
  sections: [
    {
      heading: "Pasal 1. Tentang PTN Pro",
      paragraphs: [
        "PTN Pro adalah layanan belajar digital untuk persiapan masuk perguruan tinggi negeri: Materi, Kuis, Tryout, hasil belajar, dan Vera, asisten belajar berbasis AI. Akses ke fitur-fiturnya didapat lewat pembelian paket, yang aturannya ada di Syarat Pembelian.",
      ],
    },
    {
      heading: "Pasal 2. Akunmu",
      items: [
        "Kamu berusia 18 tahun ke atas, atau sudah mendapat izin orang tua atau wali untuk membuat akun dan memakai PTN Pro. Kamu menyatakannya dengan mencentang kotak saat mendaftar.",
        "Data yang kamu isi benar, dan emailnya milikmu.",
        "Akun hanya untuk dipakai satu orang, yaitu kamu. Jangan membagikan email dan kata sandimu ke siapa pun.",
        "Kamu menjaga kata sandimu. Kalau kamu curiga akunmu dipakai orang lain, ubah kata sandimu dan beri tahu kami.",
      ],
      paragraphs: [
        "Untuk membuat akun, kamu menyatakan bahwa:",
      ],
      after: [
        "Akun baru aktif setelah emailmu diverifikasi lewat tautan yang kami kirim. Pendaftaran yang tidak diverifikasi dalam 7 hari dihapus.",
        "Pendaftaran sendiri hanya untuk siswa. Akun Kapten, admin, affiliator, dan pengembang dibuat oleh tim kami.",
      ],
    },
    {
      heading: "Pasal 3. Cara memakai PTN Pro",
      items: [
        "membagikan, menjual, atau menyebarkan Materi, soal, atau hasil Tryout di luar PTN Pro;",
        "memakai bot, skrip, atau cara otomatis lain untuk mengambil konten atau mengakses akun;",
        "mencoba menembus keamanan, mengganggu layanan, atau mengakses akun orang lain;",
        "membuat banyak akun untuk menghindari batas atau memanfaatkan promo;",
        "curang saat Kuis atau Tryout, misalnya dengan menyuruh orang lain mengerjakannya;",
        "mengirim konten yang melanggar hukum, menyinggung, atau melanggar hak orang lain, termasuk ke Vera.",
      ],
      paragraphs: [
        "Kamu boleh memakai PTN Pro untuk belajar sendiri. Kamu tidak boleh:",
      ],
    },
    {
      heading: "Pasal 4. Hak atas Materi dan konten",
      paragraphs: [
        "Materi, soal, video, pembahasan, desain, dan tampilan PTN Pro adalah milik kami atau milik Kapten dan pihak lain yang mengizinkan kami memakainya. Kamu mendapat izin memakainya untuk belajar pribadi selama aksesmu aktif. Izin itu tidak mencakup menyalin, menjual, atau membagikannya.",
        "Jawaban, pesan, dan data lain yang kamu buat tetap menjadi milikmu. Kamu mengizinkan kami menyimpan dan memprosesnya hanya untuk menjalankan layanan, sesuai Kebijakan Privasi.",
      ],
    },
    {
      heading: "Pasal 5. Jawaban Vera dan hasil dari AI",
      paragraphs: [
        "Vera menjawab dengan bantuan AI. Jawabannya bisa keliru, kurang lengkap, atau tidak sesuai dengan soal ujian yang sebenarnya. Anggap jawaban Vera sebagai bantuan belajar, bukan kunci yang pasti benar, dan cocokkan dengan Materi dan pembahasan dari Kapten.",
        "Skor dan analisis di PTN Pro membantu kamu melihat perkembanganmu. Keduanya tidak menjamin hasil ujian atau seleksi masuk perguruan tinggi yang sebenarnya.",
      ],
    },
    {
      heading: "Pasal 6. Pembelian dan pengembalian dana",
      paragraphs: [
        "Aturan membeli paket, lama akses, dan pengembalian dana ada di halaman Syarat Pembelian. Halaman itu berdiri sendiri, dan yang kamu setujui saat membeli adalah versi di halaman itu.",
      ],
    },
    {
      heading: "Pasal 7. Menangguhkan atau menutup akun",
      items: [
        "kamu melanggar aturan ini;",
        "ada tanda penyalahgunaan, penipuan, atau pembayaran yang bermasalah;",
        "hukum atau pihak berwenang mengharuskannya.",
      ],
      paragraphs: [
        "Kami bisa menangguhkan atau menutup akunmu, sementara atau seterusnya, kalau:",
      ],
      after: [
        "Kami menjelaskan alasannya kalau memungkinkan. Kalau kamu merasa penangguhan itu keliru, hubungi kami lewat kontak di Pasal 10. Kamu juga bisa meminta akunmu ditutup kapan saja lewat email ke kami. Untuk pembelian yang sudah kamu bayar, yang berlaku adalah Syarat Pembelian.",
      ],
    },
    {
      heading: "Pasal 8. Batas tanggung jawab kami",
      paragraphs: [
        "Kami berusaha menjaga PTN Pro tetap berjalan dan isinya benar, tetapi layanan ini diberikan apa adanya. Layanan bisa terhenti sementara karena perawatan atau gangguan di luar kendali kami, termasuk dari penyedia layanan yang kami pakai.",
        "Sejauh diizinkan hukum, kami tidak bertanggung jawab atas kerugian tidak langsung, seperti gagal lolos seleksi, kehilangan kesempatan, atau keputusan yang kamu ambil berdasarkan jawaban Vera atau hasil di PTN Pro. Batas ini tidak menghapus hak yang memang diberikan hukum kepadamu, termasuk hak atas pengembalian dana di Syarat Pembelian dan hak atas data pribadimu di Kebijakan Privasi.",
      ],
    },
    {
      heading: "Pasal 9. Perubahan, hukum yang berlaku, dan penyelesaian sengketa",
      items: [
        "Kami bisa mengubah syarat ini. Kalau perubahannya penting, kami memberi tahu kamu lewat email atau pemberitahuan di PTN Pro sebelum berlaku. Kalau kamu terus memakai PTN Pro setelah itu, kamu dianggap menyetujui versi barunya.",
        "Syarat ini tunduk pada hukum Republik Indonesia.",
        "Kalau ada perselisihan, kita coba selesaikan dulu lewat pembicaraan. Hubungi kami lewat kontak di Pasal 10 dan ceritakan masalahnya.",
        `Kalau pembicaraan tidak menyelesaikannya, perselisihan diselesaikan melalui pengadilan di ${owner.disputeCity}.`,
      ],
      paragraphs: [],
    },
    {
      heading: "Pasal 10. Cara menghubungi kami",
      items: [
        `Nama badan usaha: ${owner.legalEntityName}`,
        `Alamat: ${owner.legalEntityAddress}`,
        `Email bantuan: ${owner.supportContactEmail}`,
        `WhatsApp bantuan: ${owner.supportWhatsapp}`,
      ],
      paragraphs: [
        `Kami menjawab pertanyaan dan keluhanmu dalam ${owner.responseTime}.`,
      ],
    },
  ],
  status: "draft",
  title: "Syarat dan Ketentuan",
  version: "2026-11-09",
};

/** Oldest first. The last entry is the current one. An old version is never edited once anyone has agreed to it. */
const TERMS_OF_SERVICE_VERSIONS: readonly LegalDocument[] = [TERMS_OF_SERVICE_2026_11_09];

export { TERMS_OF_SERVICE_VERSIONS };
