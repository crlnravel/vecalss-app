import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutHref, parseMentorTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";

export const metadata: Metadata = { title: "Kebijakan Tryout | PTN Pro LMS" };

export default async function TryoutPolicyPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  await requireTutorSession();
  const { tryoutId } = await params;
  const parsed = parseMentorTryoutContext(await searchParams);
  if (parsed.issues.length) notFound();
  redirect(buildMentorTryoutHref(tryoutId, { ...parsed, workspace: "operations", delivery: "policy" }));
}
