"use server";

import { RoleName } from "@/generated/prisma/client";
import { requireSession } from "@/lib/auth/access";
import { requireTryoutCapability, TryoutCapabilityError } from "@/lib/tryout/capabilities";
import {
  getReadyAssemblyAttachment,
  getAssemblyDraftForEdit,
  getReadyAssemblyRevision,
  listReadyAssemblyRevisions,
  previewAssembly,
  validateAssemblyDraft,
} from "@/lib/tryout/assembly-repository";
import { AssemblyValidationError } from "@/lib/tryout/assembly-validation";
import type { PreviewAssemblyInput, SaveAssemblyDraftInput } from "@/lib/tryout/assembly-repository";
import type { AssemblyAttachmentTarget, AssemblyAttachmentTestType } from "@/lib/tryout/assembly-validation";

const archivedPackageMessage = "Paket Soal sedang diarsipkan dan tidak dapat diakses oleh Kapten.";

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

async function listReadyAssemblyRevisionsAction(target: AssemblyAttachmentTarget = "tryout") {
  await assemblyManagementSession();
  try {
    return { ok: true as const, result: await listReadyAssemblyRevisions(target) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function getReadyAssemblyRevisionAction(versionId: string, target: AssemblyAttachmentTarget = "tryout") {
  await assemblyManagementSession();
  try {
    return { ok: true as const, result: await getReadyAssemblyRevision(versionId, target) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function attachReadyAssemblyAction(input: { target: AssemblyAttachmentTarget; targetSubtestCode: string; targetTestType: AssemblyAttachmentTestType; versionId: string }) {
  await assemblyManagementSession();
  try {
    if (input.target !== "tryout" || !input.versionId.trim() || !input.targetSubtestCode.trim() || (input.targetTestType !== "cbt" && input.targetTestType !== "cat")) {
      throw new AssemblyValidationError("invalid_mode", "Attachment assembly hanya tersedia untuk Tryout dengan Subtest yang valid.");
    }
    return { ok: true as const, result: await getReadyAssemblyAttachment(input.versionId, input.target, input.targetSubtestCode, input.targetTestType) };
  } catch (error) {
    return { ok: false as const, message: assemblyMessage(error) };
  }
}

async function detachReadyAssemblyAction(input: { target: AssemblyAttachmentTarget } = { target: "tryout" }) {
  await assemblyManagementSession();
  if (input.target !== "tryout") return { ok: false as const, message: "Attachment assembly hanya tersedia untuk Tryout." };
  return { ok: true as const, result: { detached: true as const } };
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
  await assemblyManagementSession();
  void input;
  return { message: archivedPackageMessage, ok: false as const };
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
  await assemblyManagementSession();
  void packageId;
  return { message: archivedPackageMessage, ok: false as const };
}

export {
  attachReadyAssemblyAction,
  detachReadyAssemblyAction,
  getAssemblyDraftForEditAction,
  getReadyAssemblyRevisionAction,
  listReadyAssemblyRevisionsAction,
  previewAssemblyAction,
  readyAssemblyDraftAction,
  saveAssemblyDraftAction,
  validateAssemblyDraftAction,
};
