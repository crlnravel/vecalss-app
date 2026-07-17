import type { SessionContext } from "@/lib/auth/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";
import type { Course } from "./data";

function CourseDetailPageModule({
  course,
  courses,
  session,
}: {
  course: Course;
  courses: Course[];
  session: SessionContext;
}) {
  return <CourseLearningPathPageModule course={course} courses={courses} session={session} />;
}

export { CourseDetailPageModule };
