import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getPublishedCourseCatalogue } from "@/lib/materi/repository";
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

  return <CourseDetailPageModule course={course} courses={courses} session={session} />;
}
