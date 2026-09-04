"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "@/generated/prisma/client";
import { requireTutorSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

const KAPTEN_SETTINGS_KEY_PREFIX = "kapten.settings.";
const KAPTEN_SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
const KAPTEN_LANGUAGES = ["id", "en"] as const;

type KaptenSubjectCode = (typeof KAPTEN_SUBJECT_CODES)[number];
type KaptenContentLanguage = (typeof KAPTEN_LANGUAGES)[number];

type KaptenSettings = {
  contentLanguage: KaptenContentLanguage;
  email: string;
  profileName: string;
  savedAt: string | null;
  subjectCode: KaptenSubjectCode;
  userId: string;
};

type SaveKaptenSettingsInput = {
  contentLanguage: string;
  email: string;
  profileName: string;
  subjectCode: string;
};

type SaveKaptenSettingsResult =
  | { message: string; ok: true; settings: KaptenSettings }
  | { message: string; ok: false };

function settingsKey(userId: string) {
  return `${KAPTEN_SETTINGS_KEY_PREFIX}${userId}`;
}

function isSubjectCode(value: string): value is KaptenSubjectCode {
  return (KAPTEN_SUBJECT_CODES as readonly string[]).includes(value);
}

function isContentLanguage(value: string): value is KaptenContentLanguage {
  return (KAPTEN_LANGUAGES as readonly string[]).includes(value);
}

function storedWorkspaceSettings(value: unknown) {
  if (!value || typeof value !== "object") return { contentLanguage: "id" as const, subjectCode: "PU" as const };
  const candidate = value as Record<string, unknown>;
  const subjectCode = typeof candidate.subjectCode === "string" && isSubjectCode(candidate.subjectCode)
    ? candidate.subjectCode
    : "PU";
  const contentLanguage = typeof candidate.contentLanguage === "string" && isContentLanguage(candidate.contentLanguage)
    ? candidate.contentLanguage
    : "id";
  return { contentLanguage, subjectCode };
}

async function readKaptenSettings(userId: string): Promise<KaptenSettings> {
  const [user, config] = await Promise.all([
    prisma.user.findUnique({
      select: { email: true, fullName: true, id: true },
      where: { id: userId },
    }),
    prisma.systemConfig.findUnique({
      select: { configValue: true, updatedAt: true },
      where: { configKey: settingsKey(userId) },
    }),
  ]);

  if (!user) throw new Error("Akun Kapten tidak ditemukan.");
  const workspace = storedWorkspaceSettings(config?.configValue);
  return {
    contentLanguage: workspace.contentLanguage,
    email: user.email,
    profileName: user.fullName,
    savedAt: config?.updatedAt.toISOString() ?? null,
    subjectCode: workspace.subjectCode,
    userId: user.id,
  };
}

async function getKaptenSettings(): Promise<KaptenSettings> {
  const session = await requireTutorSession();
  return readKaptenSettings(session.user.id);
}

async function saveKaptenSettingsAction(input: SaveKaptenSettingsInput): Promise<SaveKaptenSettingsResult> {
  const session = await requireTutorSession();
  const profileName = input.profileName.trim();
  const email = input.email.trim().toLowerCase();
  const subjectCode = input.subjectCode.trim();
  const contentLanguage = input.contentLanguage.trim();

  if (profileName.length < 1 || profileName.length > 160) {
    return { message: "Nama profil wajib diisi dan maksimal 160 karakter.", ok: false };
  }
  if (!/^\S+@\S+\.\S+$/u.test(email) || email.length > 254) {
    return { message: "Masukkan email tutor yang valid.", ok: false };
  }
  if (!isSubjectCode(subjectCode)) {
    return { message: "Subjek utama tidak dikenali.", ok: false };
  }
  if (!isContentLanguage(contentLanguage)) {
    return { message: "Bahasa konten tidak dikenali.", ok: false };
  }

  try {
    const settings = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        data: { email, fullName: profileName },
        where: { id: session.user.id },
      });
      const config = await tx.systemConfig.upsert({
        create: {
          configKey: settingsKey(session.user.id),
          configValue: { contentLanguage, subjectCode } as Prisma.InputJsonValue,
          updatedByUserId: session.user.id,
        },
        update: {
          configValue: { contentLanguage, subjectCode } as Prisma.InputJsonValue,
          updatedByUserId: session.user.id,
        },
        where: { configKey: settingsKey(session.user.id) },
      });
      return {
        contentLanguage,
        email,
        profileName,
        savedAt: config.updatedAt.toISOString(),
        subjectCode,
        userId: session.user.id,
      } satisfies KaptenSettings;
    });

    revalidatePath("/mentor/settings");
    return { message: "Pengaturan tersimpan. Nilai server sudah dibaca ulang.", ok: true, settings };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
    return {
      message: code === "P2002"
        ? "Email tersebut sudah digunakan akun lain. Pengaturan belum berubah."
        : "Pengaturan belum tersimpan. Coba lagi.",
      ok: false,
    };
  }
}

export { getKaptenSettings, saveKaptenSettingsAction };
