import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedStudentBannerPresentation } from "@/lib/student/banner-reader";
import { getStudentBannerVariablesForUser } from "@/lib/student/banner-variables";
import { QuizCataloguePageModule } from "@/modules/quiz/QuizCataloguePageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizPage() {
  const session = await requireStudentSession();
  const [subjects, banners, notificationFeed, bannerVariables] = await Promise.all([
    getAvailableQuizSubjects(session.user.id),
    getPublishedStudentBannerPresentation("kuis"),
    getStudentNotificationFeed({ userId: session.user.id }),
    getStudentBannerVariablesForUser(session.user.id, session.user.fullName),
  ]);

  return <QuizCataloguePageModule banner={banners} bannerVariables={bannerVariables} notificationFeed={notificationFeed} session={session} subjects={subjects} />;
}
