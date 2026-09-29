# Copywriting dan microcopy

Panduan ini melengkapi aturan visual di [DESIGN.md](../../DESIGN.md) dengan
aturan untuk teks yang dibaca atau didengar pengguna. Untuk arti istilah
produk, lihat [glosarium Vecalss](../../CONTEXT.md).

## Suara Vecalss

- Utamakan Bahasa Indonesia yang jelas, natural, ramah, dan tidak kaku.
- Untuk siswa, gunakan “kamu” sebagai sapaan. Gunakan “Voyager” pada momen
  brand seperti onboarding atau apresiasi, bukan sebagai pengganti “kamu” di
  setiap instruksi.
- Gunakan “Kapten” untuk tutor dan penulis konten pada antarmuka. Untuk area
  admin dan Kapten, gunakan bahasa yang langsung dan profesional.
- Pertahankan sedikit karakter Vecalss pada onboarding, empty state, progres,
  dan perayaan. Pada formulir, tombol, konfirmasi, error, dan tindakan penting,
  utamakan kata yang menjelaskan tindakan atau akibatnya.
- Hindari bahasa terlalu formal, slang yang dipaksakan, jargon internal,
  metafora yang mengaburkan langkah, dan klaim yang tidak didukung produk.

## Menulis interaksi

- Tulis label tombol dengan kata kerja dan hasil yang spesifik: “Mulai latihan”,
  “Kumpulkan jawaban”, “Lihat pembahasan”, atau “Simpan perubahan”. Gunakan
  label lebih singkat jika konteks di dekatnya sudah jelas.
- Untuk tindakan penting atau penghapusan, sebut objek dan konsekuensi:
  “Hapus jawaban ini?” dan “Jawaban yang dihapus tidak dapat dikembalikan.”
  Label tombol harus menyebut tindakan, misalnya “Hapus jawaban”.
- Pesan error menyebut hal yang gagal dan langkah pemulihan jika diketahui.
  Jangan menjanjikan data aman, penyimpanan otomatis, atau keberhasilan yang
  tidak dibuktikan implementasi.
- Untuk error di editor Tryout, jelaskan soal sebagai “soal dari Bank Soal”.
  Hindari istilah implementasi seperti “soal langsung” atau “soal salinan”; arahkan
  Kapten untuk memuat ulang, memilih soal kembali, atau membuat Tryout baru sesuai
  langkah yang tersedia di produk.
- Pesan berhasil menyebut hasil yang tercapai, misalnya “Tugas berhasil
  dikumpulkan.” Hindari “Berhasil!” tanpa konteks.
- Empty state menjelaskan apa yang belum ada dan, bila tersedia, apa yang dapat
  dilakukan selanjutnya. Loading state menyebut proses hanya jika pengguna
  perlu memahami jedanya.
- Gunakan instruksi yang tetap jelas untuk pembaca layar. Jangan mengandalkan
  warna, posisi, bentuk ikon, atau kata “klik di sini”. Beri nama aksesibel pada
  tombol ikon dan kontrol tanpa teks yang terlihat.
- Gunakan kapitalisasi kalimat dalam Bahasa Indonesia. Kapitalisasi khusus
  dipakai untuk nama brand dan nama fitur resmi, termasuk Vecalss, Voyager,
  Kapten, Kuis, dan Tryout.

## Bahasa dan istilah

- Gunakan istilah sesuai arti pada glosarium. Jangan menukar “kelas”, “Materi”,
  “unit”, “Kuis”, “Tryout”, “sesi”, dan “pengerjaan” demi variasi kata.
- Bedakan “mata pelajaran” dari “subtes”. Nama parameter atau field internal
  seperti `subjectSlug` tidak cukup untuk menentukan istilah antarmuka; gunakan
  istilah yang sesuai dengan objek dan konteks halamannya.
- Untuk penambahan akun dari CSV, gunakan “impor”, “draf”, dan “pratinjau”
  sesuai tahap prosesnya. Pratinjau belum mengubah akun; gunakan “Mulai impor”
  untuk tindakan yang memulai pemrosesan.
- Sebut kata sandi sementara atau tautan undangan sebagai “informasi akses”.
  Hindari istilah internal “handoff”. Jelaskan jika nilainya hanya ditampilkan
  sekali atau tautannya memiliki masa berlaku.
- Gunakan “Bank Soal”, “subtes”, “unggah”, “unduh”, dan “pratinjau” pada
  antarmuka berbahasa Indonesia; jangan tampilkan “Question Bank”, “Subtest”,
  “Upload”, “Download”, atau “Preview” sebagai label interaksi.
- Gunakan Bahasa Indonesia sebagai pilihan awal. Gunakan “kata sandi” untuk
  formulir dan “Masuk” untuk tindakan membuka akun; pertahankan “Email”, “FAQ”,
  dan nama fitur resmi seperti “Tryout” bila lebih mudah dipahami.
- Jangan menerjemahkan identifier, key, enum, route, atau kontrak internal.
  Perbaiki hanya teks yang ditampilkan kepada pengguna.
- Jangan tampilkan kode error, stack trace, nama layanan internal, UUID, detail
  teknis, atau penanda versi. Ubah menjadi penjelasan dan langkah berikutnya
  yang bisa dipahami pengguna.
