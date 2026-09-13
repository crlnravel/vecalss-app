import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Kebijakan Tryout | Vecalss LMS" };

export default async function TryoutPolicyPage({ params }: { params: Promise<{ tryoutId: string }> }) {
  await requireTutorSession();
  const { tryoutId } = await params;
  redirect(`/mentor/tryout/${tryoutId}/operations`);
}
