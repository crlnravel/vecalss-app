import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";

import type { QuizQuestionSnapshot } from "../modules/mentor/quiz-builder-types";

/**
 * Stale-save probe for four authoring paths. Two tabs of the SAME tutor share one
 * valid edit lease; tab B saves first, then tab A saves its stale copy.
 *
 * Asserted (guarded paths): materi content-revision CAS (old and omitted, and no
 * false conflict after a sibling save), question bank revision CAS (old and
 * omitted), package expectedRevision CAS (old and omitted), quiz
 * expectedDraftRevision CAS (old, omitted and null-after-draft) under
 * KUIS_VERSIONING_CUTOVER=enabled.
 * Reported only: quiz under "disabled", the operator rollback switch, where no
 * draft revision exists to compare.
 *
 * Runs only against the local disposable vecalss_dev database.
 */

function assertLocalDevDatabase(raw: string | undefined) {
  if (!raw) throw new Error("DATABASE_URL is required and must point at the local vecalss_dev database.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL; refusing to run.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1"].includes(url.hostname)
    || url.port !== "55432"
    || url.pathname !== "/vecalss_dev"
  ) {
    throw new Error("Stale-save guard test requires DATABASE_URL on localhost/127.0.0.1:55432/vecalss_dev. Refusing to run.");
  }
}

// Checked before any lib/ import so lib/prisma never opens another database.
assertLocalDevDatabase(process.env.DATABASE_URL);

const { prisma } = await import("../lib/prisma");
const materiRepository = await import("../lib/materi/repository");
const quizRepository = await import("../lib/quiz/repository");
const questionBankRepository = await import("../lib/question-bank/repository");
const tryoutRepository = await import("../lib/tryout/repository");
const leaseService = await import("../lib/resource-edit-lock/service");

// Re-check after imports in case a module rewrote the environment.
assertLocalDevDatabase(process.env.DATABASE_URL);

type Attempt = { status: "accepted" } | { status: "rejected"; error: unknown };
type Row = { path: string; staleOldRevision: string; staleOmittedRevision: string; finalStored: string };
type QuizSource = Awaited<ReturnType<typeof findQuizSource>>;
type Lease = Awaited<ReturnType<typeof leaseService.acquireEditLease>>;

const rows: Row[] = [];
const pathFailures: string[] = [];
const cleanupErrors: unknown[] = [];
const token = () => randomBytes(32).toString("base64url");

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

async function attempt(action: () => Promise<unknown>): Promise<Attempt> {
  try {
    await action();
    return { status: "accepted" };
  } catch (error) {
    return { status: "rejected", error };
  }
}

function describe(result: Attempt) {
  if (result.status === "accepted") return "accepted";
  const code = errorCode(result.error);
  const message = result.error instanceof Error ? result.error.message : String(result.error);
  return `rejected${code ? ` [${code}]` : ""}: ${message.slice(0, 80)}`;
}

function storedAs(stored: string | null | undefined, tabB: string, tabA: string) {
  if (stored === tabB) return `tab B ("${stored}")`;
  if (stored === tabA) return `tab A ("${stored}") = overwrite`;
  return `other ("${stored ?? "missing"}")`;
}

async function runPath(label: string, action: () => Promise<void>) {
  try {
    await action();
    console.log(`[ok] ${label}`);
  } catch (error) {
    pathFailures.push(label);
    const message = error instanceof Error ? error.message : String(error);
    rows.push({ path: label, staleOldRevision: `ERROR: ${message.slice(0, 120)}`, staleOmittedRevision: "not reached", finalStored: "unknown" });
    console.log(`[FAIL] ${label}: ${message}`);
  }
}

async function findQuizSource() {
  return prisma.question.findFirstOrThrow({
    where: { questionBank: { purpose: "quiz" }, subtestId: { not: null } },
    include: { currentRevision: { include: { options: true } }, subtest: true },
  });
}

// ---------- Materi: the content revision the editor loaded must match what is stored. ----------
async function runMateri(tutorId: string) {
  const subjectSlug = "penalaran-umum";
  const TAB_B = "Materi tab B";
  const TAB_A = "Materi tab A";
  const document = { hostedUrl: "https://cdn.example.test/materi/stale-save-guard.pdf" };
  const topicsBefore = new Set((await prisma.topic.findMany({ where: { subtest: { code: "PU" } }, select: { id: true } })).map((topic) => topic.id));
  const leaseToken = token();
  let code: string | undefined;
  let lease: Lease | undefined;
  let siblingCode: string | undefined;
  const siblingToken = token();
  let siblingLease: Lease | undefined;
  try {
    const created = await materiRepository.saveMateriLesson({ subjectSlug, title: "Materi stale awal", document }, tutorId);
    code = created?.code;
    assert.ok(code, "Materi fixture must be created");
    const loadedRevision = created.contentRevision;
    assert.equal(typeof loadedRevision, "string", "Materi DTO must expose contentRevision");
    lease = await leaseService.acquireEditLease({ resourceType: "materi", resourceId: code, holderUserId: tutorId, newToken: leaseToken });
    assert.equal(lease.state, "owned");
    const editLease = { generation: lease.generation!, token: leaseToken };
    // Tab B saves first with the revision it loaded; this is the precondition for the stale attempt.
    const savedByB = await materiRepository.saveMateriLesson({ code, subjectSlug, title: TAB_B, document, editLease, expectedContentRevision: loadedRevision }, tutorId);
    assert.notEqual(savedByB.contentRevision, loadedRevision, "A content change must change the revision");
    // Tab A still holds the revision it loaded before tab B saved, under the same valid lease.
    const tabA = await attempt(() => materiRepository.saveMateriLesson({ code, subjectSlug, title: TAB_A, document, editLease, expectedContentRevision: loadedRevision }, tutorId));
    const tabAOmitted = await attempt(() => materiRepository.saveMateriLesson({ code, subjectSlug, title: TAB_A, document, editLease }, tutorId));
    const stored = (await materiRepository.getMentorMateriByCode(code))?.title;
    rows.push({
      path: "Materi (saveMateriLesson)",
      staleOldRevision: describe(tabA),
      staleOmittedRevision: describe(tabAOmitted),
      finalStored: storedAs(stored, TAB_B, TAB_A),
    });
    console.log(`[report] Materi tab A stale save: ${describe(tabA)}; omitted: ${describe(tabAOmitted)}; stored title: ${stored}`);
    assert.equal(tabA.status, "rejected", "Stale materi content revision must be rejected");
    assert.ok(tabA.status === "rejected" && errorCode(tabA.error) === "stale_content", "A stale materi save must carry the stale_content code for the editor");
    assert.equal(tabAOmitted.status, "rejected", "Omitting the revision on an existing materi must be rejected");
    assert.equal(stored, TAB_B, "Tab B's materi content must survive the stale save");

    // A sibling save rewrites every module row in the subject (sequence reorder). That must
    // not look like a conflict for this materi, because its own content did not change.
    const sibling = await materiRepository.saveMateriLesson({ subjectSlug, title: "Materi stale sibling", document: { hostedUrl: "https://cdn.example.test/materi/stale-save-guard-sibling.pdf" } }, tutorId);
    siblingCode = sibling.code;
    siblingLease = await leaseService.acquireEditLease({ resourceType: "materi", resourceId: siblingCode, holderUserId: tutorId, newToken: siblingToken });
    await materiRepository.saveMateriLesson({ code: siblingCode, subjectSlug, title: "Materi stale sibling 2", document: { hostedUrl: "https://cdn.example.test/materi/stale-save-guard-sibling.pdf" }, editLease: { generation: siblingLease.generation!, token: siblingToken }, expectedContentRevision: sibling.contentRevision }, tutorId);
    const afterSibling = await materiRepository.saveMateriLesson({ code, subjectSlug, title: "Materi tab B lagi", document, editLease, expectedContentRevision: savedByB.contentRevision }, tutorId);
    assert.equal(afterSibling.title, "Materi tab B lagi", "A sibling save must not cause a false stale conflict");
  } finally {
    try {
      if (siblingCode && siblingLease?.state === "owned") {
        await materiRepository.deleteMateriLesson(siblingCode, tutorId, { token: siblingToken, generation: siblingLease.generation! });
      }
      if (siblingCode) await leaseService.deleteEditLeaseForResource("materi", siblingCode);
      if (code && lease?.state === "owned") {
        await materiRepository.deleteMateriLesson(code, tutorId, { token: leaseToken, generation: lease.generation! });
      }
      if (code) await leaseService.deleteEditLeaseForResource("materi", code);
      const createdTopicIds = (await prisma.topic.findMany({ where: { subtest: { code: "PU" } }, select: { id: true } }))
        .map((topic) => topic.id)
        .filter((id) => !topicsBefore.has(id));
      if (createdTopicIds.length) await prisma.topic.deleteMany({ where: { id: { in: createdTopicIds } } });
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

// ---------- Quiz: expectedDraftRevision is only checked in the versioned path. ----------
async function runQuiz(tutorId: string, source: QuizSource, cutover: "disabled" | "enabled") {
  const TAB_B = "Kuis tab B";
  const TAB_A = "Kuis tab A";
  const label = `Kuis (saveStandaloneQuiz, KUIS_VERSIONING_CUTOVER=${cutover})`;
  const snapshot: QuizQuestionSnapshot = {
    id: randomUUID(), origin: "bank", prompt: "Pertanyaan salinan awal", explanation: "Penjelasan awal",
    choices: [{ id: "A", text: "Pilihan pertama" }, { id: "B", text: "Pilihan kedua" }],
    correctChoiceId: "A", correctChoiceIds: ["A"], questionType: "single_choice", difficulty: "medium",
    sourceQuestionId: source.id, sourceQuestionRevisionId: source.currentRevisionId,
    sourceContentDigest: source.currentRevision.contentDigest, sourceRevisionProvenance: source.currentRevision.provenance,
    sourceUpdate: {
      prompt: "Perubahan sumber yang belum diterapkan", explanation: "", choices: [],
      correctChoiceId: "A", correctChoiceIds: ["A"], sourceContentDigest: "next-digest",
      sourceQuestionRevisionId: randomUUID(), revisionNo: 2,
    },
  };
  const quiz = await prisma.standaloneQuiz.create({ data: {
    slug: `stale-save-${randomUUID()}`, title: "Kuis stale", createdByUserId: tutorId,
    subtestId: source.subtestId!, sourceBankId: source.questionBankId,
  } });
  const leaseToken = token();
  const priorCutover = process.env.KUIS_VERSIONING_CUTOVER;
  let lease: Lease | undefined;
  process.env.KUIS_VERSIONING_CUTOVER = cutover;
  try {
    const activeVersion = cutover === "enabled"
      ? await prisma.standaloneQuizVersion.create({ data: {
        quizId: quiz.id, title: quiz.title, sourceBankId: source.questionBankId, state: "active", versionNo: 1,
      } })
      : null;
    await prisma.standaloneQuizItem.create({ data: {
      quizId: quiz.id, quizVersionId: activeVersion?.id, subtestId: source.subtestId!, sortOrder: 1,
      prompt: snapshot.prompt, explanation: snapshot.explanation,
      sourceQuestionId: source.id, sourceQuestionRevisionId: source.currentRevisionId,
      sourceContentDigest: snapshot.sourceContentDigest, sourceRevisionProvenance: source.currentRevision.provenance,
      options: { create: [
        { choiceKey: "A", content: "Pilihan pertama", isCorrect: true, sortOrder: 0 },
        { choiceKey: "B", content: "Pilihan kedua", isCorrect: false, sortOrder: 1 },
      ] },
    } });
    lease = await leaseService.acquireEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutorId, newToken: leaseToken });
    assert.equal(lease.state, "owned");
    const editLease = { generation: lease.generation!, token: leaseToken };
    const base = {
      id: quiz.id, description: "", opensAt: "", closesAt: "",
      subjectCode: source.subtest!.code, questionOwnership: "quiz" as const,
      editLease,
      questions: [{ ...snapshot, prompt: "Pertanyaan berubah hanya di Kuis", explanation: "Penjelasan yang diedit" }],
    };
    // The first save creates the draft; tab A then loads and remembers its draft revision.
    // null = the editor loaded no pending draft; an existing Kuis may not omit the field.
    await quizRepository.saveStandaloneQuiz({ ...base, title: "Kuis awal", expectedDraftRevision: cutover === "enabled" ? null : undefined }, tutorId);
    const loaded = await quizRepository.getMentorStandaloneQuiz(quiz.id, tutorId);
    const oldDraftRevision = (loaded?.quiz as { draftRevision?: number | null } | undefined)?.draftRevision ?? null;
    // Tab B saves with the current revision (precondition).
    await quizRepository.saveStandaloneQuiz({ ...base, title: TAB_B, expectedDraftRevision: oldDraftRevision }, tutorId);
    // Tab A saves its stale copy with the old revision.
    const tabA = await attempt(() => quizRepository.saveStandaloneQuiz({ ...base, title: TAB_A, expectedDraftRevision: oldDraftRevision }, tutorId));
    // Tab A with the field omitted, and tab A that loaded before any draft existed (null).
    const tabAOmitted = await attempt(() => quizRepository.saveStandaloneQuiz({ ...base, title: TAB_A }, tutorId));
    const tabANoDraft = await attempt(() => quizRepository.saveStandaloneQuiz({ ...base, title: TAB_A, expectedDraftRevision: null }, tutorId));
    const stored = (await quizRepository.getMentorStandaloneQuiz(quiz.id, tutorId))?.quiz.title;
    rows.push({
      path: label,
      staleOldRevision: `${describe(tabA)} (expectedDraftRevision=${oldDraftRevision ?? "null"})`,
      staleOmittedRevision: `omitted: ${describe(tabAOmitted)}; null after a draft exists: ${describe(tabANoDraft)}`,
      finalStored: storedAs(stored, TAB_B, TAB_A),
    });
    console.log(`[report] ${label}: old draftRevision=${oldDraftRevision}; tab A ${describe(tabA)}; omitted ${describe(tabAOmitted)}; null ${describe(tabANoDraft)}; stored title: ${stored}`);
    if (cutover === "enabled") {
      assert.ok(tabA.status === "rejected" && errorCode(tabA.error) === "stale_content", "A stale Kuis save must carry the stale_content code for the editor");
      assert.equal(tabAOmitted.status, "rejected", "An existing Kuis must reject an omitted expectedDraftRevision");
      assert.equal(tabANoDraft.status, "rejected", "A null revision must not overwrite a draft another tab already saved");
      assert.equal(typeof oldDraftRevision, "number", "Versioned Kuis must expose a draftRevision");
      assert.equal(tabA.status, "rejected", "Versioned Kuis must reject a stale draft revision");
      assert.equal(stored, TAB_B, "Rejected stale Kuis save must keep tab B's title");
    }
  } finally {
    process.env.KUIS_VERSIONING_CUTOVER = priorCutover;
    try {
      if (lease?.state === "owned") await leaseService.releaseEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutorId, generation: lease.generation!, token: leaseToken });
      await prisma.standaloneQuizItemOption.deleteMany({ where: { quizItem: { quizId: quiz.id } } });
      await prisma.standaloneQuizItem.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuizVersion.deleteMany({ where: { quizId: quiz.id } });
      await prisma.standaloneQuiz.delete({ where: { id: quiz.id } });
      await leaseService.deleteEditLeaseForResource("quiz", quiz.id);
      console.log(`[cleanup] quiz ${quiz.id}: edit_leases rows left: ${await prisma.editLease.count({ where: { resourceType: "quiz", resourceId: quiz.id } })}`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

// ---------- Question bank: revision is required; undefined is rejected. ----------
async function runQuestionBank(tutorId: string) {
  const TAB_B = "Bank tab B";
  const TAB_A = "Bank tab A";
  const leaseToken = token();
  let bankId: string | undefined;
  let lease: Lease | undefined;
  try {
    const created = await questionBankRepository.saveQuestionBank({ description: "", purpose: "quiz", questions: [], title: "Bank stale awal" }, tutorId);
    bankId = created.bank.id;
    const rev0 = created.bank.revision;
    assert.equal(typeof rev0, "number", "Bank DTO must expose revision");
    lease = await leaseService.acquireEditLease({ resourceType: "question_bank", resourceId: bankId, holderUserId: tutorId, newToken: leaseToken });
    assert.equal(lease.state, "owned");
    const editLease = { generation: lease.generation!, token: leaseToken };
    const base = { id: bankId, description: "", editLease, purpose: "quiz" as const, questions: [] };
    // Tab B saves with the current revision (precondition).
    await questionBankRepository.saveQuestionBank({ ...base, title: TAB_B, revision: rev0 }, tutorId);
    // Tab A: old revision, then revision omitted.
    const tabA = await attempt(() => questionBankRepository.saveQuestionBank({ ...base, title: TAB_A, revision: rev0 }, tutorId));
    const tabAOmitted = await attempt(() => questionBankRepository.saveQuestionBank({ ...base, title: TAB_A, revision: undefined }, tutorId));
    const stored = (await prisma.questionBank.findUnique({ where: { id: bankId }, select: { name: true } }))?.name;
    rows.push({
      path: "Bank Soal (saveQuestionBank)",
      staleOldRevision: describe(tabA),
      staleOmittedRevision: describe(tabAOmitted),
      finalStored: storedAs(stored, TAB_B, TAB_A),
    });
    console.log(`[report] Bank tab A old revision: ${describe(tabA)}; omitted: ${describe(tabAOmitted)}; stored: ${stored}`);
    assert.equal(tabA.status, "rejected", "Stale bank revision must be rejected");
    assert.equal(tabA.status === "rejected" ? errorCode(tabA.error) : undefined, "stale_revision");
    assert.equal(tabAOmitted.status, "rejected", "Omitted bank revision must be rejected");
    assert.equal(tabAOmitted.status === "rejected" ? errorCode(tabAOmitted.error) : undefined, "stale_revision");
    assert.equal(stored, TAB_B, "Rejected stale bank save must keep tab B's title");
  } finally {
    try {
      // The DB rejects physical deletes of question banks; the app's delete is a soft delete.
      if (bankId && lease?.state === "owned") {
        const current = await prisma.questionBank.findUniqueOrThrow({ where: { id: bankId }, select: { revision: true } });
        await questionBankRepository.deleteQuestionBank(bankId, tutorId, { editLease: { generation: lease.generation!, token: leaseToken }, expectedRevision: current.revision });
      }
      if (bankId) await leaseService.deleteEditLeaseForResource("question_bank", bankId);
      if (bankId) console.log(`[cleanup] bank ${bankId}: soft-deleted; edit_leases rows left: ${await prisma.editLease.count({ where: { resourceType: "question_bank", resourceId: bankId } })}`);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
}

// ---------- Package: expectedRevision is checked only when defined. ----------
function revisionDigest({ difficulty, explanation, options, stem }: { difficulty: string; explanation: string; options: readonly { content: string; isCorrect: boolean; label: string; sortOrder: number }[]; stem: string }) {
  const hex = (value: string) => Buffer.from(value, "utf8").toString("hex");
  const optionStream = options
    .toSorted((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label))
    .map((option) => ["", option.content, String(option.isCorrect), option.label, String(option.sortOrder)].map(hex).join(":"))
    .join(":");
  const stream = [hex("question-revision-digest-v2"), hex(difficulty), hex(""), hex(explanation), hex(""), optionStream, hex(stem), hex(""), hex("single_choice")].join(":");
  return createHash("sha256").update(stream).digest("hex");
}

const PACKAGE_CLEANUP_TABLES = [
  "reusable_question_package_version_item_options",
  "reusable_question_package_version_items",
  "reusable_question_package_versions",
  "reusable_question_package_items",
  "reusable_question_packages",
  "question_revision_options",
  "question_revisions",
  "questions",
  "question_banks",
];

async function runPackage(tutorId: string, databaseUrl: string) {
  const TAB_B = "Paket tab B";
  const TAB_A = "Paket tab A";
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const suffix = randomUUID().slice(0, 8);
  const bankId = randomUUID();
  const questionId = randomUUID();
  const revisionId = randomUUID();
  const stem = "Stale save guard prompt";
  const packageIds: string[] = [];
  const leaseToken = token();
  let subtestId = "";
  let createdSubtest = false;
  let lease: Lease | undefined;
  let packageId: string | undefined;
  try {
    const existingSubtest = await client.query<{ id: string }>("SELECT id FROM subtests WHERE code = 'PU' LIMIT 1");
    if (existingSubtest.rows[0]) {
      subtestId = existingSubtest.rows[0].id;
    } else {
      subtestId = randomUUID();
      createdSubtest = true;
      await client.query("INSERT INTO subtests (id, code, name) VALUES ($1::uuid, 'PU', 'Stale Save Guard Test')", [subtestId]);
    }
    await client.query(
      `INSERT INTO question_banks (id, code, name, purpose, status, created_by_user_id, updated_by_user_id)
       VALUES ($1::uuid, $2, 'Stale save guard bank', 'tryout'::question_bank_purpose, 'published'::content_status, $3::uuid, $3::uuid)`,
      [bankId, `STALE-SAVE-BANK-${suffix}`, tutorId],
    );
    const options = [
      { content: "Correct answer", isCorrect: true, label: "A", sortOrder: 0 },
      { content: "Distractor answer", isCorrect: false, label: "B", sortOrder: 1 },
    ];
    const contentDigest = revisionDigest({ difficulty: "medium", explanation: "Explanation", options, stem });
    await client.query("BEGIN");
    try {
      await client.query("SET CONSTRAINTS ALL DEFERRED");
      await client.query(
        `INSERT INTO questions
          (id, code, question_bank_id, subtest_id, stem, question_type, difficulty, explanation, status, revision, current_revision_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, 'single_choice'::question_type, 'medium'::difficulty_level, 'Explanation', 'published'::content_status, 1, $6::uuid, $7::uuid, $7::uuid)`,
        [questionId, `STALE-SAVE-Q-${suffix}`, bankId, subtestId, stem, revisionId, tutorId],
      );
      await client.query(
        `INSERT INTO question_revisions
          (id, question_id, revision_no, status, provenance, stem, question_type, difficulty, explanation, content_digest, created_by_user_id, updated_by_user_id, ready_at)
         VALUES ($1::uuid, $2::uuid, 1, 'draft'::question_revision_status, 'authored'::question_revision_provenance, $3, 'single_choice'::question_type, 'medium'::difficulty_level, 'Explanation', $4, $5::uuid, $5::uuid, NULL)`,
        [revisionId, questionId, stem, contentDigest, tutorId],
      );
      await client.query(
        `INSERT INTO question_revision_options (question_revision_id, label, content, is_correct, sort_order)
         VALUES ($1::uuid, 'A', 'Correct answer', true, 0), ($1::uuid, 'B', 'Distractor answer', false, 1)`,
        [revisionId],
      );
      await client.query("UPDATE question_revisions SET status = 'ready'::question_revision_status, ready_at = NOW() WHERE id = $1::uuid", [revisionId]);
      await client.query(
        "UPDATE questions SET current_revision_id = $1::uuid, revision = 1, stem = $2, difficulty = 'medium'::difficulty_level, explanation = 'Explanation' WHERE id = $3::uuid",
        [revisionId, stem, questionId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    const { PackageConflictError, saveReusableQuestionPackage } = tryoutRepository;
    const base = {
      description: "Fixture stale save guard",
      items: [{ pointValue: 1, sourceQuestionId: questionId }],
      sourceBankId: bankId,
      subtest: "PU" as const,
      completionIntent: "draft" as const,
    };
    const created = await saveReusableQuestionPackage({ ...base, title: "Paket stale awal" }, tutorId);
    packageId = created.id;
    packageIds.push(created.id);
    const rev0 = created.revision;
    assert.equal(typeof rev0, "number", "Package DTO must expose revision");
    lease = await leaseService.acquireEditLease({ resourceType: "question_package", resourceId: created.id, holderUserId: tutorId, newToken: leaseToken });
    assert.equal(lease.state, "owned");
    const editLease = { generation: lease.generation!, token: leaseToken };
    // Tab B saves with the current revision (precondition).
    await saveReusableQuestionPackage({ ...base, id: created.id, editLease, expectedRevision: rev0, title: TAB_B }, tutorId);
    // Tab A: old expectedRevision, then expectedRevision omitted.
    const tabA = await attempt(() => saveReusableQuestionPackage({ ...base, id: created.id, editLease, expectedRevision: rev0, title: TAB_A }, tutorId));
    const tabAOmitted = await attempt(() => saveReusableQuestionPackage({ ...base, id: created.id, editLease, expectedRevision: undefined, title: TAB_A }, tutorId));
    const stored = (await prisma.reusableQuestionPackage.findUnique({ where: { id: created.id }, select: { title: true } }))?.title;
    rows.push({
      path: "Paket Soal (saveReusableQuestionPackage)",
      staleOldRevision: describe(tabA),
      staleOmittedRevision: describe(tabAOmitted),
      finalStored: storedAs(stored, TAB_B, TAB_A),
    });
    console.log(`[report] Paket tab A old expectedRevision=${rev0}: ${describe(tabA)}; omitted: ${describe(tabAOmitted)}; stored: ${stored}`);
    assert.equal(tabA.status, "rejected", "Stale expectedRevision must be rejected");
    assert.ok(tabA.status === "rejected" && tabA.error instanceof PackageConflictError, "Stale package save must return PackageConflictError");
    assert.equal(tabAOmitted.status, "rejected", "Omitting expectedRevision on an existing package must be rejected");
    assert.ok(tabAOmitted.status === "rejected" && !(tabAOmitted.error instanceof PackageConflictError), "An omitted revision is a validation error, not a conflict");
    assert.equal(stored, TAB_B, "Tab B's package title must survive both stale saves");
    assert.equal(stored === TAB_B || stored === TAB_A, true, "Package title must be one of the two saved titles");
  } finally {
    try {
      if (packageId && lease?.state === "owned") await leaseService.releaseEditLease({ resourceType: "question_package", resourceId: packageId, holderUserId: tutorId, generation: lease.generation!, token: leaseToken });
      if (packageId) await leaseService.deleteEditLeaseForResource("question_package", packageId);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await client.query("BEGIN");
      try {
        await client.query("SET CONSTRAINTS ALL DEFERRED");
        for (const table of PACKAGE_CLEANUP_TABLES) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`);
        await client.query("DELETE FROM reusable_question_package_items WHERE package_id = ANY($1::uuid[])", [packageIds]);
        await client.query("DELETE FROM reusable_question_packages WHERE id = ANY($1::uuid[])", [packageIds]);
        await client.query("DELETE FROM question_revision_options WHERE question_revision_id = $1::uuid", [revisionId]);
        await client.query("DELETE FROM question_revisions WHERE id = $1::uuid", [revisionId]);
        await client.query("DELETE FROM questions WHERE id = $1::uuid", [questionId]);
        await client.query("DELETE FROM question_banks WHERE id = $1::uuid", [bankId]);
        if (createdSubtest) await client.query("DELETE FROM subtests WHERE id = $1::uuid", [subtestId]);
        for (const table of PACKAGE_CLEANUP_TABLES) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER ALL`);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

// ---------- Driver ----------
// Soft-delete banks left by an earlier failed run of this probe. Matched only by the
// probe's generated code prefix and creator, so no other bank is touched.
async function sweepLeftoverBankFixtures(tutorId: string) {
  const leftovers = await prisma.questionBank.findMany({
    where: { code: { startsWith: "bank-stale-awal-" }, createdByUserId: tutorId, deletedAt: null },
    select: { id: true },
  });
  for (const { id } of leftovers) {
    const leaseToken = token();
    const lease = await leaseService.acquireEditLease({ resourceType: "question_bank", resourceId: id, holderUserId: tutorId, newToken: leaseToken });
    assert.equal(lease.state, "owned", `Leftover bank ${id} must be lockable for cleanup`);
    try {
      const current = await prisma.questionBank.findUniqueOrThrow({ where: { id }, select: { revision: true } });
      await questionBankRepository.deleteQuestionBank(id, tutorId, { editLease: { generation: lease.generation!, token: leaseToken }, expectedRevision: current.revision });
      console.log(`[sweep] soft-deleted leftover bank ${id} from an earlier run`);
    } finally {
      // Release is refused once the bank is soft-deleted; removing the lease row is not.
      await leaseService.deleteEditLeaseForResource("question_bank", id);
    }
  }
}

try {
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" }, select: { id: true } });
  const source = await findQuizSource();
  const databaseUrl = process.env.DATABASE_URL!;

  await sweepLeftoverBankFixtures(tutor.id);
  await runPath("Materi", () => runMateri(tutor.id));
  await runPath("Kuis enabled", () => runQuiz(tutor.id, source, "enabled"));
  await runPath("Kuis disabled", () => runQuiz(tutor.id, source, "disabled"));
  await runPath("Bank Soal", () => runQuestionBank(tutor.id));
  await runPath("Paket Soal", () => runPackage(tutor.id, databaseUrl));

  console.log("\nStale-save outcome table (local vecalss_dev only):");
  console.table(rows);
} finally {
  await prisma.$disconnect();
}

if (cleanupErrors.length) {
  throw new AggregateError(cleanupErrors, "Stale-save fixture cleanup failed; inspect leftover fixtures.");
}
if (pathFailures.length) {
  throw new Error(`Stale-save guard test failed for: ${pathFailures.join(", ")}`);
}
console.log("Stale-save guard DB probe finished: all asserted guards rejected stale writes; unguarded outcomes are reported above.");
