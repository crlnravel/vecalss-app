import { requireStudentSession } from "@/lib/auth/access";
import { getStudentBannerContents } from "@/lib/student/banner-repository";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizPage() {
  const session = await requireStudentSession();
  const [subjects, banners] = await Promise.all([
    getAvailableQuizSubjects(session.user.id),
    getStudentBannerContents(),
  ]);

  return <QuizCataloguePageModule banner={banners.kuis} session={session} subjects={subjects} />;
}
