import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutHref,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";

export const metadata: Metadata = { title: "Operasional Tryout | PTN Pro LMS" };

export default async function TryoutOperationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const { tryoutId } = await params;
  await requireTutorSession();
  const parsed = parseMentorTryoutContext(await searchParams);
  if (parsed.issues.length) notFound();
  redirect(
    buildMentorTryoutHref(tryoutId, {
      ...parsed,
      workspace: "operations",
    }),
  );
}
