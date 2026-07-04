import { requireStudentSession } from "@/lib/auth/access";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";

export default async function QuizPage() {
  const session = await requireStudentSession();

  return <QuizCataloguePageModule session={session} />;
}
