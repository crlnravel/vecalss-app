"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { decideAppeal, fileAppeal, reopenAppeal } from "@/lib/fraud/appeals";
import { requireAdmin, requireOwner } from "@/lib/fraud/authority";
import { createManualBlock, liftBlock, renewBlock } from "@/lib/fraud/blocks";
import { acknowledgeCase, closeCase, escalateCase, linkBlockToCase, reopenCase } from "@/lib/fraud/cases";
import { isBlockReasonCode, BLOCK_TYPES, type FraudBlockType } from "@/lib/fraud/constants";
import { FraudValidationError } from "@/lib/fraud/errors";
import { describeFraudError } from "@/lib/fraud/messages";
import { serverLogger } from "@/lib/server-logger";
import type { OwnerContext, AdminContext } from "@/lib/fraud/authority";

/**
 * Server actions behind the fraud pages. Each one re-authenticates on the
 * server (a verified second-factor admin session), then checks owner authority
 * where the action needs it, whatever the page showed. A failure goes back to
 * the page with a plain-language message; a success goes back with a short
 * confirmation. Nothing here trusts a hidden field except the version number,
 * and that is only ever used to detect a concurrent change.
 */

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function integer(form: FormData, key: string) {
  const value = Number.parseInt(text(form, key), 10);
  return Number.isInteger(value) ? value : -1;
}

function pathWith(path: string, params: Record<string, string>) {
  return `${path}?${new URLSearchParams(params)}`;
}

function safeReturn(form: FormData, fallback: string) {
  const value = text(form, "returnTo");
  return /^\/admin\/fraud(\/[0-9a-f-]{36})?(\/[0-9a-f-]{36})?$/iu.test(value) || value === "/admin/fraud/blocks" ? value : fallback;
}

async function runAdmin(form: FormData, fallback: string, done: string, work: (admin: AdminContext) => Promise<unknown>): Promise<never> {
  const session = await requireAdminSession();
  const target = safeReturn(form, fallback);
  let outcome: Record<string, string>;

  try {
    await work(requireAdmin(session));
    outcome = { done };
  } catch (error) {
    if (!(error instanceof Error && error.name.startsWith("Fraud"))) {
      serverLogger.error("fraud.action.failed", error, { area: "fraud" });
    }
    outcome = { error: describeFraudError(error) };
  }

  revalidatePath("/admin/fraud", "layout");
  redirect(pathWith(target, outcome));
}

async function runOwner(form: FormData, fallback: string, done: string, work: (owner: OwnerContext) => Promise<unknown>): Promise<never> {
  const session = await requireAdminSession();
  const target = safeReturn(form, fallback);
  let outcome: Record<string, string>;

  try {
    await work(requireOwner(session));
    outcome = { done };
  } catch (error) {
    if (!(error instanceof Error && error.name.startsWith("Fraud"))) {
      serverLogger.error("fraud.action.failed", error, { area: "fraud" });
    }
    outcome = { error: describeFraudError(error) };
  }

  revalidatePath("/admin/fraud", "layout");
  redirect(pathWith(target, outcome));
}

async function acknowledgeCaseAction(form: FormData) {
  const caseId = text(form, "caseId");
  await runAdmin(form, `/admin/fraud/${caseId}`, "Kasus ditandai sudah dilihat.", (admin) =>
    acknowledgeCase(admin, { caseId, expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function escalateCaseAction(form: FormData) {
  const caseId = text(form, "caseId");
  await runOwner(form, `/admin/fraud/${caseId}`, "Kasus dieskalasi.", (owner) =>
    escalateCase(owner, { caseId, expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function closeCaseAction(form: FormData) {
  const caseId = text(form, "caseId");
  await runOwner(form, `/admin/fraud/${caseId}`, "Kasus ditutup.", (owner) =>
    closeCase(owner, { caseId, closureReason: text(form, "closureReason"), expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function reopenCaseAction(form: FormData) {
  const caseId = text(form, "caseId");
  await runOwner(form, `/admin/fraud/${caseId}`, "Kasus dibuka kembali.", (owner) =>
    reopenCase(owner, { caseId, expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function linkBlockAction(form: FormData) {
  const caseId = text(form, "caseId");
  await runOwner(form, `/admin/fraud/${caseId}`, "Blokir dikaitkan ke kasus.", (owner) =>
    linkBlockToCase(owner, { blockId: text(form, "blockId"), caseId }),
  );
}

async function createBlockAction(form: FormData) {
  const type = text(form, "type") as FraudBlockType;
  const reasonCode = text(form, "reasonCode");
  const caseId = text(form, "caseId");
  const days = text(form, "days");
  const value = text(form, "value");

  await runOwner(form, "/admin/fraud/blocks", "Blokir dibuat.", (owner) => {
    if (!BLOCK_TYPES.includes(type) || !isBlockReasonCode(reasonCode)) {
      throw new FraudValidationError("invalid_identifier", "Choose a type and a reason code.");
    }
    return createManualBlock(owner, {
      caseId: caseId || null,
      days: days ? Number.parseInt(days, 10) : undefined,
      reason: text(form, "reason"),
      reasonCode,
      target: type === "account" ? { type, userId: value } : { type, value },
    });
  });
}

async function liftBlockAction(form: FormData) {
  const blockId = text(form, "blockId");
  await runOwner(form, `/admin/fraud/blocks/${blockId}`, "Blokir dicabut.", (owner) =>
    liftBlock(owner, { blockId, expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function renewBlockAction(form: FormData) {
  const blockId = text(form, "blockId");
  const days = text(form, "days");
  await runOwner(form, `/admin/fraud/blocks/${blockId}`, "Blokir diperpanjang.", (owner) =>
    renewBlock(owner, { blockId, days: days ? Number.parseInt(days, 10) : undefined, expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

async function fileAppealAction(form: FormData) {
  const blockId = text(form, "blockId");
  await runOwner(form, `/admin/fraud/blocks/${blockId}`, "Banding dicatat.", (owner) =>
    fileAppeal(owner, { blockId, channel: text(form, "channel"), expectedBlockVersion: integer(form, "version"), summary: text(form, "summary") }),
  );
}

async function decideAppealAction(form: FormData) {
  const blockId = text(form, "blockId");
  const decision = text(form, "decision");
  await runOwner(form, `/admin/fraud/blocks/${blockId}`, decision === "granted" ? "Banding dikabulkan dan blokir dicabut." : "Banding ditolak.", (owner) => {
    if (decision !== "granted" && decision !== "denied") throw new FraudValidationError("invalid_reason", "Choose a decision.");
    return decideAppeal(owner, { appealId: text(form, "appealId"), decision, expectedVersion: integer(form, "version"), reason: text(form, "reason") });
  });
}

async function reopenAppealAction(form: FormData) {
  const blockId = text(form, "blockId");
  await runOwner(form, `/admin/fraud/blocks/${blockId}`, "Banding dibuka kembali.", (owner) =>
    reopenAppeal(owner, { appealId: text(form, "appealId"), expectedVersion: integer(form, "version"), reason: text(form, "reason") }),
  );
}

export {
  acknowledgeCaseAction,
  closeCaseAction,
  createBlockAction,
  decideAppealAction,
  escalateCaseAction,
  fileAppealAction,
  liftBlockAction,
  linkBlockAction,
  reopenAppealAction,
  reopenCaseAction,
  renewBlockAction,
};
