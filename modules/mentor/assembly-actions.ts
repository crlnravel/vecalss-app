"use server";

import { revalidatePath } from "next/cache";

import { RoleName } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/access";
import { requireTryoutCapability, TryoutCapabilityError } from "@/lib/tryout/capabilities";
import {
  getAssemblyDraftForEdit,
  getReadyAssemblyRevision,
  listReadyAssemblyRevisions,
  previewAssembly,
  readyAssemblyDraft,
  saveAssemblyDraft,
  validateAssemblyDraft,
} from "@/lib/tryout/assembly-repository";
import { AssemblyValidationError } from "@/lib/tryout/assembly-validation";
import type { PreviewAssemblyInput, SaveAssemblyDraftInput } from "@/lib/tryout/assembly-repository";

async function assemblyManagementSession() {
  const session = await requireSession();
  requireTryoutCapability(session, "tryout.delivery.configure");
  return session;
}

function assemblyMessage(error: unknown) {
  return error instanceof AssemblyValidationError || error instanceof TryoutCapabilityError
    ? error.message
    : "Assembly soal tidak dapat diproses saat ini.";
}

async function listReadyAssemblyRevisionsAction() {
  await assemblyManagementSession();
  try {
    return { ok: true as const, result: await listReadyAssemblyRevisions() };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function getReadyAssemblyRevisionAction(versionId: string) {
  await assemblyManagementSession();
  try {
    return { ok: true as const, result: await getReadyAssemblyRevision(versionId) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function getAssemblyDraftForEditAction(packageId: string) {
  const session = await assemblyManagementSession();
  try {
    return { ok: true as const, result: await getAssemblyDraftForEdit(packageId, session.user.id, { isAdmin: session.user.roles.includes(RoleName.admin) }) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function saveAssemblyDraftAction(input: SaveAssemblyDraftInput) {
  const session = await assemblyManagementSession();
  try {
    const result = await saveAssemblyDraft(input, session.user.id, { isAdmin: session.user.roles.includes(RoleName.admin) });
    revalidatePath("/mentor/packages");
    revalidatePath("/mentor/tryout");
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function validateAssemblyDraftAction(packageId: string) {
  const session = await assemblyManagementSession();
  try {
    return { ok: true as const, result: await validateAssemblyDraft(packageId, session.user.id, { isAdmin: session.user.roles.includes(RoleName.admin) }) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function previewAssemblyAction(input: PreviewAssemblyInput) {
  const session = await assemblyManagementSession();
  try {
    return { ok: true as const, result: await previewAssembly(input, session.user.id, { isAdmin: session.user.roles.includes(RoleName.admin) }) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function readyAssemblyDraftAction(packageId: string) {
  const session = await assemblyManagementSession();
  try {
    const result = await readyAssemblyDraft(packageId, session.user.id, { isAdmin: session.user.roles.includes(RoleName.admin) });
    revalidatePath("/mentor/packages");
    revalidatePath("/mentor/tryout");
    return { ok: true as const, result };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

export {
  getAssemblyDraftForEditAction,
  getReadyAssemblyRevisionAction,
  listReadyAssemblyRevisionsAction,
  previewAssemblyAction,
  readyAssemblyDraftAction,
  saveAssemblyDraftAction,
  validateAssemblyDraftAction,
};
