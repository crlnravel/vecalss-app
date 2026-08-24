import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString || process.env.VERA_DISPOSABLE_DB_ACK !== "1") {
  throw new Error("Set VERA_DISPOSABLE_DATABASE_URL to a disposable localhost vera_test database and VERA_DISPOSABLE_DB_ACK=1.");
}

const parsed = new URL(connectionString);
assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "fixture runner refuses non-local databases");
assert(parsed.pathname === "/vera_test" || parsed.pathname === "/vera_test/", "fixture runner requires database name vera_test");

const root = process.cwd();
const migrationRoot = join(root, "prisma/migrations");
const veraMigrationPath = join(migrationRoot, "20260824090000_add_vera_foundation/migration.sql");
const veraFollowupMigrationNames = new Set([
  "20260824090000_add_vera_foundation",
  "20260824120000_add_vera_sprint2_stage_guard",
  "20260824133000_add_vera_stage_retention_snapshot",
  "20260824134500_add_vera_idempotency_version",
]);
const priorMigrations = readdirSync(migrationRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !veraFollowupMigrationNames.has(entry.name))
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => join(migrationRoot, entry.name, "migration.sql"));
const priorMigrationHistoryDigest = digest(priorMigrations.map((migrationPath) => ({
  path: migrationPath,
  sql: readFileSync(migrationPath, "utf8"),
})));

const client = new Client({ connectionString });
await client.connect();
try {
  for (const migrationPath of priorMigrations) {
    await client.query(readFileSync(migrationPath, "utf8"));
  }

  const studentId = randomUUID();
  const conversationId = randomUUID();
  const legacyContextId = randomUUID();
  const systemMessageId = randomUUID();
  const userMessageId = randomUUID();
  const requestId = randomUUID();
  const terminalRequestId = randomUUID();
  const weaknessId = randomUUID();
  const recommendationId = randomUUID();
  const usageId = randomUUID();

  await client.query(
    `INSERT INTO users (id, email, full_name, password_hash)
     VALUES ($1, $2, 'Vera Fixture', 'fixture-hash')`,
    [studentId, `vera-fixture-${studentId}@example.test`],
  );
  await client.query(
    `INSERT INTO ai_conversations (id, student_id, conversation_type, context_entity_type, context_entity_id, title)
     VALUES ($1, $2, 'vera_chat', 'legacy_quiz', $3, 'Fixture conversation')`,
    [conversationId, studentId, legacyContextId],
  );
  await client.query(
    `INSERT INTO ai_messages (id, conversation_id, role, content_markdown)
     VALUES ($1, $3, 'system', 'hidden system fixture'), ($2, $3, 'user', 'learner fixture')`,
    [systemMessageId, userMessageId, conversationId],
  );
  await client.query(
    `UPDATE ai_messages SET metadata = '{"policy":"hidden"}'::jsonb WHERE id = $1`,
    [systemMessageId],
  );
  await client.query(
    `UPDATE ai_messages SET metadata = '{"source":"learner"}'::jsonb WHERE id = $1`,
    [userMessageId],
  );
  await client.query(
    `INSERT INTO ai_requests (id, student_id, conversation_id, request_type, prompt_template, input_tokens, output_tokens, status)
     VALUES ($1, $2, $3, 'vera_chat', 'legacy-template', 0, 0, 'pending')`,
    [requestId, studentId, conversationId],
  );
  await client.query(
    `INSERT INTO ai_requests (id, student_id, conversation_id, request_type, prompt_template, input_tokens, output_tokens, status)
     VALUES ($1, $2, $3, 'vera_chat', 'legacy-template', 42, 11, 'succeeded')`,
    [terminalRequestId, studentId, conversationId],
  );
  await client.query(
    `INSERT INTO weakness_analyses (id, student_id, conversation_id, summary_markdown)
     VALUES ($1, $2, $3, 'legacy weakness fixture')`,
    [weaknessId, studentId, conversationId],
  );
  await client.query(
    `INSERT INTO learning_recommendations (id, student_id, source, reason)
     VALUES ($1, $2, 'legacy-fixture', 'legacy recommendation reason')`,
    [recommendationId, studentId],
  );
  await client.query(
    `INSERT INTO ai_usage_daily (id, student_id, usage_date, prompt_tokens, completion_tokens, request_count, limit_tokens)
     VALUES ($1, $2, CURRENT_DATE, 0, 0, 2, 10000)`,
    [usageId, studentId],
  );

  const before = {
    messages: (await client.query(
      `SELECT id, content_markdown, metadata FROM ai_messages WHERE id IN ($1, $2) ORDER BY id`,
      [systemMessageId, userMessageId],
    )).rows,
    conversation: (await client.query(
      `SELECT id, context_entity_type, context_entity_id FROM ai_conversations WHERE id = $1`,
      [conversationId],
    )).rows,
    requests: (await client.query(
      `SELECT id, input_tokens, output_tokens, status FROM ai_requests WHERE id IN ($1, $2) ORDER BY id`,
      [requestId, terminalRequestId],
    )).rows,
    usage: (await client.query(
      `SELECT id, prompt_tokens, completion_tokens, request_count, limit_tokens FROM ai_usage_daily WHERE id = $1`,
      [usageId],
    )).rows,
    recommendation: (await client.query(
      `SELECT id, reason FROM learning_recommendations WHERE id = $1`,
      [recommendationId],
    )).rows,
  };
  const beforeDigest = digest(before);

  await client.query("BEGIN");
  await client.query(readFileSync(veraMigrationPath, "utf8"));
  const inTransaction = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'ai_messages' AND source_object_id IS NOT NULL) AS audited_messages,
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'ai_messages' AND source_field = 'role=system' AND content_class = 'hidden_system') AS audited_system,
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'ai_messages' AND source_field = 'metadata') AS audited_metadata,
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'ai_messages' AND source_field = 'metadata:role=system' AND content_class = 'hidden_system') AS audited_hidden_metadata,
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'ai_conversations' AND source_field = 'context_entity' AND source_object_id = $6 AND content_class = 'content_free') AS audited_legacy_context,
       (SELECT COUNT(*) FROM ai_content_migration_audits WHERE source_table = 'learning_recommendations' AND source_field = 'reason' AND source_object_id = $7 AND content_class = 'learner_visible') AS audited_recommendation_reason,
       (SELECT COUNT(*) FROM ai_idempotency_keys WHERE client_request_id = $1) AS pending_key,
       (SELECT state FROM ai_idempotency_keys WHERE client_request_id = $1) AS pending_key_state,
       (SELECT rejection_code FROM ai_idempotency_keys WHERE client_request_id = $1) AS pending_key_code,
       (SELECT accepted_at IS NULL AND terminal_at IS NULL FROM ai_idempotency_keys WHERE client_request_id = $1) AS pending_no_terminal_evidence,
       (SELECT state FROM ai_idempotency_keys WHERE client_request_id = $2) AS terminal_key_state,
       (SELECT result_kind FROM ai_idempotency_keys WHERE client_request_id = $2) AS terminal_key_kind,
       (SELECT terminal_at IS NULL FROM ai_idempotency_keys WHERE client_request_id = $2) AS terminal_time_unknown,
       (SELECT input_tokens = 0 AND output_tokens = 0 AND token_usage_state = 'not_applicable' AND legacy_usage_state = 'ambiguous' FROM ai_requests WHERE id = $3) AS pending_usage,
       (SELECT input_tokens = 42 AND output_tokens = 11 AND token_usage_state = 'known' AND legacy_usage_state = 'known' FROM ai_requests WHERE id = $4) AS terminal_usage,
       (SELECT prompt_tokens FROM ai_usage_daily WHERE id = $5) AS daily_prompt_tokens,
       (SELECT completion_tokens FROM ai_usage_daily WHERE id = $5) AS daily_completion_tokens,
       (SELECT limit_tokens FROM ai_usage_daily WHERE id = $5) AS daily_limit_tokens,
       (SELECT accepted_request_count FROM ai_usage_daily WHERE id = $5) AS daily_accepted_count,
       (SELECT finalized_request_count FROM ai_usage_daily WHERE id = $5) AS daily_finalized_count,
       (SELECT legacy_usage_state FROM ai_usage_daily WHERE id = $5) AS daily_legacy_state,
       (SELECT status FROM ai_requests WHERE id = $4) AS terminal_status,
       (SELECT created_at::date FROM ai_requests WHERE id = $4) AS terminal_date,
       (SELECT usage_date FROM ai_usage_daily WHERE id = $5) AS usage_date,
       (SELECT prompt_tokens = 0 AND completion_tokens = 0 AND limit_tokens = 10000 AND accepted_request_count = 2 AND finalized_request_count = 1 AND legacy_usage_state = 'ambiguous' FROM ai_usage_daily WHERE id = $5) AS daily_ledger`,
    [
      `legacy-${requestId}`,
      `legacy-${terminalRequestId}`,
      requestId,
      terminalRequestId,
      usageId,
      conversationId,
      recommendationId,
    ],
  );
  const evidence = inTransaction.rows[0] as Record<string, unknown>;
  assert(Number(evidence.audited_messages) >= 2, "fixture messages were not inventoried");
  assert(Number(evidence.audited_system) === 1, "system message classification missing");
  assert(Number(evidence.audited_metadata) === 1 && Number(evidence.audited_hidden_metadata) === 1, "message metadata inventory missing");
  assert(Number(evidence.audited_legacy_context) === 1, "legacy scalar conversation context inventory missing");
  assert(Number(evidence.audited_recommendation_reason) === 1, "learning recommendation reason inventory missing");
  assert(Number(evidence.pending_key) === 1 && evidence.pending_key_state === "rejected" && evidence.pending_key_code === "legacy_unreconciled", "pending legacy request was fabricated as accepted");
  assert(evidence.pending_no_terminal_evidence === true, "pending request gained false terminal evidence");
  assert(evidence.terminal_key_state === "accepted" && evidence.terminal_key_kind === "request" && evidence.terminal_time_unknown === true, "terminal legacy request replay classification is wrong");
  assert(evidence.pending_usage === true, "legacy request zero telemetry classification is wrong");
  assert(evidence.terminal_usage === true, "known legacy request telemetry was not preserved");
  assert(evidence.daily_ledger === true, `legacy daily telemetry/counters were not preserved independently: ${JSON.stringify({ ledger: evidence.daily_ledger, prompt: evidence.daily_prompt_tokens, completion: evidence.daily_completion_tokens, limit: evidence.daily_limit_tokens, accepted: evidence.daily_accepted_count, finalized: evidence.daily_finalized_count, state: evidence.daily_legacy_state, terminalStatus: evidence.terminal_status, terminalDate: evidence.terminal_date, usageDate: evidence.usage_date })}`);
  await client.query("ROLLBACK");

  const afterRollback = {
    messages: (await client.query(
      `SELECT id, content_markdown, metadata FROM ai_messages WHERE id IN ($1, $2) ORDER BY id`,
      [systemMessageId, userMessageId],
    )).rows,
    conversation: (await client.query(
      `SELECT id, context_entity_type, context_entity_id FROM ai_conversations WHERE id = $1`,
      [conversationId],
    )).rows,
    requests: (await client.query(
      `SELECT id, input_tokens, output_tokens, status FROM ai_requests WHERE id IN ($1, $2) ORDER BY id`,
      [requestId, terminalRequestId],
    )).rows,
    usage: (await client.query(
      `SELECT id, prompt_tokens, completion_tokens, request_count, limit_tokens FROM ai_usage_daily WHERE id = $1`,
      [usageId],
    )).rows,
    recommendation: (await client.query(
      `SELECT id, reason FROM learning_recommendations WHERE id = $1`,
      [recommendationId],
    )).rows,
  };
  assert(digest(afterRollback) === beforeDigest, "rollback changed pre-migration fixture data");
  const rollbackMigrationHistoryDigest = digest(priorMigrations.map((migrationPath) => ({
    path: migrationPath,
    sql: readFileSync(migrationPath, "utf8"),
  })));
  assert(rollbackMigrationHistoryDigest === priorMigrationHistoryDigest, "rollback changed existing migration history");
  const rolledBackTable = await client.query(`SELECT to_regclass('public.ai_lifecycle_operations') AS table_name`);
  assert(rolledBackTable.rows[0]?.table_name === null, "rollback left Vera tables behind");

  await client.query(readFileSync(veraMigrationPath, "utf8"));
  const committed = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM ai_content_migration_audits) AS inventory_count,
       (SELECT content_state FROM ai_messages WHERE id = $1) AS message_state,
       (SELECT COUNT(*) FROM ai_lifecycle_operations) AS lifecycle_count`,
    [systemMessageId],
  );
  assert(Number(committed.rows[0]?.inventory_count) >= 12, "committed inventory is incomplete");
  assert(committed.rows[0]?.message_state === "legacy_plaintext", "legacy message state was not preserved honestly");
  assert(Number(committed.rows[0]?.lifecycle_count) === 0, "lifecycle table was not empty after fixture migration");
  const committedMigrationHistoryDigest = digest(priorMigrations.map((migrationPath) => ({
    path: migrationPath,
    sql: readFileSync(migrationPath, "utf8"),
  })));
  assert(committedMigrationHistoryDigest === priorMigrationHistoryDigest, "committed migration changed existing migration history");

  const contextPackId = randomUUID();
  const sourceRowId = randomUUID();
  const sourceId = randomUUID();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO ai_context_packs (
       id, request_id, pack_schema_version, context_pack_version,
       ordered_block_manifest_json, byte_count, pack_digest,
       redaction_policy_version, system_policy_hash, prompt_template_hash,
       tool_schema_hash, retention_class, retention_policy_version, purge_at
     ) VALUES ($1, $2, '1', '1', '[]'::jsonb, 0, 'pack-digest', 'redact-v1', 'system', 'prompt', 'tool', 'fixture', 'retention-v1', CURRENT_TIMESTAMP + interval '1 day')`,
    [contextPackId, requestId],
  );
  await client.query(
    `INSERT INTO ai_request_sources (
       id, context_pack_id, request_id, ordinal, source_type, source_id,
       citation_key, content_digest, redaction_policy_version,
       retention_policy_version, purge_at
     ) VALUES ($1, $2, $3, 1, 'practice', $4, 'fixture-1', 'source-digest', 'redact-v1', 'retention-v1', CURRENT_TIMESTAMP + interval '1 day')`,
    [sourceRowId, contextPackId, requestId, sourceId],
  );

  let mismatchRejected = false;
  await client.query("SAVEPOINT source_identity");
  try {
    await client.query(
      `INSERT INTO ai_request_sources (
         id, context_pack_id, request_id, ordinal, source_type, source_id,
         citation_key, content_digest, redaction_policy_version,
         retention_policy_version, purge_at
       ) VALUES ($1, $2, $3, 2, 'practice', $4, 'fixture-2', 'source-digest', 'redact-v1', 'retention-v1', CURRENT_TIMESTAMP + interval '1 day')`,
      [randomUUID(), contextPackId, terminalRequestId, randomUUID()],
    );
  } catch {
    mismatchRejected = true;
  }
  await client.query("ROLLBACK TO SAVEPOINT source_identity");
  await client.query("RELEASE SAVEPOINT source_identity");
  assert(mismatchRejected, "source request/pack mismatch was accepted");

  let packMutationRejected = false;
  await client.query("SAVEPOINT pack_immutable");
  try {
    await client.query(`UPDATE ai_context_packs SET pack_digest = 'changed' WHERE id = $1`, [contextPackId]);
  } catch {
    packMutationRejected = true;
  }
  await client.query("ROLLBACK TO SAVEPOINT pack_immutable");
  await client.query("RELEASE SAVEPOINT pack_immutable");
  assert(packMutationRejected, "context pack snapshot mutation was accepted");

  let sourceMutationRejected = false;
  await client.query("SAVEPOINT source_immutable");
  try {
    await client.query(`UPDATE ai_request_sources SET content_digest = 'changed' WHERE id = $1`, [sourceRowId]);
  } catch {
    sourceMutationRejected = true;
  }
  await client.query("ROLLBACK TO SAVEPOINT source_immutable");
  await client.query("RELEASE SAVEPOINT source_immutable");
  assert(sourceMutationRejected, "request source snapshot mutation was accepted");
  await client.query("COMMIT");

  console.log("PASS vera-migration-fixture: additive migration replayed against legacy AI rows");
  console.log(`PASS vera-migration-fixture: rollback preserved fixture/data and migration-history digest ${priorMigrationHistoryDigest}`);
  console.log("PASS vera-migration-fixture: committed migration retained legacy telemetry, typed pending tombstones, and independent finalization counts");
  console.log("PASS vera-migration-fixture: request/pack identity FK and append-only context/source snapshots reject drift");
} finally {
  await client.end();
}
