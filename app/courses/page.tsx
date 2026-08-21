import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
import { getCourseProgressSnapshots } from "@/lib/materi/progress";
import { getPublishedStudentBannerContents } from "@/lib/student/banner-repository";
import { CourseCataloguePageModule } from "@/modules/courses/CourseCataloguePageModule";
import { toCourseCatalogue } from "@/modules/courses/data";

export default async function CoursesPage() {
  const session = await requireStudentSession();
  const [publishedCourses, banners, notificationFeed] = await Promise.all([
    getPublishedCourseCatalogue(),
    getPublishedStudentBannerContents(),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  return <CourseCataloguePageModule banner={banners.materi} courses={toCourseCatalogue(publishedCourses)} notificationFeed={notificationFeed} progress={progress} session={session} />;
}
