import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import { getStandaloneQuizResult } from "@/lib/quiz/repository";
import type { QuizResult } from "@/modules/quiz/QuizResultView";

type Scenario = {
  name: string;
  reviewTiming: "immediate" | "after_close" | "never";
  releaseState: QuizResult["releaseState"];
  scoringState: QuizResult["scoringState"];
  score: number | null;
  correctCount: number | null;
  correctness?: "show" | "hide";
  earlierScore?: number;
};

async function run() {
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.equal(target.port, "55432");
  assert.equal(target.pathname, "/vecalss_dev", "Use only the explicit disposable dev database");
  const tutor = await prisma.user.findUniqueOrThrow({ where: { email: "tutor@vecalss.local" } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@vecalss.local" } });
  const other = await prisma.user.findUniqueOrThrow({ where: { email: "dimas@vecalss.local" } });
  const subtest = await prisma.subtest.findFirstOrThrow({ where: { code: "PU" } });
  const now = new Date("2035-10-10T10:00:00.000Z");
  const close = new Date("2035-10-10T11:00:00.000Z");
  const previousCutover = process.env.KUIS_VERSIONING_CUTOVER;
  process.env.KUIS_VERSIONING_CUTOVER = "disabled";
  const quizIds: string[] = [];
  const results: Record<string, QuizResult> = {};
  const scenarios: Scenario[] = [
    { name: "pending", reviewTiming: "after_close", releaseState: "scheduled", scoringState: "scored", score: 96, correctCount: 2 },
    { name: "never", reviewTiming: "never", releaseState: "hidden", scoringState: "scored", score: 96, correctCount: 2 },
    { name: "review", reviewTiming: "immediate", releaseState: "hidden", scoringState: "review_required", score: null, correctCount: null },
    { name: "unscored", reviewTiming: "immediate", releaseState: "hidden", scoringState: "pending", score: null, correctCount: null },
    { name: "recalculating", reviewTiming: "immediate", releaseState: "hidden", scoringState: "recalculating", score: null, correctCount: null },
    { name: "zero", reviewTiming: "immediate", releaseState: "released", scoringState: "scored", score: 0, correctCount: 0 },
    { name: "positive", reviewTiming: "immediate", releaseState: "released", scoringState: "scored", score: 50, correctCount: 1 },
    { name: "hiddenKeys", reviewTiming: "immediate", releaseState: "released", scoringState: "scored", score: 50, correctCount: 1, correctness: "hide" },
    { name: "historical", reviewTiming: "after_close", releaseState: "scheduled", scoringState: "scored", score: 96, correctCount: 2, earlierScore: 73 },
    { name: "historicalHidden", reviewTiming: "never", releaseState: "hidden", scoringState: "scored", score: 96, correctCount: 2, earlierScore: 73 },
  ];
  try {
    for (const scenario of scenarios) {
      const policy = {
        attemptsAllowed: null, correctAnswerVisibility: scenario.correctness ?? "show",
        formBehavior: "same", retryDelaySeconds: null,
        reviewTiming: scenario.reviewTiming, scorePolicy: "latest",
      };
      const quiz = await prisma.standaloneQuiz.create({ data: {
        slug: `result-presentation-${randomUUID()}`, title: "Hasil kuis",
        subtestId: subtest.id, createdByUserId: tutor.id, status: "published",
        closesAt: close, reviewTiming: scenario.reviewTiming,
      } });
      quizIds.push(quiz.id);
      const participation = await prisma.standaloneQuizParticipation.create({ data: {
        quizId: quiz.id, studentId: student.id, policySnapshot: policy,
      } });
      const item = await prisma.standaloneQuizItem.create({ data: {
        quizId: quiz.id, subtestId: subtest.id, sortOrder: 1, prompt: "Pertanyaan",
        explanation: "KRF04_PROTECTED_EXPLANATION", questionType: "single_choice",
        options: { create: [
          { choiceKey: "A", content: "Pilihan A", isCorrect: true, sortOrder: 0 },
          { choiceKey: "B", content: "Pilihan B", isCorrect: false, sortOrder: 1 },
        ] },
      }, include: { options: true } });
      const secondItem = await prisma.standaloneQuizItem.create({ data: {
        quizId: quiz.id, subtestId: subtest.id, sortOrder: 2, prompt: "Pertanyaan kedua",
        explanation: "KRF04_PROTECTED_EXPLANATION", questionType: "single_choice",
        options: { create: [
          { choiceKey: "A", content: "Pilihan A", isCorrect: true, sortOrder: 0 },
          { choiceKey: "B", content: "Pilihan B", isCorrect: false, sortOrder: 1 },
        ] },
      } });
      if (scenario.earlierScore !== undefined) {
        await prisma.standaloneQuizAttempt.create({ data: {
          participationId: participation.id, attemptNo: 1, status: "submitted",
          formItemOrder: [item.id, secondItem.id],
          releaseState: "released", scoringState: "scored", score: scenario.earlierScore,
          policySnapshot: { ...policy, reviewTiming: "immediate" }, submittedAt: now,
        } });
      }
      const selectedOption = item.options.find(option => option.isCorrect === (scenario.name !== "zero"))!;
      const attempt = await prisma.standaloneQuizAttempt.create({ data: {
        participationId: participation.id, attemptNo: scenario.earlierScore === undefined ? 1 : 2,
        status: "submitted", policySnapshot: policy, submittedAt: now,
        formItemOrder: [item.id, secondItem.id],
        releaseAt: scenario.releaseState === "scheduled" ? close : null,
        releaseState: scenario.releaseState, scoringState: scenario.scoringState,
        score: scenario.score, correctCount: scenario.correctCount,
        maxPoints: scenario.score === null ? null : 100,
        earnedPoints: scenario.score,
        answers: { create: { quizItemId: item.id, selectedOptionId: selectedOption.id, selectedOptionIds: [selectedOption.id] } },
      } });
      const result = await getStandaloneQuizResult(attempt.id, student.id, "PU", quiz.slug, now);
      assert.ok(result, scenario.name);
      assert.equal(result.answeredCount, 1);
      assert.equal(result.totalQuestions, 2);
      assert.equal(result.releaseState, scenario.releaseState);
      assert.equal(result.scoringState, scenario.scoringState);
      const released = scenario.releaseState === "released" && scenario.scoringState === "scored";
      assert.equal(result.attemptScore, released ? scenario.score : null);
      assert.equal(result.correctCount, released ? scenario.correctCount : null);
      assert.equal(result.aggregateScore, scenario.earlierScore ?? (released ? scenario.score : null));
      assert.equal(result.correctnessAvailable, released && scenario.correctness !== "hide");
      assert.equal(result.reviewAvailable, released);
      if (!released) {
        assert.ok(result.questions.every(question => question.explanation === null));
        assert.ok(result.questions.every(question => question.options.every(option => !option.correct)));
      }
      if (scenario.correctness === "hide") {
        assert.ok(result.questions.every(question => question.options.every(option => !option.correct)));
        assert.equal(result.questions[0].explanation, "KRF04_PROTECTED_EXPLANATION", "explanations remain independent of answer keys");
      }
      assert.equal(await getStandaloneQuizResult(attempt.id, other.id, "PU", quiz.slug, now), null);
      assert.equal(await getStandaloneQuizResult(attempt.id, student.id, "PU", "wrong-route", now), null);
      results[scenario.name] = result;
      if (scenario.name === "pending") {
        assert.equal((await getStandaloneQuizResult(attempt.id, student.id, "PU", quiz.slug, close))?.attemptScore, 96, "exact release boundary opens the stored numeric score");
      }
      if (scenario.name === "historical") {
        await prisma.standaloneQuizAttempt.create({ data: {
          participationId: participation.id, attemptNo: 3, status: "in_progress", policySnapshot: policy,
          formItemOrder: [item.id, secondItem.id],
        } });
        await prisma.standaloneQuiz.update({ where: { id: quiz.id }, data: { status: "archived" } });
        const withResume = await getStandaloneQuizResult(attempt.id, student.id, "PU", quiz.slug, now);
        assert.ok(withResume?.resumeAttemptId, "hidden score does not revoke an owned active continuation after archive");
        assert.equal(withResume.canRestart, true);
        results.historical = withResume;
      }
    }
    if (process.env.KRF04_RESULT_FIXTURES) {
      await writeFile(process.env.KRF04_RESULT_FIXTURES, JSON.stringify(results));
    }
    console.log("Quiz result DB projection contracts passed: availability, aggregate scope, owner/route checks and independent disclosure.");
  } finally {
    await prisma.standaloneQuiz.deleteMany({ where: { id: { in: quizIds } } });
    if (previousCutover === undefined) delete process.env.KUIS_VERSIONING_CUTOVER;
    else process.env.KUIS_VERSIONING_CUTOVER = previousCutover;
    await prisma.$disconnect();
  }
}

await run();
