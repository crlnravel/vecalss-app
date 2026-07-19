import "dotenv/config";

import pg from "pg";

const { Client } = pg;

const SUBJECTS = [
  { code: "PU", slug: "penalaran-umum", label: "Penalaran Umum" },
  { code: "PPU", slug: "pengetahuan-pemahaman-umum", label: "Pengetahuan dan Pemahaman Umum" },
  { code: "PBM", slug: "pemahaman-bacaan-menulis", label: "Pemahaman Bacaan dan Menulis" },
  { code: "PK", slug: "pengetahuan-kuantitatif", label: "Pengetahuan Kuantitatif" },
  { code: "LBI", slug: "literasi-bahasa-indonesia", label: "Literasi Bahasa Indonesia" },
  { code: "LBE", slug: "literasi-bahasa-inggris", label: "Literasi Bahasa Inggris" },
  { code: "PM", slug: "penalaran-matematika", label: "Penalaran Matematika" },
];

// These are the reviewed Bank Soal prototype questions. Content is intentionally
// limited to the subjects that already had reviewed questions; this seed must not
// manufacture academic content merely to populate every subject.
const QUESTIONS = [
  {
    code: "seed:assessment:question:pu-inferensi-1",
    subjectCode: "PU",
    difficulty: "medium",
    stem: "Jumlah pengguna transportasi umum meningkat tahun ini. Simpulan yang paling tepat adalah...",
    explanation: "Klaim peningkatan tidak membuktikan bahwa seluruh warga sudah beralih.",
    options: [
      "Semua warga kota menggunakan transportasi umum.",
      "Sebagian warga kota masih menggunakan kendaraan pribadi.",
      "Transportasi umum hanya tersedia pada akhir pekan.",
      "Tidak ada warga kota yang bekerja dari rumah.",
    ],
    correctIndex: 1,
  },
  {
    code: "seed:assessment:question:pu-inferensi-2",
    subjectCode: "PU",
    difficulty: "hard",
    stem: "Jika data baru tidak selaras dengan kesimpulan awal, tindakan paling logis adalah...",
    explanation: "Data yang berbeda menuntut pengujian ulang, bukan penolakan otomatis.",
    options: ["Peneliti selalu keliru.", "Data baru perlu diperiksa sebelum kesimpulan lama dipertahankan.", "Kesimpulan lama pasti benar.", "Semua data baru harus ditolak."],
    correctIndex: 1,
  },
  {
    code: "seed:assessment:question:pu-inferensi-3",
    subjectCode: "PU",
    difficulty: "easy",
    stem: "Manakah pernyataan yang merupakan inferensi wajar dari jalan yang basah dan licin?",
    explanation: "Pernyataan tersebut menyatakan hubungan sebab yang mungkin, bukan kepastian berlebihan.",
    options: ["Hujan turun sepanjang hari.", "Jalan licin dapat disebabkan oleh hujan.", "Semua jalan selalu licin.", "Tidak ada kendaraan yang lewat."],
    correctIndex: 1,
  },
  {
    code: "seed:assessment:question:pk-grafik-1",
    subjectCode: "PK",
    difficulty: "easy",
    stem: "Nilai meningkat dari 80 menjadi 100. Berapa persen kenaikannya?",
    explanation: "Kenaikan 20 dari dasar 80 adalah 20/80 atau 25%.",
    options: ["20%", "25%", "30%", "40%"],
    correctIndex: 1,
  },
  {
    code: "seed:assessment:question:pk-grafik-2",
    subjectCode: "PK",
    difficulty: "medium",
    stem: "Rasio 24 peserta perempuan terhadap 40 peserta laki-laki dalam bentuk paling sederhana adalah...",
    explanation: "Rasio 24 : 40 disederhanakan dengan membagi keduanya dengan 8.",
    options: ["3 : 5", "5 : 3", "8 : 3", "15 : 8"],
    correctIndex: 0,
  },
  {
    code: "seed:assessment:question:pk-grafik-3",
    subjectCode: "PK",
    difficulty: "medium",
    stem: "Pada diagram batang, kategori tertinggi menunjukkan 18 peserta. Nilai kategori tertinggi adalah...",
    explanation: "Opsi ini menguji pembacaan nilai tertinggi pada grafik.",
    options: ["12", "15", "18", "20"],
    correctIndex: 2,
  },
  {
    code: "seed:assessment:question:pbm-paragraf-1",
    subjectCode: "PBM",
    difficulty: "medium",
    stem: "Pilih konjungsi yang tepat: Rani sudah belajar dengan tekun. ..., ia tetap perlu beristirahat cukup.",
    explanation: "Namun menandai pertentangan antara dua gagasan.",
    options: ["Sebab itu", "Namun", "Selain itu", "Misalnya"],
    correctIndex: 1,
  },
  {
    code: "seed:assessment:question:pbm-paragraf-2",
    subjectCode: "PBM",
    difficulty: "easy",
    stem: "Dalam paragraf deduktif, gagasan utama umumnya terletak pada...",
    explanation: "Gagasan utama biasanya memuat pernyataan umum yang dijelaskan kalimat berikutnya.",
    options: ["Kalimat pertama", "Kalimat kedua", "Kalimat ketiga", "Kalimat keempat"],
    correctIndex: 0,
  },
  {
    code: "seed:assessment:question:pbm-paragraf-3",
    subjectCode: "PBM",
    difficulty: "medium",
    stem: "Salah satu cara membangun kohesi paragraf adalah...",
    explanation: "Kohesi dibangun melalui pengulangan wajar, kata rujukan, dan konjungsi.",
    options: ["Pengulangan kata kunci secara wajar", "Perubahan topik pada setiap kalimat", "Penggunaan kalimat tanpa hubungan", "Menghapus seluruh kata rujukan"],
    correctIndex: 0,
  },
];

const BANK = {
  code: "seed:assessment:mixed-subject-bank:v1",
  name: "Bank Soal Dasar Campuran",
  description: "Baseline terkurasi untuk validasi Bank Soal, Quiz, dan Tryout canonical.",
};
const QUIZ = {
  idempotencyKey: "seed:assessment:quiz:pu-inferensi:v1",
  slug: "seed-quiz-pu-inferensi",
  title: "Quiz PU: Simpulan Implisit",
  description: "Quiz baseline dari Bank Soal Dasar Campuran.",
};
const TRYOUT = {
  code: "seed:assessment:tryout:baseline:v1",
  idempotencyKey: "seed:assessment:tryout:baseline:v1",
  title: "Tryout Baseline Canonical",
  description: "Draft baseline dengan tujuh section subject canonical.",
};

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the assessment-only seed.");
  return databaseUrl;
}

function requireTutorEmail() {
  const email = process.env.ASSESSMENT_SEED_TUTOR_EMAIL?.trim();
  if (!email) throw new Error("ASSESSMENT_SEED_TUTOR_EMAIL is required and must identify an existing active tutor with an active tutor profile.");
  return email;
}

async function resolveActiveTutor(client, email) {
  const result = await client.query(
    `SELECT users.id FROM users
       JOIN role_assignments ON role_assignments.user_id = users.id AND role_assignments.role = 'tutor' AND role_assignments.revoked_at IS NULL
       JOIN tutor_profiles ON tutor_profiles.user_id = users.id AND tutor_profiles.is_active = TRUE
     WHERE LOWER(users.email) = LOWER($1) AND users.status = 'active'
     LIMIT 1 FOR UPDATE OF users, role_assignments, tutor_profiles`,
    [email],
  );
  if (!result.rowCount) throw new Error(`ASSESSMENT_SEED_TUTOR_EMAIL must identify an existing active tutor with an active tutor role assignment and active tutor profile: ${email}`);
  return result.rows[0].id;
}

async function upsertSubjectTags(client) {
  const ids = new Map();
  for (const subject of SUBJECTS) {
    const result = await client.query(
      `INSERT INTO tags (code, slug, label) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET slug = EXCLUDED.slug, label = EXCLUDED.label
       RETURNING id`,
      [subject.code, subject.slug, subject.label],
    );
    ids.set(subject.code, result.rows[0].id);
  }
  return ids;
}

async function resolveSubtests(client) {
  const result = await client.query("SELECT id, code FROM subtests WHERE code = ANY($1::text[]) AND is_active = TRUE FOR SHARE", [SUBJECTS.map(({ code }) => code)]);
  const ids = new Map(result.rows.map((row) => [row.code, row.id]));
  const missing = SUBJECTS.filter(({ code }) => !ids.has(code)).map(({ code }) => code);
  if (missing.length) throw new Error(`Assessment seed requires active canonical Subtests: ${missing.join(", ")}. Run the established taxonomy/content seed first.`);
  return ids;
}

async function upsertBank(client, actorId, tagIds) {
  const result = await client.query(
    `INSERT INTO question_banks (code, name, description, status, revision, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, 'published', 1, $4, $4)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = EXCLUDED.status, revision = EXCLUDED.revision, updated_by_user_id = EXCLUDED.updated_by_user_id
     RETURNING id`,
    [BANK.code, BANK.name, BANK.description, actorId],
  );
  const bankId = result.rows[0].id;
  await client.query("DELETE FROM question_bank_tags WHERE question_bank_id = $1", [bankId]);
  for (const tagId of tagIds.values()) await client.query("INSERT INTO question_bank_tags (question_bank_id, tag_id) VALUES ($1, $2)", [bankId, tagId]);
  return bankId;
}

async function clearCanonicalSnapshotOptionProvenance(client) {
  // Source-option provenance is deliberately RESTRICT. Detach only this seed's
  // snapshots before replacing its stable source options; the snapshots receive
  // their current canonical source option IDs again later in this transaction.
  await client.query(
    `UPDATE standalone_quiz_item_options options SET source_question_option_id = NULL
       FROM standalone_quiz_items items
       JOIN standalone_quizzes quiz ON quiz.id = items.quiz_id
     WHERE options.quiz_item_id = items.id
       AND quiz.idempotency_key = $1
       AND items.idempotency_key = $2`,
    [QUIZ.idempotencyKey, "seed:assessment:quiz-item:pu-inferensi-1:v1"],
  );
  await client.query(
    `UPDATE tryout_item_options options SET source_question_option_id = NULL
       FROM tryout_items items
       JOIN tryout_packages package ON package.id = items.tryout_id
     WHERE options.tryout_item_id = items.id
       AND package.code = $1
       AND items.idempotency_key = ANY($2::text[])`,
    [TRYOUT.code, SUBJECTS.map(({ code }) => `seed:assessment:tryout-item:${code.toLowerCase()}:v1`)],
  );
}

async function upsertQuestion(client, question, bankId, subtestId, actorId) {
  const result = await client.query(
    `INSERT INTO questions (code, question_bank_id, subtest_id, topic_id, stem, question_type, difficulty, explanation, prompt_asset_id, explanation_asset_id, status, source, revision, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, NULL, $4, 'single_choice', $5::difficulty_level, $6, NULL, NULL, 'published', 'reviewed-prototype-baseline', 1, $7, $7)
     ON CONFLICT (code) DO UPDATE SET question_bank_id = EXCLUDED.question_bank_id, subtest_id = EXCLUDED.subtest_id, topic_id = NULL, stem = EXCLUDED.stem, question_type = 'single_choice', difficulty = EXCLUDED.difficulty, explanation = EXCLUDED.explanation, prompt_asset_id = NULL, explanation_asset_id = NULL, status = 'published', source = EXCLUDED.source, revision = EXCLUDED.revision, updated_by_user_id = EXCLUDED.updated_by_user_id
     RETURNING id`,
    [question.code, bankId, subtestId, question.stem, question.difficulty, question.explanation, actorId],
  );
  const questionId = result.rows[0].id;
  await client.query("DELETE FROM question_options WHERE question_id = $1", [questionId]);
  const optionIds = [];
  for (const [index, content] of question.options.entries()) {
    const option = await client.query(
      "INSERT INTO question_options (question_id, label, content, is_correct, sort_order, asset_id) VALUES ($1, $2, $3, $4, $5, NULL) RETURNING id",
      [questionId, String.fromCharCode(65 + index), content, index === question.correctIndex, index],
    );
    optionIds.push(option.rows[0].id);
  }
  return { ...question, id: questionId, optionIds, subtestId };
}

async function replaceQuizItemOptions(client, quizItemId, source) {
  await client.query("DELETE FROM standalone_quiz_item_options WHERE quiz_item_id = $1", [quizItemId]);
  for (const [index, content] of source.options.entries()) {
    await client.query(
      "INSERT INTO standalone_quiz_item_options (quiz_item_id, choice_key, content, is_correct, sort_order, source_question_option_id, asset_id) VALUES ($1, $2, $3, $4, $5, $6, NULL)",
      [quizItemId, String.fromCharCode(65 + index), content, index === source.correctIndex, index, source.optionIds[index]],
    );
  }
}

async function upsertQuiz(client, actorId, bankId, source) {
  const quiz = await client.query(
    `INSERT INTO standalone_quizzes (slug, title, description, subtest_id, source_bank_id, status, opens_at, closes_at, revision, idempotency_key, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, 'published', NULL, NULL, 1, $6, $7)
     ON CONFLICT (idempotency_key) DO UPDATE SET slug = EXCLUDED.slug, title = EXCLUDED.title, description = EXCLUDED.description, subtest_id = EXCLUDED.subtest_id, source_bank_id = EXCLUDED.source_bank_id, status = EXCLUDED.status, opens_at = NULL, closes_at = NULL, revision = EXCLUDED.revision
     RETURNING id`,
    [QUIZ.slug, QUIZ.title, QUIZ.description, source.subtestId, bankId, QUIZ.idempotencyKey, actorId],
  );
  const quizId = quiz.rows[0].id;
  const itemKey = "seed:assessment:quiz-item:pu-inferensi-1:v1";
  const item = await client.query(
    `INSERT INTO standalone_quiz_items (quiz_id, sort_order, prompt, explanation, difficulty, subtest_id, source_question_id, prompt_asset_id, explanation_asset_id, idempotency_key)
     VALUES ($1, 0, $2, $3, $4::difficulty_level, $5, $6, NULL, NULL, $7)
     ON CONFLICT (quiz_id, idempotency_key) DO UPDATE SET sort_order = EXCLUDED.sort_order, prompt = EXCLUDED.prompt, explanation = EXCLUDED.explanation, difficulty = EXCLUDED.difficulty, subtest_id = EXCLUDED.subtest_id, source_question_id = EXCLUDED.source_question_id, prompt_asset_id = NULL, explanation_asset_id = NULL
     RETURNING id`,
    [quizId, source.stem, source.explanation, source.difficulty, source.subtestId, source.id, itemKey],
  );
  await replaceQuizItemOptions(client, item.rows[0].id, source);
  return { id: quizId, itemCount: 1 };
}

async function replaceTryoutItemOptions(client, itemId, source) {
  await client.query("DELETE FROM tryout_item_options WHERE tryout_item_id = $1", [itemId]);
  for (const [index, content] of source.options.entries()) {
    await client.query(
      "INSERT INTO tryout_item_options (tryout_item_id, choice_key, content, is_correct, sort_order, source_question_option_id, asset_id) VALUES ($1, $2, $3, $4, $5, $6, NULL)",
      [itemId, String.fromCharCode(65 + index), content, index === source.correctIndex, index, source.optionIds[index]],
    );
  }
}

async function upsertTryout(client, actorId, subtestIds, sourceQuestions) {
  const packageResult = await client.query(
    `INSERT INTO tryout_packages (code, title, description, assessment_type, status, published_at, revision, idempotency_key, created_by_user_id)
     VALUES ($1, $2, $3, 'tryout', 'draft', NULL, 1, $4, $5)
     ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, assessment_type = 'tryout', status = 'draft', published_at = NULL, revision = EXCLUDED.revision, idempotency_key = EXCLUDED.idempotency_key
     RETURNING id`,
    [TRYOUT.code, TRYOUT.title, TRYOUT.description, TRYOUT.idempotencyKey, actorId],
  );
  const tryoutId = packageResult.rows[0].id;
  const bySubject = new Map(sourceQuestions.map((question) => [question.subjectCode, question]));
  let itemCount = 0;
  for (const [index, subject] of SUBJECTS.entries()) {
    const source = bySubject.get(subject.code);
    const section = await client.query(
      `INSERT INTO tryout_sections (tryout_id, subtest_id, title, sequence_no, duration_seconds, question_count)
       VALUES ($1, $2, $3, $4, 1200, $5)
       ON CONFLICT (tryout_id, subtest_id) DO UPDATE SET title = EXCLUDED.title, sequence_no = EXCLUDED.sequence_no, duration_seconds = EXCLUDED.duration_seconds, question_count = EXCLUDED.question_count
       RETURNING id`,
      [tryoutId, subtestIds.get(subject.code), subject.label, index + 1, source ? 1 : 0],
    );
    if (!source) continue;
    const item = await client.query(
      `INSERT INTO tryout_items (tryout_id, tryout_section_id, source_question_id, sort_order, points, prompt, explanation, difficulty, subtest_id, package_code, prompt_asset_id, explanation_asset_id, idempotency_key)
       VALUES ($1, $2, $3, 0, 1, $4, $5, $6::difficulty_level, $7, $8, NULL, NULL, $9)
       ON CONFLICT (tryout_id, idempotency_key) DO UPDATE SET tryout_section_id = EXCLUDED.tryout_section_id, source_question_id = EXCLUDED.source_question_id, sort_order = EXCLUDED.sort_order, points = EXCLUDED.points, prompt = EXCLUDED.prompt, explanation = EXCLUDED.explanation, difficulty = EXCLUDED.difficulty, subtest_id = EXCLUDED.subtest_id, package_code = EXCLUDED.package_code, prompt_asset_id = NULL, explanation_asset_id = NULL
       RETURNING id`,
      [tryoutId, section.rows[0].id, source.id, source.stem, source.explanation, source.difficulty, source.subtestId, TRYOUT.code, `seed:assessment:tryout-item:${subject.code.toLowerCase()}:v1`],
    );
    await replaceTryoutItemOptions(client, item.rows[0].id, source);
    itemCount += 1;
  }
  return { id: tryoutId, sectionCount: SUBJECTS.length, itemCount };
}

async function main() {
  const tutorEmail = requireTutorEmail();
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    const actorId = await resolveActiveTutor(client, tutorEmail);
    const [tagIds, subtestIds] = await Promise.all([upsertSubjectTags(client), resolveSubtests(client)]);
    const bankId = await upsertBank(client, actorId, tagIds);
    await clearCanonicalSnapshotOptionProvenance(client);
    const seededQuestions = [];
    for (const question of QUESTIONS) seededQuestions.push(await upsertQuestion(client, question, bankId, subtestIds.get(question.subjectCode), actorId));
    const quiz = await upsertQuiz(client, actorId, bankId, seededQuestions[0]);
    const tryout = await upsertTryout(client, actorId, subtestIds, [
      seededQuestions.find((question) => question.subjectCode === "PU"),
      seededQuestions.find((question) => question.subjectCode === "PBM"),
      seededQuestions.find((question) => question.subjectCode === "PK"),
    ]);
    await client.query("COMMIT");
    transactionStarted = false;
    console.log(`Assessment seed complete: tags=${tagIds.size}; bank=${bankId}; questions=${seededQuestions.length}; quiz=${quiz.id} items=${quiz.itemCount}; tryout=${tryout.id} sections=${tryout.sectionCount} items=${tryout.itemCount}.`);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed canonical assessment baseline.");
  console.error(error);
  process.exitCode = 1;
});
