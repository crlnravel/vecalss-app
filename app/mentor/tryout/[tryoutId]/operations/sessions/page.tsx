import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutHref } from "@/lib/navigation/canonical-context";

export default async function TryoutSessionsPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }] = await Promise.all([params, requireTutorSession()]);
  redirect(buildMentorTryoutHref(tryoutId, { workspace: "operations" }));
}
