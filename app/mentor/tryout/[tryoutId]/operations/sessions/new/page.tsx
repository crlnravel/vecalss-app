import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { buildMentorTryoutHref } from "@/lib/navigation/canonical-context";

export const metadata: Metadata = { title: "Buat Sesi Tryout | Vecalss LMS" };

export default async function NewTryoutSessionPage({
  params,
}: {
  params: Promise<{ tryoutId: string }>;
}) {
  const [{ tryoutId }] = await Promise.all([
    params,
    requireTutorSession(),
  ]);
  redirect(buildMentorTryoutHref(tryoutId, { workspace: "operations" }));
}
