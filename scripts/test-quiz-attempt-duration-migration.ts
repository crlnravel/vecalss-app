import assert from "node:assert/strict";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

const fixturePath = "/tmp/krf03-attempt-duration-migration-fixture.json";
const originalDate = new Date("2026-10-01T00:00:00.000Z");

type Fixture = {
  pinnedAttemptId: string;
  pinnedQuizId: string;
  pinnedParticipationId: string;
  pinnedVersionId: string;
  untimedAttemptId: string;
  untimedQuizId: string;
  untimedParticipationId: string;
  untimedVersionId: string;
  stableAttemptId: string;
  stableQuizId: string;
  stableParticipationId: string;
};

function assertLocalDatabase() {
  const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(databaseUrl.hostname),
    "The migration fixture may only use the local disposable database",
  );
}

async function insertQuizFixture({
  quizId,
  participationId,
  attemptId,
  studentId,
  tutorId,
  subtestId,
  slug,
  pinnedVersionId,
  versionDurationSeconds,
  stableDurationSeconds,
}: {
  quizId: string;
  participationId: string;
  attemptId: string;
  studentId: string;
  tutorId: string;
  subtestId: string;
  slug: string;
  pinnedVersionId: string | null;
  versionDurationSeconds: number | null;
  stableDurationSeconds: number;
}) {
  await prisma.$executeRaw`
    INSERT INTO standalone_quizzes (
      id, slug, title, subtest_id, created_by_user_id, duration_seconds,
      attempts_allowed, review_timing
    ) VALUES (
      ${quizId}::uuid, ${slug}, 'Attempt duration migration fixture',
      ${subtestId}::uuid, ${tutorId}::uuid, ${stableDurationSeconds},
      1, 'immediate'
    )`;
  if (pinnedVersionId) {
    await prisma.$executeRaw`
      INSERT INTO standalone_quiz_versions (
        id, quiz_id, state, version_no, title, duration_seconds,
        attempts_allowed, review_timing
      ) VALUES (
        ${pinnedVersionId}::uuid, ${quizId}::uuid, 'active', 1,
        'Pinned duration migration fixture', ${versionDurationSeconds},
        1, 'immediate'
      )`;
  }
  await prisma.$executeRaw`
    INSERT INTO standalone_quiz_participations (
      id, quiz_id, quiz_version_id, student_id, policy_snapshot
    ) VALUES (
      ${participationId}::uuid, ${quizId}::uuid,
      ${pinnedVersionId}::uuid, ${studentId}::uuid,
      '{"attemptsAllowed":1,"reviewTiming":"immediate"}'::jsonb
    )`;
  await prisma.$executeRaw`
    INSERT INTO standalone_quiz_attempts (
      id, participation_id, attempt_no, policy_snapshot,
      form_item_order, created_at
    ) VALUES (
      ${attemptId}::uuid, ${participationId}::uuid, 1,
      '{"attemptsAllowed":1,"reviewTiming":"immediate"}'::jsonb,
      '[]'::jsonb, ${originalDate}
    )`;
}

async function prepare() {
  assertLocalDatabase();
  const [column] = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'standalone_quiz_attempts'
        AND column_name = 'duration_seconds_snapshot'
    ) AS exists`;
  assert.equal(column.exists, false, "prepare must run before the new migration");

  const [tutor] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM users WHERE email = 'tutor@vecalss.local'`;
  const [student] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM users WHERE email = 'student@vecalss.local'`;
  const [subtest] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM subtests WHERE code = 'PU'`;
  assert.ok(tutor && student && subtest, "seeded local fixture identities must exist");

  const fixture: Fixture = {
    pinnedAttemptId: randomUUID(),
    pinnedQuizId: randomUUID(),
    pinnedParticipationId: randomUUID(),
    pinnedVersionId: randomUUID(),
    untimedAttemptId: randomUUID(),
    untimedQuizId: randomUUID(),
    untimedParticipationId: randomUUID(),
    untimedVersionId: randomUUID(),
    stableAttemptId: randomUUID(),
    stableQuizId: randomUUID(),
    stableParticipationId: randomUUID(),
  };
  await insertQuizFixture({
    quizId: fixture.pinnedQuizId,
    participationId: fixture.pinnedParticipationId,
    attemptId: fixture.pinnedAttemptId,
    studentId: student.id,
    tutorId: tutor.id,
    subtestId: subtest.id,
    slug: `krf03-migration-pinned-${randomUUID()}`,
    pinnedVersionId: fixture.pinnedVersionId,
    versionDurationSeconds: 5,
    stableDurationSeconds: 900,
  });
  await insertQuizFixture({
    quizId: fixture.stableQuizId,
    participationId: fixture.stableParticipationId,
    attemptId: fixture.stableAttemptId,
    studentId: student.id,
    tutorId: tutor.id,
    subtestId: subtest.id,
    slug: `krf03-migration-stable-${randomUUID()}`,
    pinnedVersionId: null,
    versionDurationSeconds: null,
    stableDurationSeconds: 900,
  });
  await insertQuizFixture({
    quizId: fixture.untimedQuizId,
    participationId: fixture.untimedParticipationId,
    attemptId: fixture.untimedAttemptId,
    studentId: student.id,
    tutorId: tutor.id,
    subtestId: subtest.id,
    slug: `krf03-migration-untimed-${randomUUID()}`,
    pinnedVersionId: fixture.untimedVersionId,
    versionDurationSeconds: null,
    stableDurationSeconds: 900,
  });
  writeFileSync(fixturePath, JSON.stringify(fixture));
  console.log("Prepared pinned and unversioned pre-migration attempts.");
}

async function removeFixture(fixture: Fixture) {
  await prisma.$executeRaw`
    DELETE FROM standalone_quiz_attempts
    WHERE id IN (${fixture.pinnedAttemptId}::uuid, ${fixture.stableAttemptId}::uuid, ${fixture.untimedAttemptId}::uuid)`;
  await prisma.$executeRaw`
    DELETE FROM standalone_quiz_participations
    WHERE id IN (${fixture.pinnedParticipationId}::uuid, ${fixture.stableParticipationId}::uuid, ${fixture.untimedParticipationId}::uuid)`;
  await prisma.$executeRaw`
    DELETE FROM standalone_quiz_versions WHERE id IN (${fixture.pinnedVersionId}::uuid, ${fixture.untimedVersionId}::uuid)`;
  await prisma.$executeRaw`
    DELETE FROM standalone_quizzes
    WHERE id IN (${fixture.pinnedQuizId}::uuid, ${fixture.stableQuizId}::uuid, ${fixture.untimedQuizId}::uuid)`;
}

async function cleanup() {
  if (!existsSync(fixturePath)) return;
  assertLocalDatabase();
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
  await removeFixture(fixture);
  unlinkSync(fixturePath);
}

async function verify() {
  assertLocalDatabase();
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture;
  try {
    const pinned = await prisma.$queryRaw<Array<{
      created_at: Date;
      deadline_at: Date | null;
      duration_seconds_snapshot: number | null;
      started_at: Date | null;
    }>>`
      SELECT created_at, deadline_at, duration_seconds_snapshot, started_at
      FROM standalone_quiz_attempts WHERE id = ${fixture.pinnedAttemptId}::uuid`;
    assert.equal(pinned[0]?.duration_seconds_snapshot, 5);
    assert.equal(pinned[0]?.started_at?.getTime(), originalDate.getTime());
    assert.equal(
      pinned[0]?.deadline_at?.getTime(),
      originalDate.getTime() + 5_000,
      "pinned historical attempts inherit their immutable version duration",
    );

    const pinnedUntimed = await prisma.$queryRaw<Array<{
      deadline_at: Date | null;
      duration_seconds_snapshot: number | null;
      started_at: Date | null;
    }>>`
      SELECT created_at, deadline_at, duration_seconds_snapshot, started_at
      FROM standalone_quiz_attempts WHERE id = ${fixture.untimedAttemptId}::uuid`;
    assert.equal(pinnedUntimed[0]?.duration_seconds_snapshot, null);
    assert.equal(pinnedUntimed[0]?.started_at?.getTime(), originalDate.getTime());
    assert.equal(pinnedUntimed[0]?.deadline_at, null);

    const stable = await prisma.$queryRaw<Array<{
      deadline_at: Date | null;
      duration_seconds_snapshot: number | null;
      started_at: Date | null;
    }>>`
      SELECT deadline_at, duration_seconds_snapshot, started_at
      FROM standalone_quiz_attempts WHERE id = ${fixture.stableAttemptId}::uuid`;
    assert.equal(stable[0]?.duration_seconds_snapshot, null);
    assert.equal(stable[0]?.started_at, null);
    assert.equal(stable[0]?.deadline_at, null);
    console.log("Quiz attempt-duration migration backfill contracts passed.");
  } finally {
    await cleanup();
  }
}

function verifyMigrationContract() {
  const sql = readFileSync(
    "prisma/migrations/20261010110000_snapshot_standalone_quiz_attempt_duration/migration.sql",
    "utf8",
  );
  assert.match(sql, /JOIN "standalone_quiz_versions" AS version/);
  assert.match(sql, /"started_at" = attempt\."created_at"/);
  assert.match(sql, /WHEN version\."duration_seconds" > 0 THEN version\."duration_seconds"/);
  assert.match(sql, /WHEN version\."duration_seconds" > 0\s+THEN attempt\."created_at" \+ version\."duration_seconds"/);
  assert.match(sql, /WHERE attempt\."participation_id" = participation\."id"/);
  assert.match(sql, /AND attempt\."started_at" IS NULL/);
  assert.doesNotMatch(sql, /UPDATE "standalone_quiz_attempts"[\s\S]*?SET[\s\S]*?FROM[\s\S]*?standalone_quizzes" AS quiz/);
  console.log("Quiz attempt-duration migration source contract passed.");
}

async function verifyMigrationBackfill() {
  assertLocalDatabase();
  const [tutor] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM users WHERE email = 'tutor@vecalss.local'`;
  const [student] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM users WHERE email = 'student@vecalss.local'`;
  const [subtest] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text FROM subtests WHERE code = 'PU'`;
  assert.ok(tutor && student && subtest, "seeded local fixture identities must exist");

  const fixture: Fixture = {
    pinnedAttemptId: randomUUID(),
    pinnedQuizId: randomUUID(),
    pinnedParticipationId: randomUUID(),
    pinnedVersionId: randomUUID(),
    untimedAttemptId: randomUUID(),
    untimedQuizId: randomUUID(),
    untimedParticipationId: randomUUID(),
    untimedVersionId: randomUUID(),
    stableAttemptId: randomUUID(),
    stableQuizId: randomUUID(),
    stableParticipationId: randomUUID(),
  };
  try {
    await insertQuizFixture({
      quizId: fixture.pinnedQuizId,
      participationId: fixture.pinnedParticipationId,
      attemptId: fixture.pinnedAttemptId,
      studentId: student.id,
      tutorId: tutor.id,
      subtestId: subtest.id,
      slug: `krf03-migration-backfill-timed-${randomUUID()}`,
      pinnedVersionId: fixture.pinnedVersionId,
      versionDurationSeconds: 5,
      stableDurationSeconds: 900,
    });
    await insertQuizFixture({
      quizId: fixture.untimedQuizId,
      participationId: fixture.untimedParticipationId,
      attemptId: fixture.untimedAttemptId,
      studentId: student.id,
      tutorId: tutor.id,
      subtestId: subtest.id,
      slug: `krf03-migration-backfill-untimed-${randomUUID()}`,
      pinnedVersionId: fixture.untimedVersionId,
      versionDurationSeconds: null,
      stableDurationSeconds: 900,
    });
    await insertQuizFixture({
      quizId: fixture.stableQuizId,
      participationId: fixture.stableParticipationId,
      attemptId: fixture.stableAttemptId,
      studentId: student.id,
      tutorId: tutor.id,
      subtestId: subtest.id,
      slug: `krf03-migration-backfill-stable-${randomUUID()}`,
      pinnedVersionId: null,
      versionDurationSeconds: null,
      stableDurationSeconds: 900,
    });

    const migration = readFileSync(
      "prisma/migrations/20261010110000_snapshot_standalone_quiz_attempt_duration/migration.sql",
      "utf8",
    );
    const updateStart = migration.indexOf('UPDATE "standalone_quiz_attempts"');
    const constraintStart = migration.indexOf(
      '\nALTER TABLE "standalone_quiz_attempts"\nADD CONSTRAINT',
      updateStart,
    );
    assert.ok(updateStart >= 0 && constraintStart > updateStart, "migration contains a bounded timing backfill statement");
    await prisma.$executeRawUnsafe(migration.slice(updateStart, constraintStart));

    const backfilled = await prisma.$queryRaw<Array<{
      id: string;
      deadline_at: Date | null;
      duration_seconds_snapshot: number | null;
      started_at: Date | null;
    }>>`
      SELECT id::text, deadline_at, duration_seconds_snapshot, started_at
      FROM standalone_quiz_attempts
      WHERE id IN (
        ${fixture.pinnedAttemptId}::uuid,
        ${fixture.untimedAttemptId}::uuid,
        ${fixture.stableAttemptId}::uuid
      )`;
    const byId = new Map(backfilled.map((row) => [row.id, row]));
    const timed = byId.get(fixture.pinnedAttemptId);
    const untimed = byId.get(fixture.untimedAttemptId);
    const stable = byId.get(fixture.stableAttemptId);
    assert.equal(timed?.duration_seconds_snapshot, 5);
    assert.equal(timed?.started_at?.getTime(), originalDate.getTime());
    assert.equal(timed?.deadline_at?.getTime(), originalDate.getTime() + 5_000);
    assert.equal(untimed?.duration_seconds_snapshot, null);
    assert.equal(untimed?.started_at?.getTime(), originalDate.getTime());
    assert.equal(untimed?.deadline_at, null);
    assert.equal(stable?.duration_seconds_snapshot, null);
    assert.equal(stable?.started_at, null);
    assert.equal(stable?.deadline_at, null);
    console.log("Quiz attempt-duration pinned, untimed, and unversioned backfill contracts passed.");
  } finally {
    await removeFixture(fixture);
  }
}

async function run() {
  switch (process.argv[2]) {
    case "prepare":
      await prepare();
      break;
    case "verify":
      await verify();
      break;
    case "cleanup":
      await cleanup();
      break;
    case "contract":
      verifyMigrationContract();
      break;
    case "backfill":
      await verifyMigrationBackfill();
      break;
    default:
      throw new Error("Pass prepare, verify, or cleanup.");
  }
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
