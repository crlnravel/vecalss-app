import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

// Run the real repository/lease/catalogue in an isolated local schema. The
// runtime data and the bank from the user's report are never mutated.
const databaseUrl = "postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev";
const schema = `bank_delete_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: databaseUrl });
let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  // LIKE copies shape/indexes but no foreign keys. Re-create the deletion
  // boundary below; all relations used by the repository remain queryable.
  await client.query(`DO $$ DECLARE r record; labels text; BEGIN
    FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' LOOP
      SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) INTO labels FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=r.typname;
      EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', '${schema}', r.typname, labels);
    END LOOP;
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY(ARRAY[
      'users', 'user_roles', 'roles', 'tutor_profiles', 'question_banks', 'question_bank_folders', 'question_bank_categories',
      'question_bank_category_assignments', 'questions', 'question_revisions', 'question_revision_options',
      'question_options', 'subtests', 'assets', 'edit_leases', 'standalone_quizzes', 'standalone_quiz_versions',
      'standalone_quiz_items', 'standalone_quiz_item_options', 'adaptive_practice_sessions', 'adaptive_practice_answers',
      'quiz_items', 'quiz_attempt_answers', 'daily_mission_questions', 'tryout_items', 'tryout_item_options',
      'reusable_question_packages', 'reusable_question_package_versions', 'reusable_question_package_version_bank_scopes'
    ]) LOOP
      EXECUTE format('CREATE TABLE %I.%I (LIKE public.%I INCLUDING ALL)', '${schema}', r.tablename, r.tablename);
    END LOOP;
    FOR r IN SELECT t.relname, c.conname FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='${schema}' AND c.contype='c' LOOP
      EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', '${schema}', r.relname, r.conname);
    END LOOP;
    FOR r IN SELECT indexname FROM pg_indexes WHERE schemaname='${schema}' AND indexdef LIKE '% WHERE %' LOOP
      EXECUTE format('DROP INDEX %I.%I', '${schema}', r.indexname);
    END LOOP;
    FOR r IN SELECT c.table_name, c.column_name, c.udt_name, c.column_default FROM information_schema.columns c JOIN pg_type t ON t.typname=c.udt_name JOIN pg_namespace n ON n.oid=t.typnamespace AND n.nspname='public' WHERE c.table_schema='public' AND t.typtype='e' AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='${schema}' AND tablename=c.table_name) LOOP
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT', '${schema}', r.table_name, r.column_name);
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING %I::text::%I.%I', '${schema}', r.table_name, r.column_name, '${schema}', r.udt_name, r.column_name, '${schema}', r.udt_name);
      IF r.column_default IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s', '${schema}', r.table_name, r.column_name, replace(r.column_default, '::' || r.udt_name, '::${schema}.' || r.udt_name));
      END IF;
    END LOOP;
    PERFORM set_config('search_path', '${schema},public', true);
    FOR r IN SELECT t.relname, c.conname, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND c.contype='c' AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='${schema}' AND tablename=t.relname) LOOP
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', '${schema}', r.relname, r.conname, replace(r.definition, 'public.', '${schema}.'));
    END LOOP;
  END $$`);
  await client.query(`ALTER TABLE "${schema}".questions ADD FOREIGN KEY (question_bank_id) REFERENCES "${schema}".question_banks(id) ON DELETE RESTRICT`);
  await client.query(`INSERT INTO "${schema}".users (id, email, full_name, password_hash) SELECT id, email, full_name, password_hash FROM public.users WHERE email='tutor@vecalss.local'`);
  await client.query(`INSERT INTO "${schema}".subtests SELECT * FROM public.subtests WHERE code='PU'`);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  ({ prisma } = await import("../lib/prisma"));
  const { deleteQuestionBank, getQuestionBankForEdit, listQuestionBankPage, listQuestionBankFolders, listQuestionBankCategories, removeQuestionBankFolder, removeQuestionBankCategory, updateQuestionBankLifecycle } = await import("../lib/question-bank/repository");
  const { acquireEditLease } = await import("../lib/resource-edit-lock/service");
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
  const folder = await prisma.questionBankFolder.create({ data: { name: "Delete fixture", purpose: "quiz", createdByUserId: tutor.id, updatedByUserId: tutor.id } });
  const category = await prisma.questionBankCategory.create({ data: { name: "Delete fixture", createdByUserId: tutor.id, updatedByUserId: tutor.id } });
  const bank = await prisma.questionBank.create({ data: {
    code: `delete-${randomUUID()}`, name: "Tutor", purpose: "quiz", folderId: folder.id,
    createdByUserId: tutor.id, updatedByUserId: tutor.id,
  } });
  await prisma.questionBankCategoryAssignment.create({ data: { questionBankId: bank.id, categoryId: category.id, assignedByUserId: tutor.id } });
  const questionId = randomUUID();
  const revisionId = randomUUID();
  const subtest = await prisma.subtest.findUniqueOrThrow({ where: { code: "PU" } });
  await prisma.question.create({ data: {
    id: questionId, code: `delete-question-${questionId}`, questionBankId: bank.id,
    subtestId: subtest.id,
    stem: "Preserved question", currentRevisionId: revisionId,
    createdByUserId: tutor.id, updatedByUserId: tutor.id,
  } });
  await prisma.questionRevision.create({ data: {
    id: revisionId, questionId, revisionNo: 1, stem: "Preserved question",
    contentDigest: "fixture", createdByUserId: tutor.id, updatedByUserId: tutor.id,
  } });
  const token = randomBytes(32).toString("base64url");
  const lease = await acquireEditLease({ resourceId: bank.id, resourceType: "question_bank", holderUserId: tutor.id, newToken: token });
  assert.equal(lease.state, "owned");
  const proof = { token, generation: lease.generation! };
  assert.equal((await listQuestionBankPage({ purpose: "quiz" })).total, 1);
  await assert.rejects(deleteQuestionBank(bank.id, tutor.id), "Deletion must require an edit lease");
  const archived = await updateQuestionBankLifecycle(bank.id, "archive", tutor.id, { expectedRevision: bank.revision, editLease: proof });
  assert.equal((await listQuestionBankPage({ purpose: "quiz", status: "archived" })).total, 1, "Ordinary archives remain available");
  const restored = await updateQuestionBankLifecycle(bank.id, "restore", tutor.id, { expectedRevision: archived.revision, editLease: proof });
  assert.equal(restored.status, "published");
  const usedQuestion = await prisma.quizItem.create({ data: { quizId: randomUUID(), questionId, sortOrder: 1 } });
  await assert.rejects(deleteQuestionBank(bank.id, tutor.id, proof), /sudah digunakan/, "Banks in use retain the existing deletion guard");
  assert.equal((await listQuestionBankPage({ purpose: "quiz" })).total, 1, "A rejected deletion must leave the bank visible");
  await prisma.quizItem.delete({ where: { id: usedQuestion.id } });
  await deleteQuestionBank(bank.id, tutor.id, proof);
  assert.equal((await listQuestionBankPage({ purpose: "quiz" })).total, 0, "A successfully deleted bank must disappear from the default catalogue");
  assert.equal((await listQuestionBankPage({ purpose: "quiz", status: "archived" })).total, 0, "Deletion must not become a restorable archive");
  assert.equal(await getQuestionBankForEdit(bank.id), null, "Deleted detail URLs must no longer resolve");
  await assert.rejects(updateQuestionBankLifecycle(bank.id, "restore", tutor.id, { expectedRevision: restored.revision + 1, editLease: proof }), "Deletion must not be reversible through the archive action");
  await assert.rejects(acquireEditLease({ resourceId: bank.id, resourceType: "question_bank", holderUserId: tutor.id, newToken: randomBytes(32).toString("base64url") }), "Deleted banks cannot grant a new edit lease");
  const preserved = await prisma.question.findUniqueOrThrow({ where: { id: questionId } });
  assert.equal(preserved.questionBankId, bank.id);
  assert.equal(preserved.status, "archived");
  assert.equal((await prisma.questionRevision.findUniqueOrThrow({ where: { id: revisionId } })).status, "retired");
  assert.equal((await listQuestionBankFolders("quiz"))[0].bankCount, 0);
  assert.equal((await listQuestionBankCategories("quiz"))[0].bankCount, 0);
  await removeQuestionBankCategory(category.id, tutor.id, { expectedUpdatedAt: category.updatedAt.toISOString() });
  await removeQuestionBankFolder(folder.id, tutor.id, "quiz", { expectedUpdatedAt: folder.updatedAt.toISOString() });
  assert.equal(await getQuestionBankForEdit(bank.id), null);
  console.log("Question-bank deletion removes catalogue/detail access and preserves retired question history.");
} finally {
  await prisma?.$disconnect();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
