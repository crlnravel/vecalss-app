import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { CourseLessonPageModule } from "@/modules/courses/CourseLessonPageModule";
import {
  courseCatalogue,
  getCourseBySlug,
  getCourseLesson,
  getCourseLessons,
} from "@/modules/courses/data";

export function generateStaticParams() {
  return courseCatalogue.flatMap((course) =>
    getCourseLessons(course).map((lesson) => ({
      lessonId: lesson.id,
      slug: course.slug,
    })),
  );
}

export default async function CourseLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string; slug: string }>;
}) {
  const [{ lessonId, slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);
  const course = getCourseBySlug(slug);
  const lesson = course ? getCourseLesson(course, lessonId) : undefined;

  if (!course || !lesson) {
    notFound();
  }

  return (
    <CourseLessonPageModule
      courseSlug={course.slug}
      lessonId={lesson.id}
      session={session}
    />
  );
}
