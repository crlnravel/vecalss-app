import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { participantTryoutDetail } from "@/lib/tryout/participant-repository";
import { ParticipantTryoutDetailModule } from "@/modules/tryout/ParticipantTryoutDetailModule";

export const metadata: Metadata = { title: "Detail Tryout | Vecalss LMS" };

export default async function ParticipantTryoutDetailPage({
  params,
}: {
  params: Promise<{ tryoutId: string }>;
}) {
  const [{ tryoutId }, session] = await Promise.all([params, requireStudentSession()]);
  const tryout = await participantTryoutDetail(tryoutId, session.user.id);
  if (!tryout) notFound();
  return <ParticipantTryoutDetailModule session={session} tryout={tryout} />;
}
