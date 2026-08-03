import "dotenv/config";

import pg from "pg";

import {
  MATERI_CATALOGUE,
  MATERI_DEMO_MODULES,
  MATERI_DEMO_PDF_FILENAME,
  MATERI_DEMO_VIDEO_URL,
  MATERI_DEMO_VIDEO_DURATION_SECONDS,
  MATERI_DOCUMENT_MIME_TYPE,
} from "../prisma/materi-seed.mjs";

const { Client } = pg;

const SUBJECT_CODES = MATERI_CATALOGUE.map((subject) => subject.code);
const TOPIC_CODES = MATERI_CATALOGUE.flatMap((subject) =>
  subject.sections.map((_, sectionIndex) => `materi:${subject.slug}:section-${sectionIndex + 1}`),
);
const DEMO_CODES = MATERI_DEMO_MODULES.map((module) => module.code);

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the read-only Materi catalogue verifier.");
  return databaseUrl;
}

function assertContractShape() {
  const failures = [];
  if (MATERI_CATALOGUE.length !== 7) failures.push(`expected 7 subjects, found ${MATERI_CATALOGUE.length}`);
  if (TOPIC_CODES.length !== 21) failures.push(`expected 21 sections, found ${TOPIC_CODES.length}`);
  if (MATERI_DEMO_MODULES.length !== 21) failures.push(`expected 21 demo modules, found ${MATERI_DEMO_MODULES.length}`);
  if (new Set(SUBJECT_CODES).size !== SUBJECT_CODES.length) failures.push("subject codes are duplicated");
  if (new Set(TOPIC_CODES).size !== TOPIC_CODES.length) failures.push("section codes are duplicated");
  if (new Set(DEMO_CODES).size !== DEMO_CODES.length) failures.push("stable demo module codes are duplicated");
  if (MATERI_DEMO_MODULES.filter((module) => module.withVideo).length === 0) failures.push("the fixture must cover document-plus-video units");
  if (MATERI_DEMO_MODULES.filter((module) => !module.withVideo).length === 0) failures.push("the fixture must cover document-only units");
  for (const subject of MATERI_CATALOGUE) {
    if (subject.sections.length !== 3) failures.push(`subject ${subject.code} must contain exactly 3 canonical sections`);
  }
  if (failures.length > 0) throw new Error(`Materi document-first static contract failed:\n- ${failures.join("\n- ")}`);
}

function groupRowsByCode(rows, key = "code") {
  const grouped = new Map();
  for (const row of rows) {
    const group = grouped.get(row[key]) ?? [];
    group.push(row);
    grouped.set(row[key], group);
  }
  return grouped;
}

function isAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPdfUrl(value) {
  try {
    return new URL(value).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function assertOneRow(rows, label, failures) {
  if (rows.length !== 1) {
    failures.push(`${label}: expected one row, found ${rows.length}`);
    return null;
  }
  return rows[0];
}

async function verify() {
  assertContractShape();
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    const failures = [];
    const subjectResult = await client.query(
      `SELECT code, name, is_active, sort_order
         FROM subtests
        WHERE code = ANY($1::text[])
        ORDER BY sort_order, code`,
      [SUBJECT_CODES],
    );
    const subjects = groupRowsByCode(subjectResult.rows);
    for (const [subjectIndex, expected] of MATERI_CATALOGUE.entries()) {
      const subject = assertOneRow(subjects.get(expected.code) ?? [], `subject ${expected.code}`, failures);
      if (!subject) continue;
      if (subject.name !== expected.name) failures.push(`subject ${expected.code}: name differs from the canonical contract`);
      if (subject.sort_order !== subjectIndex + 1) failures.push(`subject ${expected.code}: sort order is ${subject.sort_order}, expected ${subjectIndex + 1}`);
      if (!subject.is_active) failures.push(`subject ${expected.code}: must be active`);
    }

    const topicResult = await client.query(
      `SELECT topics.code, topics.name, topics.is_active, topics.parent_topic_id,
              topics.sort_order, subtests.code AS subject_code
         FROM topics
         JOIN subtests ON subtests.id = topics.subtest_id
        WHERE subtests.code = ANY($1::text[])
          AND topics.code = ANY($2::text[])
        ORDER BY subtests.sort_order, topics.sort_order, topics.code`,
      [SUBJECT_CODES, TOPIC_CODES],
    );
    const topics = new Map(topicResult.rows.map((row) => [`${row.subject_code}:${row.code}`, row]));
    if (topicResult.rowCount !== TOPIC_CODES.length) {
      failures.push(`canonical sections: expected exactly ${TOPIC_CODES.length}, found ${topicResult.rowCount}`);
    }
    for (const subject of MATERI_CATALOGUE) {
      for (const [sectionIndex, section] of subject.sections.entries()) {
        const topicCode = `materi:${subject.slug}:section-${sectionIndex + 1}`;
        const topic = topics.get(`${subject.code}:${topicCode}`);
        if (!topic) {
          failures.push(`section ${subject.code}/${topicCode}: missing`);
          continue;
        }
        if (topic.name !== section.name) failures.push(`section ${subject.code}/${topicCode}: name differs from the canonical contract`);
        if (topic.sort_order !== sectionIndex + 1) failures.push(`section ${subject.code}/${topicCode}: sort order is ${topic.sort_order}, expected ${sectionIndex + 1}`);
        if (topic.parent_topic_id !== null) failures.push(`section ${subject.code}/${topicCode}: must be top-level`);
        if (!topic.is_active) failures.push(`section ${subject.code}/${topicCode}: must be active`);
      }
    }

    const unexpectedModuleResult = await client.query(
      `SELECT modules.code, subtests.code AS subject_code, topics.code AS topic_code
         FROM modules
         JOIN topics ON topics.id = modules.topic_id
         JOIN subtests ON subtests.id = topics.subtest_id
        WHERE subtests.code = ANY($1::text[])
          AND topics.code = ANY($2::text[])
          AND NOT (modules.code = ANY($3::text[]))
        ORDER BY subtests.sort_order, topics.sort_order, modules.sequence_no, modules.code`,
      [SUBJECT_CODES, TOPIC_CODES, DEMO_CODES],
    );
    if (unexpectedModuleResult.rowCount) {
      failures.push(`canonical sections contain ${unexpectedModuleResult.rowCount} unexpected module(s)`);
    }
    const unexpectedSubjectModuleResult = await client.query(
      `SELECT modules.code, subtests.code AS subject_code, topics.code AS topic_code
         FROM modules
         JOIN topics ON topics.id = modules.topic_id
         JOIN subtests ON subtests.id = topics.subtest_id
        WHERE subtests.code = ANY($1::text[])
          AND NOT (topics.code = ANY($2::text[]))
        ORDER BY subtests.sort_order, topics.sort_order, modules.sequence_no, modules.code`,
      [SUBJECT_CODES, TOPIC_CODES],
    );
    if (unexpectedSubjectModuleResult.rowCount) {
      failures.push(`canonical subjects contain ${unexpectedSubjectModuleResult.rowCount} module(s) outside the three canonical sections`);
    }

    const lessonResult = await client.query(
      `SELECT modules.id, modules.code, modules.title, modules.summary,
              modules.sequence_no, modules.status::text AS status,
              topics.code AS topic_code, subtests.code AS subject_code,
              module_assets.id AS asset_id,
              module_assets.asset_type::text AS asset_type,
              module_assets.source_kind::text AS source_kind,
              module_assets.managed_asset_id,
              module_assets.media_url,
              module_assets.mime_type,
              module_assets.original_name,
              module_assets.duration_seconds,
              module_assets.title AS asset_title
         FROM modules
         JOIN topics ON topics.id = modules.topic_id
         JOIN subtests ON subtests.id = topics.subtest_id
         LEFT JOIN module_assets ON module_assets.module_id = modules.id
        WHERE modules.code = ANY($1::text[])
        ORDER BY subtests.sort_order, modules.sequence_no, modules.code, module_assets.asset_type`,
      [DEMO_CODES],
    );

    const lessonsByCode = new Map();
    for (const row of lessonResult.rows) {
      const lesson = lessonsByCode.get(row.code) ?? {
        assets: [],
        code: row.code,
        subjectCode: row.subject_code,
        summary: row.summary,
        sequenceNo: row.sequence_no,
        status: row.status,
        title: row.title,
        topicCode: row.topic_code,
      };
      if (row.asset_id) lesson.assets.push(row);
      lessonsByCode.set(row.code, lesson);
    }
    if (lessonsByCode.size !== MATERI_DEMO_MODULES.length) {
      failures.push(`demo modules: expected exactly ${MATERI_DEMO_MODULES.length}, found ${lessonsByCode.size}`);
    }

    for (const expected of MATERI_DEMO_MODULES) {
      const lesson = lessonsByCode.get(expected.code);
      if (!lesson) {
        failures.push(`demo module ${expected.code}: missing`);
        continue;
      }
      if (lesson.subjectCode !== expected.subjectCode) failures.push(`demo module ${expected.code}: subject is ${lesson.subjectCode}, expected ${expected.subjectCode}`);
      if (lesson.topicCode !== expected.topicCode) failures.push(`demo module ${expected.code}: topic is ${lesson.topicCode}, expected ${expected.topicCode}`);
      if (lesson.sequenceNo !== expected.sectionNo) failures.push(`demo module ${expected.code}: sequence is ${lesson.sequenceNo}, expected ${expected.sectionNo}`);
      if (lesson.status !== "published") failures.push(`demo module ${expected.code}: must be published`);
      if (!lesson.title.startsWith("[DEMO]")) failures.push(`demo module ${expected.code}: title must be clearly marked [DEMO]`);
      if (!lesson.summary?.includes("DEMO ONLY")) failures.push(`demo module ${expected.code}: summary must identify temporary demo content`);

      const attachments = lesson.assets.filter((asset) => asset.asset_type === "attachment");
      const videos = lesson.assets.filter((asset) => asset.asset_type === "video");
      const otherAssets = lesson.assets.filter((asset) => !["attachment", "video"].includes(asset.asset_type));
      if (attachments.length !== 1) failures.push(`demo module ${expected.code}: expected exactly one attachment resource, found ${attachments.length}`);
      if (otherAssets.length > 0) failures.push(`demo module ${expected.code}: contains unsupported asset role(s) ${otherAssets.map((asset) => asset.asset_type).join(", ")}`);
      if (videos.length > 1) failures.push(`demo module ${expected.code}: expected at most one optional video resource`);
      if (expected.withVideo && videos.length !== 1) failures.push(`demo module ${expected.code}: document-plus-video coverage requires one optional video`);
      if (!expected.withVideo && videos.length !== 0) failures.push(`demo module ${expected.code}: document-only coverage must not contain a video`);

      const attachment = attachments[0];
      if (attachment) {
        if (attachment.source_kind !== "hosted") failures.push(`demo module ${expected.code}: PDF source_kind must be hosted`);
        if (attachment.managed_asset_id !== null) failures.push(`demo module ${expected.code}: local demo PDF must not reference a managed Media Asset`);
        if (attachment.mime_type?.toLowerCase() !== MATERI_DOCUMENT_MIME_TYPE) failures.push(`demo module ${expected.code}: PDF MIME type must be ${MATERI_DOCUMENT_MIME_TYPE}`);
        if (attachment.original_name !== MATERI_DEMO_PDF_FILENAME) failures.push(`demo module ${expected.code}: PDF original_name must be ${MATERI_DEMO_PDF_FILENAME}`);
        if (!isAbsoluteHttpUrl(attachment.media_url) || !isPdfUrl(attachment.media_url)) failures.push(`demo module ${expected.code}: PDF media_url must be an absolute HTTP(S) .pdf URL`);
        if (!attachment.asset_title?.startsWith("[DEMO]")) failures.push(`demo module ${expected.code}: PDF asset title must be clearly marked [DEMO]`);
      }
      const video = videos[0];
      if (video) {
        if (video.source_kind !== "hosted") failures.push(`demo module ${expected.code}: optional video source_kind must be hosted`);
        if (video.media_url !== MATERI_DEMO_VIDEO_URL) failures.push(`demo module ${expected.code}: optional video URL differs from the approved placeholder`);
        if (video.duration_seconds !== MATERI_DEMO_VIDEO_DURATION_SECONDS || !Number.isInteger(video.duration_seconds) || video.duration_seconds <= 0) failures.push(`demo module ${expected.code}: optional video duration must be a positive integer`);
        if (!video.asset_title?.startsWith("[DEMO]")) failures.push(`demo module ${expected.code}: video asset title must be clearly marked [DEMO]`);
      }
    }

    const duplicateCodeResult = await client.query(
      `SELECT code, COUNT(*)::int AS count
         FROM modules
        WHERE code = ANY($1::text[])
        GROUP BY code
       HAVING COUNT(*) > 1`,
      [DEMO_CODES],
    );
    if (duplicateCodeResult.rowCount) failures.push("demo module codes are duplicated in the database");

    if (failures.length > 0) {
      throw new Error(`Materi document-first catalogue verification failed:\n- ${failures.join("\n- ")}`);
    }

    const optionalVideoCount = MATERI_DEMO_MODULES.filter((module) => module.withVideo).length;
    console.log(`Materi document-first catalogue passed: 7 subjects, 21 sections, 21 stable demo modules, 21 hosted PDF attachments, ${optionalVideoCount} optional videos, document-only and document-plus-video coverage. Verification selects resources by explicit asset role and does not rely on a slot-0/video assumption.`);
  } finally {
    await client.end();
  }
}

verify().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
