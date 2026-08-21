import "server-only";

import {
  requireAdminStudentPreviewContext,
} from "@/lib/auth/access";
import type { AdminStudentPreviewContext } from "@/lib/admin/student-preview";

/**
 * Preview reads are intentionally narrower than ordinary student reads. The
 * callback receives only the server-resolved admin-preview context and has no
 * write/action capability to pass on to a presentation component.
 *
 * Keep this boundary at the service layer. A page or route handler may call a
 * dedicated read entry point, but it must not call a learner loader and add a
 * boolean preview flag after the fact.
 */
class PreviewReadBoundary {
  static readonly forbiddenEffects = [
    "database-write",
    "queue-enqueue",
    "event-publish",
    "analytics",
    "redis-write",
    "notification",
    "webhook",
    "external-write",
    "delayed-job",
    "learner-progress",
    "hidden-enrollment",
  ] as const;

  static async run<T>(
    read: (context: AdminStudentPreviewContext) => Promise<T>,
  ): Promise<PreviewReadResult<T>> {
    const context = await requireAdminStudentPreviewContext();

    return {
      context,
      data: await read(context),
    };
  }
}

type PreviewReadResult<T> = {
  context: AdminStudentPreviewContext;
  data: T;
};

export { PreviewReadBoundary };
export type { PreviewReadResult };
