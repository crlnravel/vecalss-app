import "dotenv/config";

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

export const MOCK_USAGE_NAMESPACE = "mock-admin-ai-usage-v1";
export const MOCK_USAGE_POLICY_VERSION = "mock-admin-ai-usage-v1";
export const MOCK_USAGE_TIMEZONE = "Asia/Jakarta";
export const MOCK_USAGE_DAYS = 30;

export const MOCK_STUDENT_EMAILS = [
  "student@vecalss.local",
  "dimas@vecalss.local",
  "leila@vecalss.local",
  "nabila@vecalss.local",
  "fajar@vecalss.local",
  "salma@vecalss.local",
  "arya@vecalss.local",
  "intan@vecalss.local",
  "kevin@vecalss.local",
  "putri@vecalss.local",
  "rangga@vecalss.local",
  "syifa@vecalss.local",
];

export const MOCK_USAGE_FEATURES = [
  {
    featureKey: "vera.chat",
    requestType: "vera_chat",
    gateway: "openrouter",
    upstreamProvider: "OpenRouter",
    upstreamProviderSlug: "openrouter",
    model: "z-ai/glm-5.2:free",
  },
  {
    featureKey: "vera.drill",
    requestType: "smart_drill",
    gateway: "direct_openai",
    upstreamProvider: "OpenAI",
    upstreamProviderSlug: "openai",
    model: "openai/gpt-4o-mini",
  },
  {
    featureKey: "vera.review",
    requestType: "weakness_analysis",
    gateway: "direct_anthropic",
    upstreamProvider: "Anthropic",
    upstreamProviderSlug: "anthropic",
    model: "anthropic/claude-3.5-sonnet",
  },
  {
    featureKey: "vera.analysis",
    requestType: "weakness_analysis",
    gateway: "openrouter",
    upstreamProvider: "OpenRouter",
    upstreamProviderSlug: "openrouter",
    model: "z-ai/glm-5.2:free",
  },
  {
    featureKey: "vera.ptn",
    requestType: "ptn_strategy",
    gateway: "mock",
    upstreamProvider: "Vera simulator",
    upstreamProviderSlug: "mock",
    model: "mock",
  },
];

const REQUEST_INSERT_SQL = `
  INSERT INTO ai_requests (
    student_id,
    request_type,
    model,
    input_tokens,
    output_tokens,
    status,
    latency_ms,
    error_code,
    client_request_id,
    request_fingerprint,
    fingerprint_key_version,
    feature_key,
    behavior_version,
    output_schema_version,
    context_pack_version,
    gateway,
    upstream_provider,
    upstream_provider_slug,
    observed_upstream_provider_slug,
    routing_policy_version,
    quota_policy_version,
    policy_bundle_version,
    retention_policy_version,
    settlement_deadline_at,
    hard_output_quota_units,
    max_provider_attempts,
    quota_units_reserved,
    quota_units_consumed,
    quota_overrun_units,
    token_usage_state,
    usage_accounting_state,
    started_at,
    first_token_at,
    completed_at,
    time_to_first_token_ms,
    fallback_reason,
    provider_request_ref,
    finalized_at,
    idempotency_evidence_state,
    legacy_usage_state,
    owner_state,
    created_at
  ) VALUES (
    $1,
    $2::ai_conversation_type,
    $3,
    $4,
    $5,
    $6::ai_request_lifecycle_state,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13,
    $14,
    $15,
    $16,
    $17,
    $18,
    $19,
    $20,
    $21,
    $22,
    $23,
    $24,
    $25,
    $26,
    $27,
    $28,
    $29,
    $30::ai_token_usage_state,
    $31::ai_usage_accounting_state,
    $32,
    $33,
    $34,
    $35,
    $36,
    $37,
    $38,
    $39,
    $40::ai_legacy_usage_state,
    $41::ai_owner_state,
    $42
  )
`;

const ADMISSION_INSERT_SQL = `
  INSERT INTO ai_admission_events (
    student_id,
    occurred_at,
    local_quota_date,
    quota_timezone,
    quota_timezone_policy_version,
    policy_bundle_version,
    quota_offset_minutes,
    feature_key,
    behavior_version,
    gateway,
    upstream_provider,
    upstream_provider_slug,
    model,
    reason
  ) VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11,
    $12,
    $13,
    $14::ai_admission_reason
  )
`;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the AI usage seed.");
  }

  return databaseUrl;
}

function candidateStudentEmails() {
  return [...new Set([process.env.SEED_STUDENT_EMAIL?.trim(), ...MOCK_STUDENT_EMAILS].filter(Boolean).map((email) => email.toLowerCase()))];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const LOCAL_QUOTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: MOCK_USAGE_TIMEZONE,
  year: "numeric",
});

function localQuotaDate(date) {
  const parts = LOCAL_QUOTA_DATE_FORMATTER.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function ensureDate(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }

  return date;
}

function requestStatus(studentIndex, featureIndex, sequence) {
  const roll = (studentIndex * 13 + featureIndex * 7 + sequence * 5) % 20;

  if (roll === 0) return "failed";
  if (roll <= 2) return "fallback";
  return "succeeded";
}

function buildRequestRow({ createdAt, feature, featureIndex, sequence, student, studentIndex }) {
  const status = requestStatus(studentIndex, featureIndex, sequence);
  const latencyMs = 620 + ((studentIndex * 41 + featureIndex * 67 + sequence * 23) % 1_180);
  const inputTokens = 180 + ((studentIndex * 29 + featureIndex * 47 + sequence * 31) % 520);
  const outputTokens = 90 + ((studentIndex * 23 + featureIndex * 37 + sequence * 19) % 340);
  const reservedUnits = 8 + ((studentIndex * 5 + featureIndex * 3 + sequence * 2) % 13);
  const consumedUnits = status === "failed" ? Math.max(1, Math.floor(reservedUnits / 3)) : reservedUnits;
  const overrunUnits = status === "fallback" && (studentIndex + featureIndex + sequence) % 11 === 0 ? 2 : 0;
  const completedAt = new Date(createdAt.getTime() + latencyMs);
  const requestKey = `${MOCK_USAGE_NAMESPACE}:${studentIndex}:${featureIndex}:${sequence}`;

  return {
    studentId: student.id,
    featureKey: feature.featureKey,
    requestType: feature.requestType,
    gateway: feature.gateway,
    upstreamProvider: feature.upstreamProvider,
    upstreamProviderSlug: feature.upstreamProviderSlug,
    model: feature.model,
    status,
    inputTokens,
    outputTokens,
    quotaUnitsReserved: reservedUnits,
    quotaUnitsConsumed: consumedUnits,
    quotaOverrunUnits: overrunUnits,
    tokenUsageState: "known",
    usageAccountingState: overrunUnits > 0 ? "overrun_debt" : "known",
    latencyMs,
    timeToFirstTokenMs: Math.round(latencyMs * 0.18),
    clientRequestId: requestKey,
    requestFingerprint: sha256(requestKey),
    fingerprintKeyVersion: MOCK_USAGE_POLICY_VERSION,
    behaviorVersion: MOCK_USAGE_POLICY_VERSION,
    outputSchemaVersion: MOCK_USAGE_POLICY_VERSION,
    contextPackVersion: MOCK_USAGE_POLICY_VERSION,
    routingPolicyVersion: `${MOCK_USAGE_POLICY_VERSION}:routing`,
    quotaPolicyVersion: `${MOCK_USAGE_POLICY_VERSION}:quota`,
    policyBundleVersion: MOCK_USAGE_POLICY_VERSION,
    retentionPolicyVersion: `${MOCK_USAGE_POLICY_VERSION}:retention`,
    settlementDeadlineAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
    hardOutputQuotaUnits: 1_000,
    maxProviderAttempts: status === "fallback" ? 2 : 1,
    startedAt: createdAt,
    firstTokenAt: new Date(createdAt.getTime() + Math.round(latencyMs * 0.18)),
    completedAt,
    fallbackReason: status === "fallback" ? "provider_rate_limit" : null,
    errorCode: status === "failed" ? "mock_provider_error" : null,
    providerRequestRef: `${requestKey}:provider`,
    finalizedAt: completedAt,
    idempotencyEvidenceState: "active",
    legacyUsageState: "not_applicable",
    ownerState: "active",
    createdAt,
  };
}

export function buildMockUsageRows({ students, now = new Date() } = {}) {
  const normalizedNow = ensureDate(now, "now");

  if (!Array.isArray(students) || students.length === 0) {
    throw new Error("At least one student is required to build mock usage rows.");
  }

  return students.flatMap((student, studentIndex) =>
    MOCK_USAGE_FEATURES.flatMap((feature, featureIndex) => {
      const anchorMinutes = 30 + studentIndex * 17 + featureIndex * 13;
      const anchor = buildRequestRow({
        createdAt: new Date(normalizedNow.getTime() - anchorMinutes * 60 * 1000),
        feature,
        featureIndex,
        sequence: 0,
        student,
        studentIndex,
      });
      const historyCount = 2 + ((studentIndex + featureIndex) % 3);
      const history = Array.from({ length: historyCount }, (_, historyIndex) => {
        const dayOffset = 1 + ((studentIndex * 7 + featureIndex * 11 + historyIndex) % (MOCK_USAGE_DAYS - 1));
        const minuteOffset = 45 + ((studentIndex * 23 + featureIndex * 31 + historyIndex * 17) % 720);
        return buildRequestRow({
          createdAt: new Date(normalizedNow.getTime() - (dayOffset * 24 * 60 + minuteOffset) * 60 * 1000),
          feature,
          featureIndex,
          sequence: historyIndex + 1,
          student,
          studentIndex,
        });
      });

      return [anchor, ...history];
    }),
  );
}

export function buildMockAdmissionRows({ students, now = new Date() } = {}) {
  const normalizedNow = ensureDate(now, "now");

  if (!Array.isArray(students) || students.length === 0) {
    throw new Error("At least one student is required to build mock admission rows.");
  }

  const reasons = ["quota", "burst", "concurrency", "quota_overrun_lock"];

  return students.flatMap((student, studentIndex) => {
    const feature = MOCK_USAGE_FEATURES[studentIndex % MOCK_USAGE_FEATURES.length];
    const recentOccurredAt = new Date(normalizedNow.getTime() - (75 + studentIndex * 29) * 60 * 1000);
    const recent = {
      studentId: student.id,
      occurredAt: recentOccurredAt,
      localQuotaDate: localQuotaDate(recentOccurredAt),
      quotaTimezone: MOCK_USAGE_TIMEZONE,
      quotaTimezonePolicyVersion: `${MOCK_USAGE_POLICY_VERSION}:quota`,
      policyBundleVersion: MOCK_USAGE_POLICY_VERSION,
      quotaOffsetMinutes: 420,
      featureKey: feature.featureKey,
      behaviorVersion: MOCK_USAGE_POLICY_VERSION,
      gateway: feature.gateway,
      upstreamProvider: feature.upstreamProvider,
      upstreamProviderSlug: feature.upstreamProviderSlug,
      model: feature.model,
      reason: reasons[studentIndex % reasons.length],
    };

    if (studentIndex % 3 !== 0) return [recent];

    const historicalOccurredAt = new Date(normalizedNow.getTime() - (1 + studentIndex) * 24 * 60 * 60 * 1000);
    return [
      recent,
      {
        ...recent,
        occurredAt: historicalOccurredAt,
        localQuotaDate: localQuotaDate(historicalOccurredAt),
        featureKey: MOCK_USAGE_FEATURES[(studentIndex + 2) % MOCK_USAGE_FEATURES.length].featureKey,
        reason: reasons[(studentIndex + 1) % reasons.length],
      },
    ];
  });
}

async function findStudents(client) {
  const emails = candidateStudentEmails();
  const result = await client.query(
    `
      SELECT u.id, u.email, u.full_name AS "fullName"
      FROM users u
      WHERE LOWER(u.email) = ANY($1::text[])
        AND u.status = 'active'::user_status
        AND EXISTS (
          SELECT 1
          FROM role_assignments ra
          WHERE ra.user_id = u.id
            AND ra.role = 'student'::role_name
            AND ra.revoked_at IS NULL
        )
      ORDER BY ARRAY_POSITION($1::text[], LOWER(u.email))
      LIMIT $2
    `,
    [emails, MOCK_STUDENT_EMAILS.length],
  );

  if (result.rows.length < 5) {
    throw new Error(
      `Found only ${result.rows.length} active demo students. Run pnpm db:seed first, then rerun pnpm db:seed-ai-usage.`,
    );
  }

  return result.rows;
}

async function insertRequest(client, row) {
  await client.query(REQUEST_INSERT_SQL, [
    row.studentId,
    row.requestType,
    row.model,
    row.inputTokens,
    row.outputTokens,
    row.status,
    row.latencyMs,
    row.errorCode,
    row.clientRequestId,
    row.requestFingerprint,
    row.fingerprintKeyVersion,
    row.featureKey,
    row.behaviorVersion,
    row.outputSchemaVersion,
    row.contextPackVersion,
    row.gateway,
    row.upstreamProvider,
    row.upstreamProviderSlug,
    row.upstreamProviderSlug,
    row.routingPolicyVersion,
    row.quotaPolicyVersion,
    row.policyBundleVersion,
    row.retentionPolicyVersion,
    row.settlementDeadlineAt,
    row.hardOutputQuotaUnits,
    row.maxProviderAttempts,
    row.quotaUnitsReserved,
    row.quotaUnitsConsumed,
    row.quotaOverrunUnits,
    row.tokenUsageState,
    row.usageAccountingState,
    row.startedAt,
    row.firstTokenAt,
    row.completedAt,
    row.timeToFirstTokenMs,
    row.fallbackReason,
    row.providerRequestRef,
    row.finalizedAt,
    row.idempotencyEvidenceState,
    row.legacyUsageState,
    row.ownerState,
    row.createdAt,
  ]);
}

async function insertAdmission(client, row) {
  await client.query(ADMISSION_INSERT_SQL, [
    row.studentId,
    row.occurredAt,
    row.localQuotaDate,
    row.quotaTimezone,
    row.quotaTimezonePolicyVersion,
    row.policyBundleVersion,
    row.quotaOffsetMinutes,
    row.featureKey,
    row.behaviorVersion,
    row.gateway,
    row.upstreamProvider,
    row.upstreamProviderSlug,
    row.model,
    row.reason,
  ]);
}

export function parseSeedArgs(argv = []) {
  const dryRun = argv.includes("--dry-run");
  const help = argv.includes("--help") || argv.includes("-h");
  const unknown = argv.filter((argument) => !["--", "--dry-run", "--help", "-h"].includes(argument));

  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown[0]}`);
  }

  return { dryRun, help };
}

export async function seedMockAiUsage({ databaseUrl = requireDatabaseUrl(), dryRun = false, now = new Date() } = {}) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const students = await findStudents(client);
    const requests = buildMockUsageRows({ now, students });
    const admissions = buildMockAdmissionRows({ now, students });
    const summary = {
      studentCount: students.length,
      requestCount: requests.length,
      admissionCount: admissions.length,
      dryRun,
    };

    if (dryRun) return summary;

    await client.query("BEGIN");
    const namespacePattern = `${MOCK_USAGE_NAMESPACE}:%`;
    await client.query("DELETE FROM ai_requests WHERE client_request_id LIKE $1", [namespacePattern]);
    await client.query("DELETE FROM ai_admission_events WHERE policy_bundle_version = $1", [MOCK_USAGE_POLICY_VERSION]);

    for (const request of requests) await insertRequest(client, request);
    for (const admission of admissions) await insertAdmission(client, admission);

    await client.query("COMMIT");
    return summary;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function printHelp() {
  console.log("Usage: pnpm db:seed-ai-usage [--dry-run]");
  console.log("Seeds privacy-safe mock AiRequest/AiAdmissionEvent telemetry for the Admin AI dashboard.");
  console.log("The seed is repeatable and replaces only rows in its mock-admin-ai-usage-v1 namespace.");
  console.log("It never creates conversations, messages, prompts, or assistant content.");
}

async function main() {
  const options = parseSeedArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const summary = await seedMockAiUsage({ dryRun: options.dryRun });
  console.log(`${summary.dryRun ? "AI usage seed preview" : "AI usage seed completed"}.`);
  console.log(`Students: ${summary.studentCount}`);
  console.log(`Requests: ${summary.requestCount}`);
  console.log(`Admission events: ${summary.admissionCount}`);
  if (summary.dryRun) console.log("No database rows were changed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Failed to seed mock Admin AI usage.");
    console.error(error);
    process.exitCode = 1;
  });
}
