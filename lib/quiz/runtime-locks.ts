import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { LOCK_LEVEL, lockOrderedRows, setTransactionLockTimeout } from "@/lib/serialization/locks";

// Authoring acquires its edit lease first. Every runtime writer then shares
// this stable aggregate boundary, before participation, attempt and child rows.
async function lockStandaloneQuizAggregate(tx: Prisma.TransactionClient, quizId: string, mode: "update" | "share" = "update") {
  await setTransactionLockTimeout(tx);
  await lockOrderedRows(tx, LOCK_LEVEL.aggregate, [quizId], async (_tx, id) => {
    if (mode === "share") {
      // Unrelated learners can write their own attempts concurrently. SHARE
      // still excludes schedule UPDATEs until scoring/disclosure has committed.
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR SHARE`;
    } else {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
    }
  });
}

async function lockStandaloneQuizAttempts(tx: Prisma.TransactionClient, quizId: string) {
  const participations = await tx.standaloneQuizParticipation.findMany({ where: { quizId }, select: { id: true } });
  await lockOrderedRows(tx, LOCK_LEVEL.session, participations.map(row => row.id), async (_tx, id) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${id}::uuid FOR UPDATE`;
  });
  const attempts = await tx.standaloneQuizAttempt.findMany({ where: { participation: { quizId } }, select: { id: true } });
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, attempts.map(row => row.id), async (_tx, id) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${id}::uuid FOR UPDATE`;
  });
}

async function lockOwnedStandaloneQuizAttempt(tx: Prisma.TransactionClient, attemptId: string, studentId: string) {
  // Resolve only identity before locking; callers must re-read state afterward.
  const identity = await tx.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participation: { studentId } },
    select: { participationId: true, participation: { select: { quizId: true } } },
  });
  if (!identity) return null;
  await lockStandaloneQuizAggregate(tx, identity.participation.quizId, "share");
  await lockOrderedRows(tx, LOCK_LEVEL.session, [identity.participationId], async (_tx, id) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${id}::uuid FOR UPDATE`;
  });
  await lockOrderedRows(tx, LOCK_LEVEL.runtime, [attemptId], async (_tx, id) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${id}::uuid FOR UPDATE`;
  });
  return tx.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participationId: identity.participationId, participation: { studentId, quizId: identity.participation.quizId } },
    select: { id: true },
  });
}

export { lockOwnedStandaloneQuizAttempt, lockStandaloneQuizAggregate, lockStandaloneQuizAttempts };
