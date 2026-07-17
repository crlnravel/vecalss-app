import "dotenv/config";

import pg from "pg";

const { Client } = pg;

const INITIAL_PLACEHOLDER_MEDIA_URL = "https://www.youtube.com/embed/4rPIpRTEhfY?rel=0";

// This contract captures the static student catalogue at the migration point.
// It is intentionally stricter than runtime reads and is only for cutover.
const CATALOGUE = [
  { code: "PU", name: "Penalaran Umum", slug: "penalaran-umum", sections: [
    ["Pengenalan PU", [["06:12", "Apa yang Diuji di Penalaran Umum"], ["08:24", "Cara Menggunakan Modul Ini"], ["10:08", "Pemetaan Kemampuan Awal"]]],
    ["Konsep Inti", [["14:30", "Premis, Klaim, dan Simpulan"], ["17:42", "Kesalahan Umum Membaca Argumen"], ["12:56", "Strategi Eliminasi Cepat"]]],
    ["Latihan", [["18:10", "Guided Exercise: Argumen Pendek"], ["21:36", "Case Study: Set Argumen UTBK"]]],
  ] },
  { code: "PPU", name: "Pengetahuan dan Pemahaman Umum", slug: "pengetahuan-pemahaman-umum", sections: [
    ["Pengenalan PPU", [["07:16", "Ruang Lingkup PPU"], ["09:44", "Membaca Informasi Secara Presisi"]]],
    ["Konsep Inti", [["15:18", "Relasi Ide dalam Teks"], ["16:05", "Makna Kata dan Konteks"], ["13:40", "Menghindari Distraktor Umum"]]],
    ["Latihan", [["19:24", "Guided Exercise: Informasi Implisit"], ["22:10", "Case Study: Bacaan Campuran"]]],
  ] },
  { code: "PBM", name: "Pemahaman Bacaan dan Menulis", slug: "pemahaman-bacaan-menulis", sections: [
    ["Pengenalan PBM", [["06:58", "Format Soal PBM"], ["11:22", "Cara Membaca Kalimat Bermasalah"]]],
    ["Konsep Inti", [["16:35", "Efektivitas Kalimat"], ["14:48", "Kohesi dan Koherensi Paragraf"], ["13:52", "Kesalahan Ejaan yang Sering Muncul"]]],
    ["Latihan", [["20:28", "Guided Exercise: Sunting Kalimat"], ["23:12", "Case Study: Paragraf Tidak Efektif"]]],
  ] },
  { code: "PK", name: "Pengetahuan Kuantitatif", slug: "pengetahuan-kuantitatif", sections: [
    ["Number Sense", [["09:48", "Mental Math Warmup"], ["13:22", "Rasio dan Persentase"], ["16:14", "Mengenali Pola Bilangan"]]],
    ["Konsep Inti", [["18:02", "Membandingkan Nilai Secara Cepat"], ["20:40", "Kesalahan Umum di Soal Kuantitatif"], ["15:45", "Review Drill Bertempo"]]],
    ["Latihan", [["24:00", "Guided Exercise: Soal Campuran"], ["26:18", "Case Study: Recovery Skor PK"]]],
  ] },
  { code: "LBI", name: "Literasi Bahasa Indonesia", slug: "literasi-bahasa-indonesia", sections: [
    ["Pengenalan LBI", [["07:05", "Apa yang Diuji di LBI"], ["11:26", "Struktur Bacaan Panjang"]]],
    ["Konsep Inti", [["16:50", "Menemukan Ide Pokok"], ["14:18", "Inferensi Tanpa Overthinking"], ["13:42", "Nada dan Tujuan Penulis"]]],
    ["Latihan", [["20:12", "Guided Exercise: Teks Editorial"], ["22:30", "Case Study: Reading Bertempo"]]],
  ] },
  { code: "LBE", name: "Literasi Bahasa Inggris", slug: "literasi-bahasa-inggris", sections: [
    ["Reading Setup", [["08:44", "Course Orientation"], ["12:10", "Skimming vs Scanning"], ["10:58", "Vocabulary in Context"]]],
    ["Konsep Inti", [["18:36", "Inference Questions"], ["17:05", "Author Purpose and Tone"], ["15:34", "Distractor Patterns"]]],
    ["Latihan", [["23:20", "Guided Exercise: Science Passage"], ["25:12", "Case Study: Two-Passage Set"]]],
  ] },
  { code: "PM", name: "Penalaran Matematika", slug: "penalaran-matematika", sections: [
    ["Pengenalan PM", [["08:16", "Format Penalaran Matematika"], ["12:38", "Menerjemahkan Cerita ke Model"], ["13:05", "Membaca Grafik dan Tabel"]]],
    ["Konsep Inti", [["18:55", "Menghubungkan Data dan Operasi"], ["16:28", "Kesalahan Umum di PM"], ["17:40", "Memilih Simpulan Matematis"]]],
    ["Latihan", [["24:18", "Guided Exercise: Soal Tabel"], ["27:30", "Case Study: Grafik Campuran"]]],
  ] },
];

const EXPECTED_TOPICS = CATALOGUE.flatMap((subject, subjectIndex) =>
  subject.sections.map(([name], sectionIndex) => ({
    code: `materi:${subject.slug}:section-${sectionIndex + 1}`,
    name,
    sortOrder: sectionIndex + 1,
    subjectCode: subject.code,
    subjectOrder: subjectIndex + 1,
  })),
);

const EXPECTED_LESSONS = CATALOGUE.flatMap((subject) => {
  let sequenceNo = 0;
  return subject.sections.flatMap(([, lessons], sectionIndex) =>
    lessons.map(([duration, title], lessonIndex) => ({
      code: `${subject.slug}-${sectionIndex + 1}-${lessonIndex + 1}`,
      durationSeconds: durationToSeconds(duration),
      sequenceNo: ++sequenceNo,
      title,
      topicCode: `materi:${subject.slug}:section-${sectionIndex + 1}`,
    })),
  );
});

function durationToSeconds(duration) {
  const [minutes, seconds] = duration.split(":").map(Number);
  return minutes * 60 + seconds;
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the read-only Materi cutover parity gate.");
  }
  return databaseUrl;
}

function groupRowsByCode(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const group = grouped.get(row.code) ?? [];
    group.push(row);
    grouped.set(row.code, group);
  }
  return grouped;
}

function assertContractShape() {
  if (CATALOGUE.length !== 7 || EXPECTED_TOPICS.length !== 21 || EXPECTED_LESSONS.length !== 53) {
    throw new Error("The Materi cutover parity contract must contain exactly 7 subjects, 21 sections, and 53 lessons.");
  }
}

async function verify() {
  assertContractShape();

  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    const failures = [];
    const expectedSubjectCodes = CATALOGUE.map((subject) => subject.code);
    const subjectResult = await client.query(
      "SELECT code, name, is_active, sort_order FROM subtests WHERE code = ANY($1::text[])",
      [expectedSubjectCodes],
    );
    const subjects = groupRowsByCode(subjectResult.rows);
    for (const [index, expected] of CATALOGUE.entries()) {
      const rows = subjects.get(expected.code) ?? [];
      if (rows.length !== 1) {
        failures.push(`subject ${expected.code}: expected one record, found ${rows.length}`);
        continue;
      }
      const [subject] = rows;
      if (subject.name !== expected.name) failures.push(`subject ${expected.code}: name is ${JSON.stringify(subject.name)}, expected ${JSON.stringify(expected.name)}`);
      if (subject.sort_order !== index + 1) failures.push(`subject ${expected.code}: sort order is ${subject.sort_order}, expected ${index + 1}`);
      if (!subject.is_active) failures.push(`subject ${expected.code}: must be active`);
    }

    const topicResult = await client.query(
      `SELECT topics.code, topics.name, topics.is_active, topics.parent_topic_id, topics.sort_order, subtests.code AS subject_code
       FROM topics
       JOIN subtests ON subtests.id = topics.subtest_id
       WHERE topics.code = ANY($1::text[])`,
      [EXPECTED_TOPICS.map((topic) => topic.code)],
    );
    const topics = groupRowsByCode(topicResult.rows);
    for (const expected of EXPECTED_TOPICS) {
      const rows = topics.get(expected.code) ?? [];
      if (rows.length !== 1) {
        failures.push(`section ${expected.code}: expected one canonical record, found ${rows.length}`);
        continue;
      }
      const [topic] = rows;
      if (topic.name !== expected.name) failures.push(`section ${expected.code}: name is ${JSON.stringify(topic.name)}, expected ${JSON.stringify(expected.name)}`);
      if (topic.subject_code !== expected.subjectCode) failures.push(`section ${expected.code}: subject is ${topic.subject_code}, expected ${expected.subjectCode}`);
      if (topic.parent_topic_id !== null) failures.push(`section ${expected.code}: must be top-level`);
      if (topic.sort_order !== expected.sortOrder) failures.push(`section ${expected.code}: sort order is ${topic.sort_order}, expected ${expected.sortOrder}`);
      if (!topic.is_active) failures.push(`section ${expected.code}: must be active`);
    }

    const lessonResult = await client.query(
      `SELECT
         modules.code,
         modules.title,
         modules.sequence_no,
         modules.status::text AS status,
         topics.code AS topic_code,
         module_assets.id AS primary_asset_id,
         module_assets.asset_type::text AS primary_asset_type,
         module_assets.duration_seconds AS primary_duration_seconds,
         module_assets.media_url AS primary_media_url
       FROM modules
       LEFT JOIN topics ON topics.id = modules.topic_id
       LEFT JOIN module_assets
         ON module_assets.module_id = modules.id
         AND module_assets.sort_order = 0
       WHERE modules.code = ANY($1::text[])`,
      [EXPECTED_LESSONS.map((lesson) => lesson.code)],
    );
    const lessons = groupRowsByCode(lessonResult.rows);
    for (const expected of EXPECTED_LESSONS) {
      const rows = lessons.get(expected.code) ?? [];
      if (rows.length !== 1) {
        failures.push(`lesson ${expected.code}: expected one module/primary-slot row, found ${rows.length}`);
        continue;
      }
      const [lesson] = rows;
      if (lesson.topic_code !== expected.topicCode) failures.push(`lesson ${expected.code}: topic is ${lesson.topic_code ?? "missing"}, expected ${expected.topicCode}`);
      if (lesson.sequence_no !== expected.sequenceNo) failures.push(`lesson ${expected.code}: sequence is ${lesson.sequence_no}, expected ${expected.sequenceNo}`);
      if (lesson.title !== expected.title) failures.push(`lesson ${expected.code}: title is ${JSON.stringify(lesson.title)}, expected ${JSON.stringify(expected.title)}`);
      if (lesson.status !== "published") failures.push(`lesson ${expected.code}: status is ${lesson.status ?? "missing"}, expected published`);
      if (!lesson.primary_asset_id || lesson.primary_asset_type !== "video") failures.push(`lesson ${expected.code}: slot 0 must contain a video asset`);
      if (lesson.primary_duration_seconds !== expected.durationSeconds) failures.push(`lesson ${expected.code}: duration is ${lesson.primary_duration_seconds}, expected ${expected.durationSeconds}`);
      if (lesson.primary_media_url !== INITIAL_PLACEHOLDER_MEDIA_URL) failures.push(`lesson ${expected.code}: media URL differs from the initial placeholder`);
    }

    const canonicalModuleResult = await client.query(
      `SELECT modules.code, topics.code AS topic_code
       FROM modules
       JOIN topics ON topics.id = modules.topic_id
       WHERE topics.code = ANY($1::text[])`,
      [EXPECTED_TOPICS.map((topic) => topic.code)],
    );
    const expectedLessonsByCode = new Map(EXPECTED_LESSONS.map((lesson) => [lesson.code, lesson]));
    for (const row of canonicalModuleResult.rows) {
      const expected = expectedLessonsByCode.get(row.code);
      if (!expected) {
        failures.push(`section ${row.topic_code}: unexpected lesson ${row.code}`);
      } else if (row.topic_code !== expected.topicCode) {
        failures.push(`lesson ${row.code}: appears in ${row.topic_code}, expected ${expected.topicCode}`);
      }
    }

    const duplicateSlotResult = await client.query(
      `SELECT module_id, sort_order, COUNT(*)::int AS count
       FROM module_assets
       GROUP BY module_id, sort_order
       HAVING COUNT(*) > 1`,
    );
    for (const duplicate of duplicateSlotResult.rows) {
      failures.push(`module asset slot ${duplicate.module_id}/${duplicate.sort_order}: ${duplicate.count} rows found`);
    }

    if (failures.length > 0) {
      throw new Error(`Materi initial cutover parity failed:\n- ${failures.join("\n- ")}`);
    }

    console.log("Materi initial cutover parity passed: exact 7-subject, 21-section, 53-lesson catalogue with canonical order and placeholder primary videos.");
  } finally {
    await client.end();
  }
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
