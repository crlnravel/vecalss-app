import { Suspense } from "react";

import { requireStudentSession } from "@/lib/auth/access";
import { canonicalContextMessage, parseStudentContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";
import { VeraAiPageModule } from "@/modules/vera-ai/VeraAiPageModule";

export default async function VeraAiPage({ searchParams }: { searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const session = await requireStudentSession();
  const [notificationFeed, query] = await Promise.all([
    getStudentNotificationFeed({ userId: session.user.id }),
    searchParams,
  ]);
  const context = parseStudentContext(query);
  if (context.issues.length) {
    return (
      <CourseWorkspaceShell activeLabel="Vera AI" breadcrumbLabel="Vera AI" notificationFeed={notificationFeed} session={session} showSearch={false}>
        <section aria-labelledby="vera-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg" role="alert">
          <h1 className="text-lg font-semibold" id="vera-context-unavailable">Konteks Vera tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(context.issues)}</p>
        </section>
      </CourseWorkspaceShell>
    );
  }

  return (
    <Suspense fallback={<div className="student-page-canvas min-h-svh" />}>
      <VeraAiPageModule notificationFeed={notificationFeed} returnToHref={context.returnTo} session={session} />
    </Suspense>
  );
}
