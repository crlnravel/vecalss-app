import { requireStudentSession } from "@/lib/auth/access";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
import { CourseCataloguePageModule } from "@/modules/courses/CourseCataloguePageModule";
import { toCourseCatalogue } from "@/modules/courses/data";

export default async function CoursesPage() {
  const session = await requireStudentSession();
  const publishedCourses = await getPublishedCourseCatalogue();

  return <CourseCataloguePageModule courses={toCourseCatalogue(publishedCourses)} session={session} />;
}
