import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
import { getCourseProgressSnapshots } from "@/lib/materi/progress";
import { getPublishedStudentBannerPresentation } from "@/lib/student/banner-reader";
import { CourseCataloguePageModule } from "@/modules/courses/CourseCataloguePageModule";
import { toCourseCatalogue } from "@/modules/courses/data";

export default async function CoursesPage() {
  const session = await requireStudentSession();
  const [publishedCourses, banners, notificationFeed] = await Promise.all([
    getPublishedCourseCatalogue(),
    getPublishedStudentBannerPresentation("materi"),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  return <CourseCataloguePageModule banner={banners} courses={toCourseCatalogue(publishedCourses)} notificationFeed={notificationFeed} progress={progress} session={session} />;
}
