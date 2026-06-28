import { requireStudentSession } from "@/lib/auth/access";
import { CourseCataloguePageModule } from "@/modules/courses/CourseCataloguePageModule";

export default async function CoursesPage() {
  const session = await requireStudentSession();

  return <CourseCataloguePageModule session={session} />;
}
