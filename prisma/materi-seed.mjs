// Shared, content-only Materi contract. Both seed entry points use this file.
//
// The reset command is deliberately separate from this recipe. A normal
// `pnpm db:seed` may create these records on a fresh database or reconcile the
// records carrying the stable `demo:materi:` prefix, but it never deletes
// arbitrary existing Materi content.

const MATERI_DOCUMENT_MIME_TYPE = "application/pdf";
const MATERI_DEMO_CODE_PREFIX = "demo:materi:";
const MATERI_DEMO_PDF_FILENAME = "test.pdf";
const MATERI_DEMO_PDF_ROUTE_PATH = "/api/materi-demo/test.pdf";
const MATERI_DEMO_VIDEO_URL = "https://www.youtube.com/embed/4rPIpRTEhfY?rel=0";
const MATERI_DEMO_VIDEO_DURATION_SECONDS = 300;

const MATERI_CATALOGUE = [
  {
    code: "PU",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
    sections: [
      { name: "Pengenalan PU", title: "[DEMO] Orientasi Penalaran Umum", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Premis, Klaim, dan Simpulan", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Argumen Pendek", withVideo: false },
    ],
  },
  {
    code: "PPU",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
    sections: [
      { name: "Pengenalan PPU", title: "[DEMO] Orientasi Pengetahuan Umum", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Relasi Ide dalam Teks", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Informasi Implisit", withVideo: false },
    ],
  },
  {
    code: "PBM",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
    sections: [
      { name: "Pengenalan PBM", title: "[DEMO] Format Soal PBM", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Efektivitas Kalimat", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Sunting Kalimat", withVideo: false },
    ],
  },
  {
    code: "PK",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
    sections: [
      { name: "Number Sense", title: "[DEMO] Mental Math Warmup", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Membandingkan Nilai", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Soal Campuran", withVideo: false },
    ],
  },
  {
    code: "LBI",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
    sections: [
      { name: "Pengenalan LBI", title: "[DEMO] Orientasi Literasi Indonesia", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Menemukan Ide Pokok", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Teks Editorial", withVideo: false },
    ],
  },
  {
    code: "LBE",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
    sections: [
      { name: "Reading Setup", title: "[DEMO] Course Orientation", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Inference Questions", withVideo: true },
      { name: "Latihan", title: "[DEMO] Science Passage Practice", withVideo: false },
    ],
  },
  {
    code: "PM",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
    sections: [
      { name: "Pengenalan PM", title: "[DEMO] Format Penalaran Matematika", withVideo: false },
      { name: "Konsep Inti", title: "[DEMO] Menghubungkan Data dan Operasi", withVideo: true },
      { name: "Latihan", title: "[DEMO] Latihan Soal Tabel", withVideo: false },
    ],
  },
];

const MATERI_SUBJECT_CODES = MATERI_CATALOGUE.map((subject) => subject.code);
const MATERI_TOPIC_CODES = MATERI_CATALOGUE.flatMap((subject) =>
  subject.sections.map((_, sectionIndex) => `materi:${subject.slug}:section-${sectionIndex + 1}`),
);
const MATERI_DEMO_MODULES = MATERI_CATALOGUE.flatMap((subject) =>
  subject.sections.map((section, sectionIndex) => ({
    code: buildMateriDemoCode(subject.slug, sectionIndex + 1),
    sectionName: section.name,
    sectionNo: sectionIndex + 1,
    subjectCode: subject.code,
    subjectName: subject.name,
    subjectSlug: subject.slug,
    title: section.title,
    topicCode: `materi:${subject.slug}:section-${sectionIndex + 1}`,
    withVideo: section.withVideo,
  })),
);

function buildMateriDemoCode(subjectSlug, sectionNo) {
  return `${MATERI_DEMO_CODE_PREFIX}${subjectSlug}:unit-${sectionNo}`;
}

function ensureAbsoluteHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL: ${value}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS: ${value}`);
  }
  return parsed;
}

/**
 * Local demo PDFs are served by the development-only route that reads
 * `tmp/test.pdf` at request time. The seed stores only this absolute URL; it
 * never copies, mutates, or deletes the supplied fixture.
 */
function resolveMateriDemoPdfUrl({ baseUrl, pdfUrl } = {}) {
  const explicitUrl = pdfUrl?.trim() || (!baseUrl ? process.env.MATERI_DEMO_PDF_URL?.trim() : "");
  const configuredBase = baseUrl?.trim()
    || process.env.MATERI_DEMO_PDF_BASE_URL?.trim()
    || process.env.APP_BASE_URL?.trim()
    || "http://localhost:5023";
  const candidate = explicitUrl
    ? explicitUrl
    : new URL(MATERI_DEMO_PDF_ROUTE_PATH, ensureAbsoluteHttpUrl(configuredBase, "MATERI_DEMO_PDF_BASE_URL")).toString();
  const parsed = ensureAbsoluteHttpUrl(candidate, "MATERI_DEMO_PDF_URL");
  if (!parsed.pathname.toLowerCase().endsWith(`/${MATERI_DEMO_PDF_FILENAME}`)) {
    throw new Error(`MATERI_DEMO_PDF_URL must end in /${MATERI_DEMO_PDF_FILENAME} so the hosted-PDF contract can validate it.`);
  }
  return parsed.toString();
}

function canonicalTopicCode(subjectSlug, sectionNo) {
  return `materi:${subjectSlug}:section-${sectionNo}`;
}

function assertCanonicalModuleTopic(existingTopicId, expectedTopicId, code, expectedTopicCode) {
  if (existingTopicId !== expectedTopicId) {
    throw new Error(`Materi seed conflict for stable code "${code}": it belongs to topic ${existingTopicId}, not canonical topic "${expectedTopicCode}" (${expectedTopicId}).`);
  }
}

async function findModuleByCode(client, code) {
  const result = await client.query(
    "SELECT id, topic_id, title, summary, sequence_no, estimated_minutes, status::text AS status, published_at FROM modules WHERE code = $1 LIMIT 1",
    [code],
  );
  return result.rows[0];
}

async function insertOrSelectSubtest(client, { code, name, sortOrder }) {
  const inserted = await client.query(
    `INSERT INTO subtests (code, name, description, sort_order, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (code) DO NOTHING
     RETURNING id, name, sort_order, is_active`,
    [code, name, name, sortOrder],
  );
  const row = inserted.rows[0] ?? (await client.query(
    "SELECT id, name, sort_order, is_active FROM subtests WHERE code = $1 FOR UPDATE",
    [code],
  )).rows[0];
  if (!row) throw new Error(`Materi seed could not resolve canonical subtest "${code}".`);
  if (row.name !== name || row.sort_order !== sortOrder || !row.is_active) {
    throw new Error(`Canonical Materi subtest "${code}" has unexpected shared taxonomy metadata; refusing to mutate it.`);
  }
  return row.id;
}

async function insertOrSelectTopic(client, { code, name, sortOrder, subtestId }) {
  const inserted = await client.query(
    `INSERT INTO topics (subtest_id, code, name, sort_order, is_active)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (subtest_id, code) DO NOTHING
     RETURNING id, name, sort_order, is_active, parent_topic_id`,
    [subtestId, code, name, sortOrder],
  );
  const row = inserted.rows[0] ?? (await client.query(
    "SELECT id, name, sort_order, is_active, parent_topic_id FROM topics WHERE subtest_id = $1 AND code = $2 FOR UPDATE",
    [subtestId, code],
  )).rows[0];
  if (!row) throw new Error(`Materi seed could not resolve canonical topic "${code}".`);
  if (row.name !== name || row.sort_order !== sortOrder || !row.is_active || row.parent_topic_id !== null) {
    throw new Error(`Canonical Materi topic "${code}" has unexpected shared taxonomy metadata; refusing to mutate it.`);
  }
  return row.id;
}

async function assertNoUnexpectedCanonicalModules(client) {
  const expectedCodes = MATERI_DEMO_MODULES.map((module) => module.code);
  const result = await client.query(
    `SELECT modules.code, subtests.code AS subject_code, topics.code AS topic_code
       FROM modules
       JOIN topics ON topics.id = modules.topic_id
       JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code = ANY($2::text[])
        AND NOT (modules.code = ANY($3::text[]))
      ORDER BY subtests.sort_order, topics.sort_order, modules.sequence_no, modules.code`,
    [MATERI_SUBJECT_CODES, MATERI_TOPIC_CODES, expectedCodes],
  );
  if (result.rowCount) {
    const details = result.rows.map((row) => `${row.subject_code}/${row.topic_code}/${row.code}`).join(", ");
    throw new Error(`Unexpected canonical Materi modules exist (${details}). Run the guarded reset command before reseeding.`);
  }
}

async function insertOrVerifyDemoModule(client, { authorUserId, demoModule, topicId, pdfUrl }) {
  const summary = `DEMO ONLY — local PDF fixture ${MATERI_DEMO_PDF_FILENAME}; replace through the Kapten Materi workflow.`;
  const existing = await findModuleByCode(client, demoModule.code);
  let moduleId;
  if (existing) {
    assertCanonicalModuleTopic(existing.topic_id, topicId, demoModule.code, demoModule.topicCode);
    if (
      existing.title !== demoModule.title
      || existing.sequence_no !== demoModule.sectionNo
      || existing.status !== "published"
      || !existing.published_at
    ) {
      throw new Error(`Known demo module "${demoModule.code}" is not document-ready/published; run the guarded reset before reseeding.`);
    }
    moduleId = existing.id;
  } else {
    const inserted = await client.query(
      `INSERT INTO modules (
         topic_id, code, title, summary, sequence_no, estimated_minutes,
         status, published_at, created_by_user_id, updated_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'published', NOW(), $7, $7)
       RETURNING id`,
      [topicId, demoModule.code, demoModule.title, summary, demoModule.sectionNo, 15, authorUserId],
    );
    moduleId = inserted.rows[0].id;
  }

  const expectedAssetCount = demoModule.withVideo ? 2 : 1;
  const assets = await client.query(
    `SELECT id, asset_type::text AS asset_type, source_kind::text AS source_kind,
            managed_asset_id, title, media_url, mime_type, original_name,
            duration_seconds, sort_order
       FROM module_assets
      WHERE module_id = $1
      ORDER BY sort_order, id`,
    [moduleId],
  );
  if (assets.rowCount > 0) {
    if (assets.rowCount !== expectedAssetCount) {
      throw new Error(`Known demo module "${demoModule.code}" has ${assets.rowCount} assets; expected ${expectedAssetCount}. Run the guarded reset before reseeding.`);
    }
    const attachment = assets.rows.find((asset) => asset.asset_type === "attachment");
    const video = assets.rows.find((asset) => asset.asset_type === "video");
    if (
      !attachment
      || attachment.source_kind !== "hosted"
      || attachment.managed_asset_id !== null
      || attachment.media_url !== pdfUrl
      || attachment.mime_type !== MATERI_DOCUMENT_MIME_TYPE
      || attachment.original_name !== MATERI_DEMO_PDF_FILENAME
    ) {
      throw new Error(`Known demo module "${demoModule.code}" has an unexpected PDF resource; run the guarded reset before reseeding.`);
    }
    if (demoModule.withVideo && (
      !video
      || video.source_kind !== "hosted"
      || video.media_url !== MATERI_DEMO_VIDEO_URL
      || video.duration_seconds !== MATERI_DEMO_VIDEO_DURATION_SECONDS
    )) {
      throw new Error(`Known demo module "${demoModule.code}" has an unexpected optional video resource; run the guarded reset before reseeding.`);
    }
    if (!demoModule.withVideo && video) {
      throw new Error(`Known document-only demo module "${demoModule.code}" unexpectedly has a video resource.`);
    }
    return { id: moduleId, inserted: false };
  }

  await client.query(
    `INSERT INTO module_assets (
       module_id, asset_type, source_kind, title, media_url, mime_type,
       original_name, sort_order
     ) VALUES ($1, 'attachment', 'hosted', $2, $3, $4, $5, 0)`,
    [moduleId, `[DEMO] PDF · ${MATERI_DEMO_PDF_FILENAME}`, pdfUrl, MATERI_DOCUMENT_MIME_TYPE, MATERI_DEMO_PDF_FILENAME],
  );
  if (demoModule.withVideo) {
    await client.query(
      `INSERT INTO module_assets (
         module_id, asset_type, source_kind, title, media_url,
         duration_seconds, sort_order
       ) VALUES ($1, 'video', 'hosted', $2, $3, $4, 1)`,
      [moduleId, "[DEMO] Optional companion video", MATERI_DEMO_VIDEO_URL, MATERI_DEMO_VIDEO_DURATION_SECONDS],
    );
  }
  return { id: moduleId, inserted: true };
}

async function seedMateriCatalogue(client, { authorUserId, baseUrl, pdfUrl } = {}) {
  if (!authorUserId || typeof authorUserId !== "string") {
    throw new Error("Materi seed requires an existing active tutor user id.");
  }
  const resolvedPdfUrl = resolveMateriDemoPdfUrl({ baseUrl, pdfUrl });
  const topicIds = new Map();

  for (const [subjectIndex, subject] of MATERI_CATALOGUE.entries()) {
    const subtestId = await insertOrSelectSubtest(client, {
      code: subject.code,
      name: subject.name,
      sortOrder: subjectIndex + 1,
    });
    for (const [sectionIndex, section] of subject.sections.entries()) {
      const topicCode = canonicalTopicCode(subject.slug, sectionIndex + 1);
      const topicId = await insertOrSelectTopic(client, {
        code: topicCode,
        name: section.name,
        sortOrder: sectionIndex + 1,
        subtestId,
      });
      topicIds.set(topicCode, topicId);
    }
  }

  await assertNoUnexpectedCanonicalModules(client);
  for (const demoModule of MATERI_DEMO_MODULES) {
    const topicId = topicIds.get(demoModule.topicCode);
    if (!topicId) throw new Error(`Materi seed could not resolve topic ${demoModule.topicCode}.`);
    await insertOrVerifyDemoModule(client, {
      authorUserId,
      demoModule,
      pdfUrl: resolvedPdfUrl,
      topicId,
    });
  }
  return { demoModuleCount: MATERI_DEMO_MODULES.length, pdfUrl: resolvedPdfUrl };
}

export {
  MATERI_CATALOGUE,
  MATERI_DEMO_CODE_PREFIX,
  MATERI_DEMO_MODULES,
  MATERI_DEMO_PDF_FILENAME,
  MATERI_DEMO_PDF_ROUTE_PATH,
  MATERI_DEMO_VIDEO_DURATION_SECONDS,
  MATERI_DEMO_VIDEO_URL,
  MATERI_DOCUMENT_MIME_TYPE,
  buildMateriDemoCode,
  resolveMateriDemoPdfUrl,
  seedMateriCatalogue,
};
