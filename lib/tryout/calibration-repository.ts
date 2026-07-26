import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { prisma } from "@/lib/prisma";

class TryoutCalibrationValidationError extends Error {}

type TwoPlCalibrationInput = {
  discrimination: number;
  difficulty: number;
  questionId: string;
  reason: string;
};

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new TryoutCalibrationValidationError(`${name} harus berupa angka terbatas.`);
  return value;
}

async function approveTwoPlCalibration(input: TwoPlCalibrationInput, actorId: string) {
  const reason = input.reason.trim();
  const discrimination = finite(input.discrimination, "Diskriminasi");
  const difficulty = finite(input.difficulty, "Kesulitan");
  if (!reason || discrimination <= 0) throw new TryoutCalibrationValidationError("Alasan audit dan diskriminasi positif wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const question = await tx.question.findUnique({ where: { id: input.questionId }, select: { id: true, questionBankId: true, subtestId: true } });
    if (!question?.questionBankId || !question.subtestId) throw new TryoutCalibrationValidationError("Hanya soal Bank dengan Subtest dapat dikalibrasi untuk CAT.");
    const existing = await tx.twoPlQuestionCalibration.findUnique({ where: { questionId_modelVersion: { questionId: question.id, modelVersion: CANONICAL_2PL_MODEL_VERSION } } });
    if (existing) throw new TryoutCalibrationValidationError("Kalibrasi 2PL kanonis untuk soal ini sudah ada dan tidak dapat diubah.");
    return tx.twoPlQuestionCalibration.create({ data: { approvedByUserId: actorId, auditReason: reason, difficulty: new Prisma.Decimal(difficulty), discrimination: new Prisma.Decimal(discrimination), modelVersion: CANONICAL_2PL_MODEL_VERSION, questionId: question.id, recordedByUserId: actorId } });
  });
}

export { approveTwoPlCalibration, TryoutCalibrationValidationError };
export type { TwoPlCalibrationInput };
