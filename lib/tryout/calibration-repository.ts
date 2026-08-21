import "server-only";

import { Prisma, QuestionRevisionProvenance, QuestionRevisionStatus } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { prisma } from "@/lib/prisma";

class TryoutCalibrationValidationError extends Error {}

type TwoPlCalibrationInput = {
  discrimination: number;
  difficulty: number;
  questionId: string;
  questionRevisionId?: string;
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
    const question = await tx.question.findUnique({ where: { id: input.questionId }, select: { id: true, questionBankId: true, subtestId: true, currentRevision: { select: { contentDigest: true, id: true, questionId: true, status: true } } } });
    if (!question?.questionBankId || !question.subtestId) throw new TryoutCalibrationValidationError("Hanya soal Bank dengan Subtest dapat dikalibrasi untuk CAT.");
    const revision = input.questionRevisionId
      ? await tx.questionRevision.findUnique({ where: { id: input.questionRevisionId }, select: { contentDigest: true, id: true, questionId: true, status: true } })
      : question.currentRevision;
    if (!revision || revision.questionId !== question.id || revision.status !== QuestionRevisionStatus.ready) throw new TryoutCalibrationValidationError("Kalibrasi CAT harus terikat pada QuestionRevision Ready yang dipilih.");
    const existing = await tx.twoPlQuestionCalibration.findUnique({ where: { questionRevisionId_modelVersion: { questionRevisionId: revision.id, modelVersion: CANONICAL_2PL_MODEL_VERSION } } });
    if (existing?.approvalState === "approved" && existing.sourceRevisionProvenance !== QuestionRevisionProvenance.legacy_unknown) throw new TryoutCalibrationValidationError("Kalibrasi 2PL kanonis untuk soal ini sudah ada dan tidak dapat diubah.");
    if (existing) {
      return tx.twoPlQuestionCalibration.update({
        where: { id: existing.id },
        data: {
          approvalState: "approved",
          approvedAt: new Date(),
          approvedByUserId: actorId,
          auditReason: reason,
          contentDigest: revision.contentDigest,
          difficulty: new Prisma.Decimal(difficulty),
          discrimination: new Prisma.Decimal(discrimination),
          recordedByUserId: actorId,
          sourceRevisionProvenance: QuestionRevisionProvenance.authored,
        },
      });
    }
    return tx.twoPlQuestionCalibration.create({ data: { approvedByUserId: actorId, auditReason: reason, contentDigest: revision.contentDigest, difficulty: new Prisma.Decimal(difficulty), discrimination: new Prisma.Decimal(discrimination), modelVersion: CANONICAL_2PL_MODEL_VERSION, questionId: question.id, questionRevisionId: revision.id, recordedByUserId: actorId, sourceRevisionProvenance: QuestionRevisionProvenance.authored } });
  });
}

export { approveTwoPlCalibration, TryoutCalibrationValidationError };
export type { TwoPlCalibrationInput };
