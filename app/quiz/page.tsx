import { requireStudentSession } from "@/lib/auth/access";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizPage() {
  const [session, subjects] = await Promise.all([requireStudentSession(), getAvailableQuizSubjects()]);

  return <QuizCataloguePageModule session={session} subjects={subjects} />;
}
