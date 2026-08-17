import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getPublishedCourseCatalogue, getPublishedLesson } from "@/lib/materi/repository";
import { getCourseProgressSnapshots } from "@/lib/materi/progress";
import { CourseLessonPageModule } from "@/modules/courses/CourseLessonPageModule";
import { getCourseBySlug, getCourseLesson, toCourseCatalogue } from "@/modules/courses/data";

export default async function CourseLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string; slug: string }>;
}) {
  const session = await requireStudentSession();
  const { lessonId: encodedLessonId, slug } = await params;
  let lessonId: string;
  try {
    lessonId = decodeURIComponent(encodedLessonId);
  } catch {
    notFound();
  }
  const [publishedCourses, publishedLesson, notificationFeed] = await Promise.all([
    getPublishedCourseCatalogue(),
    getPublishedLesson(slug, lessonId),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  const courses = toCourseCatalogue(publishedCourses);
  const course = getCourseBySlug(courses, slug);
  const catalogueLesson = course ? getCourseLesson(course, lessonId) : undefined;

  if (!course || !catalogueLesson || !publishedLesson) {
    notFound();
  }

  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  // Reuse the canonical single-lesson DTO for the reader resource. Managed
  // documents still carry metadata only; the short-lived delivery URL is
  // resolved by the student-safe route after the UI lock has passed.
  const lesson = {
    ...catalogueLesson,
    document: { ...publishedLesson.document, url: null },
    optionalVideo: publishedLesson.optionalVideo,
  };

  return (
    <CourseLessonPageModule
      course={course}
      courses={courses}
      lesson={lesson}
      notificationFeed={notificationFeed}
      progress={progress}
      session={session}
    />
  );
}
