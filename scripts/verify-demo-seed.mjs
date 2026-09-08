import "dotenv/config";

import assert from "node:assert/strict";
import pg from "pg";

import { digestAssessmentReleasePayload } from "../lib/tryout/assessment-release-canonical.mjs";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before verifying the demonstration seed.");
  return databaseUrl;
}

async function scalar(client, text, values = []) {
  const result = await client.query(text, values);
  return Number(result.rows[0].value);
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    const tryoutResult = await client.query(
      "SELECT id FROM tryout_packages WHERE code = 'seed:assessment:tryout:evaluasi-program:v1' AND status = 'published'",
    );
    assert.equal(tryoutResult.rowCount, 1, "The published demonstration tryout is missing.");
    const tryoutId = tryoutResult.rows[0].id;

    const bankQuestionCounts = await client.query(
      `SELECT question_banks.code AS bank_code, question_banks.purpose, subtests.code, COUNT(*)::int AS count
         FROM questions
         JOIN question_banks ON question_banks.id = questions.question_bank_id
         JOIN subtests ON subtests.id = questions.subtest_id
        WHERE question_banks.code IN ('seed:assessment:quiz-bank:v1', 'seed:assessment:tryout-bank:v1')
          AND questions.code LIKE 'seed:demo:%:question:%'
          AND questions.status = 'published'
        GROUP BY question_banks.code, question_banks.purpose, subtests.code
        ORDER BY question_banks.code, subtests.code`,
    );
    assert.equal(bankQuestionCounts.rowCount, 14, "Every UTBK subtest must be represented in both purpose-specific banks.");
    assert(bankQuestionCounts.rows.every((row) => row.count === 3), "Every UTBK subtest must contain three reviewed questions.");
    assert.deepEqual(
      new Set(bankQuestionCounts.rows.map((row) => row.purpose)),
      new Set(["quiz", "tryout"]),
      "The demonstration must contain separate Kuis and Tryout banks.",
    );

    assert.equal(
      await scalar(client, "SELECT COUNT(*)::int AS value FROM standalone_quizzes WHERE idempotency_key LIKE 'seed:demo:quiz:%'"),
      7,
      "The demonstration catalogue must contain seven quizzes.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM standalone_quizzes quizzes
                              JOIN standalone_quiz_items items ON items.quiz_id = quizzes.id
                             WHERE quizzes.idempotency_key LIKE 'seed:demo:quiz:%'`),
      21,
      "Every demonstration quiz must contain three questions.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM standalone_quizzes quizzes
                              JOIN question_banks banks ON banks.id = quizzes.source_bank_id
                             WHERE quizzes.idempotency_key LIKE 'seed:demo:quiz:%'
                               AND banks.purpose = 'quiz'`),
      7,
      "Every demonstration Kuis must use the Quiz-purpose bank.",
    );
    assert.equal(
      await scalar(client, "SELECT COUNT(*)::int AS value FROM reusable_question_packages WHERE code LIKE 'seed:demo:package:%' AND status = 'published'"),
      7,
      "The demonstration catalogue must contain seven ready reusable packages.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM reusable_question_packages packages
                              JOIN question_banks banks ON banks.id = packages.source_bank_id
                             WHERE packages.code LIKE 'seed:demo:package:%'
                               AND packages.status = 'published'
                               AND banks.purpose = 'tryout'`),
      7,
      "Every demonstration package must use the Tryout-purpose bank.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value FROM tryout_sections WHERE tryout_id = $1`, [tryoutId]),
      7,
      "The published tryout must contain seven test sections.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value FROM tryout_items WHERE tryout_id = $1`, [tryoutId]),
      21,
      "The published tryout must contain 21 frozen items.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM tryout_items items
                              JOIN questions questions ON questions.id = items.source_question_id
                              JOIN question_banks banks ON banks.id = questions.question_bank_id
                             WHERE items.tryout_id = $1
                               AND banks.purpose = 'tryout'`, [tryoutId]),
      21,
      "Every published Tryout item must come from the Tryout-purpose bank.",
    );

    const bindingState = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM tryout_sections WHERE tryout_id = $1 AND package_version_id IS NOT NULL) AS package_section_count,
         (SELECT COUNT(*)::int FROM tryout_items WHERE tryout_id = $1 AND package_version_id IS NOT NULL) AS package_item_count,
         (SELECT COUNT(*)::int FROM tryout_items WHERE tryout_id = $1 AND package_version_id IS NULL) AS direct_item_count,
         (SELECT COUNT(*)::int FROM tryout_attempts WHERE tryout_id = $1) AS attempt_count,
         (SELECT COUNT(*)::int
            FROM tryout_attempts attempts
            JOIN tryout_delivery_sessions sessions ON sessions.id = attempts.delivery_session_id
           WHERE attempts.tryout_id = $1
             AND sessions.status = 'closed') AS historical_attempt_count`,
      [tryoutId],
    );
    const bindings = bindingState.rows[0];
    const hasLegacyBindings = bindings.package_section_count > 0 || bindings.package_item_count > 0;
    if (hasLegacyBindings) {
      assert(bindings.historical_attempt_count > 0, "A freshly generated canonical Tryout must use direct snapshots; package bindings are only accepted for historical fixtures with attempts in a closed session.");
      console.warn(`Canonical Tryout binding classification: historical-package-bound (${bindings.package_section_count} sections, ${bindings.package_item_count} items, ${bindings.attempt_count} attempts, ${bindings.historical_attempt_count} closed-session attempts). A disposable reset/reseed is required to verify the fresh direct fixture.`);
    } else {
      assert.equal(bindings.direct_item_count, 21, "A freshly generated canonical Tryout must contain 21 direct snapshots.");
    }

    const directSnapshotIssues = await scalar(
      client,
      `SELECT COUNT(*)::int AS value
         FROM tryout_items items
         LEFT JOIN questions questions ON questions.id = items.source_question_id
         LEFT JOIN question_revisions revisions ON revisions.id = items.source_question_revision_id
         LEFT JOIN question_banks banks ON banks.id = questions.question_bank_id
        WHERE items.tryout_id = $1
          AND items.package_version_id IS NULL
          AND (
            items.source_question_id IS NULL
            OR items.source_question_revision_id IS NULL
            OR items.source_content_digest IS NULL
            OR items.source_revision_provenance IS NULL
            OR items.source_revision_provenance = 'legacy_unknown'
            OR revisions.id IS NULL
            OR revisions.question_id <> items.source_question_id
            OR revisions.status <> 'ready'
            OR revisions.provenance <> items.source_revision_provenance
            OR revisions.content_digest <> items.source_content_digest
            OR questions.status <> 'published'
            OR banks.id IS NULL
            OR banks.purpose <> 'tryout'
          )`,
      [tryoutId],
    );
    assert.equal(directSnapshotIssues, 0, "Every direct Tryout snapshot must retain a Ready source revision, matching digest, valid provenance, and Tryout-purpose bank.");

    const directOptionIssues = await scalar(
      client,
      `SELECT COUNT(*)::int AS value
         FROM tryout_items items
         JOIN question_revisions revisions ON revisions.id = items.source_question_revision_id
        WHERE items.tryout_id = $1
          AND items.package_version_id IS NULL
          AND (
            (SELECT COUNT(*) FROM tryout_item_options options WHERE options.tryout_item_id = items.id)
              <> (SELECT COUNT(*) FROM question_revision_options options WHERE options.question_revision_id = revisions.id)
            OR EXISTS (
              SELECT 1
                FROM tryout_item_options options
                LEFT JOIN question_revision_options source_options
                  ON source_options.id = options.source_question_revision_option_id
               WHERE options.tryout_item_id = items.id
                 AND (
                   source_options.id IS NULL
                   OR source_options.question_revision_id <> revisions.id
                   OR source_options.label <> options.choice_key
                   OR source_options.content <> options.content
                   OR source_options.is_correct <> options.is_correct
                   OR source_options.sort_order <> options.sort_order
                   OR source_options.asset_id IS DISTINCT FROM options.asset_id
                 )
            )
          )`,
      [tryoutId],
    );
    assert.equal(directOptionIssues, 0, "Every direct Tryout snapshot must retain the complete source revision option set.");

    const releaseResult = await client.query(
      `SELECT content_digest, payload
         FROM assessment_releases
        WHERE tryout_id = $1
        ORDER BY release_number DESC
        LIMIT 1`,
      [tryoutId],
    );
    assert.equal(releaseResult.rowCount, 1, "The published demonstration Tryout must have an AssessmentRelease.");
    const release = releaseResult.rows[0];
    const releasePayload = typeof release.payload === "string" ? JSON.parse(release.payload) : release.payload;
    assert.equal(digestAssessmentReleasePayload(releasePayload), release.content_digest, "The AssessmentRelease digest must match its canonical payload.");
    const physicalSections = await client.query(
      `SELECT sequence_no, duration_seconds, instructions, package_version_id,
              test_type::text, scoring_config, shuffle_items, cat_item_count,
              cat_model_version
         FROM tryout_sections
        WHERE tryout_id = $1
        ORDER BY sequence_no`,
      [tryoutId],
    );
    const releaseSections = releasePayload.sections ?? [];
    assert.equal(releaseSections.length, physicalSections.rowCount, "The AssessmentRelease must retain one immutable payload Section for every physical Section.");
    physicalSections.rows.forEach((section, index) => {
      const releaseSection = releaseSections[index];
      assert.equal(releaseSection.sequenceNo, section.sequence_no, "The AssessmentRelease Section order must match the physical Section.");
      assert.equal(releaseSection.durationSeconds, section.duration_seconds, "The AssessmentRelease Section duration must match the physical Section.");
      assert.equal(releaseSection.instructions, section.instructions, "The AssessmentRelease Section instructions must match the physical Section.");
      assert.equal(releaseSection.assembly?.mode, section.package_version_id ? "fixed_set" : "direct", "The AssessmentRelease assembly mode must match the physical Section binding.");
      assert.equal(releaseSection.assembly?.packageVersionId ?? null, section.package_version_id, "The AssessmentRelease package binding must match the physical Section binding.");
      assert.equal(releaseSection.randomization?.shuffleItems, section.shuffle_items, "The AssessmentRelease randomization must match the physical Section.");
      assert.equal(releaseSection.scoring?.testType, section.test_type, "The AssessmentRelease test type must match the physical Section.");
      assert.deepEqual(releaseSection.scoring?.config ?? null, section.scoring_config, "The AssessmentRelease scoring config must match the physical Section.");
      assert.equal(releaseSection.cat?.itemCount ?? null, section.cat_item_count, "The AssessmentRelease CAT item count must match the physical Section.");
      assert.equal(releaseSection.cat?.modelVersion ?? null, section.cat_model_version, "The AssessmentRelease CAT model version must match the physical Section.");
    });
    if (!hasLegacyBindings) {
      assert(
        releaseSections.length === 7
          && releaseSections.every((section) => section.assembly?.mode === "direct" && section.assembly?.packageVersionId === null),
        "A freshly generated canonical Tryout release must retain direct assembly metadata for every Section.",
      );
    }
    const physicalItems = await client.query(
      `SELECT items.package_code, items.points::text, items.source_content_digest,
              items.source_question_id, items.source_question_revision_id,
              items.source_revision_provenance, items.prompt, items.explanation,
              items.difficulty::text, items.prompt_asset_id, items.explanation_asset_id,
              section.sequence_no, items.sort_order,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'assetId', options.asset_id,
                  'choiceKey', options.choice_key,
                  'content', options.content,
                  'isCorrect', options.is_correct,
                  'sortOrder', options.sort_order,
                  'sourceQuestionOptionId', options.source_question_option_id,
                  'sourceQuestionRevisionOptionId', options.source_question_revision_option_id
                ) ORDER BY options.sort_order)
                  FROM tryout_item_options options
                 WHERE options.tryout_item_id = items.id
              ), '[]'::jsonb) AS options
         FROM tryout_items items
         JOIN tryout_sections section ON section.id = items.tryout_section_id
        WHERE items.tryout_id = $1
        ORDER BY section.sequence_no, items.sort_order`,
      [tryoutId],
    );
    const releaseItems = (releasePayload.sections ?? []).flatMap((section) => section.items ?? []);
    assert.equal(releaseItems.length, physicalItems.rowCount, "The AssessmentRelease must retain one immutable payload item for every physical Tryout item.");
    physicalItems.rows.forEach((item, index) => {
      const releaseItem = releaseItems[index];
      assert.equal(releaseItem.packageCode, item.package_code, "The AssessmentRelease package/direct marker must match the physical snapshot.");
      assert.equal(releaseItem.points, item.points, "The AssessmentRelease points must match the physical snapshot.");
      assert.equal(releaseItem.sourceContentDigest, item.source_content_digest, "The AssessmentRelease source digest must match the physical snapshot.");
      assert.equal(releaseItem.sourceQuestionId, item.source_question_id, "The AssessmentRelease source question must match the physical snapshot.");
      assert.equal(releaseItem.sourceQuestionRevisionId, item.source_question_revision_id, "The AssessmentRelease source revision must match the physical snapshot.");
      assert.equal(releaseItem.sourceRevisionProvenance, item.source_revision_provenance, "The AssessmentRelease source provenance must match the physical snapshot.");
      assert.equal(releaseItem.sortOrder, item.sort_order, "The AssessmentRelease item order must match the physical snapshot.");
      assert.equal(releaseItem.prompt, item.prompt, "The AssessmentRelease prompt must match the physical snapshot.");
      assert.equal(releaseItem.explanation, item.explanation, "The AssessmentRelease explanation must match the physical snapshot.");
      assert.equal(releaseItem.difficulty, item.difficulty, "The AssessmentRelease difficulty must match the physical snapshot.");
      assert.equal(releaseItem.promptAssetId ?? null, item.prompt_asset_id, "The AssessmentRelease prompt asset must match the physical snapshot.");
      assert.equal(releaseItem.explanationAssetId ?? null, item.explanation_asset_id, "The AssessmentRelease explanation asset must match the physical snapshot.");
      assert.deepEqual(
        (releaseItem.options ?? []).map((option) => ({
          assetId: option.assetId ?? null,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          sortOrder: option.sortOrder,
          sourceQuestionOptionId: option.sourceQuestionOptionId ?? null,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId ?? null,
        })),
        item.options,
        "The AssessmentRelease options must match the physical snapshot.",
      );
    });

    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value FROM tryout_sections WHERE tryout_id = $1 AND test_type = 'cat'`, [tryoutId]),
      3,
      "The tryout must contain three CAT sections.",
    );

    const sessions = await client.query(
      `SELECT id, name, status, available_from, available_until, released_at
         FROM tryout_delivery_sessions
        WHERE tryout_id = $1`,
      [tryoutId],
    );
    assert.equal(sessions.rowCount, 2, "The tryout must contain one active and one historical delivery session.");
    const active = sessions.rows.find((session) => session.name === "Sesi Reguler Pekan Ini");
    const historical = sessions.rows.find((session) => session.name === "Sesi Evaluasi Sebelumnya");
    assert(active && active.status === "active", "The current delivery session must be active.");
    assert(active.available_from <= new Date() && active.available_until > new Date(), "The current delivery session must be open now.");
    assert(historical && historical.status === "closed" && historical.released_at, "The historical session must contain released results.");

    const admissionCounts = await client.query(
      `SELECT status, COUNT(*)::int AS count
         FROM tryout_admissions
        WHERE tryout_id = $1
        GROUP BY status`,
      [tryoutId],
    );
    const admissions = new Map(admissionCounts.rows.map((row) => [row.status, row.count]));
    assert.deepEqual(Object.fromEntries(admissions), { active: 3, pending: 1, rejected: 1, revoked: 1 });
    assert.equal(
      await scalar(client, "SELECT COUNT(*)::int AS value FROM tryout_attempts WHERE delivery_session_id = $1 AND status = 'scored'", [historical.id]),
      3,
      "The historical session must contain three scored attempts.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM tryout_attempt_test_runs runs
                              JOIN tryout_attempts attempts ON attempts.id = runs.attempt_id
                             WHERE attempts.delivery_session_id = $1
                               AND runs.status = 'sealed'
                               AND runs.calculation_releaseable = TRUE`, [historical.id]),
      21,
      "Every historical attempt must contain seven releaseable runs.",
    );

    const auditSeed = await client.query(
      `SELECT action, metadata->>'seedKey' AS seed_key
         FROM audit_logs
        WHERE metadata->>'seedKey' LIKE 'vecalss.demo.audit-log.v1:%'
        ORDER BY occurred_at, id`,
    );
    assert.equal(auditSeed.rowCount, 6, "The demonstration seed must contain six immutable audit events.");
    assert.deepEqual(
      auditSeed.rows.map((row) => row.action).sort(),
      [
        "admission.approved",
        "enrollment_handoff.completed",
        "enrollment_handoff.released",
        "notification.kelas_sent",
        "result.bundle_released",
        "system_config.updated",
      ].sort(),
      "The demonstration audit seed must cover the expected operational events.",
    );
    assert(
      auditSeed.rows.every((row) => /^vecalss\.demo\.audit-log\.v1:[0-9a-f-]{36}$/u.test(row.seed_key)),
      "Every demonstration audit event must have a stable seed identity.",
    );
    assert.equal(
      await scalar(client, `SELECT COUNT(*)::int AS value
                              FROM pg_trigger
                             WHERE tgname IN ('audit_logs_immutable', 'audit_logs_truncate_immutable')
                               AND NOT tgisinternal`),
      2,
      "The audit log append-only triggers must be installed.",
    );

    const normalizedScores = await client.query(
      `SELECT attempts.id,
              attempts.score::numeric AS final_score,
              attempts.release_policy_snapshot ->> 'aggregationVersion' AS aggregation_version,
              COUNT(runs.id)::int AS run_count,
              COUNT(*) FILTER (WHERE runs.calculation_result ? 'normalizedScore')::int AS normalized_run_count,
              MIN((runs.calculation_result ->> 'normalizedScore')::numeric) AS minimum_run_score,
              MAX((runs.calculation_result ->> 'normalizedScore')::numeric) AS maximum_run_score
         FROM tryout_attempts attempts
         JOIN tryout_attempt_test_runs runs ON runs.attempt_id = attempts.id
        WHERE attempts.delivery_session_id = $1
        GROUP BY attempts.id
        ORDER BY final_score DESC`,
      [historical.id],
    );
    assert.equal(normalizedScores.rowCount, 3, "The historical session must contain three normalized scored attempts.");
    for (const attempt of normalizedScores.rows) {
      assert.equal(attempt.aggregation_version, "normalized-test-mean-v1", "Each demo attempt must record the normalized aggregation version.");
      assert.equal(attempt.run_count, 7, "Each demo attempt must contain seven Test runs.");
      assert.equal(attempt.normalized_run_count, 7, "Each demo Test run must retain normalizedScore.");
      assert(Number(attempt.final_score) >= 0 && Number(attempt.final_score) <= 100, "Demo final indices must stay within the internal 0–100 scale.");
      assert(Number(attempt.minimum_run_score) >= 0 && Number(attempt.maximum_run_score) <= 100, "Demo Test indices must stay within the internal 0–100 scale.");
    }
    console.table(normalizedScores.rows.map((attempt) => ({
      aggregationVersion: attempt.aggregation_version,
      finalIndex: Number(attempt.final_score),
      maxTestIndex: Number(attempt.maximum_run_score),
      minTestIndex: Number(attempt.minimum_run_score),
      normalizedRuns: attempt.normalized_run_count,
    })));

    const prohibitedCopy = await scalar(
      client,
      `SELECT COUNT(*)::int AS value FROM (
         SELECT title AS value FROM tryout_packages WHERE code = 'seed:assessment:tryout:evaluasi-program:v1'
         UNION ALL SELECT description FROM tryout_packages WHERE code = 'seed:assessment:tryout:evaluasi-program:v1'
         UNION ALL SELECT name FROM question_banks WHERE code IN ('seed:assessment:quiz-bank:v1', 'seed:assessment:tryout-bank:v1')
         UNION ALL SELECT description FROM question_banks WHERE code IN ('seed:assessment:quiz-bank:v1', 'seed:assessment:tryout-bank:v1')
       ) copy WHERE value ILIKE '%baseline%' OR value ILIKE '%tryout baseline%'`,
    );
    assert.equal(prohibitedCopy, 0, "User-facing demonstration copy must not contain placeholder language.");

    console.table([
      { area: "Question banks", records: 2 },
      { area: "Purpose-specific bank questions", records: 42 },
      { area: "Standalone quizzes", records: 7 },
      { area: "Reusable package versions", records: 7 },
      { area: "Tryout sections", records: 7 },
      { area: "Canonical Tryout binding", records: hasLegacyBindings ? "historical package-bound" : "fresh direct" },
      { area: "Participant states", records: 6 },
      { area: "Released attempts", records: 3 },
      { area: "Audit events", records: 6 },
    ]);
    console.log("Demonstration seed verification passed.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Demonstration seed verification failed.");
  console.error(error);
  process.exitCode = 1;
});
