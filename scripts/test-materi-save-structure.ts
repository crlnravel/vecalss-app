import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { MATERI_CATALOGUE } from "../prisma/materi-seed.mjs";

// Exercise real repository writes in an isolated schema; never change the
// configured runtime database or require demo lessons to exist.
const databaseUrl = "postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev";
const schema = `materi_save_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: databaseUrl });
let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  // Prisma qualifies enum casts with its configured schema. Clone the types
  // and convert LIKE's public enum columns to the same isolated types.
  for (const type of ["content_status", "module_asset_type", "module_asset_source_kind", "media_library_scope", "media_asset_state", "edit_lease_resource_type", "progress_status", "attempt_status", "recommendation_status", "ai_target_lifecycle_state", "ai_deletion_state", "intervention_status"]) {
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    const labels = await client.query<{ label: string }>(
      "SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=$1 ORDER BY e.enumsortorder", [type],
    );
    const values = labels.rows.map(({ label }) => `'${label.replaceAll("'", "''")}'`).join(", ");
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    await client.query(`CREATE TYPE "${schema}"."${type}" AS ENUM (${values})`);
  }
  const tables = ["users", "subtests", "topics", "modules", "module_assets", "assets", "edit_leases", "module_prerequisites", "module_progress", "module_quizzes", "quiz_items", "quiz_attempts", "quiz_attempt_answers", "learning_recommendations", "weakness_analysis_topics", "interventions"];
  for (const table of tables) {
    // Fixed table names and a generated identifier only; LIKE does not copy FKs.
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    await client.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  // Preserve real FK behavior between fixture tables. Unrelated user/question
  // aggregates are represented by dummy IDs, never touched in public.
  const foreignKeys = await client.query<{ name: string; table: string; target: string; definition: string }>(`
    SELECT c.conname AS name, s.relname AS table, t.relname AS target, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace n ON n.oid=s.relnamespace
    JOIN pg_class t ON t.oid=c.confrelid WHERE n.nspname='public' AND c.contype='f' AND s.relname=ANY($1) AND t.relname=ANY($1)
  `, [tables]);
  for (const fk of foreignKeys.rows) {
    const definition = fk.definition.replace(new RegExp(`REFERENCES (?:public\\.)?"?${fk.target}"?\\(`), `REFERENCES "${schema}"."${fk.target}"(`);
    // react-doctor-disable-next-line async-await-in-loop -- restore fixture constraints in a deterministic DDL sequence.
    await client.query(`ALTER TABLE "${schema}"."${fk.table}" ADD CONSTRAINT "${fk.name}" ${definition}`);
  }
  for (const [table, column, type, defaultValue] of [
    ["modules", "status", "content_status", "draft"],
    ["module_assets", "asset_type", "module_asset_type", null],
    ["module_assets", "source_kind", "module_asset_source_kind", null],
    ["assets", "library_scope", "media_library_scope", "admin"],
    ["assets", "state", "media_asset_state", "ready"],
    ["edit_leases", "resource_type", "edit_lease_resource_type", null],
    ["module_progress", "status", "progress_status", "locked"],
    ["module_quizzes", "status", "content_status", "draft"],
    ["quiz_attempts", "status", "attempt_status", "in_progress"],
    ["learning_recommendations", "status", "recommendation_status", "active"],
    ["learning_recommendations", "lifecycle_state", "ai_target_lifecycle_state", "active"],
    ["learning_recommendations", "deletion_state", "ai_deletion_state", "active"],
    ["interventions", "status", "intervention_status", "drafted"],
  ] as const) {
    // react-doctor-disable-next-line async-await-in-loop -- defaults must be dropped before enum conversion.
    await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" DROP DEFAULT`);
    // react-doctor-disable-next-line async-await-in-loop -- convert the isolated fixture column after dropping its public default.
    await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" TYPE "${schema}"."${type}" USING "${column}"::text::"${schema}"."${type}"`);
    if (defaultValue) {
      // react-doctor-disable-next-line async-await-in-loop -- restore the fixture's original default after conversion.
      await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'::"${schema}"."${type}"`);
    }
  }
  await client.query(`INSERT INTO "${schema}".subtests (code, name) VALUES ('PU', 'Penalaran Umum'), ('PPU', 'Pengetahuan dan Pemahaman Umum')`);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  ({ prisma } = await import("../lib/prisma"));
  const { saveMateriLesson, getMentorMateriCatalogue, getPublishedLesson, getMentorMateriByCode, deleteMateriLesson, MateriValidationError } = await import("../lib/materi/repository");
  const tutorId = randomUUID();
  const studentId = randomUUID();
  await client.query(`INSERT INTO "${schema}".users (id, email, full_name, password_hash) VALUES ($1, 'materi-tutor@example.test', 'Tutor fixture', 'unused'), ($2, 'materi-student@example.test', 'Student fixture', 'unused')`, [tutorId, studentId]);
  const input = {
    subjectSlug: "penalaran-umum",
    title: "PU",
    document: { hostedUrl: "https://cdn.example.test/materi/reading.pdf" },
  };

  // This is the reported failure: a valid form in an unseeded Materi subject.
  const lesson = await saveMateriLesson(input, tutorId);
  assert.ok(lesson, "A valid Materi must save without demo topic seeds");
  assert.equal(lesson.readiness, "ready");
  assert.equal(lesson.sequenceNo, 1);
  assert.equal(lesson.lifecycleStatus, "published");
  assert.ok(lesson.publishedAt, "Creation records the publication time");
  assert.ok(await getPublishedLesson(input.subjectSlug, lesson.code), "A newly created Materi is immediately available to students");
  assert.equal(await prisma.topic.count(), 3);
  const puTopics = await prisma.topic.findMany({ orderBy: { sortOrder: "asc" } });
  assert.deepEqual(puTopics.map((topic) => ({ name: topic.name, sortOrder: topic.sortOrder })),
    MATERI_CATALOGUE.find((subject) => subject.code === "PU")!.sections.map((section, index) => ({ name: section.name, sortOrder: index + 1 })),
    "Initialized topic metadata must agree with the normal seed contract");
  const second = await saveMateriLesson({ ...input, title: "PU kedua" }, tutorId);
  assert.equal(second?.sequenceNo, 2);
  assert.equal(await prisma.topic.count(), 3, "Repeated saving must not duplicate topics");
  const catalogue = await getMentorMateriCatalogue();
  assert.equal(catalogue.find((subject) => subject.code === "PU")?.lessons.length, 2);

  // A partly initialized subject retains its existing topic identity and name.
  const ppu = await prisma.subtest.findUniqueOrThrow({ where: { code: "PPU" } });
  const existing = await prisma.topic.create({ data: { subtestId: ppu.id, code: "materi:pengetahuan-pemahaman-umum:section-2", name: "Konsep Inti", sortOrder: 2 } });
  await saveMateriLesson({ ...input, subjectSlug: "pengetahuan-pemahaman-umum" }, tutorId);
  assert.equal(await prisma.topic.count({ where: { subtestId: ppu.id } }), 3);
  assert.equal((await prisma.topic.findUniqueOrThrow({ where: { id: existing.id } })).name, "Konsep Inti");

  // Invalid forms must fail before creating internal scaffolding.
  await prisma.moduleAsset.deleteMany();
  await prisma.module.deleteMany();
  await prisma.topic.deleteMany();
  await assert.rejects(saveMateriLesson({ ...input, title: "" }, tutorId), MateriValidationError);
  assert.equal(await prisma.topic.count(), 0);

  // Replay the user's managed PDF payload against the same empty structure.
  const managedPdf = await prisma.asset.create({ data: {
    id: "d8d75e3e-b332-4c95-9458-782dd2b44cc2",
    libraryScope: "kapten",
    mimeType: "application/pdf",
    objectKey: "materi-save-test/art-1.pdf",
    originalName: "Art 1 Meta Jan2022.pdf",
    sizeBytes: 1024,
    state: "ready",
  } });
  const managedInput = { ...input, document: {
    managedAssetId: managedPdf.id,
    mimeType: managedPdf.mimeType,
    originalName: managedPdf.originalName!,
  } };
  const managedLesson = await saveMateriLesson(managedInput, tutorId);
  assert.equal(managedLesson?.document?.managedAssetId, managedPdf.id);
  assert.equal(managedLesson?.readiness, "ready");
  assert.equal(await prisma.topic.count(), 3);
  const concurrent = await Promise.all([
    saveMateriLesson({ ...managedInput, title: "PU paralel A" }, tutorId),
    saveMateriLesson({ ...managedInput, title: "PU paralel B" }, tutorId),
  ]);
  assert.deepEqual(concurrent.map((saved) => saved?.sequenceNo).sort(), [2, 3]);
  assert.equal(await prisma.topic.count(), 3, "Concurrent saves share the subject initialization lock");
  const { acquireEditLease, EditLeaseServiceError } = await import("../lib/resource-edit-lock/service");
  await assert.rejects(deleteMateriLesson(managedLesson!.code, randomUUID()), EditLeaseServiceError, "Another tutor cannot delete this lesson");
  const lessonModule = await prisma.module.findUniqueOrThrow({ where: { code: managedLesson!.code } });
  const nextModule = await prisma.module.findUniqueOrThrow({ where: { code: concurrent[0]!.code } });
  const otherModule = await prisma.module.findUniqueOrThrow({ where: { code: concurrent[1]!.code } });
  await prisma.moduleProgress.create({ data: { moduleId: lessonModule.id, studentId } });
  await prisma.modulePrerequisite.create({ data: { moduleId: nextModule.id, prerequisiteModuleId: lessonModule.id } });
  await prisma.modulePrerequisite.create({ data: { moduleId: lessonModule.id, prerequisiteModuleId: otherModule.id } });
  await prisma.modulePrerequisite.create({ data: { moduleId: nextModule.id, prerequisiteModuleId: otherModule.id } });
  const quiz = await prisma.moduleQuiz.create({ data: { moduleId: lessonModule.id, title: "Latihan" } });
  const attempt = await prisma.quizAttempt.create({ data: { quizId: quiz.id, studentId } });
  await prisma.quizAttemptAnswer.create({ data: { attemptId: attempt.id, questionId: randomUUID() } });
  await prisma.quizItem.create({ data: { quizId: quiz.id, questionId: randomUUID(), sortOrder: 1 } });
  const recommendation = await prisma.learningRecommendation.create({ data: { moduleId: lessonModule.id, topicId: lessonModule.topicId, studentId, source: "test" } });
  const weaknessTopic = await prisma.weaknessAnalysisTopic.create({ data: { moduleId: lessonModule.id, topicId: lessonModule.topicId, weaknessAnalysisId: randomUUID(), rank: 1 } });
  const intervention = await prisma.intervention.create({ data: { recommendedModuleId: lessonModule.id, studentId, tutorId, message: "Baca materi ini" } });
  const token = randomBytes(32).toString("base64url");
  const lease = await acquireEditLease({ holderUserId: tutorId, newToken: token, resourceId: managedLesson!.code, resourceType: "materi" });
  assert.equal(lease.state, "owned");
  await assert.rejects(deleteMateriLesson(managedLesson!.code, tutorId), EditLeaseServiceError, "Catalogue deletion cannot bypass an active editor");
  assert.ok(await getPublishedLesson(input.subjectSlug, managedLesson!.code), "A blocked deletion leaves the lesson available");
  await deleteMateriLesson(managedLesson!.code, tutorId, { token, generation: lease.generation! });
  assert.equal(await getMentorMateriByCode(managedLesson!.code), undefined);
  assert.equal(await getPublishedLesson(input.subjectSlug, managedLesson!.code), undefined);
  assert.ok(await prisma.asset.findUnique({ where: { id: managedPdf.id } }), "Deleting a lesson retains its PDF in the media library");
  const retainedRecommendation = await prisma.learningRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
  assert.equal(retainedRecommendation.moduleId, null);
  assert.equal(retainedRecommendation.topicId, lessonModule.topicId, "Recommendations retain their topic context");
  const retainedWeaknessTopic = await prisma.weaknessAnalysisTopic.findUniqueOrThrow({ where: { id: weaknessTopic.id } });
  assert.equal(retainedWeaknessTopic.moduleId, null);
  assert.equal(retainedWeaknessTopic.topicId, lessonModule.topicId);
  assert.equal(retainedWeaknessTopic.weaknessAnalysisId, weaknessTopic.weaknessAnalysisId, "Analysis history survives lesson deletion");
  const retainedIntervention = await prisma.intervention.findUniqueOrThrow({ where: { id: intervention.id } });
  assert.equal(retainedIntervention.recommendedModuleId, null);
  assert.equal(retainedIntervention.message, "Baca materi ini", "Intervention history survives lesson deletion");
  assert.equal(await prisma.modulePrerequisite.count({ where: { OR: [{ moduleId: lessonModule.id }, { prerequisiteModuleId: lessonModule.id }] } }), 0, "Remove prerequisite links in both directions");
  assert.ok(await prisma.modulePrerequisite.findUnique({ where: { moduleId_prerequisiteModuleId: { moduleId: nextModule.id, prerequisiteModuleId: otherModule.id } } }), "Keep prerequisite links between remaining lessons");
  const remaining = (await getMentorMateriCatalogue()).find((subject) => subject.code === "PU")!.lessons;
  assert.deepEqual(remaining.map((item) => item.sequenceNo), [1, 2]);
  assert.deepEqual(remaining.map((item) => item.code), concurrent.sort((a, b) => a!.sequenceNo - b!.sequenceNo).map((item) => item!.code));
  await deleteMateriLesson(remaining[0].code, tutorId);
  assert.equal(await getMentorMateriByCode(remaining[0].code), undefined, "Catalogue deletion succeeds without an active editor");
  assert.equal((await getMentorMateriByCode(remaining[1].code))?.sequenceNo, 1);
  console.log("Materi auto-publication, safe deletion, ownership/edit locks, missing/partial topics, managed PDF, ordering, and validation passed.");
} finally {
  await prisma?.$disconnect();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
