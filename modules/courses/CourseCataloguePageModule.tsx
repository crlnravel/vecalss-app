"use client";

import type { SessionContext } from "@/lib/auth/types";

import { CourseLearningPathPageModule } from "./CourseLearningPathPageModule";
import { courseCatalogue, getCourseBySlug } from "./data";

const defaultCourseSlug = (getCourseBySlug("pemahaman-bacaan-menulis") ?? courseCatalogue[0]).slug;

function CourseCataloguePageModule({ session }: { session: SessionContext }) {
  return <CourseLearningPathPageModule courseSlug={defaultCourseSlug} session={session} />;
}

export { CourseCataloguePageModule };
