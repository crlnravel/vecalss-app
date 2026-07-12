import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { CourseDetailPageModule } from "@/modules/courses/CourseDetailPageModule";
import { courseCatalogue, getCourseBySlug } from "@/modules/courses/data";

export function generateStaticParams() {
  return courseCatalogue.map((course) => ({
    slug: course.slug,
  }));
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);
  const course = getCourseBySlug(slug);

  if (!course) {
    notFound();
  }

  return <CourseDetailPageModule courseSlug={course.slug} session={session} />;
}
