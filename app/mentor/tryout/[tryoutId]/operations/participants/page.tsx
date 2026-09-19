import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import {
  buildMentorTryoutHref,
  parseMentorTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";

export const metadata: Metadata = { title: "Peserta Tryout | Vecalss LMS" };

export default async function TryoutParticipantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tryoutId: string }>;
  searchParams: Promise<Record<string, NavigationQueryValue>>;
}) {
  const { tryoutId } = await params;
  await requireTutorSession();
  const parsed = parseMentorTryoutContext(await searchParams);
  redirect(
    buildMentorTryoutHref(tryoutId, {
      parent: parsed.parent,
      workspace: "participants",
    }),
  );
}
