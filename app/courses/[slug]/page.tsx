import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
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
  const [{ slug }, publishedCourses, notificationFeed] = await Promise.all([
    params,
    getPublishedCourseCatalogue(),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  const courses = toCourseCatalogue(publishedCourses);
  const course = getCourseBySlug(courses, slug);

  if (!course) {
    notFound();
  }

  const progress = await getCourseProgressSnapshots(session.user.id, publishedCourses);

  return <CourseDetailPageModule course={course} courses={courses} notificationFeed={notificationFeed} progress={progress} session={session} />;
}
