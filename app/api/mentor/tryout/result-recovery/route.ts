import { getReadOnlySessionContext } from "@/lib/auth/session";
import { inspectTryoutCalculation } from "@/lib/tryout/result-repository";
import { serveTryoutCalculationInspection } from "@/lib/tryout/result-recovery-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return serveTryoutCalculationInspection(request, { getSession: getReadOnlySessionContext, read: inspectTryoutCalculation });
}
