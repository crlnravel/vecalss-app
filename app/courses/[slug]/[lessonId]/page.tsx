import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getPublishedCourseCatalogue, getPublishedLesson } from "@/lib/materi/repository";
import { CourseLessonPageModule } from "@/modules/courses/CourseLessonPageModule";
import { getCourseBySlug, getCourseLesson, toCourseCatalogue } from "@/modules/courses/data";

export default async function CourseLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string; slug: string }>;
}) {
  const session = await requireStudentSession();
  const { lessonId, slug } = await params;
  const [publishedCourses, publishedLesson] = await Promise.all([
    getPublishedCourseCatalogue(),
    getPublishedLesson(slug, lessonId),
  ]);
  const courses = toCourseCatalogue(publishedCourses);
  const course = getCourseBySlug(courses, slug);
  const lesson = course ? getCourseLesson(course, lessonId) : undefined;

  if (!course || !lesson || !publishedLesson) {
    notFound();
  }

  return (
    <CourseLessonPageModule
      course={course}
      courses={courses}
      lesson={lesson}
      session={session}
    />
  );
}
