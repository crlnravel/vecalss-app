import type { SessionContext } from "@/lib/auth/types";
import type { StudentNotificationFeed } from "@/lib/notifications/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";
import type { Course, CourseProgressSnapshot } from "./data";

function CourseDetailPageModule({
  course,
  courses,
  notificationFeed,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  notificationFeed?: StudentNotificationFeed;
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return <CourseLearningPathPageModule course={course} courses={courses} notificationFeed={notificationFeed} progress={progress} session={session} />;
}

export { CourseDetailPageModule };
