import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import {
  buildStudentTryoutHref,
  canonicalContextMessage,
  parseStudentTryoutContext,
  type NavigationQueryValue,
} from "@/lib/navigation/canonical-context";
import { CourseWorkspaceShell } from "@/modules/courses/CourseWorkspaceShell";

export default async function TryoutRegistrationPage({ params, searchParams }: { params: Promise<{ tryoutId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const { tryoutId } = await params;
  const [session, query] = await Promise.all([requireStudentSession(), searchParams]);
  const parsed = parseStudentTryoutContext(query);
  if (parsed.issues.length) {
    return (
      <CourseWorkspaceShell activeLabel="Tryout" breadcrumbLabel="Pendaftaran tryout" session={session} showSearch={false}>
        <section aria-labelledby="student-register-context-unavailable" className="rounded-3xl border border-student-status-danger-border bg-student-status-danger-bg px-5 py-8 text-student-status-danger-fg" role="alert">
          <h1 className="text-lg font-semibold" id="student-register-context-unavailable">Konteks pendaftaran tidak tersedia</h1>
          <p className="mt-2 text-sm leading-6">{canonicalContextMessage(parsed.issues)}</p>
        </section>
      </CourseWorkspaceShell>
    );
  }
  redirect(buildStudentTryoutHref(tryoutId, { returnTo: parsed.returnTo, session: parsed.session }));
}
