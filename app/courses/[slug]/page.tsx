import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
import { getCourseProgressSnapshots } from "@/lib/materi/progress";
import { CourseDetailPageModule } from "@/modules/courses/CourseDetailPageModule";
import { getCourseBySlug, toCourseCatalogue } from "@/modules/courses/data";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireStudentSession();
  const [{ slug }, publishedCourses] = await Promise.all([
    params,
    getPublishedCourseCatalogue(),
  ]);
  const courses = toCourseCatalogue(publishedCourses);
  const course = getCourseBySlug(courses, slug);

  if (!course) {
    notFound();
  }

  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  return <CourseDetailPageModule course={course} courses={courses} progress={progress} session={session} />;
}
