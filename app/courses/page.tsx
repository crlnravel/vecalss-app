import { requireStudentSession } from "@/lib/auth/access";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
import { getCourseProgressSnapshots } from "@/lib/materi/progress";
import { CourseCataloguePageModule } from "@/modules/courses/CourseCataloguePageModule";
import { toCourseCatalogue } from "@/modules/courses/data";

export default async function CoursesPage() {
  const session = await requireStudentSession();
  const publishedCourses = await getPublishedCourseCatalogue();
  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  return <CourseCataloguePageModule courses={toCourseCatalogue(publishedCourses)} progress={progress} session={session} />;
}
