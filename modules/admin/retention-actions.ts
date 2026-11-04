"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth/access";
import { requireOwner } from "@/lib/fraud/authority";
import { describeFraudError } from "@/lib/fraud/messages";
import { describeRetentionError, RetentionError } from "@/lib/retention/errors";
import { CASE_KINDS, placeLegalHold, type CaseKind, type HoldScope } from "@/lib/retention/holds";
import { serverLogger } from "@/lib/server-logger";

/**
 * Server actions behind the retention panel on the order page. Owner only, with
 * a verified second factor and a written reason: each one re-authenticates on
 * the server and checks owner authority again whatever the page showed.
 */

const UUID = /^[0-9a-f-]{36}$/iu;

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** "order:<id>", "buyer:<id>" or "case:<kind>:<id>" from the select on the page. */
function parseTarget(value: string): { caseKind: CaseKind | null; scope: HoldScope; subjectId: string } | null {
  const [scope, second, third] = value.split(":");
  if ((scope === "order" || scope === "buyer") && UUID.test(second ?? "")) return { caseKind: null, scope, subjectId: second };
  if (scope === "case" && CASE_KINDS.includes(second as CaseKind) && UUID.test(third ?? "")) {
    return { caseKind: second as CaseKind, scope, subjectId: third };
  }
  return null;
}

async function run(form: FormData, done: string, work: (owner: ReturnType<typeof requireOwner>) => Promise<unknown>): Promise<never> {
  const session = await requireAdminSession();
  const orderId = text(form, "orderId");
  const page = UUID.test(orderId) ? `/admin/fraud/orders/${orderId}` : "/admin/fraud/orders";
  let outcome: Record<string, string>;

  try {
    await work(requireOwner(session));
    outcome = { done };
  } catch (error) {
    const known = describeRetentionError(error);
    if (!known && !(error instanceof Error && error.name.startsWith("Fraud"))) {
      serverLogger.error("retention.action.failed", error, { area: "retention" });
    }
    outcome = { error: known ?? describeFraudError(error) };
  }

  revalidatePath("/admin/fraud", "layout");
  redirect(`${page}?${new URLSearchParams(outcome)}`);
}

async function placeHoldAction(form: FormData) {
  const target = parseTarget(text(form, "target"));
  await run(form, "Penahanan dipasang. Data ini tidak akan dihapus selama penahanan aktif.", (owner) => {
    if (!target) throw new RetentionError("invalid_subject", "Unknown hold target.");
    return placeLegalHold(owner, { ...target, reason: text(form, "reason") });
  });
}

export { placeHoldAction };
