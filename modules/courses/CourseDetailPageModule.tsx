import type { SessionContext } from "@/lib/auth/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";
import type { Course, CourseProgressSnapshot } from "./data";

function CourseDetailPageModule({
  course,
  courses,
  progress,
  session,
}: {
  course: Course;
  courses: Course[];
  progress: Record<string, CourseProgressSnapshot>;
  session: SessionContext;
}) {
  return <CourseLearningPathPageModule course={course} courses={courses} progress={progress} session={session} />;
}

export { CourseDetailPageModule };
