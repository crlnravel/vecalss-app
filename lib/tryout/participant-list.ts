import type { MentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { participantStatus, type ParticipantStatus } from "@/lib/tryout/participant-status";

export const PARTICIPANT_PAGE_SIZE = 10;

/** Filter the complete authorized projection before pagination. Never filter a visible page. */
export function queryTryoutParticipants(view: Pick<TryoutOperationsView, "participants">, context: Partial<MentorTryoutContext>) {
  const pendingCount = view.participants.filter((participant) => participant.admission.status === "pending").length;
  // The URL value is validated by parseMentorTryoutContext before it reaches this query.
  const status = (context.status ?? (pendingCount && !context.q ? "pending" : "all")) as "all" | ParticipantStatus;
  const q = context.q?.trim().toLocaleLowerCase("id-ID") ?? "";
  const matching = view.participants.filter((participant) =>
    (status === "all" || participantStatus(participant) === status)
    && (!q || `${participant.participant.displayName} ${participant.participant.email}`.toLocaleLowerCase("id-ID").includes(q)),
  );
  const pageSize = context.pageSize ?? PARTICIPANT_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(context.page ?? 1, pages);
  return { page, pageSize, pages, pendingCount, rows: matching.slice((page - 1) * pageSize, page * pageSize), status, total: matching.length };
}
