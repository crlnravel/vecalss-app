import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getStudentBannerContents } from "@/lib/student/banner-repository";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizPage() {
  const session = await requireStudentSession();
  const [subjects, banners, notificationFeed] = await Promise.all([
    getAvailableQuizSubjects(session.user.id),
    getStudentBannerContents(),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);

  return <QuizCataloguePageModule banner={banners.kuis} notificationFeed={notificationFeed} session={session} subjects={subjects} />;
}
