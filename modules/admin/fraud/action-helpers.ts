import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { requireAdmin, requireOwner, type AdminContext, type OwnerContext } from "@/lib/fraud/authority";
import { describeRefundError } from "@/lib/refunds/errors";
import { serverLogger } from "@/lib/server-logger";

/**
 * What every fraud and refund server action shares. Each one re-authenticates
 * on the server (a verified second-factor admin session), then checks owner
 * authority where the action needs it, whatever the page showed. A failure goes
 * back to the page with a plain-language message; a success goes back with a
 * short confirmation. Nothing here trusts a hidden field except the version
 * number, and that is only ever used to detect a concurrent change.
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
  return /^\/admin\/fraud(\/(orders|refunds))?(\/[0-9a-f-]{36}){0,2}$/iu.test(value) || value === "/admin/fraud/blocks" ? value : fallback;
}

/** Errors the interface already explains in words; anything else is logged. */
function isKnownFailure(error: unknown) {
  return error instanceof Error && (error.name.startsWith("Fraud") || error.name === "RefundError");
}

async function runAdmin(form: FormData, fallback: string, done: string, work: (admin: AdminContext) => Promise<unknown>): Promise<never> {
  const session = await requireAdminSession();
  const target = safeReturn(form, fallback);
  let outcome: Record<string, string>;

  try {
    await work(requireAdmin(session));
    outcome = { done };
  } catch (error) {
    if (!isKnownFailure(error)) serverLogger.error("fraud.action.failed", error, { area: "fraud" });
    outcome = { error: describeRefundError(error) };
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
    if (!isKnownFailure(error)) serverLogger.error("fraud.action.failed", error, { area: "fraud" });
    outcome = { error: describeRefundError(error) };
  }

  revalidatePath("/admin/fraud", "layout");
  redirect(pathWith(target, outcome));
}

export { integer, pathWith, runAdmin, runOwner, safeReturn, text };
