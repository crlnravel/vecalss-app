import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { asQuizOwnedQuestion } from "@/lib/quiz/question-ownership";
import { getMentorStandaloneQuiz, saveStandaloneQuiz } from "@/lib/quiz/repository";
import { acquireEditLease, releaseEditLease } from "@/lib/resource-edit-lock/service";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

async function run() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Use a local disposable fixture database");
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
  const source = await prisma.question.findFirstOrThrow({
    where: { questionBank: { purpose: "quiz" }, subtestId: { not: null } },
    include: { currentRevision: { include: { options: true } }, subtest: true },
  });
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
  const owned = asQuizOwnedQuestion(snapshot);
  assert.equal(owned.origin, "local");
  assert.equal(owned.sourceQuestionId, undefined);
  assert.equal(owned.sourceUpdate, undefined);
  owned.choices[0].text = "Pilihan hanya pada salinan";
  owned.correctChoiceIds!.push("B");
  assert.equal(snapshot.choices[0].text, "Pilihan pertama");
  assert.deepEqual(snapshot.correctChoiceIds, ["A"]);

  const priorCutover = process.env.KUIS_VERSIONING_CUTOVER;
  try {
    for (const cutover of ["disabled", "enabled"]) {
      process.env.KUIS_VERSIONING_CUTOVER = cutover;
      const quiz = await prisma.standaloneQuiz.create({ data: {
        slug: `owned-editing-${randomUUID()}`, title: "Kuis salinan", createdByUserId: tutor.id,
        subtestId: source.subtestId!, sourceBankId: source.questionBankId,
      } });
      const token = randomBytes(32).toString("base64url");
      let lease: Awaited<ReturnType<typeof acquireEditLease>> | undefined;
      try {
        const active = cutover === "enabled" ? await prisma.standaloneQuizVersion.create({ data: {
          quizId: quiz.id, title: quiz.title, sourceBankId: source.questionBankId, state: "active", versionNo: 1,
        } }) : null;
        await prisma.standaloneQuizItem.create({ data: {
          quizId: quiz.id, quizVersionId: active?.id, subtestId: source.subtestId!, sortOrder: 1,
          prompt: snapshot.prompt, explanation: snapshot.explanation,
          sourceQuestionId: source.id, sourceQuestionRevisionId: source.currentRevisionId,
          sourceContentDigest: snapshot.sourceContentDigest, sourceRevisionProvenance: source.currentRevision.provenance,
          options: { create: [
            { choiceKey: "A", content: "Pilihan pertama", isCorrect: true, sortOrder: 0 },
            { choiceKey: "B", content: "Pilihan kedua", isCorrect: false, sortOrder: 1 },
          ] },
        } });
        lease = await acquireEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, newToken: token });
        assert.equal(lease.state, "owned");
        const input = {
          id: quiz.id, title: "Kuis dengan salinan yang diedit", description: "", opensAt: "", closesAt: "",
          subjectCode: source.subtest!.code, questionOwnership: "quiz" as const,
          editLease: { generation: lease.generation!, token },
          questions: [{ ...snapshot, prompt: "Pertanyaan berubah hanya di Kuis", explanation: "Penjelasan yang diedit" }],
        };
        await assert.rejects(saveStandaloneQuiz({ ...input, editLease: undefined }, tutor.id), "A valid edit lease is still required");
        await assert.rejects(saveStandaloneQuiz(input, student.id), "Another user cannot edit the quiz copy");
        await saveStandaloneQuiz(input, tutor.id);
        const saved = await getMentorStandaloneQuiz(quiz.id, tutor.id);
        assert.ok(saved);
        assert.equal(saved.quiz.sourceMode, "local");
        assert.equal(saved.quiz.title, input.title);
        assert.equal(saved.questions[0].prompt, input.questions[0].prompt);
        assert.equal(saved.questions[0].explanation, input.questions[0].explanation);
        assert.equal(saved.questions[0].origin, "local");
        assert.equal(saved.questions[0].sourceQuestionId, undefined);
        assert.equal(saved.questions[0].sourceUpdate, undefined);
        const sourceAfter = await prisma.question.findUniqueOrThrow({ where: { id: source.id }, include: { currentRevision: { include: { options: true } }, subtest: true } });
        assert.deepEqual(sourceAfter, source, "Quiz saves must leave the source question and its revision unchanged");
        if (active) {
          const activeAfter = await prisma.standaloneQuizVersion.findUniqueOrThrow({ where: { id: active.id }, include: { items: true } });
          assert.equal(activeAfter.state, "active");
          assert.equal(activeAfter.items[0].prompt, snapshot.prompt, "Existing student assessments keep their original question");
          await assert.rejects(saveStandaloneQuiz({ ...input, expectedDraftRevision: 0 }, tutor.id), "Stale drafts remain fenced");
        }
      } finally {
        if (lease?.state === "owned") await releaseEditLease({ resourceType: "quiz", resourceId: quiz.id, holderUserId: tutor.id, generation: lease.generation!, token });
        await prisma.standaloneQuizItemOption.deleteMany({ where: { quizItem: { quizId: quiz.id } } });
        await prisma.standaloneQuizItem.deleteMany({ where: { quizId: quiz.id } });
        await prisma.standaloneQuizVersion.deleteMany({ where: { quizId: quiz.id } });
        await prisma.standaloneQuiz.delete({ where: { id: quiz.id } });
      }
    }
    console.log("Independent quiz editing passed for legacy and versioned saves, source isolation, active assessments, leases, ownership and stale drafts.");
  } finally {
    if (priorCutover === undefined) delete process.env.KUIS_VERSIONING_CUTOVER;
    else process.env.KUIS_VERSIONING_CUTOVER = priorCutover;
  }
}

run().finally(() => prisma.$disconnect());
