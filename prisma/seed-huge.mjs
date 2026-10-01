import "dotenv/config";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { pathToFileURL } from "node:url";

import { resolveMateriDemoPdfUrl } from "./materi-seed.mjs";

const { Client } = pg;
const DEFAULT_STUDENT_COUNT = 10_000;
const DEFAULT_MODULE_COUNT = 10_000;
const MAX_RECORD_COUNT = 50_000;
const STUDENT_EMAIL_PREFIX = "huge-seed-student-";
const MODULE_CODE_PREFIX = "seed:huge:materi:";
const MATERI_SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"];
const REQUIRED_MATERI_TOPIC_COUNT = 21;
const DEFAULT_ADMIN_EMAIL = "admin@vecalss.local";
const DEFAULT_TUTOR_EMAIL = "tutor@vecalss.local";
const DEFAULT_EXAM_EVENT_NAME = "UTBK SNBT 2027 - Gelombang Utama";

function requestedCount(name, fallback) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const parsedValue = Number(rawValue);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 0 || parsedValue > MAX_RECORD_COUNT) {
    throw new Error(`${name} must be an integer between 0 and ${MAX_RECORD_COUNT}.`);
  }

  return parsedValue;
}

function requireLocalDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the huge local seed.");

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL for the local development database.");
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ""));
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  const isPostgresUrl = parsedUrl.protocol === "postgres:" || parsedUrl.protocol === "postgresql:";
  if (!isPostgresUrl || !localHosts.has(parsedUrl.hostname) || parsedUrl.port !== "55432" || databaseName !== "vecalss_dev") {
    throw new Error("The huge seed only runs against local vecalss_dev on loopback port 55432; no records were changed.");
  }

  return databaseUrl;
}

async function resolveRequiredUser(client, { email, role }) {
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

  if (!result.rowCount) {
    throw new Error(`The huge seed needs an active ${role} account for ${email}. Run just local-seed first.`);
  }

  return result.rows[0].id;
}

async function resolveRequiredExamEvent(client) {
  const result = await client.query(
    "SELECT id FROM exam_events WHERE name = $1 AND is_active = TRUE LIMIT 1",
    [DEFAULT_EXAM_EVENT_NAME],
  );

  if (!result.rowCount) {
    throw new Error(`The huge seed needs the active exam event "${DEFAULT_EXAM_EVENT_NAME}". Run just local-seed first.`);
  }

  return result.rows[0].id;
}

async function seedHugeStudents(client, { adminId, examEventId, passwordHash, studentCount }) {
  if (studentCount === 0) return { accounts: 0, profiles: 0, roles: 0 };

  const profileResult = await client.query(
    `WITH generated AS (
       SELECT
         generated.sequence::integer AS sequence,
         'huge-seed-student-' || lpad(generated.sequence::text, 6, '0') || '@vecalss.local' AS email,
         'Peserta uji skala besar ' || lpad(generated.sequence::text, 6, '0') AS full_name,
         date_trunc('day', NOW()) - ((generated.sequence % 730) * INTERVAL '1 day') AS created_at
       FROM generate_series(1, $1::integer) AS generated(sequence)
     ), upserted_users AS (
       INSERT INTO users (
         email,
         full_name,
         password_hash,
         must_change_password,
         status,
         created_at,
         updated_at
       )
       SELECT email, full_name, $2, TRUE, 'active', created_at, NOW()
         FROM generated
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         password_hash = EXCLUDED.password_hash,
         must_change_password = TRUE,
         soft_deleted_at = NULL,
         status = 'active',
         created_at = EXCLUDED.created_at,
         updated_at = NOW()
       RETURNING id, full_name
     )
     INSERT INTO student_profiles (
       user_id,
       display_name,
       onboarding_status,
       target_exam_event_id,
       timezone,
       enrolled_by_user_id
     )
     SELECT id, full_name, 'completed', $3::uuid, 'Asia/Jakarta', $4::uuid
       FROM upserted_users
     ON CONFLICT (user_id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       enrolled_by_user_id = EXCLUDED.enrolled_by_user_id,
       onboarding_status = EXCLUDED.onboarding_status,
       target_exam_event_id = EXCLUDED.target_exam_event_id,
       timezone = EXCLUDED.timezone,
       updated_at = NOW()
     RETURNING user_id`,
    [studentCount, passwordHash, examEventId, adminId],
  );

  const roleResult = await client.query(
    `INSERT INTO role_assignments (user_id, role, assigned_by_user_id)
     SELECT users.id, 'student'::role_name, $2::uuid
       FROM users
      WHERE users.email LIKE $1
        AND NOT EXISTS (
          SELECT 1
            FROM role_assignments
           WHERE role_assignments.user_id = users.id
             AND role_assignments.role = 'student'::role_name
             AND role_assignments.revoked_at IS NULL
        )
     RETURNING id`,
    [`${STUDENT_EMAIL_PREFIX}%@vecalss.local`, adminId],
  );

  const accountResult = await client.query(
    "SELECT COUNT(*)::integer AS count FROM users WHERE email LIKE $1",
    [`${STUDENT_EMAIL_PREFIX}%@vecalss.local`],
  );

  return {
    accounts: accountResult.rows[0].count,
    profiles: profileResult.rowCount,
    roles: roleResult.rowCount,
  };
}

async function seedHugeModules(client, { moduleCount, tutorId }) {
  if (moduleCount === 0) return { modules: 0, attachments: 0, topics: 0 };

  const topicResult = await client.query(
    `SELECT topics.id,
            topics.code,
            subtests.name AS subject_name,
            subtests.sort_order::integer AS subtest_sort_order,
            topics.sort_order::integer AS topic_sort_order,
            COALESCE(MAX(modules.sequence_no) FILTER (WHERE modules.code NOT LIKE $2), 0) + 1 AS sequence_base
       FROM topics
       JOIN subtests ON subtests.id = topics.subtest_id
       LEFT JOIN modules ON modules.topic_id = topics.id
      WHERE subtests.code = ANY($1::text[])
        AND topics.code LIKE 'materi:%'
        AND topics.parent_topic_id IS NULL
        AND topics.is_active = TRUE
        AND subtests.is_active = TRUE
      GROUP BY topics.id, topics.code, topics.sort_order, subtests.name, subtests.sort_order
      ORDER BY subtests.sort_order, topics.sort_order, topics.code`,
    [MATERI_SUBJECT_CODES, `${MODULE_CODE_PREFIX}%`],
  );

  if (topicResult.rows.length !== REQUIRED_MATERI_TOPIC_COUNT) {
    throw new Error(
      `The huge seed expected ${REQUIRED_MATERI_TOPIC_COUNT} active canonical Materi topics, found ${topicResult.rows.length}. Run just local-seed first.`,
    );
  }

  const pdfUrl = resolveMateriDemoPdfUrl({
    baseUrl: "http://localhost:5023",
    pdfUrl: process.env.MATERI_DEMO_PDF_URL,
  });
  const moduleResult = await client.query(
    `WITH target_topics AS (
       SELECT id,
              subject_name,
              sequence_base::integer,
              row_number() OVER (ORDER BY subtest_sort_order, topic_sort_order, code)::integer AS topic_ordinal,
              COUNT(*) OVER ()::integer AS topic_count
         FROM unnest($1::uuid[], $2::text[], $3::integer[], $4::integer[], $5::integer[], $6::text[])
           AS target(id, subject_name, sequence_base, subtest_sort_order, topic_sort_order, code)
     ), generated AS (
       SELECT series.sequence::integer,
              target.id AS topic_id,
              target.subject_name,
              target.sequence_base + ((series.sequence - 1) / target.topic_count)::integer AS sequence_no,
              '${MODULE_CODE_PREFIX}' || lpad(series.sequence::text, 6, '0') AS code,
              '[UJI SKALA BESAR] ' || target.subject_name || ' · Materi ' || lpad(series.sequence::text, 6, '0') AS title,
              'Konten sintetis untuk pengujian tampilan daftar berskala besar.' AS summary,
              date_trunc('day', NOW()) - ((series.sequence % 180) * INTERVAL '1 day') AS published_at
         FROM generate_series(1, $7::integer) AS series(sequence)
         JOIN target_topics AS target
           ON target.topic_ordinal = ((series.sequence - 1) % target.topic_count) + 1
     )
     INSERT INTO modules (
       topic_id,
       code,
       title,
       summary,
       sequence_no,
       estimated_minutes,
       status,
       published_at,
       created_by_user_id,
       updated_by_user_id,
       created_at,
       updated_at
     )
     SELECT topic_id,
            code,
            title,
            summary,
            sequence_no,
            8 + (sequence % 23),
            'published',
            published_at,
            $8::uuid,
            $8::uuid,
            published_at,
            NOW()
       FROM generated
     ON CONFLICT (code)
     DO UPDATE SET
       topic_id = EXCLUDED.topic_id,
       title = EXCLUDED.title,
       summary = EXCLUDED.summary,
       sequence_no = EXCLUDED.sequence_no,
       estimated_minutes = EXCLUDED.estimated_minutes,
       status = 'published',
       published_at = EXCLUDED.published_at,
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       created_at = EXCLUDED.created_at,
       updated_at = NOW()
     RETURNING id`,
    [
      topicResult.rows.map((topic) => topic.id),
      topicResult.rows.map((topic) => topic.subject_name),
      topicResult.rows.map((topic) => Number(topic.sequence_base)),
      topicResult.rows.map((topic) => topic.subtest_sort_order ?? 0),
      topicResult.rows.map((topic) => topic.topic_sort_order ?? 0),
      topicResult.rows.map((topic) => topic.code),
      moduleCount,
      tutorId,
    ],
  );

  const attachmentResult = await client.query(
    `INSERT INTO module_assets (
       module_id,
       asset_type,
       source_kind,
       title,
       media_url,
       mime_type,
       original_name,
       sort_order
     )
     SELECT id,
            'attachment',
            'hosted',
            '[UJI SKALA BESAR] Bacaan contoh',
            $1,
            'application/pdf',
            'test.pdf',
            0
       FROM modules
      WHERE code LIKE $2
     ON CONFLICT (module_id, sort_order)
     DO UPDATE SET
       asset_type = EXCLUDED.asset_type,
       source_kind = EXCLUDED.source_kind,
       title = EXCLUDED.title,
       media_url = EXCLUDED.media_url,
       mime_type = EXCLUDED.mime_type,
       original_name = EXCLUDED.original_name
     RETURNING id`,
    [pdfUrl, `${MODULE_CODE_PREFIX}%`],
  );

  const totalsResult = await client.query(
    `SELECT COUNT(*)::integer AS modules,
            COUNT(DISTINCT topic_id)::integer AS topics
       FROM modules
      WHERE code LIKE $1`,
    [`${MODULE_CODE_PREFIX}%`],
  );

  return {
    attachments: attachmentResult.rowCount,
    modules: totalsResult.rows[0].modules,
    requestedModules: moduleResult.rowCount,
    topics: totalsResult.rows[0].topics,
  };
}

async function main() {
  const databaseUrl = requireLocalDatabaseUrl();
  const studentCount = requestedCount("LOCAL_HUGE_SEED_STUDENTS", DEFAULT_STUDENT_COUNT);
  const moduleCount = requestedCount("LOCAL_HUGE_SEED_MODULES", DEFAULT_MODULE_COUNT);
  const client = new Client({ connectionString: databaseUrl });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");

    const adminId = await resolveRequiredUser(client, { email: DEFAULT_ADMIN_EMAIL, role: "admin" });
    const tutorId = await resolveRequiredUser(client, { email: DEFAULT_TUTOR_EMAIL, role: "tutor" });
    const examEventId = await resolveRequiredExamEvent(client);
    const passwordHash = await bcrypt.hash(randomBytes(48).toString("base64url"), 12);
    const studentSummary = await seedHugeStudents(client, {
      adminId,
      examEventId,
      passwordHash,
      studentCount,
    });
    const moduleSummary = await seedHugeModules(client, { moduleCount, tutorId });

    await client.query("COMMIT");
    console.log("Local huge seed completed (synthetic display data only).");
    console.log(
      `Students: ${studentSummary.accounts} accounts, ${studentSummary.profiles} profiles, ${studentSummary.roles} new active roles.`,
    );
    console.log(
      `Materi: ${moduleSummary.modules} total tagged modules across ${moduleSummary.topics} topics; ${moduleSummary.attachments} PDF resources.`,
    );
    console.log("The seed is additive and repeatable; it does not reset or delete existing records.");
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
    console.error("Failed to seed the local huge dataset.");
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_MODULE_COUNT,
  DEFAULT_STUDENT_COUNT,
  MAX_RECORD_COUNT,
  requireLocalDatabaseUrl,
  requestedCount,
  seedHugeModules,
  seedHugeStudents,
};
