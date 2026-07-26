import "dotenv/config";

import assert from "node:assert/strict";
import pg from "pg";

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
      `SELECT subtests.code, COUNT(*)::int AS count
         FROM questions
         JOIN question_banks ON question_banks.id = questions.question_bank_id
         JOIN subtests ON subtests.id = questions.subtest_id
        WHERE question_banks.code = 'seed:assessment:mixed-subject-bank:v1'
          AND questions.code LIKE 'seed:demo:question:%'
          AND questions.status = 'published'
        GROUP BY subtests.code
        ORDER BY subtests.code`,
    );
    assert.equal(bankQuestionCounts.rowCount, 7, "Every UTBK subtest must be represented in the question bank.");
    assert(bankQuestionCounts.rows.every((row) => row.count === 3), "Every UTBK subtest must contain three reviewed questions.");

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
      await scalar(client, "SELECT COUNT(*)::int AS value FROM reusable_question_packages WHERE code LIKE 'seed:demo:package:%' AND status = 'published'"),
      7,
      "The demonstration catalogue must contain seven ready reusable packages.",
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

    const prohibitedCopy = await scalar(
      client,
      `SELECT COUNT(*)::int AS value FROM (
         SELECT title AS value FROM tryout_packages WHERE code = 'seed:assessment:tryout:evaluasi-program:v1'
         UNION ALL SELECT description FROM tryout_packages WHERE code = 'seed:assessment:tryout:evaluasi-program:v1'
         UNION ALL SELECT name FROM question_banks WHERE code = 'seed:assessment:mixed-subject-bank:v1'
         UNION ALL SELECT description FROM question_banks WHERE code = 'seed:assessment:mixed-subject-bank:v1'
       ) copy WHERE value ILIKE '%baseline%' OR value ILIKE '%tryout baseline%'`,
    );
    assert.equal(prohibitedCopy, 0, "User-facing demonstration copy must not contain placeholder language.");

    console.table([
      { area: "Question bank", records: 21 },
      { area: "Standalone quizzes", records: 7 },
      { area: "Reusable package versions", records: 7 },
      { area: "Tryout sections", records: 7 },
      { area: "Participant states", records: 6 },
      { area: "Released attempts", records: 3 },
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
