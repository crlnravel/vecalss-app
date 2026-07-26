import { requireStudentSession } from "@/lib/auth/access";
import { ParticipantResultModule } from "@/modules/tryout/ParticipantResultModule";

export default async function TryoutResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requireStudentSession();
  const { attemptId } = await params;
  return <ParticipantResultModule attemptId={attemptId} />;
}
