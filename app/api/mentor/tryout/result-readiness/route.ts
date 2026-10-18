import { RoleName } from "@/generated/prisma/client";
import { getReadOnlySessionContext, hasRole } from "@/lib/auth/session";
import { requireTryoutCapability } from "@/lib/tryout/capabilities";
import { inspectTryoutSessionReadiness } from "@/lib/tryout/result-repository";
import { serveTryoutReadinessInspection } from "@/lib/tryout/result-readiness-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export function GET(request: Request) {
  return serveTryoutReadinessInspection(request, {
    getSession: getReadOnlySessionContext,
    authorize(session) { requireTryoutCapability(session, "tryout.results.manage"); return { allowCrossOwner: hasRole(session, RoleName.admin) }; },
    read: inspectTryoutSessionReadiness,
  });
}
