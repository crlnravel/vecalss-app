import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

export default async function VeraAiPage() {
  const session = await requireStudentSession();
  const notificationFeed = await getStudentNotificationFeed({ userId: session.user.id });

  return (
    <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
      <section aria-labelledby="vera-placeholder-title" className="rounded-3xl border border-border bg-card px-5 py-8 text-card-foreground">
        <h1 className="text-lg font-semibold" id="vera-placeholder-title">Vera sedang disiapkan.</h1>
      </section>
    </CourseWorkspaceShell>
  );
}
