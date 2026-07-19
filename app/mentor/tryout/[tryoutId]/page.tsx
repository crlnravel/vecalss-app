import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { PersistedTryoutBuilderRoute } from "@/modules/mentor/PersistedTryoutBuilderRoute";

export const metadata: Metadata = { title: "Edit Tryout Kapten | Vecalss LMS" };

export default async function TryoutPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }, session] = await Promise.all([params, requireTutorSession()]);
  return <PersistedTryoutBuilderRoute id={tryoutId} session={session} />;
}
