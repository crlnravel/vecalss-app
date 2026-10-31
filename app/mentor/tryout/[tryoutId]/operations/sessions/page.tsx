import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutHref, parseMentorTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";

export default async function TryoutSessionsPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ tryoutId }] = await Promise.all([params, requireTutorSession()]);
  const parsed = parseMentorTryoutContext(await searchParams);
  if (parsed.issues.length) notFound();
  redirect(buildMentorTryoutHref(tryoutId, { ...parsed, workspace: "operations", delivery: "sessions" }));
}
