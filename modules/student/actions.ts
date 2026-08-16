"use server";

import { redirect } from "next/navigation";

import { OnboardingStatus } from "@/generated/prisma/client";
import { requireStudentSession } from "@/lib/auth/access";
import { markAllStudentNotificationsRead } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/modules/auth/form-state";

function readOptionalId(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readOptionalText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
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

async function saveProfileAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireStudentSession();
  const fullName = readOptionalText(formData, "fullName");
  const targetExamEventId = readOptionalId(formData, "targetExamEventId");
  let targetUniversityId = readOptionalId(formData, "targetUniversityId");
  const targetMajorId = readOptionalId(formData, "targetMajorId");
  const timezone = readOptionalText(formData, "timezone") || "Asia/Jakarta";

  if (!fullName) {
    return {
      fieldErrors: { fullName: "Nama lengkap wajib diisi." },
      fields: { fullName },
      message: "Masukkan nama lengkapmu sebelum menyimpan profil.",
      status: "error",
    };
  }

  const [examEvent, university, major] = await Promise.all([
    targetExamEventId
      ? prisma.examEvent.findFirst({
          where: { id: targetExamEventId, isActive: true },
        })
      : Promise.resolve(null),
    targetUniversityId
      ? prisma.university.findFirst({ where: { id: targetUniversityId } })
      : Promise.resolve(null),
    targetMajorId
      ? prisma.major.findFirst({
          include: { university: true },
          where: { id: targetMajorId, isActive: true },
        })
      : Promise.resolve(null),
  ]);

  if (targetExamEventId && !examEvent) {
    return {
      message: "Ujian target yang dipilih sudah tidak tersedia. Silakan pilih yang lain.",
      status: "error",
    };
  }

  if (targetUniversityId && !university) {
    return {
      message: "Kampus target yang dipilih sudah tidak tersedia. Silakan pilih yang lain.",
      status: "error",
    };
  }

  if (targetMajorId && !major) {
    return {
      message: "Jurusan target yang dipilih sudah tidak tersedia. Silakan pilih yang lain.",
      status: "error",
    };
  }

  if (major && !targetUniversityId) {
    targetUniversityId = major.universityId;
  }

  if (major && targetUniversityId && major.universityId !== targetUniversityId) {
    return {
      message: "Pilih jurusan yang sesuai dengan kampus targetmu.",
      status: "error",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      data: { fullName },
      where: { id: session.user.id },
    }),
    prisma.studentProfile.update({
      data: {
        displayName: fullName,
        targetExamEventId,
        targetMajorId,
        targetUniversityId,
        timezone,
      },
      where: { userId: session.user.id },
    }),
  ]);

  redirect("/settings");
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

async function markAllNotificationsReadAction() {
  const session = await requireStudentSession();
  await markAllStudentNotificationsRead(session.user.id);
  revalidatePath("/notifications");
  revalidatePath("/notifications/[notificationId]", "page");
}

export {
  markAllNotificationsReadAction,
  saveOnboardingAction,
  saveProfileAction,
  skipOnboardingAction,
};
