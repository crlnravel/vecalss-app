"""PBM 01 layout recipe. Every word is sliced from the original extraction."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def normalize(text):
    text = re.sub(r"--- PAGE \d+ ---", "", text)
    text = text.replace("\u200b", "").replace("\ufeff", "")
    return " ".join(text.split())


class Source:
    def __init__(self, text):
        self.text = normalize(text)

    def take(self, text):
        if not self.text.startswith(text):
            raise ValueError(f"Source mismatch: expected {text[:90]!r}, found {self.text[:100]!r}")
        self.text = self.text[len(text):].lstrip()
        return text

    def before(self, marker):
        if marker is None:
            result, self.text = self.text, ""
        else:
            end = self.text.index(marker)
            result, self.text = self.text[:end].rstrip(), self.text[end:]
        return result


def prepare():
    source = Source((ROOT / "pbm1.source.txt").read_text())
    pages = []

    def page(id, title, refs):
        if title:
            source.take(title)
        result = {"id": id, "title": title, "source_pages": refs, "blocks": []}
        if not title:
            result["continuation"] = True
        pages.append(result)
        return result["blocks"]

    def heading(blocks, text):
        blocks.append({"type": "heading", "text": source.take(text)})

    def paragraph(blocks, next_marker):
        text = source.before(next_marker)
        if text:
            blocks.append({"type": "paragraph", "text": text})

    def table(blocks, headers, rows, widths=None):
        for value in [*headers, *(v for row in rows for v in row)]:
            if value:
                source.take(value)
        block = {"type": "table", "headers": headers, "rows": rows}
        if widths:
            block["widths"] = widths
        blocks.append(block)

    def bullets(blocks, count, end, marker="•"):
        items = []
        for n in range(count):
            source.take(marker)
            items.append(source.before(marker if n < count-1 else end))
        blocks.append({"type": "bullets", "items": items, "marker": marker})

    def question(blocks, number, correct):
        source.take(f"{number}.")
        prompt = source.before("a. ")
        options = []
        for i, letter in enumerate("abcde"):
            source.take(f"{letter}.")
            option = source.before(f"{chr(ord(letter)+1)}. " if i < 4 else "Pembahasan:")
            # Preserve original answer emphasis; do not alter the question or key.
            if letter == correct:
                option = f"**{option}**"
            if number == 2 and letter != correct:
                for word in ("analisa", "hipotesa", "resiko", "sistim", "jadual", "fotocopy", "kwitansi"):
                    option = re.sub(rf"\b{word}\b", f"**{word}**", option)
            options.append(option)
        blocks.append({"type": "question", "id": str(number), "labels": "abcde", "prompt": prompt, "options": options})
        heading(blocks, "Pembahasan:")

    a = page("konsep-dasar", "MATERI 01 — Ejaan & Tanda Baca", [1])
    paragraph(a, "A. Konsep Dasar: EYD Edisi V")
    heading(a, "A. Konsep Dasar: EYD Edisi V")
    paragraph(a, "Perubahan penting EYD Edisi V yang wajib diketahui:")
    paragraph(a, "Aspek EYD/PUEBI Lama")
    table(a, ["Aspek", "EYD/PUEBI Lama", "EYD Edisi V (Berlaku Sekarang)"], [
        ["Diftong", "ai, au, oi (3 diftong)", "ai, au, oi, ei (4 diftong) — mengakomodasi kata seperti survei, geiser"],
        ["Huruf kapital untuk julukan", "belum ditegaskan", "Ditegaskan: julukan ikut kapital, mis. Jenderal Kancil, Pangeran Diponegoro"],
        ["Huruf tebal", "belum diatur khusus", "Aturan baru: menegaskan bagian yang sudah dimiringkan & judul bab/subbab karangan"]
    ], [1, 1.1, 1.8])
    paragraph(a, "B. Pemakaian Huruf")

    a = page("kapital", "B. Pemakaian Huruf", [1, 2])
    heading(a, "B1. Huruf Kapital")
    paragraph(a, "•")
    bullets(a, 10, "B2. Huruf Miring dan Huruf Tebal")

    a = page("miring-imbuhan", "B2. Huruf Miring dan Huruf Tebal", [3])
    table(a, ["Fungsi", "Contoh"], [
        ["Huruf miring — judul buku/film/media massa dalam kalimat", "Buku Salah Asuhan; film Habibie dan Ainun"],
        ["Huruf miring — menegaskan/mengkhususkan huruf atau kata", "Huruf terakhir kata abad adalah d"],
        ["Huruf miring — kata/ungkapan bahasa daerah, asing, atau nama ilmiah", "tut wuri handayani; Garcinia mangostana"],
        ["Huruf tebal (baru di EYD V) — menegaskan bagian yang sudah dimiringkan", "kata et pada frasa ora et labora"],
        ["Huruf tebal (baru di EYD V) — judul bab/subbab karangan", "BAB I PENDAHULUAN, 1.1 Latar Belakang"]
    ])
    paragraph(a, "C. Penulisan Kata")
    heading(a, "C. Penulisan Kata")
    heading(a, "C1. Kata Berimbuhan dan Kaidah Meluluh")
    paragraph(a, "Awalan meng-")
    paragraph(a, "C2. Bentuk Ulang dan Gabungan Kata")

    a = page("gabungan-kata", "C2. Bentuk Ulang dan Gabungan Kata", [3, 4])
    paragraph(a, "Aturan Gabungan Kata Contoh")
    table(a, ["Aturan Gabungan Kata", "Contoh"], [
        ["Umumnya ditulis terpisah", "duta besar, kambing hitam, meja tulis, orang tua"],
        ["Pakai tanda hubung bila berpotensi bermakna ganda", "anak-istri pejabat (2 orang) ≠ anak istri-pejabat (1 orang)"],
        ["Serangkai jika dapat awalan DAN akhiran sekaligus", "dilipatgandakan, pertanggungjawaban, menggarisbawahi"],
        ["Serangkai karena sudah dianggap satu kata padu", "acapkali, apalagi, bagaimanapun, seringkali, daripada"]
    ])
    paragraph(a, "C3. Kata Depan vs Awalan di-")

    a = page("kata-depan-partikel", "C3. Kata Depan vs Awalan di-", [4, 5])
    table(a, ["", "Kata Depan (Preposisi)", "Awalan di- (Prefiks)"], [
        ["Ditulis", "Terpisah", "Serangkai"],
        ["Diikuti oleh", "kata benda/keterangan tempat", "kata kerja (bentuk pasif)"],
        ["Uji cepat", "tidak bisa diubah jadi kalimat aktif", 'bisa diubah jadi aktif ("dimakan" → "memakan")'],
        ["Contoh benar", "di rumah, ke kantor, di mana, ke depan", "dimakan, ditulis, dibawa"]
    ], [0.7, 1.5, 1.5])
    paragraph(a, "C4. Partikel, Singkatan, Akronim, Angka")
    heading(a, "C4. Partikel, Singkatan, Akronim, Angka")
    bullets(a, 6, "D. Pemakaian Tanda Baca")

    a = page("titik-koma", "D. Pemakaian Tanda Baca", [5, 6])
    heading(a, "D1. Titik (.) dan Koma (,)")
    paragraph(a, "Koma — tiga aturan paling sering diuji UTBK:")
    paragraph(a, "Aturan Koma Contoh")
    table(a, ["Aturan Koma", "Contoh"], [
        ['Antarunsur perincian ≥3 unsur, sebelum "dan/atau" terakhir', "Telepon, komputer, atau internet bukan hal asing."],
        ["Sebelum konjungsi setara tetapi, sedangkan, melainkan", "Dia rajin belajar, tetapi nilai ujiannya tetap rendah."],
        ["Anak kalimat mendahului induk kalimat → pakai koma; anak kalimat mengikuti induk kalimat (setelah karena, sehingga, agar, jika) → tidak pakai koma", "Karena macet, saya datang terlambat. (koma) ↔ Saya datang terlambat karena macet. (tanpa koma)"]
    ])
    paragraph(a, "D2. Titik Dua (:) dan Titik Koma (;)")

    a = page("titik-dua-hubung-pisah", "D2. Titik Dua (:) dan Titik Koma (;)", [6, 7])
    bullets(a, 3, "D3. Tanda Hubung (-) vs Tanda Pisah (–)")
    heading(a, "D3. Tanda Hubung (-) vs Tanda Pisah (–)")
    table(a, ["", "Tanda Hubung (-)", "Tanda Pisah (–)"], [
        ["Fungsi utama", "Menyambung dua unsur setara/berpasangan atau bentuk ulang", 'Menyatakan rentang (waktu, tempat, angka) bermakna "sampai dengan"'],
        ["Contoh", "Soekarno-Hatta; Indonesia-Malaysia; anak-anak", "Tahun 2019–2022; Senin–Jumat; Jakarta–Bandung"]
    ], [0.8, 1.5, 1.5])
    paragraph(a, "D4. Tanda Baca Lainnya")

    a = page("tanda-baca-lain", "D4. Tanda Baca Lainnya", [7])
    bullets(a, 5, "E. Ringkasan Kilat")

    a = page("ringkasan-awal", "E. Ringkasan Kilat — 16 Jebakan Ejaan & Tanda Baca yang Paling Sering Muncul", [7, 8])
    paragraph(a, "Jangan Tulis Tulis Jangan Tulis Tulis")
    table(a, ["Jangan Tulis", "Tulis", "Jangan Tulis", "Tulis"], [
        ["dimana, disini, kesana", "di mana, di sini, ke sana", "kedepan, kebelakang", "ke depan, ke belakang"],
        ["Gubernur Jawa Barat hadir (semua gubernur, tanpa nama)", 'huruf kecil "gubernur" jika tanpa nama diri', "jalan ke arah Timur kota", "jalan ke arah timur kota (arah biasa)"],
        ['sering kali (dalam makna "acapkali")', "seringkali", "mengkonfirmasi, mengkritisi", "mengonfirmasi (cek kaidah luluh per kata)"],
        ["Saya terlambat, karena macet", "Saya terlambat karena macet (tanpa koma)", "anak2, berulang2", "anak-anak, berulang-ulang"]
    ])
    a = page("ringkasan-lanjut", "", [8])
    table(a, ["", "", "", ""], [
        ["praktek, resiko, apotik, aktifitas", "praktik, risiko, apotek, aktivitas", "analisa, hipotesa, atlit", "analisis, hipotesis, atlet"],
        ["Sumatera, Perancis", "Sumatra, Prancis", "Dr. Ahmad, SPd (tanpa titik gelar akhir)", "Dr. Ahmad, S.Pd."],
        ['Buku itu berjudul: "Laskar Pelangi"', 'Buku itu berjudul "Laskar Pelangi". (tanpa titik dua)', 'Ali bin Abu Thalib → "Bin" dikapitalkan', "Ali bin Abu Thalib (bin selalu huruf kecil)"],
        ["PEMILU, IPTEK ditulis kapital di kalimat biasa", "pemilu, iptek (akronim bukan nama diri = huruf kecil)", 'merubah (kata dasar dikira "rubah")', 'mengubah (kata dasarnya "ubah")']
    ])

    a = page("strategi", "F. Strategi Mengerjakan Soal Ejaan dan Tanda Baca UTBK", [8, 9])
    paragraph(a, "1.")
    items = []
    for n in range(1, 7):
        source.take(f"{n}.")
        items.append(source.before(f"{n+1}." if n < 6 else "G. Contoh Soal Beserta Pembahasan"))
    a.append({"type": "steps", "items": items})

    a = page("soal-1", "G. Contoh Soal Beserta Pembahasan", [9])
    question(a, 1, "d")
    for marker in ("Opsi A salah", "Opsi B salah", "Opsi C salah", "Opsi E salah", "2. Kalimat berikut"):
        paragraph(a, marker)
    a = page("soal-2", "", [10])
    question(a, 2, "c")
    for marker in ("Opsi A tidak baku", "Opsi B tidak baku", "Opsi D tidak baku", "Opsi E tidak baku", "3. Kalimat manakah"):
        paragraph(a, marker)
    a = page("soal-3", "", [10, 11])
    question(a, 3, "a")
    for marker in ("Opsi B salah", "Opsi C salah", "Opsi D salah", "Opsi E salah", "4. Perhatikan kalimat berikut"):
        paragraph(a, marker)
    a = page("soal-4", "", [11, 12])
    question(a, 4, "b")
    for marker in ("Pada kalimat soal", "Sebaliknya,", '"lintas-sektor" sudah benar', "Jawaban yang tepat adalah B.", "🦆 VECO TIPS"):
        paragraph(a, marker)

    a = page("tips", "🦆 VECO TIPS — Cara Cepat & Trik Khusus", [12])
    heading(a, "💡 Veco Tips 1: Trik Hapus Mental!")
    paragraph(a, "💡 Veco Tips 2: Ide Pokok ≠ Kalimat Pertama")
    heading(a, "💡 Veco Tips 2: Ide Pokok ≠ Kalimat Pertama")
    paragraph(a, "⚠️ Kesalahan Umum yang Sering Terjadi")
    heading(a, "⚠️ Kesalahan Umum yang Sering Terjadi")
    bullets(a, 4, None, "●")
    if source.text:
        raise ValueError("Unconsumed source content")

    # Presentation only: group each original tip/warning heading with its paragraph or bullets.
    tip_blocks = pages[-1]["blocks"]
    pages[-1]["blocks"] = [
        {"type": "tip", "title": tip_blocks[0]["text"], "text": tip_blocks[1]["text"]},
        {"type": "tip", "title": tip_blocks[2]["text"], "text": tip_blocks[3]["text"]},
        {"type": "tip", "title": tip_blocks[4]["text"], "items": tip_blocks[5]["items"], "marker": tip_blocks[5]["marker"]},
    ]

    # Reapply source italic semantics to examples; words are not changed.
    italics = ("Salah Asuhan", "Habibie dan Ainun", "tut wuri handayani", "Garcinia mangostana", "ora et labora", "Dari Ave Maria ke Jalan Lain ke Roma")
    def emphasize(text):
        for term in italics:
            text = text.replace(term, f"*{term}*")
        return text
    for p in pages:
        for block in p["blocks"]:
            for key in ("text",):
                if key in block:
                    block[key] = emphasize(block[key])
            if block["type"] in ("bullets", "tip") and "items" in block:
                block["items"] = [emphasize(i) for i in block["items"]]
            if block["type"] == "table":
                block["rows"] = [[emphasize(v) for v in row] for row in block["rows"]]
    lesson = {"title": "MATERI 01 — Ejaan & Tanda Baca", "code": "PBM",
              "subject": "Pemahaman Bacaan & Menulis", "source": "materi/pbm1.pdf",
              "verbatim": True, "pages": pages}
    (ROOT / "pbm1.lesson.json").write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n")
    print(f"Prepared {len(pages)} logical pages from complete original text")


if __name__ == "__main__":
    prepare()
