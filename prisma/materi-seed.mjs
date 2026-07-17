// Shared, content-only Materi contract. Both seed entry points use this file.
const MATERI_CATALOGUE = [
  { code: "PU", name: "Penalaran Umum", slug: "penalaran-umum", sections: [["Pengenalan PU", [["06:12", "Apa yang Diuji di Penalaran Umum"], ["08:24", "Cara Menggunakan Modul Ini"], ["10:08", "Pemetaan Kemampuan Awal"]]], ["Konsep Inti", [["14:30", "Premis, Klaim, dan Simpulan"], ["17:42", "Kesalahan Umum Membaca Argumen"], ["12:56", "Strategi Eliminasi Cepat"]]], ["Latihan", [["18:10", "Guided Exercise: Argumen Pendek"], ["21:36", "Case Study: Set Argumen UTBK"]]]] },
  { code: "PPU", name: "Pengetahuan dan Pemahaman Umum", slug: "pengetahuan-pemahaman-umum", sections: [["Pengenalan PPU", [["07:16", "Ruang Lingkup PPU"], ["09:44", "Membaca Informasi Secara Presisi"]]], ["Konsep Inti", [["15:18", "Relasi Ide dalam Teks"], ["16:05", "Makna Kata dan Konteks"], ["13:40", "Menghindari Distraktor Umum"]]], ["Latihan", [["19:24", "Guided Exercise: Informasi Implisit"], ["22:10", "Case Study: Bacaan Campuran"]]]] },
  { code: "PBM", name: "Pemahaman Bacaan dan Menulis", slug: "pemahaman-bacaan-menulis", sections: [["Pengenalan PBM", [["06:58", "Format Soal PBM"], ["11:22", "Cara Membaca Kalimat Bermasalah"]]], ["Konsep Inti", [["16:35", "Efektivitas Kalimat"], ["14:48", "Kohesi dan Koherensi Paragraf"], ["13:52", "Kesalahan Ejaan yang Sering Muncul"]]], ["Latihan", [["20:28", "Guided Exercise: Sunting Kalimat"], ["23:12", "Case Study: Paragraf Tidak Efektif"]]]] },
  { code: "PK", name: "Pengetahuan Kuantitatif", slug: "pengetahuan-kuantitatif", sections: [["Number Sense", [["09:48", "Mental Math Warmup"], ["13:22", "Rasio dan Persentase"], ["16:14", "Mengenali Pola Bilangan"]]], ["Konsep Inti", [["18:02", "Membandingkan Nilai Secara Cepat"], ["20:40", "Kesalahan Umum di Soal Kuantitatif"], ["15:45", "Review Drill Bertempo"]]], ["Latihan", [["24:00", "Guided Exercise: Soal Campuran"], ["26:18", "Case Study: Recovery Skor PK"]]]] },
  { code: "LBI", name: "Literasi Bahasa Indonesia", slug: "literasi-bahasa-indonesia", sections: [["Pengenalan LBI", [["07:05", "Apa yang Diuji di LBI"], ["11:26", "Struktur Bacaan Panjang"]]], ["Konsep Inti", [["16:50", "Menemukan Ide Pokok"], ["14:18", "Inferensi Tanpa Overthinking"], ["13:42", "Nada dan Tujuan Penulis"]]], ["Latihan", [["20:12", "Guided Exercise: Teks Editorial"], ["22:30", "Case Study: Reading Bertempo"]]]] },
  { code: "LBE", name: "Literasi Bahasa Inggris", slug: "literasi-bahasa-inggris", sections: [["Reading Setup", [["08:44", "Course Orientation"], ["12:10", "Skimming vs Scanning"], ["10:58", "Vocabulary in Context"]]], ["Konsep Inti", [["18:36", "Inference Questions"], ["17:05", "Author Purpose and Tone"], ["15:34", "Distractor Patterns"]]], ["Latihan", [["23:20", "Guided Exercise: Science Passage"], ["25:12", "Case Study: Two-Passage Set"]]]] },
  { code: "PM", name: "Penalaran Matematika", slug: "penalaran-matematika", sections: [["Pengenalan PM", [["08:16", "Format Penalaran Matematika"], ["12:38", "Menerjemahkan Cerita ke Model"], ["13:05", "Membaca Grafik dan Tabel"]]], ["Konsep Inti", [["18:55", "Menghubungkan Data dan Operasi"], ["16:28", "Kesalahan Umum di PM"], ["17:40", "Memilih Simpulan Matematis"]]], ["Latihan", [["24:18", "Guided Exercise: Soal Tabel"], ["27:30", "Case Study: Grafik Campuran"]]]] },
];

const STUDENT_MATERI_PLACEHOLDER_VIDEO_URL = "https://www.youtube.com/embed/4rPIpRTEhfY?rel=0";

function durationToSeconds(duration) {
  const [minutes, seconds] = duration.split(":").map(Number);
  return minutes * 60 + seconds;
}

function assertCanonicalModuleTopic(existingTopicId, expectedTopicId, code, expectedTopicCode) {
  if (existingTopicId !== expectedTopicId) throw new Error(`Materi seed conflict for stable code "${code}": it belongs to topic ${existingTopicId}, not canonical topic "${expectedTopicCode}" (${expectedTopicId}).`);
}

async function findModuleByCode(client, code) {
  const result = await client.query("SELECT id, topic_id FROM modules WHERE code = $1 LIMIT 1", [code]);
  return result.rows[0];
}

async function insertSeedModule(client, { authorUserId, code, durationSeconds, expectedTopicCode, subjectSlug, subtestId, title, topicId }) {
  const existing = await findModuleByCode(client, code);
  if (existing) {
    assertCanonicalModuleTopic(existing.topic_id, topicId, code, expectedTopicCode);
    return { id: existing.id, inserted: false };
  }
  await client.query("SELECT id FROM topics WHERE id = $1 FOR UPDATE", [topicId]);
  const afterLock = await findModuleByCode(client, code);
  if (afterLock) {
    assertCanonicalModuleTopic(afterLock.topic_id, topicId, code, expectedTopicCode);
    return { id: afterLock.id, inserted: false };
  }
  const sequenceResult = await client.query("SELECT COALESCE(MAX(modules.sequence_no), 0) + 1 AS next_sequence_no FROM modules JOIN topics ON topics.id = modules.topic_id WHERE topics.subtest_id = $1 AND topics.code = ANY($2::text[])", [subtestId, [1, 2, 3].map((sectionNo) => `materi:${subjectSlug}:section-${sectionNo}`)]);
  const result = await client.query(`INSERT INTO modules (topic_id, code, title, sequence_no, estimated_minutes, status, published_at, created_by_user_id, updated_by_user_id) VALUES ($1, $2, $3, $4, $5, 'published', NOW(), $6, $6) RETURNING id`, [topicId, code, title, Number(sequenceResult.rows[0].next_sequence_no), Math.ceil(durationSeconds / 60), authorUserId]);
  return { id: result.rows[0].id, inserted: true };
}

async function insertOrSelectSubtest(client, { code, name, sortOrder }) {
  const inserted = await client.query(`INSERT INTO subtests (code, name, description, sort_order, is_active) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (code) DO NOTHING RETURNING id`, [code, name, name, sortOrder]);
  if (inserted.rowCount) return inserted.rows[0].id;
  const existing = await client.query("SELECT id FROM subtests WHERE code = $1", [code]);
  if (!existing.rowCount) throw new Error(`Materi seed could not resolve existing subtest "${code}" after a conflict.`);
  return existing.rows[0].id;
}

async function insertOrSelectTopic(client, { code, name, sortOrder, subtestId }) {
  const inserted = await client.query(`INSERT INTO topics (subtest_id, code, name, sort_order, is_active) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT (subtest_id, code) DO NOTHING RETURNING id`, [subtestId, code, name, sortOrder]);
  if (inserted.rowCount) return inserted.rows[0].id;
  const existing = await client.query("SELECT id FROM topics WHERE subtest_id = $1 AND code = $2", [subtestId, code]);
  if (!existing.rowCount) throw new Error(`Materi seed could not resolve existing topic "${code}" after a conflict.`);
  return existing.rows[0].id;
}

async function seedMateriCatalogue(client, { authorUserId }) {
  for (const [subjectIndex, subject] of MATERI_CATALOGUE.entries()) {
    const subtestId = await insertOrSelectSubtest(client, { code: subject.code, name: subject.name, sortOrder: subjectIndex + 1 });
    for (const [sectionIndex, [sectionName, lessons]] of subject.sections.entries()) {
      const topicCode = `materi:${subject.slug}:section-${sectionIndex + 1}`;
      const topicId = await insertOrSelectTopic(client, { code: topicCode, name: sectionName, sortOrder: sectionIndex + 1, subtestId });
      for (const [lessonIndex, [duration, title]] of lessons.entries()) {
        const moduleResult = await insertSeedModule(client, { authorUserId, code: `${subject.slug}-${sectionIndex + 1}-${lessonIndex + 1}`, durationSeconds: durationToSeconds(duration), expectedTopicCode: topicCode, subjectSlug: subject.slug, subtestId, title, topicId });
        if (!moduleResult.inserted) continue;
        await client.query(`INSERT INTO module_assets (module_id, asset_type, title, media_url, duration_seconds, sort_order) VALUES ($1, 'video', $2, $3, $4, 0)`, [moduleResult.id, title, STUDENT_MATERI_PLACEHOLDER_VIDEO_URL, durationToSeconds(duration)]);
      }
    }
  }
}

export { MATERI_CATALOGUE, seedMateriCatalogue };
