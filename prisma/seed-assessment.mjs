import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  buildAssessmentReleasePayload,
  canonicalAssessmentReleaseJson,
  digestAssessmentReleasePayload,
} from "../lib/tryout/assessment-release-canonical.mjs";
import { seedQuestionBankOrganization } from "./question-bank-organization-seed.mjs";

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

function assemblyDefinitionDigest({ candidates, mode, rule, scope, subtestId }) {
  return createHash("sha256")
    .update(JSON.stringify({
      candidates: candidates.map((candidate) => ({
        pointValue: candidate.pointValue,
        sourceContentDigest: candidate.sourceContentDigest,
        sourceQuestionId: candidate.sourceQuestionId,
        sourceQuestionRevisionId: candidate.sourceQuestionRevisionId,
      })),
      mode,
      rule,
      scope,
      subtestId,
    }))
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

const BANKS = {
  quiz: {
    code: "seed:assessment:quiz-bank:v1",
    name: "Bank Soal Kuis UTBK",
    description: "Kumpulan soal yang telah ditinjau untuk latihan Kuis tujuh subtes UTBK.",
    purpose: "quiz",
  },
  tryout: {
    code: "seed:assessment:tryout-bank:v1",
    name: "Bank Soal Tryout UTBK",
    description: "Kumpulan soal yang telah ditinjau untuk penyusunan Tryout tujuh subtes UTBK.",
    purpose: "tryout",
  },
};

const TRYOUT = {
  code: "seed:assessment:tryout:evaluasi-program:v1",
  idempotencyKey: "seed:assessment:tryout:evaluasi-program:v1",
  title: "Simulasi UTBK SNBT — Evaluasi Tengah Program",
  description: "Simulasi tujuh subtes untuk menilai kemajuan belajar dan menentukan prioritas pembahasan berikutnya.",
};

const TRYOUT_SCORE_AGGREGATION_VERSION = "normalized-test-mean-v1";
const TRYOUT_CBT_SCORING_VERSION = "cbt-frozen-item-points-v1";
const TRYOUT_CAT_SCORING_VERSION = "2pl-map-v1";

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

async function upsertQuestionBank(client, tutorId, purpose) {
  const bank = BANKS[purpose];
  const result = await client.query(
    `INSERT INTO question_banks (code, name, description, purpose, status, revision, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, $4::question_bank_purpose, 'published', 1, $5, $5)
     ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           description = EXCLUDED.description,
           purpose = EXCLUDED.purpose,
           status = 'published',
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()
     RETURNING id`,
    [bank.code, bank.name, bank.description, bank.purpose, tutorId],
  );
  return result.rows[0].id;
}

async function upsertQuestions(client, { bankId, purpose, subtestIds, tutorId }) {
  const seeded = [];
  for (const question of QUESTIONS) {
    const questionCode = question.code.replace("seed:demo:question:", `seed:demo:${purpose}:question:`);
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
      [questionCode, bankId, subtestIds.get(question.subjectCode), question.stem, question.difficulty, question.explanation, tutorId],
    );
    const questionId = questionResult.rows[0].id;
    const currentRevisionId = questionResult.rows[0].current_revision_id;
    const currentRevisionState = await client.query(
      `SELECT status
         FROM question_revisions
        WHERE id = $1`,
      [currentRevisionId],
    );
    const legacyOptionsMutable = !['ready', 'retired'].includes(currentRevisionState.rows[0]?.status);
    const optionIds = [];
    if (legacyOptionsMutable) {
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
    seeded.push({ ...question, code: questionCode, contentDigest, id: questionId, optionIds: existingOptionResult.rows.map((row, index) => optionIds[index] ?? row.id), revisionId, revisionOptionIds: revisionOptionResult.rows.map((row) => row.id), subtestId: subtestIds.get(question.subjectCode) });
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
           package_id, source_bank_id, subtest_id, version_no, mode, status, created_by_user_id
         ) VALUES ($1, $2, $3, 1, 'fixed_set', 'draft', $4)
           RETURNING id, status`,
        [packageId, bankId, subtestIds.get(subject.code), tutorId],
      );
    }
    const version = versionResult.rows[0];
    if (version.status !== "published") {
      // Published legacy versions are immutable; the repository reports their
      // missing scope/digest as not Ready and the Kuis picker hides them.
      await client.query(
        `UPDATE reusable_question_package_versions
            SET source_bank_id = $2,
                subtest_id = $3,
                mode = 'fixed_set'
          WHERE id = $1`,
        [version.id, bankId, subtestIds.get(subject.code)],
      );
      await client.query(
        "DELETE FROM reusable_question_package_version_bank_scopes WHERE package_version_id = $1",
        [version.id],
      );
      await client.query(
        `INSERT INTO reusable_question_package_version_bank_scopes (package_version_id, question_bank_id)
         VALUES ($1, $2)`,
        [version.id, bankId],
      );
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
      const definitionDigest = assemblyDefinitionDigest({
        candidates: subjectQuestions.map((question) => ({
          pointValue: 1,
          sourceContentDigest: question.contentDigest,
          sourceQuestionId: question.id,
          sourceQuestionRevisionId: question.revisionId,
        })),
        mode: "fixed_set",
        rule: null,
        scope: { bankIds: [bankId], categoryIds: [], folderIds: [] },
        subtestId: subtestIds.get(subject.code),
      });
      await client.query(
        "UPDATE reusable_question_package_versions SET definition_digest = $2, provenance = 'authored', status = 'published', ready_at = NOW() WHERE id = $1",
        [version.id, definitionDigest],
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
         participation_id, attempt_no, status, attempt_state, scoring_state, release_state,
         policy_snapshot, form_item_order, form_snapshot,
         correct_count, wrong_count, unanswered_count, max_points, earned_points, score,
         scoring_version, scoring_provenance, release_at, submitted_at, created_at, updated_at
       ) VALUES (
         $1,
         1,
         'submitted',
         'submitted'::assessment_attempt_state,
         'scored'::assessment_scoring_state,
         'released'::assessment_result_release_state,
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
         (SELECT COUNT(*)::int FROM standalone_quiz_items WHERE quiz_id = $5) - $2,
         0,
         (SELECT COUNT(*)::numeric FROM standalone_quiz_items WHERE quiz_id = $5),
         $2,
         $3,
         'kuis-frozen-form-v1',
         'runtime'::assessment_scoring_provenance,
         NOW() - ($4::int * INTERVAL '1 day'),
         NOW() - ($4::int * INTERVAL '1 day'),
         NOW() - ($4::int * INTERVAL '1 day'),
         NOW() - ($4::int * INTERVAL '1 day')
       )
       RETURNING id`,
      [participationResult.rows[0].id, correctCount, score, fixture.submittedDaysAgo, quizId],
    );
    for (const [index, item] of itemResult.rows.entries()) {
      await client.query(
        `INSERT INTO standalone_quiz_answers (
           attempt_id, quiz_item_id, selected_option_id, is_correct, points_awarded, scoring_version
         ) VALUES ($1, $2, $3, $4, $5, 'kuis-frozen-form-v1')`,
        [attemptResult.rows[0].id, item.id, fixture.correctPattern[index] ? item.correct_option_id : item.wrong_option_id, fixture.correctPattern[index], fixture.correctPattern[index] ? 1 : 0],
      );
    }
  }
  return quizIds;
}

async function lockSeedTryoutSessions(client, tryoutId) {
  const sessions = await client.query(
    `SELECT id, status, assessment_release_id
       FROM tryout_delivery_sessions
      WHERE tryout_id = $1
      ORDER BY id
      FOR UPDATE`,
    [tryoutId],
  );
  if (sessions.rows.some((session) => session.status === "active" && session.assessment_release_id !== null)) {
    throw new Error("The assessment seed cannot replace Tryout rows while an active release-bound delivery session exists. Close or archive the session first.");
  }
}

async function seedTryout(client, { examEventId, subtestIds, tutorId, versionIds }) {
  const existingTryout = await client.query("SELECT id FROM tryout_packages WHERE code = $1", [TRYOUT.code]);
  let tryoutResult;
  if (existingTryout.rowCount) {
    const tryoutId = existingTryout.rows[0].id;
    // Participant start locks overlapping sessions before the Tryout row.
    // Keep the seed in that same order; the deterministic all-session lock
    // also prevents a concurrent start from appearing after the guard read.
    await lockSeedTryoutSessions(client, tryoutId);
    await client.query("SELECT id FROM tryout_packages WHERE id = $1 FOR UPDATE", [tryoutId]);
    tryoutResult = await client.query(
      `UPDATE tryout_packages
          SET exam_event_id = $1,
              title = $2,
              description = $3,
              status = 'published',
              published_at = COALESCE(published_at, NOW()),
              admission_mode = 'approval_required',
              default_result_release_policy = 'automatic_at_end',
              updated_at = NOW()
        WHERE id = $4
        RETURNING id`,
      [examEventId, TRYOUT.title, TRYOUT.description, tryoutId],
    );
  } else {
    const baselineTryout = await client.query(
      "SELECT id FROM tryout_packages WHERE code = 'seed:assessment:tryout:baseline:v1'",
    );
    if (baselineTryout.rowCount) {
      const tryoutId = baselineTryout.rows[0].id;
      await lockSeedTryoutSessions(client, tryoutId);
      await client.query("SELECT id FROM tryout_packages WHERE id = $1 FOR UPDATE", [tryoutId]);
      tryoutResult = await client.query(
        `UPDATE tryout_packages
            SET code = $1,
                idempotency_key = $2
          WHERE id = $3
            AND NOT EXISTS (SELECT 1 FROM tryout_packages WHERE code = $1)
          RETURNING id`,
        [TRYOUT.code, TRYOUT.idempotencyKey, tryoutId],
      );
      if (!tryoutResult.rowCount) throw new Error("The assessment seed found a concurrent Tryout code change; retry after the transaction finishes.");
    } else {
      // A newly-created Tryout cannot have a participant session before this
      // transaction commits, so its INSERT lock is the first and only lock
      // needed on this branch.  If another transaction wins the unique code
      // race, retry through the existing-row branch to preserve lock order.
      tryoutResult = await client.query(
        `INSERT INTO tryout_packages (
           exam_event_id, code, title, description, assessment_type, status, published_at,
           revision, idempotency_key, admission_mode, default_result_release_policy, created_by_user_id
         )
         VALUES ($1, $2, $3, $4, 'tryout', 'published', NOW(), 1, $5, 'approval_required', 'automatic_at_end', $6)
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [examEventId, TRYOUT.code, TRYOUT.title, TRYOUT.description, TRYOUT.idempotencyKey, tutorId],
      );
      if (!tryoutResult.rowCount) {
        const concurrentTryout = await client.query("SELECT id FROM tryout_packages WHERE code = $1", [TRYOUT.code]);
        if (!concurrentTryout.rowCount) throw new Error("The assessment seed could not resolve its Tryout after a concurrent code write.");
        const tryoutId = concurrentTryout.rows[0].id;
        await lockSeedTryoutSessions(client, tryoutId);
        await client.query("SELECT id FROM tryout_packages WHERE id = $1 FOR UPDATE", [tryoutId]);
        tryoutResult = await client.query(
          `UPDATE tryout_packages
              SET exam_event_id = $1,
                  title = $2,
                  description = $3,
                  status = 'published',
                  published_at = COALESCE(published_at, NOW()),
                  admission_mode = 'approval_required',
                  default_result_release_policy = 'automatic_at_end',
                  updated_at = NOW()
            WHERE id = $4
            RETURNING id`,
          [examEventId, TRYOUT.title, TRYOUT.description, tryoutId],
        );
      }
    }
  }
  const tryoutId = tryoutResult.rows[0].id;
  const rebuildState = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM tryout_attempts WHERE tryout_id = $1) AS attempt_count,
       (SELECT COUNT(*)::int FROM assessment_releases WHERE tryout_id = $1) AS assessment_release_count,
       (SELECT COUNT(*)::int
          FROM tryout_delivery_sessions
         WHERE tryout_id = $1
           AND assessment_release_id IS NOT NULL) AS release_bound_session_count`,
    [tryoutId],
  );
  assertSeedTryoutRebuildAllowed({
    assessmentReleaseCount: rebuildState.rows[0].assessment_release_count,
    attemptCount: rebuildState.rows[0].attempt_count,
    releaseBoundSessionCount: rebuildState.rows[0].release_bound_session_count,
  });
  if (Number(rebuildState.rows[0].attempt_count) === 0) {
    await client.query("DELETE FROM tryout_items WHERE tryout_id = $1", [tryoutId]);
    await client.query("DELETE FROM tryout_sections WHERE tryout_id = $1", [tryoutId]);
    for (const [subjectIndex, subject] of SUBJECTS.entries()) {
      const isCat = ["PU", "PK", "PM"].includes(subject.code);
      // Keep the reusable package fixtures available for the package catalogue,
      // but seed the canonical Tryout as direct snapshots. The current Kapten
      // authoring boundary intentionally refuses legacy package bindings.
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
          null,
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
                items.difficulty, items.subtest_id, items.prompt_asset_id,
                items.explanation_asset_id
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
             prompt_asset_id, explanation_asset_id, idempotency_key, package_version_id
           ) VALUES ($1, $2, $3, $4, $5, $6::question_revision_provenance, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           RETURNING id`,
          [tryoutId, sectionResult.rows[0].id, versionItem.source_question_id, versionItem.source_question_revision_id, versionItem.source_content_digest, versionItem.source_revision_provenance, versionItem.sort_order, versionItem.point_value, versionItem.prompt, versionItem.explanation, versionItem.difficulty, versionItem.subtest_id, "direct", versionItem.prompt_asset_id, versionItem.explanation_asset_id, `seed:demo:tryout-item:${subject.code.toLowerCase()}:${versionItem.sort_order}`, null],
        );
        const versionOptions = await client.query(
          `SELECT choice_key, content, is_correct, sort_order, source_question_option_id,
                  source_question_revision_option_id, asset_id
             FROM reusable_question_package_version_item_options
            WHERE package_version_item_id = $1
            ORDER BY sort_order`,
          [versionItem.id],
        );
        for (const option of versionOptions.rows) {
          await client.query(
            `INSERT INTO tryout_item_options (
               tryout_item_id, choice_key, content, is_correct, sort_order,
               source_question_option_id, source_question_revision_option_id, asset_id
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [itemResult.rows[0].id, option.choice_key, option.content, option.is_correct, option.sort_order, option.source_question_option_id, option.source_question_revision_option_id, option.asset_id],
          );
        }
      }
    }
  }
  return tryoutId;
}

async function upsertAssessmentRelease(client, { tryoutId, tutorId }) {
  await client.query("SELECT id FROM tryout_packages WHERE id = $1 FOR UPDATE", [tryoutId]);
  const tryoutResult = await client.query(
    `SELECT id, revision
       FROM tryout_packages
      WHERE id = $1
        AND status = 'published'`,
    [tryoutId],
  );
  if (!tryoutResult.rowCount) throw new Error("The assessment seed requires a published Tryout before creating its release.");

  const sectionResult = await client.query(
    `SELECT section.id, section.cat_item_count, section.cat_model_version,
            section.duration_seconds, section.instructions,
            section.package_version_id, section.scoring_config,
            section.sequence_no, section.shuffle_items, section.subtest_id,
            section.test_type, section.title, subtest.code AS subtest_code,
            subtest.name AS subtest_name
       FROM tryout_sections AS section
       JOIN subtests AS subtest ON subtest.id = section.subtest_id
      WHERE section.tryout_id = $1
      ORDER BY section.sequence_no`,
    [tryoutId],
  );
  const sections = [];
  for (const section of sectionResult.rows) {
    const itemResult = await client.query(
      `SELECT id, difficulty, explanation, explanation_asset_id, package_code,
              points::text, prompt, prompt_asset_id, sort_order,
              source_content_digest, source_question_id,
              source_question_revision_id, source_revision_provenance,
              subtest_id
         FROM tryout_items
        WHERE tryout_section_id = $1
        ORDER BY sort_order`,
      [section.id],
    );
    const items = [];
    for (const item of itemResult.rows) {
      const optionResult = await client.query(
        `SELECT asset_id, choice_key, content, id, is_correct, sort_order,
                source_question_option_id, source_question_revision_option_id
           FROM tryout_item_options
          WHERE tryout_item_id = $1
          ORDER BY sort_order`,
        [item.id],
      );
      items.push({
        difficulty: item.difficulty,
        explanation: item.explanation,
        explanationAssetId: item.explanation_asset_id,
        id: item.id,
        options: optionResult.rows.map((option) => ({
          assetId: option.asset_id,
          choiceKey: option.choice_key,
          content: option.content,
          id: option.id,
          isCorrect: option.is_correct,
          sortOrder: option.sort_order,
          sourceQuestionOptionId: option.source_question_option_id,
          sourceQuestionRevisionOptionId: option.source_question_revision_option_id,
        })),
        packageCode: item.package_code,
        points: item.points,
        prompt: item.prompt,
        promptAssetId: item.prompt_asset_id,
        sortOrder: item.sort_order,
        sourceContentDigest: item.source_content_digest,
        sourceQuestionId: item.source_question_id,
        sourceQuestionRevisionId: item.source_question_revision_id,
        sourceRevisionProvenance: item.source_revision_provenance,
        subtestId: item.subtest_id,
      });
    }
    sections.push({
      catItemCount: section.cat_item_count,
      catModelVersion: section.cat_model_version,
      durationSeconds: section.duration_seconds,
      id: section.id,
      instructions: section.instructions,
      items,
      packageVersionId: section.package_version_id,
      scoringConfig: section.scoring_config,
      sequenceNo: section.sequence_no,
      shuffleItems: section.shuffle_items,
      subtestCode: section.subtest_code,
      subtestName: section.subtest_name,
      subtestId: section.subtest_id,
      testType: section.test_type,
      title: section.title,
    });
  }
  if (sections.length !== 7 || sections.some((section) => section.items.length === 0)) throw new Error("The assessment seed expects seven populated Tryout sections.");
  const catItems = sections.flatMap((section) => section.testType === "cat" ? section.items : []);
  if (catItems.some((item) => !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || !item.sourceRevisionProvenance || item.sourceRevisionProvenance === "legacy_unknown")) {
    throw new Error("The assessment seed requires complete CAT source provenance.");
  }
  const catRevisionIds = [...new Set(catItems.flatMap((item) => item.sourceQuestionRevisionId ? [item.sourceQuestionRevisionId] : []))];
  if (catRevisionIds.length) {
    const [revisionResult, calibrationResult] = await Promise.all([
      client.query(
        `SELECT id, question_id, content_digest
           FROM question_revisions
          WHERE id = ANY($1::uuid[])
            AND status = 'ready'`,
        [catRevisionIds],
      ),
      client.query(
        `SELECT id, content_digest, difficulty::text, discrimination::text,
                question_id, question_revision_id, source_revision_provenance
           FROM two_pl_question_calibrations
          WHERE approval_state = 'approved'
            AND model_version = '2pl-canonical-v1'
            AND question_revision_id = ANY($1::uuid[])`,
        [catRevisionIds],
      ),
    ]);
    const revisionById = new Map(revisionResult.rows.map((revision) => [revision.id, revision]));
    const calibrationByRevision = new Map(calibrationResult.rows.map((calibration) => [calibration.question_revision_id, calibration]));
    if (revisionResult.rowCount !== catRevisionIds.length || calibrationResult.rowCount !== catRevisionIds.length) throw new Error("The assessment seed requires every CAT QuestionRevision to remain ready with an approved canonical 2PL calibration.");
    for (const item of catItems) {
      const revision = revisionById.get(item.sourceQuestionRevisionId);
      const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId);
      if (!revision || !calibration || revision.question_id !== item.sourceQuestionId || revision.content_digest !== item.sourceContentDigest || calibration.question_id !== item.sourceQuestionId || calibration.content_digest !== item.sourceContentDigest || calibration.source_revision_provenance === "legacy_unknown" || !Number.isFinite(Number(calibration.difficulty)) || !Number.isFinite(Number(calibration.discrimination)) || Number(calibration.discrimination) <= 0) {
        throw new Error("The assessment seed requires an approved canonical 2PL calibration matching each CAT source revision digest.");
      }
      item.catCalibration = {
        calibrationDigest: calibration.content_digest,
        calibrationId: calibration.id,
        difficulty: Number(calibration.difficulty),
        discrimination: Number(calibration.discrimination),
        sourceRevisionProvenance: calibration.source_revision_provenance,
      };
    }
  }
  const payload = buildAssessmentReleasePayload({
    aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION,
    catVersion: TRYOUT_CAT_SCORING_VERSION,
    cbtVersion: TRYOUT_CBT_SCORING_VERSION,
    tryoutId,
    tryoutRevision: tryoutResult.rows[0].revision,
    sections,
  });
  const contentDigest = digestAssessmentReleasePayload(payload);
  const existing = await client.query(
    `SELECT id, content_digest, release_number
       FROM assessment_releases
      WHERE tryout_id = $1 AND content_digest = $2`,
    [tryoutId, contentDigest],
  );
  if (existing.rowCount) return { ...existing.rows[0], contentDigest: existing.rows[0].content_digest, releaseNumber: existing.rows[0].release_number };
  const nextNumber = await client.query(
    `SELECT COALESCE(MAX(release_number), 0) + 1 AS release_number
       FROM assessment_releases
      WHERE tryout_id = $1`,
    [tryoutId],
  );
  const inserted = await client.query(
    `INSERT INTO assessment_releases (
       tryout_id, release_number, content_digest, payload, published_at,
       created_by_user_id
     ) VALUES ($1, $2, $3, $4::jsonb, COALESCE((SELECT published_at FROM tryout_packages WHERE id = $1), NOW()), $5)
     RETURNING id, content_digest, release_number`,
    [tryoutId, nextNumber.rows[0].release_number, contentDigest, JSON.stringify(payload), tutorId],
  );
  return { ...inserted.rows[0], contentDigest: inserted.rows[0].content_digest, releaseNumber: inserted.rows[0].release_number };
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

async function upsertDeliverySession(client, { assessmentRelease, name, relativeWindow, release, status, tryoutId, tutorId }) {
  const result = await client.query(
    `INSERT INTO tryout_delivery_sessions (
       tryout_id, name, available_from, available_until, result_release_policy,
       ranking_rule, is_default_open_registration, fullscreen_prompt, status,
       release_state, release_reason, assessment_release_id,
       created_by_user_id, updated_by_user_id, released_at, released_by_user_id
     ) VALUES (
       $1, $2, NOW() + ($3::int * INTERVAL '1 day'), NOW() + ($4::int * INTERVAL '1 day'),
       $5::tryout_result_release_policy, 'cohort', $6, $7, $8::tryout_delivery_session_status,
       CASE WHEN $10::boolean THEN 'released'::assessment_result_release_state ELSE 'hidden'::assessment_result_release_state END,
       CASE WHEN $10::boolean THEN 'Seeded runtime result bundle.' ELSE NULL END,
       $11::uuid,
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
           release_state = EXCLUDED.release_state,
           release_reason = EXCLUDED.release_reason,
           assessment_release_id = COALESCE(tryout_delivery_sessions.assessment_release_id, EXCLUDED.assessment_release_id),
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           released_at = EXCLUDED.released_at,
           released_by_user_id = EXCLUDED.released_by_user_id,
           updated_at = NOW()
     RETURNING id`,
    [tryoutId, name, relativeWindow.from, relativeWindow.until, release.policy, release.defaultRegistration, release.fullscreenPrompt, status, tutorId, release.released, assessmentRelease.id],
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
    `SELECT section.cat_item_count, section.cat_model_version, section.id,
            section.package_version_id, section.subtest_id, section.sequence_no,
            section.duration_seconds, section.instructions, section.scoring_config,
            section.shuffle_items, section.test_type, section.title,
            subtest.code AS subtest_code, subtest.name AS subtest_name
       FROM tryout_sections AS section
       JOIN subtests AS subtest ON subtest.id = section.subtest_id
      WHERE section.tryout_id = $1
      ORDER BY section.sequence_no`,
    [tryoutId],
  );
  const snapshots = [];
  for (const section of sections.rows) {
    const items = await client.query(
    `SELECT id, prompt, explanation, explanation_asset_id, prompt_asset_id, points::text, sort_order, difficulty,
            package_version_id,
            package_code,
            source_content_digest, source_question_id, source_question_revision_id,
            source_revision_provenance, subtest_id
         FROM tryout_items
        WHERE tryout_section_id = $1
        ORDER BY sort_order`,
      [section.id],
    );
    const snapshotItems = [];
    for (const item of items.rows) {
      const options = await client.query(
        `SELECT asset_id, id, choice_key, content, is_correct, sort_order,
                source_question_option_id, source_question_revision_option_id
           FROM tryout_item_options
          WHERE tryout_item_id = $1
          ORDER BY sort_order`,
        [item.id],
      );
      snapshotItems.push({
        difficulty: item.difficulty,
        explanation: item.explanation,
        explanationAssetId: item.explanation_asset_id,
        id: item.id,
        options: options.rows.map((option) => ({ assetId: option.asset_id, choiceKey: option.choice_key, content: option.content, id: option.id, isCorrect: option.is_correct, sortOrder: option.sort_order, sourceQuestionOptionId: option.source_question_option_id, sourceQuestionRevisionOptionId: option.source_question_revision_option_id })),
        packageVersionId: item.package_version_id,
        packageCode: item.package_code,
        points: item.points,
        prompt: item.prompt,
        promptAssetId: item.prompt_asset_id,
        sortOrder: item.sort_order,
        sourceContentDigest: item.source_content_digest,
        sourceQuestionId: item.source_question_id,
        sourceQuestionRevisionId: item.source_question_revision_id,
        sourceRevisionProvenance: item.source_revision_provenance,
        subtestId: item.subtest_id,
      });
    }
    snapshots.push({
      ...section,
      content: {
        catItemCount: section.cat_item_count,
        catModelVersion: section.cat_model_version,
        durationSeconds: section.duration_seconds,
        instructions: section.instructions,
        items: snapshotItems,
        packageVersionId: section.package_version_id,
        scoringConfig: section.scoring_config,
        sectionId: section.id,
        sequenceNo: section.sequence_no,
        shuffleItems: section.shuffle_items,
        subtestId: section.subtest_id,
        subtestCode: section.subtest_code,
        subtestName: section.subtest_name,
        testType: section.test_type,
        title: section.title,
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const SEED_SECTION_SNAPSHOT_REQUIRED_FIELDS = [
  "catItemCount",
  "catModelVersion",
  "durationSeconds",
  "instructions",
  "items",
  "scoringConfig",
  "sectionId",
  "sequenceNo",
  "shuffleItems",
  "subtestId",
  "testType",
  "title",
];

const SEED_HISTORICAL_RUN_FALLBACK_FIELDS = new Set(["shuffleItems"]);

function assertSeedHistoricalAttemptsClosed({ packageSectionCount, packageItemCount, attemptCount, closedAttemptCount, package_section_count, package_item_count, attempt_count, historical_attempt_count }, label = "canonical Tryout") {
  const sectionCount = packageSectionCount ?? package_section_count;
  const itemCount = packageItemCount ?? package_item_count;
  const totalAttempts = attemptCount ?? attempt_count;
  const closedAttempts = closedAttemptCount ?? historical_attempt_count;
  const hasLegacyBindings = Number(sectionCount) > 0 || Number(itemCount) > 0;
  if (!hasLegacyBindings) return false;
  if (Number(totalAttempts) <= 0 || Number(closedAttempts) !== Number(totalAttempts)) {
    throw new Error(`${label} has legacy package bindings but not every historical attempt belongs to a closed delivery session.`);
  }
  return true;
}

function assertSeedDirectSnapshotMarker(item, label) {
  if (item?.packageVersionId === null && item.packageCode !== "direct") {
    throw new Error(`${label} is an unbound Tryout snapshot without the direct package marker.`);
  }
}

function assertSeedTryoutRebuildAllowed({ attemptCount, assessmentReleaseCount, releaseBoundSessionCount }, label = "canonical Tryout") {
  if (Number(attemptCount) === 0 && (Number(assessmentReleaseCount) > 0 || Number(releaseBoundSessionCount) > 0)) {
    throw new Error(`${label} has an immutable AssessmentRelease or release-bound delivery session but no attempts; refusing to rebuild its physical snapshots.`);
  }
}

function assertSeedFreshSessionReleaseBindings(sessions, label = "fresh canonical Tryout") {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error(`${label} must contain delivery sessions before release-pin verification.`);
  }
  const unboundSessions = sessions.filter((session) => session?.assessment_release_id === null || session?.assessment_release_id === undefined);
  if (unboundSessions.length) {
    throw new Error(`${label} has ${unboundSessions.length} delivery session(s) without an AssessmentRelease binding.`);
  }
}

function seedReleaseSnapshotMetadata(assessmentRelease) {
  return {
    digest: assessmentRelease.contentDigest,
    id: assessmentRelease.id,
    number: assessmentRelease.releaseNumber,
  };
}

function seedExistingReleaseSnapshotMetadata(snapshot, assessmentRelease) {
  const metadata = isRecord(snapshot?.assessmentRelease) ? snapshot.assessmentRelease : null;
  if (metadata && seedReleaseSnapshotMetadataShape(snapshot)) return { ...metadata };
  return seedReleaseSnapshotMetadata(assessmentRelease);
}

function seedReleaseSnapshotMetadataShape(value) {
  const snapshot = isRecord(value) ? value : null;
  const metadata = snapshot && isRecord(snapshot.assessmentRelease)
    ? snapshot.assessmentRelease
    : null;
  if (!metadata) return null;
  if (Object.prototype.hasOwnProperty.call(metadata, "id")
    && Object.prototype.hasOwnProperty.call(metadata, "number")
    && Object.prototype.hasOwnProperty.call(metadata, "digest")) {
    return {
      digest: metadata.digest,
      id: metadata.id,
      kind: "runtime",
      number: metadata.number,
    };
  }
  if (Object.prototype.hasOwnProperty.call(metadata, "id")
    && Object.prototype.hasOwnProperty.call(metadata, "releaseNumber")
    && Object.prototype.hasOwnProperty.call(metadata, "contentDigest")) {
    return {
      digest: metadata.contentDigest,
      id: metadata.id,
      kind: "historical-legacy",
      number: metadata.releaseNumber,
    };
  }
  return null;
}

function assertSeedReleasePayloadIdentity(tryout, releasePayload, label, { requireRevision = true } = {}) {
  const releaseTryout = isRecord(releasePayload?.tryout) ? releasePayload.tryout : null;
  if (!releaseTryout
    || releaseTryout.id !== tryout.id
    || !Number.isInteger(Number(releaseTryout.revision))) {
    throw new Error(`The assessment seed found a ${label} AssessmentRelease with an invalid Tryout identity.`);
  }
  if (requireRevision && Number(releaseTryout.revision) !== Number(tryout.revision)) {
    throw new Error(`The assessment seed found a ${label} AssessmentRelease from a different Tryout revision.`);
  }
}

function assertSeedRequiredReleaseMetadata(value, assessmentRelease, label) {
  const metadataShape = seedReleaseSnapshotMetadataShape(value);
  if (!metadataShape) throw new Error(`The assessment seed found a pinned ${label} snapshot without valid AssessmentRelease metadata.`);
  assertSeedReleaseMetadataCompatible(value, assessmentRelease, label);
  return metadataShape.kind;
}

function assertSeedReleaseMetadataCompatible(value, assessmentRelease, label) {
  const metadataShape = seedReleaseSnapshotMetadataShape(value);
  if (!metadataShape) {
    const snapshot = isRecord(value) ? value : null;
    if (!snapshot || !Object.prototype.hasOwnProperty.call(snapshot, "assessmentRelease")) return null;
    throw new Error(`The assessment seed found an invalid ${label} AssessmentRelease snapshot.`);
  }
  if (metadataShape.id !== assessmentRelease.id
    || Number(metadataShape.number) !== Number(assessmentRelease.releaseNumber)
    || metadataShape.digest !== assessmentRelease.contentDigest) {
    throw new Error(`The assessment seed found a ${label} snapshot from a different AssessmentRelease.`);
  }
  return metadataShape.kind;
}

function assertSeedReleaseBindingCompatible(value, assessmentRelease, label) {
  const fields = [
    value.assessment_release_id,
    value.assessment_release_number,
    value.assessment_release_digest,
  ];
  const hasAny = fields.some((field) => field !== null && field !== undefined);
  if (!hasAny) return;
  if (fields.some((field) => field === null || field === undefined)
    || value.assessment_release_id !== assessmentRelease.id
    || Number(value.assessment_release_number) !== Number(assessmentRelease.releaseNumber)
    || value.assessment_release_digest !== assessmentRelease.contentDigest) {
    throw new Error(`The assessment seed found an incomplete or mismatched ${label} AssessmentRelease binding.`);
  }
}

function assertSeedReleaseItemBridge(releaseItem, snapshotItem, label) {
  if (!isRecord(releaseItem) || !isRecord(snapshotItem) || releaseItem.physicalId !== snapshotItem.id) {
    throw new Error(`The assessment seed could not prove the immutable item bridge for ${label}.`);
  }
  for (const field of [
    "difficulty",
    "explanation",
    "explanationAssetId",
    "id",
    "options",
    "packageCode",
    "points",
    "prompt",
    "promptAssetId",
    "sortOrder",
    "sourceContentDigest",
    "sourceQuestionId",
    "sourceQuestionRevisionId",
    "sourceRevisionProvenance",
    "subtestId",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(snapshotItem, field)) {
      throw new Error(`The assessment seed found an incomplete frozen item for ${label}.`);
    }
  }
  if (releaseItem.difficulty !== snapshotItem.difficulty
    || releaseItem.explanation !== snapshotItem.explanation
    || releaseItem.explanationAssetId !== snapshotItem.explanationAssetId
    || releaseItem.packageCode !== snapshotItem.packageCode
    || String(releaseItem.points) !== String(snapshotItem.points)
    || releaseItem.prompt !== snapshotItem.prompt
    || releaseItem.promptAssetId !== snapshotItem.promptAssetId
    || releaseItem.sortOrder !== snapshotItem.sortOrder) {
    throw new Error(`The assessment seed found frozen item content drift for ${label}.`);
  }
  for (const field of [
    "sourceContentDigest",
    "sourceQuestionId",
    "sourceQuestionRevisionId",
    "sourceRevisionProvenance",
    "subtestId",
  ]) {
    if (releaseItem[field] !== snapshotItem[field]) {
      throw new Error(`The assessment seed found mutable source drift in the item bridge for ${label}.`);
    }
  }
  const releaseOptions = Array.isArray(releaseItem.options) ? releaseItem.options : null;
  const snapshotOptions = Array.isArray(snapshotItem.options) ? snapshotItem.options : null;
  if (!releaseOptions || !snapshotOptions || releaseOptions.length !== snapshotOptions.length) {
    throw new Error(`The assessment seed found an incomplete option snapshot for ${label}.`);
  }
  const snapshotOptionIds = snapshotOptions.map((snapshotOption) => {
    if (!isRecord(snapshotOption) || typeof snapshotOption.id !== "string") {
      throw new Error(`The assessment seed found an incomplete frozen option for ${label}.`);
    }
    return snapshotOption.id;
  });
  const releaseOptionIds = releaseOptions.map((releaseOption) => releaseOption.physicalId);
  const releaseOptionIdSet = new Set(releaseOptionIds);
  if (releaseOptionIds.some((id) => typeof id !== "string")
    || new Set(snapshotOptionIds).size !== snapshotOptionIds.length
    || releaseOptionIdSet.size !== releaseOptionIds.length
    || snapshotOptionIds.some((id) => !releaseOptionIdSet.has(id))) {
    throw new Error(`The assessment seed found a non-bijective option bridge for ${label}.`);
  }
  const releaseOptionById = new Map(releaseOptions.map((candidate) => [candidate.physicalId, candidate]));
  for (const snapshotOption of snapshotOptions) {
    if (!isRecord(snapshotOption)
      || !Object.prototype.hasOwnProperty.call(snapshotOption, "assetId")
      || !Object.prototype.hasOwnProperty.call(snapshotOption, "choiceKey")
      || !Object.prototype.hasOwnProperty.call(snapshotOption, "content")
      || !Object.prototype.hasOwnProperty.call(snapshotOption, "isCorrect")
      || !Object.prototype.hasOwnProperty.call(snapshotOption, "sortOrder")) {
      throw new Error(`The assessment seed found an incomplete frozen option for ${label}.`);
    }
    const releaseOption = releaseOptionById.get(snapshotOption.id);
    if (!releaseOption
      || releaseOption.assetId !== snapshotOption.assetId
      || releaseOption.choiceKey !== snapshotOption.choiceKey
      || releaseOption.content !== snapshotOption.content
      || releaseOption.isCorrect !== snapshotOption.isCorrect
      || releaseOption.sortOrder !== snapshotOption.sortOrder) {
      throw new Error(`The assessment seed could not prove the immutable option bridge for ${label}.`);
    }
    for (const field of ["sourceQuestionOptionId", "sourceQuestionRevisionOptionId"]) {
      if (!Object.prototype.hasOwnProperty.call(snapshotOption, field)
        || releaseOption[field] !== snapshotOption[field]) {
        throw new Error(`The assessment seed found mutable source drift in the option bridge for ${label}.`);
      }
    }
  }
}

function assertSeedSnapshotMatchesRelease(contentSnapshot, releasePayload, label) {
  const snapshot = isRecord(contentSnapshot) ? contentSnapshot : {};
  const sectionSnapshot = isRecord(snapshot.content) ? snapshot.content : snapshot;
  if (SEED_SECTION_SNAPSHOT_REQUIRED_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(sectionSnapshot, field))) {
    throw new Error(`The assessment seed found an incomplete frozen section snapshot for ${label}.`);
  }
  const releaseSection = (Array.isArray(releasePayload?.sections) ? releasePayload.sections : [])
    .find((candidate) => candidate.physicalId === sectionSnapshot.sectionId);
  if (!releaseSection
    || releaseSection.sequenceNo !== sectionSnapshot.sequenceNo
    || releaseSection.subtestId !== sectionSnapshot.subtestId
    || releaseSection.durationSeconds !== sectionSnapshot.durationSeconds
    || releaseSection.instructions !== sectionSnapshot.instructions
    || releaseSection.title !== sectionSnapshot.title
    || releaseSection.cat?.itemCount !== sectionSnapshot.catItemCount
    || releaseSection.cat?.modelVersion !== sectionSnapshot.catModelVersion
    || releaseSection.scoring?.testType !== sectionSnapshot.testType
    || releaseSection.scoring?.modelVersion !== (sectionSnapshot.testType === "cat" ? sectionSnapshot.catModelVersion : TRYOUT_CBT_SCORING_VERSION)
    || releaseSection.randomization?.shuffleItems !== Boolean(sectionSnapshot.shuffleItems)
    || canonicalAssessmentReleaseJson(releaseSection.scoring?.config ?? null) !== canonicalAssessmentReleaseJson(sectionSnapshot.scoringConfig ?? null)) {
    throw new Error(`The assessment seed could not prove the immutable section bridge for ${label}.`);
  }
  if (Object.prototype.hasOwnProperty.call(sectionSnapshot, "packageVersionId")
    && (releaseSection.assembly?.packageVersionId ?? null) !== (sectionSnapshot.packageVersionId ?? null)) {
    throw new Error(`The assessment seed found physical package binding drift for ${label}.`);
  }
  for (const [snapshotField, releaseField] of [["subtestCode", "subtestCode"], ["subtestName", "subtestName"]]) {
    if (Object.prototype.hasOwnProperty.call(sectionSnapshot, snapshotField)
      && releaseSection[releaseField] !== sectionSnapshot[snapshotField]) {
      throw new Error(`The assessment seed found frozen subject label drift for ${label}.`);
    }
  }
  const snapshotItems = Array.isArray(sectionSnapshot.items) ? sectionSnapshot.items : null;
  const releaseItems = Array.isArray(releaseSection.items) ? releaseSection.items : null;
  if (!snapshotItems || !releaseItems || snapshotItems.length !== releaseItems.length) {
    throw new Error(`The assessment seed found an incomplete frozen item snapshot for ${label}.`);
  }
  const snapshotItemIds = snapshotItems.map((snapshotItem) => {
    if (!isRecord(snapshotItem) || typeof snapshotItem.id !== "string") {
      throw new Error(`The assessment seed found an incomplete frozen item snapshot for ${label}.`);
    }
    return snapshotItem.id;
  });
  const releaseItemIds = releaseItems.map((releaseItem) => releaseItem.physicalId);
  const releaseItemIdSet = new Set(releaseItemIds);
  if (releaseItemIds.some((id) => typeof id !== "string")
    || new Set(snapshotItemIds).size !== snapshotItemIds.length
    || releaseItemIdSet.size !== releaseItemIds.length
    || snapshotItemIds.some((id) => !releaseItemIdSet.has(id))) {
    throw new Error(`The assessment seed found a non-bijective item bridge for ${label}.`);
  }
  const releaseItemById = new Map(releaseItems.map((candidate) => [candidate.physicalId, candidate]));
  for (const snapshotItem of snapshotItems) {
    const releaseItem = releaseItemById.get(snapshotItem.id);
    assertSeedReleaseItemBridge(releaseItem, snapshotItem, label);
  }
}

function assertSeedPhysicalSnapshotMatchesRelease(snapshot, releasePayload, label) {
  const physical = isRecord(snapshot) ? snapshot : {};
  const content = isRecord(physical.content) ? physical.content : physical;
  assertSeedSnapshotMatchesRelease(content, releasePayload, label);
  const releaseSection = (releasePayload?.sections ?? []).find((candidate) => candidate.physicalId === content.sectionId);
  if (!releaseSection) throw new Error(`The assessment seed could not find the physical Section bridge for ${label}.`);
  const expectedLogicalId = `subtest:${physical.subtest_id ?? content.subtestId}:sequence:${physical.sequence_no ?? content.sequenceNo}`;
  if (releaseSection.id !== expectedLogicalId
    || releaseSection.subtestId !== (physical.subtest_id ?? content.subtestId)
    || releaseSection.title !== physical.title
    || releaseSection.subtestCode !== physical.subtest_code
    || releaseSection.subtestName !== physical.subtest_name
    || releaseSection.assembly?.mode !== ((physical.package_version_id ?? null) ? "fixed_set" : "direct")
    || (releaseSection.assembly?.packageVersionId ?? null) !== (physical.package_version_id ?? null)) {
    throw new Error(`The assessment seed could not prove the complete physical Section identity for ${label}.`);
  }
  for (const item of content.items ?? []) {
    if ((item.packageVersionId ?? null) !== (physical.package_version_id ?? null)) {
      throw new Error(`The assessment seed found item/Section package binding drift for ${label}.`);
    }
    assertSeedDirectSnapshotMarker(item, `${label} item ${item.id}`);
  }
}

function assertSeedHistoricalRunSnapshotMatchesRelease(contentSnapshot, physicalSection, releasePayload, label) {
  const snapshot = isRecord(contentSnapshot) ? contentSnapshot : {};
  const sectionSnapshot = isRecord(snapshot.content) ? snapshot.content : snapshot;
  const physicalContent = isRecord(physicalSection?.content) ? physicalSection.content : physicalSection;
  const missingFields = SEED_SECTION_SNAPSHOT_REQUIRED_FIELDS.filter(
    (field) => !Object.prototype.hasOwnProperty.call(sectionSnapshot, field),
  );
  const unsupportedMissingFields = missingFields.filter((field) => !SEED_HISTORICAL_RUN_FALLBACK_FIELDS.has(field));
  if (unsupportedMissingFields.length || missingFields.some((field) => !Object.prototype.hasOwnProperty.call(physicalContent ?? {}, field))) {
    throw new Error(`The assessment seed found an incomplete frozen historical run snapshot for ${label}.`);
  }
  const normalizedSectionSnapshot = { ...sectionSnapshot };
  for (const field of missingFields) normalizedSectionSnapshot[field] = physicalContent[field];
  const normalizedSnapshot = isRecord(snapshot.content)
    ? { ...snapshot, content: normalizedSectionSnapshot }
    : normalizedSectionSnapshot;
  assertSeedSnapshotMatchesRelease(normalizedSnapshot, releasePayload, label);
  return missingFields;
}

function assertSeedRunSnapshotIdentity(run, section, label) {
  const snapshot = isRecord(run.content_snapshot) ? run.content_snapshot : {};
  const sectionSnapshot = isRecord(snapshot.content) ? snapshot.content : snapshot;
  if (sectionSnapshot.sectionId !== run.tryout_section_id
    || sectionSnapshot.sequenceNo !== run.sequence_no
    || sectionSnapshot.subtestId !== section.subtest_id) {
    throw new Error(`The assessment seed found a ${label} run whose frozen section identity does not match its physical run row.`);
  }
}

function assertSeedFrozenRunComplete(run, section, releasePayload, label) {
  if (section.package_version_id === null) {
    assertSeedSnapshotMatchesRelease(run.content_snapshot, releasePayload, label);
  } else {
    assertSeedHistoricalRunSnapshotMatchesRelease(run.content_snapshot, section, releasePayload, label);
  }
  if (!run.scoring_state
    || !run.scoring_version
    || !run.scoring_provenance
    || !run.calculation_version
    || !isRecord(run.calculation_input)
    || !isRecord(run.calculation_result)
    || typeof run.calculation_releaseable !== "boolean") {
    throw new Error(`The assessment seed found incomplete frozen scoring fields for ${label}.`);
  }
  if (section.test_type !== "cat") return;
  const cat = isRecord(run.cat_snapshot) ? run.cat_snapshot : null;
  const releaseSection = (releasePayload?.sections ?? []).find((candidate) => candidate.physicalId === section.id);
  const expectedParameters = releaseSection?.cat?.parameters;
  if (!cat
    || cat.modelVersion !== releaseSection?.cat?.modelVersion
    || !Number.isFinite(Number(cat.currentAbility))
    || !Number.isFinite(Number(cat.initialAbility))
    || !Array.isArray(cat.parameters)
    || !Array.isArray(expectedParameters)
    || cat.parameters.length !== expectedParameters.length
    || !Array.isArray(cat.selectedItemIds)
    || !Array.isArray(cat.updates)) {
    throw new Error(`The assessment seed found an incomplete frozen CAT snapshot for ${label}.`);
  }
  const releaseItemById = new Map((releaseSection?.items ?? []).map((item) => [item.id, item]));
  for (const parameter of cat.parameters) {
    const expected = expectedParameters.find((candidate) => {
      if (candidate.itemId === parameter.itemId) return true;
      return releaseItemById.get(candidate.itemId)?.physicalId === parameter.itemId;
    });
    if (!expected
      || expected.calibrationDigest !== parameter.calibrationDigest
      || Number(expected.difficulty) !== Number(parameter.difficulty)
      || Number(expected.discrimination) !== Number(parameter.discrimination)
      || expected.sourceContentDigest !== parameter.sourceContentDigest
      || expected.sourceQuestionId !== parameter.sourceQuestionId
      || expected.sourceQuestionRevisionId !== parameter.sourceQuestionRevisionId
      || expected.sourceRevisionProvenance !== parameter.sourceRevisionProvenance) {
      throw new Error(`The assessment seed found CAT parameter drift for ${label}.`);
    }
  }
}

function mergeReleaseMediaIntoSnapshot(contentSnapshot, releasePayload, assessmentRelease) {
  const snapshot = isRecord(contentSnapshot) ? contentSnapshot : {};
  const sections = Array.isArray(releasePayload?.sections) ? releasePayload.sections : [];
  const content = isRecord(snapshot.content) ? snapshot.content : null;
  const sectionSnapshot = content ?? snapshot;
  const releaseSection = sections.find((section) =>
    (section.physicalId && sectionSnapshot.sectionId === section.physicalId)
      || (section.id && sectionSnapshot.releaseSectionId === section.id),
  );
  const snapshotItems = Array.isArray(sectionSnapshot.items) ? sectionSnapshot.items : null;
  const releaseItems = Array.isArray(releaseSection?.items) ? releaseSection.items : [];
  const mergedItems = snapshotItems
    ? snapshotItems.map((snapshotItem) => {
      if (!isRecord(snapshotItem)) return snapshotItem;
      const releaseItem = releaseItems.find((candidate) =>
        candidate.physicalId === snapshotItem.id
          || (candidate.sourceQuestionId && candidate.sourceQuestionId === snapshotItem.sourceQuestionId
            && candidate.sourceQuestionRevisionId === snapshotItem.sourceQuestionRevisionId
            && candidate.sourceContentDigest === snapshotItem.sourceContentDigest),
      );
      if (!releaseItem) return snapshotItem;
      const snapshotOptions = Array.isArray(snapshotItem.options) ? snapshotItem.options : null;
      const releaseOptions = Array.isArray(releaseItem.options) ? releaseItem.options : [];
      const mergedOptions = snapshotOptions
        ? snapshotOptions.map((snapshotOption) => {
          if (!isRecord(snapshotOption)) return snapshotOption;
          const releaseOption = releaseOptions.find((candidate) =>
            candidate.physicalId === snapshotOption.id
              || (candidate.sourceQuestionOptionId && candidate.sourceQuestionOptionId === snapshotOption.sourceQuestionOptionId)
              || (candidate.sourceQuestionRevisionOptionId && candidate.sourceQuestionRevisionOptionId === snapshotOption.sourceQuestionRevisionOptionId),
          );
          return releaseOption && releaseOption.assetId !== undefined
            ? { ...snapshotOption, assetId: releaseOption.assetId }
            : snapshotOption;
        })
        : snapshotItem.options;
      return {
        ...snapshotItem,
        ...(releaseItem.promptAssetId !== undefined ? { promptAssetId: releaseItem.promptAssetId } : {}),
        ...(releaseItem.explanationAssetId !== undefined ? { explanationAssetId: releaseItem.explanationAssetId } : {}),
        ...(mergedOptions ? { options: mergedOptions } : {}),
      };
    })
    : sectionSnapshot.items;
  const nextSectionSnapshot = mergedItems ? { ...sectionSnapshot, items: mergedItems } : sectionSnapshot;
  const nextSnapshot = content
    ? { ...snapshot, content: nextSectionSnapshot }
    : nextSectionSnapshot;
  return { ...nextSnapshot, assessmentRelease: seedExistingReleaseSnapshotMetadata(snapshot, assessmentRelease) };
}

function seedCatSnapshot(section, releasePayload, selectedItemIds) {
  const releaseSection = (releasePayload?.sections ?? []).find((candidate) =>
    candidate.physicalId && candidate.physicalId === section.id,
  );
  const releaseParameters = releaseSection?.cat?.parameters ?? [];
  const releaseItems = releaseSection?.items ?? [];
  if (!releaseSection?.cat?.modelVersion || releaseSection.cat.modelVersion !== "2pl-canonical-v1" || releaseParameters.length !== section.content.items.length) {
    throw new Error("The assessment seed requires a complete frozen CAT parameter snapshot.");
  }
  const parameters = releaseParameters.map((parameter) => {
    const releaseItem = releaseItems.find((item) => item.id === parameter.itemId);
    if (!releaseItem?.physicalId) throw new Error("The assessment seed could not bridge a CAT release item to its physical snapshot row.");
    return { ...parameter, itemId: releaseItem.physicalId };
  });
  return {
    currentAbility: 0,
    initialAbility: 0,
    modelVersion: releaseSection.cat.modelVersion,
    parameters,
    selectedItemIds,
    updates: [],
  };
}

function completeSeedContentSnapshot(contentSnapshot, section, assessmentRelease) {
  const snapshot = isRecord(contentSnapshot) ? contentSnapshot : {};
  const nested = isRecord(snapshot.content) ? snapshot.content : null;
  const current = nested ?? snapshot;
  const content = { ...section.content, ...current };
  const releaseSnapshotMetadata = seedExistingReleaseSnapshotMetadata(snapshot, assessmentRelease);
  return nested
    ? { ...snapshot, assessmentRelease: releaseSnapshotMetadata, content }
    : { ...content, assessmentRelease: releaseSnapshotMetadata };
}

async function seedCompletedAttempt(client, { admissionId, deliverySessionId, scorePattern, studentId, tryoutId }) {
  const releaseResult = await client.query(
    `SELECT session.assessment_release_id AS id,
            release.release_number,
            release.content_digest,
            release.payload
       FROM tryout_delivery_sessions AS session
       JOIN assessment_releases AS release ON release.id = session.assessment_release_id
      WHERE session.id = $1
        AND session.tryout_id = $2`,
    [deliverySessionId, tryoutId],
  );
  if (!releaseResult.rowCount) throw new Error("The assessment seed requires every delivery session to pin an AssessmentRelease.");
  const assessmentRelease = {
    contentDigest: releaseResult.rows[0].content_digest,
    id: releaseResult.rows[0].id,
    releaseNumber: releaseResult.rows[0].release_number,
  };
  const releasePayload = releaseResult.rows[0].payload;
  const existing = await client.query(
    `SELECT id, assessment_release_id, assessment_release_number,
            assessment_release_digest, content_snapshot
       FROM tryout_attempts
      WHERE delivery_session_id = $1
        AND student_id = $2`,
    [deliverySessionId, studentId],
  );
  if (existing.rowCount) {
    assertSeedReleaseBindingCompatible(existing.rows[0], assessmentRelease, "attempt");
    assertSeedReleaseMetadataCompatible(existing.rows[0].content_snapshot, assessmentRelease, "attempt");
    const existingRuns = await client.query(
      `SELECT id, assessment_release_id, assessment_release_number,
              assessment_release_digest, cat_snapshot, content_snapshot,
              sequence_no, tryout_section_id, scoring_state, scoring_version,
              scoring_provenance, calculation_input, calculation_result,
              calculation_version, calculation_releaseable
         FROM tryout_attempt_test_runs
        WHERE attempt_id = $1
        ORDER BY sequence_no`,
      [existing.rows[0].id],
    );
    const existingSections = await sectionSnapshots(client, tryoutId);
    if (existingRuns.rowCount !== existingSections.length) {
      throw new Error("The assessment seed refuses to repair an attempt with an incomplete set of frozen Test runs.");
    }
    const existingSectionById = new Map(existingSections.map((section) => [section.id, section]));
    const seenRunSectionIds = new Set();
    for (const run of existingRuns.rows) {
      const section = existingSectionById.get(run.tryout_section_id);
      if (!section || seenRunSectionIds.has(run.tryout_section_id) || run.sequence_no !== section.sequence_no) {
        throw new Error("The assessment seed refuses to repair duplicate, missing, or re-sequenced frozen Test runs.");
      }
      seenRunSectionIds.add(run.tryout_section_id);
      assertSeedRunSnapshotIdentity(run, section, `run ${run.id}`);
      assertSeedReleaseBindingCompatible(run, assessmentRelease, "run");
      assertSeedReleaseMetadataCompatible(run.content_snapshot, assessmentRelease, "run");
      assertSeedFrozenRunComplete(run, section, releasePayload, `run ${run.id}`);
    }
    if (seenRunSectionIds.size !== existingSections.length) {
      throw new Error("The assessment seed refuses to repair an attempt without one frozen Test run per physical section.");
    }
    // The current physical rows must still be exactly the bridge represented
    // by the pinned release.  If a previous seed rebuilt them, stop before
    // mixing old release identity with new section/item content.
    for (const section of existingSections) {
      assertSeedSnapshotMatchesRelease(section.content, releasePayload, `current section ${section.id}`);
    }
    await client.query(
      `UPDATE tryout_attempts
          SET assessment_release_id = $2,
              assessment_release_number = $3,
              assessment_release_digest = $4,
              content_snapshot = jsonb_set(
                CASE WHEN jsonb_typeof(content_snapshot) = 'object' THEN content_snapshot ELSE '{}'::jsonb END,
                '{assessmentRelease}', $5::jsonb, TRUE
              )
        WHERE id = $1`,
      [existing.rows[0].id, assessmentRelease.id, assessmentRelease.releaseNumber, assessmentRelease.contentDigest, JSON.stringify(seedExistingReleaseSnapshotMetadata(existing.rows[0].content_snapshot, assessmentRelease))],
    );
    await client.query(
      `UPDATE tryout_attempt_test_runs
          SET assessment_release_id = $2,
              assessment_release_number = $3,
              assessment_release_digest = $4
        WHERE attempt_id = $1`,
      [existing.rows[0].id, assessmentRelease.id, assessmentRelease.releaseNumber, assessmentRelease.contentDigest],
    );
    for (const run of existingRuns.rows) {
      const section = existingSectionById.get(run.tryout_section_id);
      const contentSnapshot = completeSeedContentSnapshot(mergeReleaseMediaIntoSnapshot(run.content_snapshot, releasePayload, assessmentRelease), section, assessmentRelease);
      const catSnapshot = section.test_type === "cat"
        ? seedCatSnapshot(section, releasePayload, Array.isArray(run.cat_snapshot?.selectedItemIds) ? run.cat_snapshot.selectedItemIds : section.content.items.slice(0, 2).map((item) => item.id))
        : null;
      await client.query(
        `UPDATE tryout_attempt_test_runs
            SET content_snapshot = $2::jsonb,
                cat_snapshot = $3::jsonb
          WHERE id = $1`,
        [run.id, JSON.stringify(contentSnapshot), catSnapshot ? JSON.stringify(catSnapshot) : null],
      );
    }
    await normalizeSeededAttemptTiming(client, existing.rows[0].id);
    return existing.rows[0].id;
  }
  const sections = await sectionSnapshots(client, tryoutId);
  if (sections.length !== 7 || scorePattern.length !== sections.length) throw new Error("The assessment seed expects seven score inputs.");
  for (const section of sections) {
    assertSeedSnapshotMatchesRelease(section.content, releasePayload, `new section ${section.id}`);
  }
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
  const aggregateCounts = sections.reduce((totals, section, sectionIndex) => {
    const score = scorePattern[sectionIndex];
    const isCat = section.test_type === "cat";
    const deliveredCount = isCat ? 2 : section.content.items.length;
    const correctCount = isCat ? Math.min(2, Math.max(0, score)) : score;
    totals.correctCount += correctCount;
    totals.wrongCount += deliveredCount - correctCount;
    totals.rawScore += isCat ? (correctCount === 2 ? 0.72 : -0.15) : score;
    return totals;
  }, { correctCount: 0, rawScore: 0, wrongCount: 0 });
  const attemptResult = await client.query(
    `INSERT INTO tryout_attempts (
       tryout_id, delivery_session_id, admission_id, student_id, status,
       attempt_state, scoring_state, release_state,
       assessment_release_id, assessment_release_number, assessment_release_digest,
       server_started_at, server_deadline_at, submitted_at,
       correct_count, wrong_count, unanswered_count, raw_score, scaled_score, normalized_score, score,
       scoring_version, scoring_provenance, release_at,
       percentile_cohort, release_policy_snapshot, content_snapshot
     ) VALUES (
       $1, $2, $3, $4, 'scored',
       'submitted'::assessment_attempt_state,
       'scored'::assessment_scoring_state,
       'released'::assessment_result_release_state,
       $12, $13, $14,
       NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days',
       $6, $7, 0, $8, $5, $5, $5,
       'normalized-test-mean-v1', 'runtime'::assessment_scoring_provenance,
       NOW() - INTERVAL '6 days',
       $9, $10::jsonb, $11::jsonb
     ) RETURNING id`,
    [tryoutId, deliverySessionId, admissionId, studentId, finalScore, aggregateCounts.correctCount, aggregateCounts.wrongCount, aggregateCounts.rawScore, finalScore >= 60 ? 82 : 61, JSON.stringify({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, rankingRule: "cohort", resultReleasePolicy: "manual", scheduledReleaseAt: null }), JSON.stringify({ assessmentRelease: seedReleaseSnapshotMetadata(assessmentRelease), tryoutId, tryoutRevision: releasePayload?.tryout?.revision ?? null }), assessmentRelease.id, assessmentRelease.releaseNumber, assessmentRelease.contentDigest],
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
    const maxScore = isCat ? null : section.content.items.reduce((total, item) => total + Number(item.points), 0);
    const rawScore = isCat ? ability : score;
    const scoringVersion = isCat ? "2pl-map-v1" : "cbt-frozen-item-points-v1";
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
         calculation_result, calculation_version, scoring_state, scoring_version,
         assessment_release_id, assessment_release_number, assessment_release_digest,
         scoring_provenance, correct_count, wrong_count, unanswered_count,
         raw_score, max_score, scaled_score, normalized_score,
         cat_state, cat_snapshot,
         calculation_releaseable
       ) VALUES (
         $1, $2, $3, 'sealed', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days',
         NOW() - INTERVAL '8 days', $4::jsonb, $5::jsonb, $6::jsonb, $7,
         'scored'::assessment_scoring_state, $7,
         $16, $17, $18,
         'runtime'::assessment_scoring_provenance,
         $8, $9, $10, $11, $12, $13, $13,
         $14::tryout_cat_run_state, $15::jsonb, TRUE
       ) RETURNING id`,
      [
        attemptId,
        section.id,
        section.sequence_no,
        JSON.stringify({ ...section.content, assessmentRelease: seedReleaseSnapshotMetadata(assessmentRelease) }),
        JSON.stringify(calculationInput),
        JSON.stringify(calculationResult),
        scoringVersion,
        correctCount,
        wrongCount,
        0,
        rawScore,
        maxScore,
        normalizedScore,
        isCat ? "ready" : "not_applicable",
        isCat ? JSON.stringify(seedCatSnapshot(section, releasePayload, selectedItemIds)) : null,
        assessmentRelease.id,
        assessmentRelease.releaseNumber,
        assessmentRelease.contentDigest,
      ],
    );
    const answerableItems = isCat ? section.content.items.slice(0, 2) : section.content.items;
    for (const [itemIndex, item] of answerableItems.entries()) {
      const chooseCorrect = itemIndex < correctCount;
      const selected = item.options.find((option) => option.isCorrect === chooseCorrect) ?? item.options[0];
      await client.query(
        `INSERT INTO tryout_answers (
           attempt_id, attempt_test_run_id, tryout_id, tryout_item_id,
           selected_option_id, is_correct, points_awarded, scoring_version, answered_at, synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days')`,
        [attemptId, runResult.rows[0].id, tryoutId, item.id, selected.id, selected.isCorrect, selected.isCorrect ? 1 : 0, scoringVersion],
      );
    }
    await client.query(
      `INSERT INTO tryout_score_breakdowns (
         attempt_id, subtest_id, correct_count, wrong_count, unanswered_count, raw_score, scaled_score,
         normalized_score, scoring_version, scoring_provenance
       ) VALUES ($1, $2, $3::int, $4::int, 0, $5::numeric, $6::numeric, $6::numeric, $7, 'runtime'::assessment_scoring_provenance)`,
      [attemptId, section.subtest_id, correctCount, wrongCount, isCat ? ability : score, normalizedScore, scoringVersion],
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

async function seedTryoutOperations(client, { assessmentRelease, studentIds, tryoutId, tutorId }) {
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
      assessmentRelease,
      name: "Sesi Evaluasi Sebelumnya",
      relativeWindow: { from: -10, until: -8 },
      release: { defaultRegistration: false, fullscreenPrompt: true, policy: "manual", released: true },
      status: "closed",
      tryoutId,
      tutorId,
    }),
    upsertDeliverySession(client, {
      assessmentRelease,
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
  const [subtestIds, quizBankId, tryoutBankId] = await Promise.all([
    resolveSubtests(client),
    upsertQuestionBank(client, tutorId, "quiz"),
    upsertQuestionBank(client, tutorId, "tryout"),
  ]);
  await seedQuestionBankOrganization(client, { tutorId });
  const [quizQuestions, tryoutQuestions] = await Promise.all([
    upsertQuestions(client, { bankId: quizBankId, purpose: "quiz", subtestIds, tutorId }),
    upsertQuestions(client, { bankId: tryoutBankId, purpose: "tryout", subtestIds, tutorId }),
  ]);
  await upsertCalibrations(client, tutorId, tryoutQuestions);
  const versionIds = await seedReusablePackages(client, { bankId: tryoutBankId, questions: tryoutQuestions, subtestIds, tutorId });
  const [quizIds, tryoutId] = await Promise.all([
    seedQuizzes(client, { bankId: quizBankId, questions: quizQuestions, studentIds, subtestIds, tutorId }),
    seedTryout(client, { examEventId, subtestIds, tutorId, versionIds }),
  ]);
  const assessmentRelease = await upsertAssessmentRelease(client, { tryoutId, tutorId });
  const sessions = await seedTryoutOperations(client, { assessmentRelease, studentIds, tryoutId, tutorId });
  return { bankIds: { quiz: quizBankId, tryout: tryoutBankId }, questionCount: quizQuestions.length + tryoutQuestions.length, quizQuestionCount: quizQuestions.length, tryoutQuestionCount: tryoutQuestions.length, quizCount: quizIds.size, sessions, tryoutId, versionCount: versionIds.size };
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

export {
  QUESTIONS,
  SUBJECTS,
  assertSeedDirectSnapshotMarker,
  assertSeedFreshSessionReleaseBindings,
  assertSeedHistoricalAttemptsClosed,
  assertSeedPhysicalSnapshotMatchesRelease,
  assertSeedReleasePayloadIdentity,
  assertSeedReleaseMetadataCompatible,
  assertSeedRequiredReleaseMetadata,
  assertSeedSnapshotMatchesRelease,
  assertSeedTryoutRebuildAllowed,
  assertSeedHistoricalRunSnapshotMatchesRelease,
  sectionSnapshots,
  seedExistingReleaseSnapshotMetadata,
  seedReleaseSnapshotMetadata,
  seedAssessmentDemo,
};
