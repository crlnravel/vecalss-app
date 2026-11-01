"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { validateKaptenAvatarDataUrl } from "@/modules/mentor/avatar-validation";
import { kaptenSubjects } from "@/modules/mentor/mock-data";
import type { KaptenSettings } from "@/modules/mentor/settings-types";

type SaveKaptenSettingsInput = {
  avatarUrl?: string | null;
  profileName: string;
};
type SaveKaptenSettingsResult =
  | { message: string; ok: true; settings: KaptenSettings }
  | {
      field?: "avatarUrl" | "profileName" | "subjectCode";
      message: string;
      ok: false;
    };

const SETTINGS_USER_SELECT = {
  avatarUrl: true,
  email: true,
  fullName: true,
  id: true,
  tutorProfile: {
    select: { teachingSubject: { select: { code: true, isActive: true } } },
  },
} as const;

function profileSettings(user: {
  avatarUrl: string | null;
  email: string;
  fullName: string;
  id: string;
  tutorProfile: {
    teachingSubject: { code: string; isActive: boolean } | null;
  } | null;
}): KaptenSettings {
  const subject = user.tutorProfile?.teachingSubject;
  const subjectCode =
    subject?.isActive &&
    kaptenSubjects.some((item) => item.code === subject.code)
      ? subject.code
      : null;
  return {
    avatarUrl: user.avatarUrl,
    email: user.email,
    profileName: user.fullName,
    subjectCode,
    userId: user.id,
  };
}

async function getKaptenSettings(): Promise<KaptenSettings> {
  const session = await requireTutorSession();
  const user = await prisma.user.findUnique({
    select: SETTINGS_USER_SELECT,
    where: { id: session.user.id },
  });
  if (!user) throw new Error("Akun Kapten tidak ditemukan.");
  return profileSettings(user);
}

async function saveKaptenSettingsAction(
  input: SaveKaptenSettingsInput,
): Promise<SaveKaptenSettingsResult> {
  const session = await requireTutorSession();
  const profileName =
    typeof input?.profileName === "string" ? input.profileName.trim() : "";
  if (profileName.length < 1 || profileName.length > 160) {
    return {
      field: "profileName",
      message: "Nama profil wajib diisi dan maksimal 160 karakter.",
      ok: false,
    };
  }

  let validatedAvatarUrl: string | null | undefined;
  if (input?.avatarUrl !== undefined) {
    const avatarCheck = validateKaptenAvatarDataUrl(input.avatarUrl);
    if (!avatarCheck.ok) {
      return avatarCheck;
    }
    validatedAvatarUrl = avatarCheck.avatarUrl;
  }

  try {
    // This action cannot change login identity or role assignments.
    const user =
      validatedAvatarUrl === undefined
        ? await prisma.user.update({
            data: { fullName: profileName },
            select: SETTINGS_USER_SELECT,
            where: { id: session.user.id },
          })
        : await prisma.user.update({
            data: { avatarUrl: validatedAvatarUrl, fullName: profileName },
            select: SETTINGS_USER_SELECT,
            where: { id: session.user.id },
          });
    revalidatePath("/mentor/settings");
    revalidatePath("/mentor/quiz");
    revalidatePath("/mentor/quiz/question-bank");
    return {
      message: "Perubahan tersimpan.",
      ok: true,
      settings: profileSettings(user),
    };
  } catch {
    return {
      message: "Perubahan belum tersimpan. Coba simpan lagi.",
      ok: false,
    };
  }
}

async function saveKaptenSubjectAction(input: {
  subjectCode: string | null;
}): Promise<SaveKaptenSettingsResult> {
  const session = await requireTutorSession();
  const subjectCode = input?.subjectCode;
  if (
    subjectCode !== null &&
    (typeof subjectCode !== "string" ||
      !kaptenSubjects.some((subject) => subject.code === subjectCode))
  ) {
    return {
      field: "subjectCode",
      message: "Pilih subjek yang tersedia.",
      ok: false,
    };
  }
  try {
    if (
      subjectCode !== null &&
      !(await prisma.subtest.findFirst({
        where: { code: subjectCode, isActive: true },
        select: { id: true },
      }))
    ) {
      return {
        field: "subjectCode",
        message: "Subjek ini tidak tersedia. Pilih subjek lain.",
        ok: false,
      };
    }
    await prisma.tutorProfile.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, teachingSubjectCode: subjectCode },
      update: { teachingSubjectCode: subjectCode },
    });
    const user = await prisma.user.findUniqueOrThrow({
      select: SETTINGS_USER_SELECT,
      where: { id: session.user.id },
    });
    revalidatePath("/mentor/settings");
    revalidatePath("/mentor/quiz");
    return {
      message: "Perubahan tersimpan.",
      ok: true,
      settings: profileSettings(user),
    };
  } catch {
    return {
      message: "Perubahan belum tersimpan. Coba simpan lagi.",
      ok: false,
    };
  }
}

export {
  getKaptenSettings,
  saveKaptenSettingsAction,
  saveKaptenSubjectAction,
};
