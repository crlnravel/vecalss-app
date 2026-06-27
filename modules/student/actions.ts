"use server";

import { redirect } from "next/navigation";

import { OnboardingStatus } from "@/generated/prisma/client";
import { requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import type { FormState } from "@/modules/auth/form-state";

function readOptionalId(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function saveOnboardingAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireStudentSession({
    allowIncompleteOnboarding: true,
  });
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");
  let targetUniversityId = readOptionalId(formData, "targetUniversityId");
  const targetMajorId = readOptionalId(formData, "targetMajorId");

  const [examEvent, university, major] = await Promise.all([
    targetExamEventId
      ? prisma.examEvent.findFirst({
          where: {
            id: targetExamEventId,
            isActive: true,
          },
        })
      : Promise.resolve(null),
    targetUniversityId
      ? prisma.university.findFirst({
          where: {
            id: targetUniversityId,
          },
        })
      : Promise.resolve(null),
    targetMajorId
      ? prisma.major.findFirst({
          include: {
            university: true,
          },
          where: {
            id: targetMajorId,
            isActive: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (targetExamEventId && !examEvent) {
    return {
      message: "We're sorry, that exam option is no longer available. Please choose another one.",
      status: "error",
    };
  }

  if (targetUniversityId && !university) {
    return {
      message: "We're sorry, that university is no longer available. Please choose another one.",
      status: "error",
    };
  }

  if (targetMajorId && !major) {
    return {
      message: "We're sorry, that major is no longer available. Please choose another one.",
      status: "error",
    };
  }

  if (major && !targetUniversityId) {
    targetUniversityId = major.universityId;
  }

  if (major && targetUniversityId && major.universityId !== targetUniversityId) {
    return {
      message: "Please choose a major that matches the selected university.",
      status: "error",
    };
  }

  await prisma.studentProfile.update({
    data: {
      onboardingStatus: OnboardingStatus.completed,
      targetExamEventId,
      targetMajorId,
      targetUniversityId,
    },
    where: {
      userId: session.user.id,
    },
  });

  redirect("/dashboard");
}

async function skipOnboardingAction() {
  const session = await requireStudentSession({
    allowIncompleteOnboarding: true,
  });

  await prisma.studentProfile.update({
    data: {
      onboardingStatus: OnboardingStatus.skipped,
    },
    where: {
      userId: session.user.id,
    },
  });

  redirect("/dashboard");
}

export { saveOnboardingAction, skipOnboardingAction };
