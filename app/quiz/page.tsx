import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedStudentBannerPresentation } from "@/lib/student/banner-reader";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizPage() {
  const session = await requireStudentSession();
  const [subjects, banners, notificationFeed] = await Promise.all([
    getAvailableQuizSubjects(session.user.id),
    getPublishedStudentBannerPresentation("kuis"),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);

  return <QuizCataloguePageModule banner={banners} notificationFeed={notificationFeed} session={session} subjects={subjects} />;
}
