import type { SessionContext } from "@/lib/auth/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";
import type { Course } from "./data";

function CourseCataloguePageModule({
  courses,
  session,
}: {
  courses: Course[];
  session: SessionContext;
}) {
  const defaultCourse = courses.find((course) => course.slug === "pemahaman-bacaan-menulis") ?? courses[0];

  if (!defaultCourse) {
    return null;
  }

  return (
    <CourseLearningPathPageModule
      course={defaultCourse}
      courses={courses}
      session={session}
    />
  );
}

export { CourseCataloguePageModule };
