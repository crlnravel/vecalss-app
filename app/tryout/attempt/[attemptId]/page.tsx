import { requireStudentSession } from "@/lib/auth/access";
import { ParticipantAttemptModule } from "@/modules/tryout/ParticipantAttemptModule";

export default async function TryoutAttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  await requireStudentSession();
  const { attemptId } = await params;
  return <ParticipantAttemptModule attemptId={attemptId} />;
}
