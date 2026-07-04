import { requireStudentSession } from "@/lib/auth/access";
import { VeraAiPageModule } from "@/modules/vera-ai/VeraAiPageModule";

export default async function VeraAiPage() {
  const session = await requireStudentSession();

  return <VeraAiPageModule session={session} />;
}
