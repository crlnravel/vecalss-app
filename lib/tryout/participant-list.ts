import type { MentorTryoutContext } from "@/lib/navigation/canonical-context";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

export const PARTICIPANT_PAGE_SIZE = 10;
export function participantAccess(participant: TryoutOperationsView["participants"][number], sessionId?: string) {
  const assignment = participant.sessions.find((session) => session.id === sessionId);
  return assignment?.assignmentStatus === "active" ? "active" : assignment ? "revoked" : "missing";
}

/** Filter the complete authorized projection before pagination. Never filter a visible page. */
export function queryTryoutParticipants(view: Pick<TryoutOperationsView, "participants" | "sessions">, context: Partial<MentorTryoutContext>) {
  const pendingCount = view.participants.filter((participant) => participant.admission.status === "pending").length;
  const access = context.access ?? "all";
  const status = context.status ?? (pendingCount && access === "all" && !context.q ? "pending" : "all");
  const q = context.q?.trim().toLocaleLowerCase("id-ID") ?? "";
  const main = selectMainTryoutSession(view.sessions);
  const matching = view.participants.filter((participant) =>
    (status === "all" || participant.admission.status === status)
    && (access === "all" || participantAccess(participant, main?.id) === access)
    && (!q || `${participant.participant.displayName} ${participant.participant.email}`.toLocaleLowerCase("id-ID").includes(q)),
  );
  const pages = Math.max(1, Math.ceil(matching.length / PARTICIPANT_PAGE_SIZE));
  const page = Math.min(context.page ?? 1, pages);
  return { access, page, pages, pendingCount, rows: matching.slice((page - 1) * PARTICIPANT_PAGE_SIZE, page * PARTICIPANT_PAGE_SIZE), status, total: matching.length };
}
