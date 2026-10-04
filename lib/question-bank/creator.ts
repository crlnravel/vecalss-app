import type { Prisma } from "@/generated/prisma/client";

export type QuestionBankCreator = {
  name: string;
  avatarSrc: string | null;
  subject: string | null;
};

export const questionBankCreatorSelect = {
  fullName: true,
  avatarUrl: true,
  tutorProfile: { select: { teachingSubject: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export function toQuestionBankCreator(
  creator: Prisma.UserGetPayload<{ select: typeof questionBankCreatorSelect }>,
): QuestionBankCreator {
  return {
    name: creator.fullName,
    avatarSrc: creator.avatarUrl,
    subject: creator.tutorProfile?.teachingSubject?.name ?? null,
  };
}
