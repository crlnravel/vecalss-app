import "server-only";

import { prisma } from "@/lib/prisma";

import {
  buildStudentBannerVariables,
  type StudentBannerVariables,
} from "./banner-content";

async function getStudentBannerVariablesForUser(
  userId: string,
  fullName: string,
): Promise<StudentBannerVariables> {
  const profile = await prisma.studentProfile.findUnique({
    select: {
      targetMajor: { select: { name: true } },
      targetUniversity: { select: { name: true, shortName: true } },
    },
    where: { userId },
  });

  return buildStudentBannerVariables({
    fullName,
    targetMajor: profile?.targetMajor?.name,
    targetUniversity: profile?.targetUniversity?.shortName || profile?.targetUniversity?.name,
  });
}

export { getStudentBannerVariablesForUser };
