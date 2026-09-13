import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

export default async function TryoutSessionsPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  const [{ tryoutId }] = await Promise.all([params, requireTutorSession()]);
  redirect(`/mentor/tryout/${tryoutId}/operations`);
}
