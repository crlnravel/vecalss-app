import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma";
import { exportQuestionBankCsv } from "../lib/question-bank/csv-repository";
import { manageMentorDashboardQuiz } from "../lib/quiz/mentor-dashboard-repository";
import { getMentorQuizCatalogueRecords } from "../lib/quiz/repository";
import { acquireEditLease, EditLeaseServiceError, releaseEditLease } from "../lib/resource-edit-lock/service";

/**
 * Materi, Kuis and Bank Soal are shared across Kapten like Tryouts: any active
 * Kapten or admin can read, lease and edit them; accounts without that role
 * cannot; and the author stays the owner of record.
 */
const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || url.pathname !== "/vecalss_dev") {
  throw new Error("Shared Kapten content test requires the local disposable vecalss_dev database on port 55432.");
}

const activeTutor = { status: "active" as const, softDeletedAt: null, previewPurpose: null, roleAssignments: { some: { role: "tutor" as const, revokedAt: null } } };

const quiz = await prisma.standaloneQuiz.findFirstOrThrow({ where: { createdBy: activeTutor }, orderBy: { createdAt: "asc" } });
const bank = await prisma.questionBank.findFirstOrThrow({ where: { createdBy: activeTutor, deletedAt: null }, orderBy: { createdAt: "asc" } });
const lesson = await prisma.module.findFirstOrThrow({ where: { createdBy: activeTutor }, orderBy: { createdAt: "asc" } });
const other = await prisma.user.findFirstOrThrow({ select: { id: true }, where: { ...activeTutor, id: { notIn: [quiz.createdByUserId, bank.createdByUserId, lesson.createdByUserId!] } } });
const student = await prisma.user.findUniqueOrThrow({ select: { id: true }, where: { email: process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local" } });
const originalQuizHidden = quiz.isHidden;

const refusal = (action: () => Promise<unknown>) => action().then(() => null, (error: unknown) => error);

try {
  // --- Kuis ---
  assert((await getMentorQuizCatalogueRecords(other.id)).some((record) => record.id === quiz.id), "a second Kapten lists another Kapten's Kuis");
  assert.equal((await getMentorQuizCatalogueRecords(student.id)).length, 0, "a student sees no Kuis library");
  await manageMentorDashboardQuiz(other.id, quiz.id, quiz.isHidden ? "show" : "hide");
  assert.notEqual((await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: quiz.id } })).isHidden, originalQuizHidden, "a second Kapten can hide or show another Kapten's Kuis");
  const quizRefusal = await refusal(() => manageMentorDashboardQuiz(student.id, quiz.id, "hide"));
  assert(quizRefusal instanceof Error, "a student cannot manage a Kuis");

  // --- Bank Soal ---
  assert(await exportQuestionBankCsv(other.id, bank.id), "a second Kapten exports another Kapten's Bank Soal");
  assert.equal(await exportQuestionBankCsv(student.id, bank.id), null, "a student cannot export a Bank Soal");

  // --- edit leases for every shared resource type ---
  const resources = [
    { resourceId: quiz.id, resourceType: "quiz" as const },
    { resourceId: bank.id, resourceType: "question_bank" as const },
    { resourceId: lesson.code, resourceType: "materi" as const },
  ];
  for (const resource of resources) {
    const studentLease = await refusal(() => acquireEditLease({ ...resource, holderUserId: student.id, newToken: randomBytes(32).toString("base64url") }));
    assert(studentLease instanceof EditLeaseServiceError && studentLease.code === "resource_inaccessible", `a student cannot lease ${resource.resourceType}`);

    const token = randomBytes(32).toString("base64url");
    const lease = await acquireEditLease({ ...resource, holderUserId: other.id, newToken: token });
    assert(lease.state === "owned" && lease.generation !== undefined, `a second Kapten can lease ${resource.resourceType}`);
    await releaseEditLease({ ...resource, generation: lease.generation, holderUserId: other.id, token });
  }

  // --- authorship stays recorded ---
  assert.equal((await prisma.standaloneQuiz.findUniqueOrThrow({ where: { id: quiz.id } })).createdByUserId, quiz.createdByUserId);
  assert.equal((await prisma.questionBank.findUniqueOrThrow({ where: { id: bank.id } })).createdByUserId, bank.createdByUserId);
  assert.equal((await prisma.module.findUniqueOrThrow({ where: { id: lesson.id } })).createdByUserId, lesson.createdByUserId);

  console.log("Shared Kapten content passed: a second Kapten lists, manages, exports and leases Kuis/Bank Soal/Materi; a student is refused; authors unchanged.");
} finally {
  await prisma.standaloneQuiz.update({ data: { isHidden: originalQuizHidden }, where: { id: quiz.id } });
  await prisma.$disconnect();
}
