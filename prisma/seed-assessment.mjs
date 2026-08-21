import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

function revisionDigest({ difficulty, explanation, options, stem }) {
  const parts = [
    "question-revision-digest-v1",
    difficulty,
    explanation ?? "",
    "",
    ...options.flatMap((option) => [
      "",
      option.content,
      String(option.isCorrect),
      option.label,
      String(option.sortOrder),
    ]),
    stem,
    "",
    "single_choice",
  ];
  return createHash("sha256")
    .update(parts.map((part) => Buffer.from(part, "utf8").toString("hex")).join(":"), "utf8")
    .digest("hex");
}

const SUBJECTS = [
  { code: "PU", slug: "penalaran-umum", label: "Penalaran Umum" },
  { code: "PPU", slug: "pengetahuan-pemahaman-umum", label: "Pengetahuan dan Pemahaman Umum" },
  { code: "PBM", slug: "pemahaman-bacaan-menulis", label: "Pemahaman Bacaan dan Menulis" },
  { code: "PK", slug: "pengetahuan-kuantitatif", label: "Pengetahuan Kuantitatif" },
  { code: "LBI", slug: "literasi-bahasa-indonesia", label: "Literasi Bahasa Indonesia" },
  { code: "LBE", slug: "literasi-bahasa-inggris", label: "Literasi Bahasa Inggris" },
  { code: "PM", slug: "penalaran-matematika", label: "Penalaran Matematika" },
];

const QUESTIONS = [
  {
    subjectCode: "PU",
    difficulty: "easy",
    stem: "Semua peserta yang lolos seleksi administrasi mengikuti wawancara. Nanda tidak mengikuti wawancara. Simpulan yang tepat adalah...",
    explanation: "Jika mengikuti wawancara merupakan syarat bagi semua peserta yang lolos administrasi, Nanda tidak termasuk peserta yang lolos tahap tersebut.",
    options: ["Nanda tidak lolos seleksi administrasi.", "Nanda mengundurkan diri setelah wawancara.", "Nanda lolos melalui jalur lain.", "Hasil seleksi Nanda belum dapat diketahui."],
    correctIndex: 0,
  },
  {
    subjectCode: "PU",
    difficulty: "medium",
    stem: "Sebuah survei menunjukkan bahwa siswa yang membaca sedikitnya tiga kali seminggu cenderung memiliki kosakata lebih luas. Pernyataan yang paling hati-hati adalah...",
    explanation: "Survei menunjukkan hubungan, tetapi tidak cukup untuk menetapkan sebab tunggal atau berlaku kepada setiap siswa.",
    options: ["Membaca tiga kali seminggu menjamin nilai bahasa yang tinggi.", "Kebiasaan membaca berkaitan dengan keluasan kosakata pada responden survei.", "Kosakata hanya dapat ditingkatkan dengan membaca.", "Semua siswa yang jarang membaca memiliki kosakata terbatas."],
    correctIndex: 1,
  },
  {
    subjectCode: "PU",
    difficulty: "hard",
    stem: "Klaim bahwa kelas pagi selalu lebih efektif dibuat berdasarkan hasil satu kelas. Informasi yang paling melemahkan klaim tersebut adalah...",
    explanation: "Hasil dari beberapa kelas dengan kondisi berbeda menunjukkan bahwa kesimpulan universal dari satu kelas terlalu luas.",
    options: ["Kelas tersebut memiliki jendela yang besar.", "Sebagian siswa membawa sarapan.", "Tiga kelas lain memperoleh hasil setara pada jadwal siang.", "Guru mencatat kehadiran setiap pertemuan."],
    correctIndex: 2,
  },
  {
    subjectCode: "PPU",
    difficulty: "easy",
    stem: "Dalam kalimat 'Kebijakan itu perlu ditinjau secara berkala agar tetap relevan', makna kata relevan adalah...",
    explanation: "Relevan berarti masih memiliki hubungan atau kesesuaian dengan keadaan yang sedang dihadapi.",
    options: ["Sesuai dengan kebutuhan saat ini", "Sulit untuk diterapkan", "Ditetapkan secara permanen", "Disukai oleh semua pihak"],
    correctIndex: 0,
  },
  {
    subjectCode: "PPU",
    difficulty: "medium",
    stem: "Kalimat 'Ruang terbuka kota tidak hanya memperbaiki kualitas udara, tetapi juga menyediakan tempat interaksi warga' menunjukkan hubungan...",
    explanation: "Struktur 'tidak hanya ..., tetapi juga ...' menambahkan manfaat kedua kepada manfaat pertama.",
    options: ["Perlawanan", "Penambahan", "Sebab-akibat", "Perbandingan"],
    correctIndex: 1,
  },
  {
    subjectCode: "PPU",
    difficulty: "hard",
    stem: "Kata yang paling tepat menggantikan 'mengikis' dalam kalimat 'Informasi keliru dapat mengikis kepercayaan publik' adalah...",
    explanation: "Dalam konteks tersebut, mengikis berarti mengurangi secara bertahap.",
    options: ["Membangun", "Mengurangi", "Mengalihkan", "Menegaskan"],
    correctIndex: 1,
  },
  {
    subjectCode: "PBM",
    difficulty: "easy",
    stem: "Kalimat yang menggunakan konjungsi sebab-akibat secara tepat adalah...",
    explanation: "Konjungsi 'sehingga' menghubungkan sebab pada klausa pertama dengan akibat pada klausa kedua.",
    options: ["Rina belajar teratur sehingga lebih siap menghadapi ujian.", "Rina belajar teratur tetapi lebih siap menghadapi ujian.", "Rina belajar teratur atau lebih siap menghadapi ujian.", "Rina belajar teratur namun karena lebih siap menghadapi ujian."],
    correctIndex: 0,
  },
  {
    subjectCode: "PBM",
    difficulty: "medium",
    stem: "Perbaikan paling efektif untuk kalimat 'Para siswa-siswa diminta untuk mengumpulkan tugas agar supaya dapat dinilai' adalah...",
    explanation: "Bentuk jamak ganda dan pasangan penghubung yang berlebihan perlu dihilangkan.",
    options: ["Para siswa diminta mengumpulkan tugas agar dapat dinilai.", "Siswa-siswa diminta untuk mengumpulkan tugas agar supaya dinilai.", "Para siswa-siswa mengumpulkan tugas untuk agar dinilai.", "Siswa diminta agar supaya tugas dapat untuk dinilai."],
    correctIndex: 0,
  },
  {
    subjectCode: "PBM",
    difficulty: "hard",
    stem: "Urutan yang paling logis untuk paragraf eksposisi adalah...",
    explanation: "Paragraf eksposisi yang padu bergerak dari pernyataan utama menuju alasan, bukti, lalu penegasan.",
    options: ["Bukti, judul, alasan, salam", "Pernyataan utama, alasan, bukti, penegasan", "Penegasan, bukti, pertanyaan, alasan", "Alasan, salam, pernyataan utama, bukti"],
    correctIndex: 1,
  },
  {
    subjectCode: "PK",
    difficulty: "easy",
    stem: "Harga sebuah buku Rp80.000 mendapat potongan 15%. Harga setelah potongan adalah...",
    explanation: "Potongan 15% dari Rp80.000 adalah Rp12.000, sehingga harga akhirnya Rp68.000.",
    options: ["Rp65.000", "Rp68.000", "Rp72.000", "Rp74.000"],
    correctIndex: 1,
  },
  {
    subjectCode: "PK",
    difficulty: "medium",
    stem: "Rasio peserta kelas A dan kelas B adalah 5 : 7. Jika jumlah seluruh peserta 96 orang, jumlah peserta kelas B adalah...",
    explanation: "Dua belas bagian bernilai 96, jadi setiap bagian bernilai 8. Kelas B berjumlah 7 × 8 = 56 orang.",
    options: ["40", "48", "56", "64"],
    correctIndex: 2,
  },
  {
    subjectCode: "PK",
    difficulty: "hard",
    stem: "Nilai rata-rata lima ujian adalah 78. Setelah satu nilai tambahan dimasukkan, rata-ratanya menjadi 80. Nilai tambahan tersebut adalah...",
    explanation: "Jumlah lima nilai adalah 390, sedangkan jumlah enam nilai harus 480. Nilai tambahan adalah 90.",
    options: ["82", "86", "88", "90"],
    correctIndex: 3,
  },
  {
    subjectCode: "LBI",
    difficulty: "easy",
    stem: "Sebuah paragraf menjelaskan bahwa perpustakaan memperpanjang jam layanan, menambah koleksi digital, dan membuka ruang diskusi. Gagasan utamanya adalah...",
    explanation: "Ketiga rincian tersebut merupakan bentuk peningkatan layanan perpustakaan.",
    options: ["Perpustakaan meningkatkan layanan bagi pengunjung.", "Koleksi digital menggantikan seluruh buku cetak.", "Ruang diskusi hanya dibuka pada malam hari.", "Pengunjung diwajibkan membawa perangkat sendiri."],
    correctIndex: 0,
  },
  {
    subjectCode: "LBI",
    difficulty: "medium",
    stem: "Penulis menyajikan data penurunan sampah plastik lalu menguraikan kebijakan yang diterapkan. Tujuan penulis paling mungkin adalah...",
    explanation: "Data dan uraian kebijakan digunakan untuk menjelaskan hasil serta langkah yang berkaitan dengannya.",
    options: ["Menghibur pembaca dengan cerita", "Menjelaskan perubahan dan kebijakan yang mendasarinya", "Menyalahkan satu kelompok masyarakat", "Mempromosikan produk tertentu"],
    correctIndex: 1,
  },
  {
    subjectCode: "LBI",
    difficulty: "hard",
    stem: "Dalam ulasan yang menyebut suatu kebijakan 'menjanjikan, meskipun pelaksanaannya belum merata', sikap penulis adalah...",
    explanation: "Penulis mengakui potensi kebijakan sambil tetap menyampaikan keterbatasan pelaksanaannya.",
    options: ["Sepenuhnya menolak", "Mendukung tanpa catatan", "Mengapresiasi dengan sikap kritis", "Tidak memiliki pendapat"],
    correctIndex: 2,
  },
  {
    subjectCode: "LBE",
    difficulty: "easy",
    stem: "The word 'decline' in the sentence 'The number of late arrivals began to decline' is closest in meaning to...",
    explanation: "In this context, 'decline' means to become smaller or fewer.",
    options: ["decrease", "remain", "appear", "return"],
    correctIndex: 0,
  },
  {
    subjectCode: "LBE",
    difficulty: "medium",
    stem: "A passage describes how shaded sidewalks encourage more people to walk during hot weather. What is the main idea?",
    explanation: "The passage connects a design feature, shade, with greater willingness to walk in hot conditions.",
    options: ["Hot weather prevents all outdoor activity.", "Shaded pedestrian routes can support walking in warm climates.", "Sidewalks are more expensive than roads.", "People only walk when public transport is unavailable."],
    correctIndex: 1,
  },
  {
    subjectCode: "LBE",
    difficulty: "hard",
    stem: "The author calls the initial findings 'useful but not conclusive.' This phrase suggests that the findings...",
    explanation: "The phrase recognizes value in the findings while stating that further evidence is still required.",
    options: ["should be ignored completely", "prove the claim beyond doubt", "provide direction but require more evidence", "are unrelated to the research question"],
    correctIndex: 2,
  },
  {
    subjectCode: "PM",
    difficulty: "easy",
    stem: "Sebuah bus menempuh 120 km dalam 3 jam dengan kecepatan tetap. Jarak yang ditempuh dalam 5 jam adalah...",
    explanation: "Kecepatan bus 40 km per jam, sehingga dalam 5 jam jaraknya 200 km.",
    options: ["160 km", "180 km", "200 km", "240 km"],
    correctIndex: 2,
  },
  {
    subjectCode: "PM",
    difficulty: "medium",
    stem: "Sebuah tangki terisi 3/5 bagian. Setelah ditambah 24 liter, tangki menjadi penuh. Kapasitas tangki adalah...",
    explanation: "Tambahan 24 liter mengisi 2/5 kapasitas, jadi kapasitas penuh adalah 24 × 5/2 = 60 liter.",
    options: ["40 liter", "48 liter", "60 liter", "72 liter"],
    correctIndex: 2,
  },
  {
    subjectCode: "PM",
    difficulty: "hard",
    stem: "Jumlah dua bilangan adalah 46. Bilangan pertama 8 lebih besar daripada bilangan kedua. Bilangan pertama adalah...",
    explanation: "Jika bilangan kedua x, maka x + (x + 8) = 46. Diperoleh x = 19 dan bilangan pertama 27.",
    options: ["23", "25", "27", "29"],
    correctIndex: 2,
  },
].map((question, index) => ({ ...question, code: `seed:demo:question:${question.subjectCode.toLowerCase()}:${index + 1}` }));

const BANK = {
  code: "seed:assessment:mixed-subject-bank:v1",
  name: "Bank Soal Evaluasi UTBK",
  description: "Kumpulan soal yang telah ditinjau untuk latihan, penyusunan paket, dan simulasi tujuh subtes UTBK.",
};

const TRYOUT = {
  code: "seed:assessment:tryout:evaluasi-program:v1",
  idempotencyKey: "seed:assessment:tryout:evaluasi-program:v1",
  title: "Simulasi UTBK SNBT — Evaluasi Tengah Program",
  description: "Simulasi tujuh subtes untuk menilai kemajuan belajar dan menentukan prioritas pembahasan berikutnya.",
};

const TRYOUT_SCORE_AGGREGATION_VERSION = "normalized-test-mean-v1";

function roundInternalScore(value) {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

function normalizeSeedCbtScore(score, maxScore) {
  return roundInternalScore((score / maxScore) * 100);
}

function normalizeSeedCatAbility(ability) {
  const probability = ability >= 0
    ? 1 / (1 + Math.exp(-ability))
    : Math.exp(ability) / (1 + Math.exp(ability));
  return roundInternalScore(probability * 100);
}

function aggregateSeedTryoutScores(scores) {
  return roundInternalScore(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the assessment seed.");
  return databaseUrl;
}

async function resolveUser(client, email, role) {
  const result = await client.query(
    `SELECT users.id
       FROM users
       JOIN role_assignments ON role_assignments.user_id = users.id
        AND role_assignments.role = $2::role_name
        AND role_assignments.revoked_at IS NULL
      WHERE LOWER(users.email) = LOWER($1)
        AND users.status = 'active'
      LIMIT 1`,
    [email, role],
  );
  if (!result.rowCount) throw new Error(`The assessment seed requires an active ${role} account for ${email}. Run pnpm db:seed first.`);
  return result.rows[0].id;
}

async function resolveSubtests(client) {
  const result = await client.query(
    "SELECT id, code FROM subtests WHERE code = ANY($1::text[]) AND is_active = TRUE",
    [SUBJECTS.map(({ code }) => code)],
  );
  const subtestIds = new Map(result.rows.map((row) => [row.code, row.id]));
  const missing = SUBJECTS.reduce((codes, { code }) => {
    if (!subtestIds.has(code)) codes.push(code);
    return codes;
  }, []);
  if (missing.length) throw new Error(`Missing active subtests: ${missing.join(", ")}. Run the Materi seed before the assessment seed.`);
  return subtestIds;
}

async function upsertQuestionBank(client, tutorId) {
  const result = await client.query(
    `INSERT INTO question_banks (code, name, description, status, revision, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, 'published', 1, $4, $4)
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           status = 'published',
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()
     RETURNING id`,
    [BANK.code, BANK.name, BANK.description, tutorId],
  );
  return result.rows[0].id;
}

async function upsertQuestions(client, { bankId, subtestIds, tutorId }) {
  const seeded = [];
  for (const question of QUESTIONS) {
    const questionResult = await client.query(
      `INSERT INTO questions (
         code, question_bank_id, subtest_id, stem, question_type, difficulty,
         explanation, status, source, revision, current_revision_id,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, 'single_choice', $5::difficulty_level, $6, 'published', 'Tim Akademik Vecalss', 1, gen_random_uuid(), $7, $7)
       ON CONFLICT (code) DO UPDATE
         SET question_bank_id = EXCLUDED.question_bank_id,
             subtest_id = EXCLUDED.subtest_id,
             status = 'published',
             source = EXCLUDED.source,
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = NOW()
       RETURNING id, current_revision_id, revision`,
      [question.code, bankId, subtestIds.get(question.subjectCode), question.stem, question.difficulty, question.explanation, tutorId],
    );
    const questionId = questionResult.rows[0].id;
    const currentRevisionId = questionResult.rows[0].current_revision_id;
    const optionIds = [];
    for (const [optionIndex, content] of question.options.entries()) {
      const label = String.fromCharCode(65 + optionIndex);
      const optionResult = await client.query(
        `INSERT INTO question_options (question_id, label, content, is_correct, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (question_id, label) DO NOTHING
         RETURNING id`,
        [questionId, label, content, optionIndex === question.correctIndex, optionIndex],
      );
      optionIds.push(optionResult.rows[0]?.id);
    }
    const options = question.options.map((content, sortOrder) => ({ content, isCorrect: sortOrder === question.correctIndex, label: String.fromCharCode(65 + sortOrder), sortOrder }));
    const contentDigest = revisionDigest({ difficulty: question.difficulty, explanation: question.explanation, options, stem: question.stem });
    const currentRevision = await client.query(
      `SELECT id, revision_no, content_digest
         FROM question_revisions
        WHERE id = $1`,
      [currentRevisionId],
    );
    let revisionId = currentRevisionId;
    let revisionNo = currentRevision.rows[0]?.revision_no ?? 0;
    if (!currentRevision.rows[0] || currentRevision.rows[0].content_digest !== contentDigest) {
      revisionId = currentRevision.rows[0] ? randomUUID() : currentRevisionId;
      revisionNo += 1;
      await client.query(
        `INSERT INTO question_revisions (
           id, question_id, revision_no, status, provenance, stem, question_type,
           difficulty, explanation, content_digest, created_by_user_id,
           updated_by_user_id, ready_at
         ) VALUES ($1, $2, $3, 'draft', 'authored', $4, 'single_choice', $5::difficulty_level, $6, $7, $8, $8, NULL)`,
        [revisionId, questionId, revisionNo, question.stem, question.difficulty, question.explanation, contentDigest, tutorId],
      );
      for (const option of options) {
        await client.query(
          `INSERT INTO question_revision_options (
             question_revision_id, label, content, is_correct, sort_order
           ) VALUES ($1, $2, $3, $4, $5)`,
          [revisionId, option.label, option.content, option.isCorrect, option.sortOrder],
        );
      }
      await client.query(
        `UPDATE question_revisions
            SET status = 'ready',
                ready_at = NOW()
          WHERE id = $1`,
        [revisionId],
      );
      await client.query(
        `UPDATE questions
            SET current_revision_id = $1,
                revision = $2,
                stem = $3,
                difficulty = $4::difficulty_level,
                explanation = $5,
                status = 'published',
                updated_by_user_id = $6,
                updated_at = NOW()
          WHERE id = $7`,
        [revisionId, revisionNo, question.stem, question.difficulty, question.explanation, tutorId, questionId],
      );
    }
    const revisionOptionResult = await client.query(
      `SELECT id
         FROM question_revision_options
        WHERE question_revision_id = $1
        ORDER BY sort_order`,
      [revisionId],
    );
    const existingOptionResult = await client.query(
      `SELECT id
         FROM question_options
        WHERE question_id = $1
        ORDER BY sort_order`,
      [questionId],
    );
    seeded.push({ ...question, contentDigest, id: questionId, optionIds: existingOptionResult.rows.map((row, index) => optionIds[index] ?? row.id), revisionId, revisionOptionIds: revisionOptionResult.rows.map((row) => row.id), subtestId: subtestIds.get(question.subjectCode) });
  }
  return seeded;
}

async function upsertCalibrations(client, tutorId, questions) {
  const difficultyByLevel = { easy: -0.8, medium: 0, hard: 0.9 };
  for (const [index, question] of questions.entries()) {
    await client.query(
      `INSERT INTO two_pl_question_calibrations (
         question_id, question_revision_id, content_digest, model_version, discrimination, difficulty, approval_state,
         recorded_by_user_id, approved_by_user_id, approved_at, audit_reason
       )
       VALUES ($1, $2, $3, '2pl-canonical-v1', $4, $5, 'approved', $6, $6, NOW(), $7)
       ON CONFLICT (question_revision_id, model_version) DO UPDATE
         SET discrimination = EXCLUDED.discrimination,
             difficulty = EXCLUDED.difficulty,
             approval_state = 'approved',
             approved_by_user_id = EXCLUDED.approved_by_user_id,
             approved_at = NOW(),
             audit_reason = EXCLUDED.audit_reason`,
      [question.id, question.revisionId, question.contentDigest, (1.05 + (index % 4) * 0.12).toFixed(2), difficultyByLevel[question.difficulty], tutorId, "Parameter latihan disetujui untuk demonstrasi alur CAT dan tidak digunakan sebagai acuan psikometrik produksi."],
    );
  }
}

async function seedReusablePackages(client, { bankId, questions, subtestIds, tutorId }) {
  const versionIds = new Map();
  for (const subject of SUBJECTS) {
    const subjectQuestions = questions.filter((question) => question.subjectCode === subject.code);
    const packageCode = `seed:demo:package:${subject.code.toLowerCase()}:v1`;
    const packageResult = await client.query(
      `INSERT INTO reusable_question_packages (
         code, title, description, source_bank_id, subtest_id, status, revision,
         created_by_user_id, updated_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, 'published', 1, $6, $6)
       ON CONFLICT (code) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description,
             status = 'published',
             updated_by_user_id = EXCLUDED.updated_by_user_id,
             updated_at = NOW()
       RETURNING id`,
      [packageCode, `Paket ${subject.label} — Evaluasi Program`, `Tiga soal ${subject.label} yang telah ditinjau untuk latihan terstruktur dan simulasi UTBK.`, bankId, subtestIds.get(subject.code), tutorId],
    );
    const packageId = packageResult.rows[0].id;
    for (const [index, question] of subjectQuestions.entries()) {
      await client.query(
        `INSERT INTO reusable_question_package_items (
           package_id, source_question_id, source_question_revision_id,
           source_content_digest, source_revision_provenance, sort_order, point_value
         ) VALUES ($1, $2, $3, $4, 'authored', $5, 1)
         ON CONFLICT (package_id, source_question_id) DO UPDATE
           SET source_question_revision_id = EXCLUDED.source_question_revision_id,
               source_content_digest = EXCLUDED.source_content_digest,
               source_revision_provenance = EXCLUDED.source_revision_provenance,
               sort_order = EXCLUDED.sort_order,
               point_value = EXCLUDED.point_value`,
        [packageId, question.id, question.revisionId, question.contentDigest, index + 1],
      );
    }

    let versionResult = await client.query(
      "SELECT id, status FROM reusable_question_package_versions WHERE package_id = $1 AND version_no = 1",
      [packageId],
    );
    if (!versionResult.rowCount) {
      versionResult = await client.query(
        `INSERT INTO reusable_question_package_versions (
           package_id, source_bank_id, version_no, status, created_by_user_id
         ) VALUES ($1, $2, 1, 'draft', $3)
         RETURNING id, status`,
        [packageId, bankId, tutorId],
      );
    }
    const version = versionResult.rows[0];
    if (version.status !== "published") {
      await client.query("DELETE FROM reusable_question_package_version_items WHERE package_version_id = $1", [version.id]);
      for (const [index, question] of subjectQuestions.entries()) {
        const itemResult = await client.query(
          `INSERT INTO reusable_question_package_version_items (
             package_version_id, source_question_id, sort_order, point_value,
             source_question_revision_id, source_content_digest, source_revision_provenance,
             prompt, explanation, difficulty, subtest_id
           ) VALUES ($1, $2, $3, 1, $4, $5, 'authored', $6, $7, $8::difficulty_level, $9)
           RETURNING id`,
          [version.id, question.id, index + 1, question.revisionId, question.contentDigest, question.stem, question.explanation, question.difficulty, question.subtestId],
        );
        for (const [optionIndex, content] of question.options.entries()) {
          await client.query(
            `INSERT INTO reusable_question_package_version_item_options (
               package_version_item_id, choice_key, content, is_correct, sort_order,
               source_question_option_id, source_question_revision_option_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [itemResult.rows[0].id, String.fromCharCode(65 + optionIndex), content, optionIndex === question.correctIndex, optionIndex, null, question.revisionOptionIds[optionIndex]],
          );
        }
      }
      await client.query(
        "UPDATE reusable_question_package_versions SET status = 'published', ready_at = NOW() WHERE id = $1",
        [version.id],
      );
    }
    versionIds.set(subject.code, version.id);
  }
  return versionIds;
}

async function seedQuizzes(client, { bankId, questions, studentIds, subtestIds, tutorId }) {
  const quizIds = new Map();
  await client.query(
    `UPDATE standalone_quizzes
        SET slug = 'arsip-latihan-penalaran-umum-v1',
            title = 'Arsip Latihan Penalaran Umum — Versi Sebelumnya',
            description = 'Riwayat latihan yang dipertahankan karena telah memiliki pengumpulan dari siswa.',
            status = 'archived',
            updated_at = NOW()
      WHERE idempotency_key = 'seed:assessment:quiz:pu-inferensi:v1'`,
  );
  for (const subject of SUBJECTS) {
    const subjectQuestions = questions.filter((question) => question.subjectCode === subject.code);
    const idempotencyKey = `seed:demo:quiz:${subject.code.toLowerCase()}:v1`;
    const quizResult = await client.query(
      `INSERT INTO standalone_quizzes (
         slug, title, description, subtest_id, source_bank_id, status,
         opens_at, closes_at, revision, idempotency_key, created_by_user_id
       )
       VALUES ($1, $2, $3, $4, $5, 'published', NOW() - INTERVAL '30 days', NOW() + INTERVAL '180 days', 1, $6, $7)
       ON CONFLICT (idempotency_key) DO UPDATE
         SET slug = EXCLUDED.slug,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             subtest_id = EXCLUDED.subtest_id,
             source_bank_id = EXCLUDED.source_bank_id,
             status = 'published',
             opens_at = EXCLUDED.opens_at,
             closes_at = EXCLUDED.closes_at,
             updated_at = NOW()
       RETURNING id`,
      [`latihan-${subject.slug}`, `Latihan ${subject.label} — Tinjauan Konsep`, `Latihan singkat untuk meninjau pemahaman konsep utama ${subject.label}.`, subtestIds.get(subject.code), bankId, idempotencyKey, tutorId],
    );
    const quizId = quizResult.rows[0].id;
    quizIds.set(subject.code, quizId);
    const attempts = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM standalone_quiz_attempts attempts
         JOIN standalone_quiz_participations participations ON participations.id = attempts.participation_id
        WHERE participations.quiz_id = $1`,
      [quizId],
    );
    if (attempts.rows[0].count === 0) {
      await client.query("DELETE FROM standalone_quiz_items WHERE quiz_id = $1", [quizId]);
      for (const [index, question] of subjectQuestions.entries()) {
        const itemResult = await client.query(
          `INSERT INTO standalone_quiz_items (
             quiz_id, sort_order, prompt, explanation, difficulty, subtest_id,
             source_question_id, source_question_revision_id, source_content_digest,
             source_revision_provenance, idempotency_key
           ) VALUES ($1, $2, $3, $4, $5::difficulty_level, $6, $7, $8, $9, 'authored', $10)
           RETURNING id`,
          [quizId, index + 1, question.stem, question.explanation, question.difficulty, question.subtestId, question.id, question.revisionId, question.contentDigest, `seed:demo:quiz-item:${subject.code.toLowerCase()}:${index + 1}`],
        );
        for (const [optionIndex, content] of question.options.entries()) {
          await client.query(
            `INSERT INTO standalone_quiz_item_options (
               quiz_item_id, choice_key, content, is_correct, sort_order,
               source_question_option_id, source_question_revision_option_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [itemResult.rows[0].id, String.fromCharCode(65 + optionIndex), content, optionIndex === question.correctIndex, optionIndex, null, question.revisionOptionIds[optionIndex]],
          );
        }
      }
    }
  }

  const quizAttempts = [
    { subjectCode: "PU", studentId: studentIds.primary, correctPattern: [true, true, false], submittedDaysAgo: 4 },
    { subjectCode: "PK", studentId: studentIds.primary, correctPattern: [true, false, true], submittedDaysAgo: 2 },
    { subjectCode: "LBI", studentId: studentIds.completed, correctPattern: [true, true, true], submittedDaysAgo: 3 },
  ];
  for (const fixture of quizAttempts) {
    const quizId = quizIds.get(fixture.subjectCode);
    const existing = await client.query(
      `SELECT attempts.id
         FROM standalone_quiz_attempts attempts
         JOIN standalone_quiz_participations participations ON participations.id = attempts.participation_id
        WHERE participations.quiz_id = $1 AND participations.student_id = $2`,
      [quizId, fixture.studentId],
    );
    if (existing.rowCount) continue;
    const itemResult = await client.query(
      `SELECT items.id,
              (SELECT id FROM standalone_quiz_item_options WHERE quiz_item_id = items.id AND is_correct = TRUE LIMIT 1) AS correct_option_id,
              (SELECT id FROM standalone_quiz_item_options WHERE quiz_item_id = items.id AND is_correct = FALSE ORDER BY sort_order LIMIT 1) AS wrong_option_id
         FROM standalone_quiz_items items
        WHERE items.quiz_id = $1
        ORDER BY items.sort_order`,
      [quizId],
    );
    const correctCount = fixture.correctPattern.filter(Boolean).length;
    const score = Math.round((correctCount / itemResult.rowCount) * 100);
    const participationResult = await client.query(
      `INSERT INTO standalone_quiz_participations (quiz_id, student_id, policy_snapshot)
       VALUES ($1, $2, (SELECT jsonb_build_object(
         'attemptsAllowed', attempts_allowed,
         'correctAnswerVisibility', correct_answer_visibility,
         'formBehavior', form_behavior,
         'retryDelaySeconds', retry_delay_seconds,
         'reviewTiming', review_timing,
         'scorePolicy', score_policy
       ) FROM standalone_quizzes WHERE id = $3))
       ON CONFLICT (quiz_id, student_id) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [quizId, fixture.studentId, quizId],
    );
    const attemptResult = await client.query(
      `INSERT INTO standalone_quiz_attempts (
         participation_id, attempt_no, status, policy_snapshot, form_item_order, form_snapshot,
         correct_count, score, submitted_at, created_at, updated_at
       ) VALUES (
         $1,
         1,
         'submitted',
         (SELECT jsonb_build_object(
            'attemptsAllowed', attempts_allowed,
            'correctAnswerVisibility', correct_answer_visibility,
            'formBehavior', form_behavior,
            'retryDelaySeconds', retry_delay_seconds,
            'reviewTiming', review_timing,
            'scorePolicy', score_policy
          ) FROM standalone_quizzes WHERE id = $5),
         COALESCE((
           SELECT jsonb_agg(items.id ORDER BY items.sort_order)
             FROM standalone_quiz_items items
            WHERE items.quiz_id = $5
         ), '[]'::jsonb),
         COALESCE((
           SELECT jsonb_build_object(
             'version', 1,
             'items', jsonb_agg(jsonb_build_object(
               'id', items.id,
               'sortOrder', items.sort_order,
               'prompt', items.prompt,
               'explanation', items.explanation,
               'promptAssetId', items.prompt_asset_id,
               'explanationAssetId', items.explanation_asset_id,
               'options', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'id', options.id,
                   'choiceKey', options.choice_key,
                   'content', options.content,
                   'isCorrect', options.is_correct,
                   'sortOrder', options.sort_order,
                   'assetId', options.asset_id
                 ) ORDER BY options.sort_order)
                   FROM standalone_quiz_item_options options
                  WHERE options.quiz_item_id = items.id
               ), '[]'::jsonb)
             ) ORDER BY items.sort_order)
           )
             FROM standalone_quiz_items items
            WHERE items.quiz_id = $5
         ), '{"version":1,"items":[]}'::jsonb),
         $2,
         $3,
         NOW() - ($4::int * INTERVAL '1 day'),
         NOW() - ($4::int * INTERVAL '1 day'),
         NOW() - ($4::int * INTERVAL '1 day')
       )
       RETURNING id`,
      [participationResult.rows[0].id, correctCount, score, fixture.submittedDaysAgo, quizId],
    );
    for (const [index, item] of itemResult.rows.entries()) {
      await client.query(
        `INSERT INTO standalone_quiz_answers (attempt_id, quiz_item_id, selected_option_id)
         VALUES ($1, $2, $3)`,
        [attemptResult.rows[0].id, item.id, fixture.correctPattern[index] ? item.correct_option_id : item.wrong_option_id],
      );
    }
  }
  return quizIds;
}

async function seedTryout(client, { examEventId, subtestIds, tutorId, versionIds }) {
  await client.query(
    `UPDATE tryout_packages
        SET code = $1, idempotency_key = $2
      WHERE code = 'seed:assessment:tryout:baseline:v1'
        AND NOT EXISTS (SELECT 1 FROM tryout_packages WHERE code = $1)`,
    [TRYOUT.code, TRYOUT.idempotencyKey],
  );
  const tryoutResult = await client.query(
    `INSERT INTO tryout_packages (
       exam_event_id, code, title, description, assessment_type, status, published_at,
       revision, idempotency_key, admission_mode, default_result_release_policy, created_by_user_id
     )
     VALUES ($1, $2, $3, $4, 'tryout', 'published', NOW(), 1, $5, 'approval_required', 'automatic_at_end', $6)
     ON CONFLICT (code) DO UPDATE
       SET exam_event_id = EXCLUDED.exam_event_id,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = 'published',
           published_at = COALESCE(tryout_packages.published_at, NOW()),
           admission_mode = 'approval_required',
           default_result_release_policy = 'automatic_at_end',
           updated_at = NOW()
     RETURNING id`,
    [examEventId, TRYOUT.code, TRYOUT.title, TRYOUT.description, TRYOUT.idempotencyKey, tutorId],
  );
  const tryoutId = tryoutResult.rows[0].id;
  const attempts = await client.query("SELECT COUNT(*)::int AS count FROM tryout_attempts WHERE tryout_id = $1", [tryoutId]);
  if (attempts.rows[0].count === 0) {
    await client.query("DELETE FROM tryout_items WHERE tryout_id = $1", [tryoutId]);
    await client.query("DELETE FROM tryout_sections WHERE tryout_id = $1", [tryoutId]);
    for (const [subjectIndex, subject] of SUBJECTS.entries()) {
      const isCat = ["PU", "PK", "PM"].includes(subject.code);
      const sectionResult = await client.query(
        `INSERT INTO tryout_sections (
           tryout_id, subtest_id, title, sequence_no, duration_seconds, question_count,
           package_version_id, instructions, test_type, scoring_config, shuffle_items,
           cat_item_count, cat_model_version
         ) VALUES ($1, $2, $3, $4, $5, 3, $6, $7, $8::tryout_test_type, $9::jsonb, FALSE, $10, $11)
         RETURNING id`,
        [
          tryoutId,
          subtestIds.get(subject.code),
          subject.label,
          subjectIndex + 1,
          isCat ? 900 : 720,
          versionIds.get(subject.code),
          `Baca setiap pertanyaan dengan cermat. Pilih satu jawaban yang paling tepat untuk bagian ${subject.label}.`,
          isCat ? "cat" : "cbt",
          JSON.stringify({ method: isCat ? "two_pl" : "sum_item_points", wrongAnswerPoints: 0 }),
          isCat ? 2 : null,
          isCat ? "2pl-canonical-v1" : null,
        ],
      );
      const versionItems = await client.query(
        `SELECT items.id, items.source_question_id, items.sort_order, items.point_value,
                items.source_question_revision_id, items.source_content_digest,
                items.source_revision_provenance, items.prompt, items.explanation,
                items.difficulty, items.subtest_id
           FROM reusable_question_package_version_items items
          WHERE items.package_version_id = $1
          ORDER BY items.sort_order`,
        [versionIds.get(subject.code)],
      );
      for (const versionItem of versionItems.rows) {
        const itemResult = await client.query(
          `INSERT INTO tryout_items (
             tryout_id, tryout_section_id, source_question_id, source_question_revision_id,
             source_content_digest, source_revision_provenance, sort_order, points,
             prompt, explanation, difficulty, subtest_id, package_code,
             idempotency_key, package_version_id
           ) VALUES ($1, $2, $3, $4, $5, $6::question_revision_provenance, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           RETURNING id`,
          [tryoutId, sectionResult.rows[0].id, versionItem.source_question_id, versionItem.source_question_revision_id, versionItem.source_content_digest, versionItem.source_revision_provenance, versionItem.sort_order, versionItem.point_value, versionItem.prompt, versionItem.explanation, versionItem.difficulty, versionItem.subtest_id, `PKG-${subject.code}-EVALUASI`, `seed:demo:tryout-item:${subject.code.toLowerCase()}:${versionItem.sort_order}`, versionIds.get(subject.code)],
        );
        const versionOptions = await client.query(
          `SELECT choice_key, content, is_correct, sort_order, source_question_option_id,
                  source_question_revision_option_id
             FROM reusable_question_package_version_item_options
            WHERE package_version_item_id = $1
            ORDER BY sort_order`,
          [versionItem.id],
        );
        for (const option of versionOptions.rows) {
          await client.query(
            `INSERT INTO tryout_item_options (
               tryout_item_id, choice_key, content, is_correct, sort_order,
               source_question_option_id, source_question_revision_option_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [itemResult.rows[0].id, option.choice_key, option.content, option.is_correct, option.sort_order, option.source_question_option_id, option.source_question_revision_option_id],
          );
        }
      }
    }
  }
  return tryoutId;
}

async function upsertAdmission(client, { decidedByUserId, status, studentId, tryoutId }) {
  const decided = status === "pending" ? null : new Date();
  const result = await client.query(
    `INSERT INTO tryout_admissions (
       tryout_id, student_id, status, requested_at, decided_at, decided_by_user_id
     ) VALUES ($1, $2, $3::tryout_admission_status, NOW() - INTERVAL '10 days', $4, $5)
     ON CONFLICT (tryout_id, student_id) DO UPDATE
       SET status = EXCLUDED.status,
           decided_at = EXCLUDED.decided_at,
           decided_by_user_id = EXCLUDED.decided_by_user_id,
           revoke_reason = CASE WHEN EXCLUDED.status = 'revoked' THEN 'Keikutsertaan dibatalkan atas permintaan peserta.' ELSE NULL END,
           updated_at = NOW()
     RETURNING id`,
    [tryoutId, studentId, status, decided, decided ? decidedByUserId : null],
  );
  return result.rows[0].id;
}

async function upsertDeliverySession(client, { name, relativeWindow, release, status, tryoutId, tutorId }) {
  const result = await client.query(
    `INSERT INTO tryout_delivery_sessions (
       tryout_id, name, available_from, available_until, result_release_policy,
       ranking_rule, is_default_open_registration, fullscreen_prompt, status,
       created_by_user_id, updated_by_user_id, released_at, released_by_user_id
     ) VALUES (
       $1, $2, NOW() + ($3::int * INTERVAL '1 day'), NOW() + ($4::int * INTERVAL '1 day'),
       $5::tryout_result_release_policy, 'cohort', $6, $7, $8::tryout_delivery_session_status,
       $9::uuid, $9::uuid, CASE WHEN $10::boolean THEN NOW() - INTERVAL '6 days' ELSE NULL END,
       CASE WHEN $10::boolean THEN $9::uuid ELSE NULL END
     )
     ON CONFLICT (tryout_id, name) DO UPDATE
       SET available_from = EXCLUDED.available_from,
           available_until = EXCLUDED.available_until,
           result_release_policy = EXCLUDED.result_release_policy,
           ranking_rule = EXCLUDED.ranking_rule,
           is_default_open_registration = EXCLUDED.is_default_open_registration,
           fullscreen_prompt = EXCLUDED.fullscreen_prompt,
           status = EXCLUDED.status,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           released_at = EXCLUDED.released_at,
           released_by_user_id = EXCLUDED.released_by_user_id,
           updated_at = NOW()
     RETURNING id`,
    [tryoutId, name, relativeWindow.from, relativeWindow.until, release.policy, release.defaultRegistration, release.fullscreenPrompt, status, tutorId, release.released],
  );
  return result.rows[0].id;
}

async function upsertAssignment(client, { admissionId, assignedDaysAgo = 0, deliverySessionId, status = "active", tutorId }) {
  await client.query(
    `INSERT INTO tryout_delivery_assignments (
       admission_id, delivery_session_id, status, assigned_by_user_id, assigned_at,
       revoked_at, revoke_reason
     ) VALUES (
       $1, $2, $5::tryout_assignment_status, $3, NOW() - ($4::int * INTERVAL '1 day'),
       CASE WHEN $5::tryout_assignment_status = 'revoked' THEN NOW() - INTERVAL '7 days' ELSE NULL END,
       CASE WHEN $5::tryout_assignment_status = 'revoked' THEN 'Sesi telah selesai dan peserta telah dialihkan ke sesi aktif.' ELSE NULL END
     )
     ON CONFLICT (admission_id, delivery_session_id) DO UPDATE
       SET status = EXCLUDED.status,
           assigned_at = EXCLUDED.assigned_at,
           revoked_at = EXCLUDED.revoked_at,
           revoke_reason = EXCLUDED.revoke_reason`,
    [admissionId, deliverySessionId, tutorId, assignedDaysAgo, status],
  );
}

async function sectionSnapshots(client, tryoutId) {
  const sections = await client.query(
    `SELECT id, subtest_id, sequence_no, duration_seconds, instructions, scoring_config, test_type
       FROM tryout_sections
      WHERE tryout_id = $1
      ORDER BY sequence_no`,
    [tryoutId],
  );
  const snapshots = [];
  for (const section of sections.rows) {
    const items = await client.query(
      `SELECT id, prompt, explanation, points::text, sort_order
         FROM tryout_items
        WHERE tryout_section_id = $1
        ORDER BY sort_order`,
      [section.id],
    );
    const snapshotItems = [];
    for (const item of items.rows) {
      const options = await client.query(
        `SELECT id, choice_key, content, is_correct, sort_order
           FROM tryout_item_options
          WHERE tryout_item_id = $1
          ORDER BY sort_order`,
        [item.id],
      );
      snapshotItems.push({ ...item, options: options.rows.map((option) => ({ choiceKey: option.choice_key, content: option.content, id: option.id, isCorrect: option.is_correct, sortOrder: option.sort_order })) });
    }
    snapshots.push({
      ...section,
      content: {
        durationSeconds: section.duration_seconds,
        instructions: section.instructions,
        items: snapshotItems,
        scoringConfig: section.scoring_config,
        sectionId: section.id,
        testType: section.test_type,
      },
    });
  }
  return snapshots;
}

async function normalizeSeededAttemptTiming(client, attemptId) {
  await client.query(
    `UPDATE tryout_attempts
     SET server_started_at = NOW() - INTERVAL '8 days' - INTERVAL '4 hours',
         server_deadline_at = NOW() - INTERVAL '8 days' - INTERVAL '1 hour',
         submitted_at = NOW() - INTERVAL '8 days'
     WHERE id = $1`,
    [attemptId],
  );
  await client.query(
    `UPDATE tryout_attempt_test_runs AS run
     SET server_started_at = timeline.started_at,
         server_deadline_at = timeline.started_at + (timeline.duration_seconds * INTERVAL '1 second'),
         sealed_at = timeline.started_at + (timeline.time_spent_seconds * INTERVAL '1 second')
     FROM (
       SELECT run.id,
              NOW() - INTERVAL '8 days' - INTERVAL '2 hours' - ((run.sequence_no - 1) * INTERVAL '10 minutes') AS started_at,
              section.duration_seconds,
              LEAST(GREATEST(section.duration_seconds - 120, 240), section.duration_seconds - 60) AS time_spent_seconds
       FROM tryout_attempt_test_runs AS run
       JOIN tryout_sections AS section ON section.id = run.tryout_section_id
       WHERE run.attempt_id = $1
     ) AS timeline
     WHERE run.id = timeline.id`,
    [attemptId],
  );
  await client.query(
    `UPDATE tryout_answers AS answer
     SET answered_at = run.server_started_at + INTERVAL '3 minutes',
         synced_at = run.server_started_at + INTERVAL '3 minutes'
     FROM tryout_attempt_test_runs AS run
     WHERE answer.attempt_id = $1
       AND answer.attempt_test_run_id = run.id`,
    [attemptId],
  );
  await client.query(
    `UPDATE tryout_integrity_events AS event
     SET created_at = run.server_started_at + CASE event.server_sequence
       WHEN 1 THEN INTERVAL '1 minute'
       WHEN 2 THEN INTERVAL '5 minutes'
       ELSE INTERVAL '6 minutes'
     END
     FROM tryout_attempt_test_runs AS run
     WHERE event.run_id = run.id
       AND run.attempt_id = $1`,
    [attemptId],
  );
}

async function seedCompletedAttempt(client, { admissionId, deliverySessionId, scorePattern, studentId, tryoutId }) {
  const existing = await client.query(
    "SELECT id FROM tryout_attempts WHERE delivery_session_id = $1 AND student_id = $2",
    [deliverySessionId, studentId],
  );
  if (existing.rowCount) {
    await normalizeSeededAttemptTiming(client, existing.rows[0].id);
    return existing.rows[0].id;
  }
  const sections = await sectionSnapshots(client, tryoutId);
  if (sections.length !== 7 || scorePattern.length !== sections.length) throw new Error("The assessment seed expects seven score inputs.");
  const normalizedScores = sections.map((section, sectionIndex) => {
    const score = scorePattern[sectionIndex];
    if (section.test_type === "cat") {
      const correctCount = Math.min(2, Math.max(0, score));
      return normalizeSeedCatAbility(correctCount === 2 ? 0.72 : -0.15);
    }
    const maxScore = section.content.items.reduce((total, item) => total + Number(item.points), 0);
    return normalizeSeedCbtScore(score, maxScore);
  });
  const finalScore = aggregateSeedTryoutScores(normalizedScores);
  const attemptResult = await client.query(
    `INSERT INTO tryout_attempts (
       tryout_id, delivery_session_id, admission_id, student_id, status,
       server_started_at, server_deadline_at, submitted_at, score,
       percentile_cohort, release_policy_snapshot, content_snapshot
     ) VALUES (
       $1, $2, $3, $4, 'scored', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days',
       NOW() - INTERVAL '8 days', $5, $6,
       $7::jsonb, $8::jsonb
     ) RETURNING id`,
    [tryoutId, deliverySessionId, admissionId, studentId, finalScore, finalScore >= 60 ? 82 : 61, JSON.stringify({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, rankingRule: "cohort", resultReleasePolicy: "manual", scheduledReleaseAt: null }), JSON.stringify({ tryoutId, tryoutRevision: 1 })],
  );
  const attemptId = attemptResult.rows[0].id;
  for (const [sectionIndex, section] of sections.entries()) {
    const score = scorePattern[sectionIndex];
    const isCat = section.test_type === "cat";
    const selectedItemIds = isCat ? section.content.items.slice(0, 2).map((item) => item.id) : [];
    const correctCount = isCat ? Math.min(2, Math.max(0, score)) : score;
    const wrongCount = (isCat ? 2 : section.content.items.length) - correctCount;
    const ability = isCat ? (correctCount === 2 ? 0.72 : -0.15) : null;
    const normalizedScore = normalizedScores[sectionIndex];
    const calculationInput = isCat
      ? { modelVersion: "2pl-canonical-v1", selectedItemIds, updates: [] }
      : { totalItems: section.content.items.length };
    const calculationResult = isCat
      ? { ability, answeredCount: 2, deliveredCount: 2, normalizedScore, score: ability, unansweredCount: 0 }
      : { answeredCount: section.content.items.length, correctCount, maxScore: section.content.items.reduce((total, item) => total + Number(item.points), 0), normalizedScore, score, unansweredCount: 0, wrongCount };
    const runResult = await client.query(
      `INSERT INTO tryout_attempt_test_runs (
         attempt_id, tryout_section_id, sequence_no, status, server_started_at,
         server_deadline_at, sealed_at, content_snapshot, calculation_input,
         calculation_result, calculation_version, cat_state, cat_snapshot,
         calculation_releaseable
       ) VALUES (
         $1, $2, $3, 'sealed', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days',
         NOW() - INTERVAL '8 days', $4::jsonb, $5::jsonb, $6::jsonb, $7,
         $8::tryout_cat_run_state, $9::jsonb, TRUE
       ) RETURNING id`,
      [
        attemptId,
        section.id,
        section.sequence_no,
        JSON.stringify(section.content),
        JSON.stringify(calculationInput),
        JSON.stringify(calculationResult),
        isCat ? "2pl-map-v1" : "cbt-frozen-item-points-v1",
        isCat ? "ready" : "not_applicable",
        isCat ? JSON.stringify({ currentAbility: ability, initialAbility: 0, modelVersion: "2pl-canonical-v1", parameters: [], selectedItemIds, updates: [] }) : null,
      ],
    );
    const answerableItems = isCat ? section.content.items.slice(0, 2) : section.content.items;
    for (const [itemIndex, item] of answerableItems.entries()) {
      const chooseCorrect = itemIndex < correctCount;
      const selected = item.options.find((option) => option.isCorrect === chooseCorrect) ?? item.options[0];
      await client.query(
        `INSERT INTO tryout_answers (
           attempt_id, attempt_test_run_id, tryout_id, tryout_item_id,
           selected_option_id, is_correct, points_awarded, answered_at, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days')`,
        [attemptId, runResult.rows[0].id, tryoutId, item.id, selected.id, selected.isCorrect, selected.isCorrect ? 1 : 0],
      );
    }
    await client.query(
      `INSERT INTO tryout_score_breakdowns (
         attempt_id, subtest_id, correct_count, wrong_count, unanswered_count, raw_score, scaled_score
       ) VALUES ($1, $2, $3::int, $4::int, 0, $5::numeric, $6::numeric)`,
      [attemptId, section.subtest_id, correctCount, wrongCount, isCat ? ability : score, normalizedScore],
    );
    if (sectionIndex === 0) {
      await client.query(
        `INSERT INTO tryout_integrity_events (run_id, event_type, server_sequence, created_at)
         VALUES ($1, 'fullscreen_entered', 1, NOW() - INTERVAL '9 days'),
                ($1, 'focus_lost', 2, NOW() - INTERVAL '9 days' + INTERVAL '12 minutes'),
                ($1, 'focus_returned', 3, NOW() - INTERVAL '9 days' + INTERVAL '13 minutes')`,
        [runResult.rows[0].id],
      );
    }
  }
  await normalizeSeededAttemptTiming(client, attemptId);
  return attemptId;
}

async function seedTryoutOperations(client, { studentIds, tryoutId, tutorId }) {
  const admissions = {
    primary: await upsertAdmission(client, { decidedByUserId: tutorId, status: "active", studentId: studentIds.primary, tryoutId }),
    completed: await upsertAdmission(client, { decidedByUserId: tutorId, status: "active", studentId: studentIds.completed, tryoutId }),
    secondCompleted: await upsertAdmission(client, { decidedByUserId: tutorId, status: "active", studentId: studentIds.secondCompleted, tryoutId }),
    pending: await upsertAdmission(client, { decidedByUserId: tutorId, status: "pending", studentId: studentIds.pending, tryoutId }),
    rejected: await upsertAdmission(client, { decidedByUserId: tutorId, status: "rejected", studentId: studentIds.rejected, tryoutId }),
    revoked: await upsertAdmission(client, { decidedByUserId: tutorId, status: "revoked", studentId: studentIds.revoked, tryoutId }),
  };
  const [historicalSessionId, activeSessionId] = await Promise.all([
    upsertDeliverySession(client, {
      name: "Sesi Evaluasi Sebelumnya",
      relativeWindow: { from: -10, until: -8 },
      release: { defaultRegistration: false, fullscreenPrompt: true, policy: "manual", released: true },
      status: "closed",
      tryoutId,
      tutorId,
    }),
    upsertDeliverySession(client, {
      name: "Sesi Reguler Pekan Ini",
      relativeWindow: { from: -1, until: 7 },
      release: { defaultRegistration: true, fullscreenPrompt: true, policy: "automatic_at_end", released: false },
      status: "active",
      tryoutId,
      tutorId,
    }),
  ]);
  await upsertAssignment(client, { admissionId: admissions.primary, assignedDaysAgo: 10, deliverySessionId: historicalSessionId, status: "revoked", tutorId });
  await upsertAssignment(client, { admissionId: admissions.completed, assignedDaysAgo: 10, deliverySessionId: historicalSessionId, tutorId });
  await upsertAssignment(client, { admissionId: admissions.secondCompleted, assignedDaysAgo: 10, deliverySessionId: historicalSessionId, tutorId });
  await upsertAssignment(client, { admissionId: admissions.primary, deliverySessionId: activeSessionId, tutorId });
  await upsertAssignment(client, { admissionId: admissions.completed, deliverySessionId: activeSessionId, tutorId });

  await seedCompletedAttempt(client, { admissionId: admissions.primary, deliverySessionId: historicalSessionId, scorePattern: [2, 2, 2, 1, 3, 2, 2], studentId: studentIds.primary, tryoutId });
  await seedCompletedAttempt(client, { admissionId: admissions.completed, deliverySessionId: historicalSessionId, scorePattern: [2, 3, 2, 2, 3, 3, 2], studentId: studentIds.completed, tryoutId });
  await seedCompletedAttempt(client, { admissionId: admissions.secondCompleted, deliverySessionId: historicalSessionId, scorePattern: [1, 2, 2, 1, 2, 2, 1], studentId: studentIds.secondCompleted, tryoutId });

  const auditResult = await client.query(
    "SELECT id FROM tryout_delivery_audits WHERE tryout_id = $1 AND action = 'demo.seed_completed' LIMIT 1",
    [tryoutId],
  );
  if (!auditResult.rowCount) {
    await client.query(
      `INSERT INTO tryout_delivery_audits (
         tryout_id, delivery_session_id, actor_user_id, action, reason, after
       ) VALUES ($1, $2, $3, 'demo.seed_completed', $4, $5::jsonb)`,
      [tryoutId, activeSessionId, tutorId, "Menyiapkan data demonstrasi untuk peninjauan alur peserta dan operasi tryout.", JSON.stringify({ activeSessionId, participantCount: Object.keys(admissions).length })],
    );
  }
  return { activeSessionId, historicalSessionId };
}

async function seedAssessmentDemo(client, { examEventId, studentIds, tutorId }) {
  const subtestIds = await resolveSubtests(client);
  const bankId = await upsertQuestionBank(client, tutorId);
  const questions = await upsertQuestions(client, { bankId, subtestIds, tutorId });
  await upsertCalibrations(client, tutorId, questions);
  const versionIds = await seedReusablePackages(client, { bankId, questions, subtestIds, tutorId });
  const [quizIds, tryoutId] = await Promise.all([
    seedQuizzes(client, { bankId, questions, studentIds, subtestIds, tutorId }),
    seedTryout(client, { examEventId, subtestIds, tutorId, versionIds }),
  ]);
  const sessions = await seedTryoutOperations(client, { studentIds, tryoutId, tutorId });
  return { bankId, questionCount: questions.length, quizCount: quizIds.size, sessions, tryoutId, versionCount: versionIds.size };
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    const tutorId = await resolveUser(client, process.env.ASSESSMENT_SEED_TUTOR_EMAIL?.trim() || "tutor@vecalss.local", "tutor");
    const primaryStudentId = await resolveUser(client, process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local", "student");
    const demoEmails = ["dimas@vecalss.local", "leila@vecalss.local", "nabila@vecalss.local", "fajar@vecalss.local", "salma@vecalss.local"];
    const [completed, secondCompleted, pending, rejected, revoked] = await Promise.all(demoEmails.map((email) => resolveUser(client, email, "student")));
    const eventResult = await client.query("SELECT id FROM exam_events WHERE name = 'UTBK SNBT 2027 - Gelombang Utama' LIMIT 1");
    if (!eventResult.rowCount) throw new Error("The assessment seed requires the main 2027 exam event. Run pnpm db:seed first.");
    const summary = await seedAssessmentDemo(client, {
      examEventId: eventResult.rows[0].id,
      studentIds: { completed, pending, primary: primaryStudentId, rejected, revoked, secondCompleted },
      tutorId,
    });
    await client.query("COMMIT");
    console.log(`Assessment demonstration data completed: ${summary.questionCount} questions, ${summary.versionCount} package versions, ${summary.quizCount} quizzes, and one seven-test tryout.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error("Failed to seed the assessment demonstration data.");
    console.error(error);
    process.exitCode = 1;
  });
}

export { QUESTIONS, SUBJECTS, seedAssessmentDemo };
