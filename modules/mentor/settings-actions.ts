"use server";

import { revalidatePath } from "next/cache";

import { requireTutorSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import type { KaptenSettings } from "@/modules/mentor/settings-types";

type SaveKaptenSettingsInput = { profileName: string };
type SaveKaptenSettingsResult =
  | { message: string; ok: true; settings: KaptenSettings }
  | { field?: "profileName"; message: string; ok: false };

const SETTINGS_USER_SELECT = { email: true, fullName: true, id: true } as const;

function profileSettings(user: { email: string; fullName: string; id: string }): KaptenSettings {
  return { email: user.email, profileName: user.fullName, userId: user.id };
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

async function saveKaptenSettingsAction(input: SaveKaptenSettingsInput): Promise<SaveKaptenSettingsResult> {
  const session = await requireTutorSession();
  const profileName = typeof input?.profileName === "string" ? input.profileName.trim() : "";
  if (profileName.length < 1 || profileName.length > 160) {
    return { field: "profileName", message: "Nama profil wajib diisi dan maksimal 160 karakter.", ok: false };
  }

  try {
    // This action cannot change login identity or role assignments.
    const user = await prisma.user.update({
      data: { fullName: profileName },
      select: SETTINGS_USER_SELECT,
      where: { id: session.user.id },
    });
    revalidatePath("/mentor/settings");
    return { message: "Perubahan tersimpan.", ok: true, settings: profileSettings(user) };
  } catch {
    return { message: "Perubahan belum tersimpan. Coba simpan lagi.", ok: false };
  }
}

export { getKaptenSettings, saveKaptenSettingsAction };
