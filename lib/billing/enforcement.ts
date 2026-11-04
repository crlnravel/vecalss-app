import { recordPaidUse } from "@/lib/fulfillment/usage";

import { hasPaidAccess } from "./service";

/**
 * "Everything is paid" is built but switched off. Only an explicit on value turns
 * enforcement on; anything else, including a typo, leaves students exactly as
 * they are today, which is the safe current behaviour.
 */
function isPaidAccessEnforced(env: Partial<Record<string, string | undefined>> = process.env) {
  const value = env.PAID_ACCESS_ENFORCED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/**
 * Whether a student may use the paid learning surfaces. With enforcement off
 * this is always true and does not touch the database.
 */
async function studentMayUsePaidSurfaces(
  studentId: string,
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  if (!isPaidAccessEnforced(env)) return true;
  return hasPaidAccess(studentId);
}

/**
 * The check a paid surface makes on entry: may this student in, and if so,
 * note the use (at most once per grant per Jakarta day, and only for current,
 * payment-sourced access; see lib/fulfillment/usage). The switch decides who is
 * let in, not whether use is recorded.
 * Pages that only ask "would this student be let in?" (the page that explains a
 * missing package) use `studentMayUsePaidSurfaces` and record nothing.
 */
async function enterPaidSurface(
  studentId: string,
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  const allowed = await studentMayUsePaidSurfaces(studentId, env);
  // The gate decision above is the only thing the switch controls. Use is
  // recorded either way: with the paywall off everyone is let in, and a student
  // whose access came from a payment still leaves evidence of using it.
  if (allowed) await recordPaidUse(studentId);
  return allowed;
}

/** Shown on the page that explains a denial, and sent by API routes. */
const PAID_ACCESS_REQUIRED_MESSAGE =
  "Fitur ini belum termasuk dalam paketmu. Lihat paket yang tersedia untuk melanjutkan belajar.";

/** Student API routes answer 403 with this when a student has no access. */
async function paidAccessDenial(
  session: { user: { id: string } },
  env: Partial<Record<string, string | undefined>> = process.env,
) {
  if (await enterPaidSurface(session.user.id, env)) return null;

  return Response.json(
    { code: "paid_access_required", message: PAID_ACCESS_REQUIRED_MESSAGE },
    { headers: { "Cache-Control": "no-store, max-age=0" }, status: 403 },
  );
}

export {
  PAID_ACCESS_REQUIRED_MESSAGE,
  enterPaidSurface,
  isPaidAccessEnforced,
  paidAccessDenial,
  studentMayUsePaidSurfaces,
};
