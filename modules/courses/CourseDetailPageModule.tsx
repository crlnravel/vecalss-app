import type { SessionContext } from "@/lib/auth/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";

function CourseDetailPageModule({
  courseSlug,
  session,
}: {
  courseSlug: string;
  session: SessionContext;
}) {
  return <CourseLearningPathPageModule courseSlug={courseSlug} session={session} />;
}

export { CourseDetailPageModule };
