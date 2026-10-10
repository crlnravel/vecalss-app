import { SunkenTabLink, SunkenTabNavigation } from "@/components/ui/sunken-tabs";
import { buildMentorTryoutOperationsHref } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

export function TryoutOperationsNavigation({ initial, active, parentId, pendingCount }: {
  initial: Pick<TryoutOperationsView, "id" | "participants">;
  active: "sessions" | "participants";
  parentId?: string;
  pendingCount?: number;
}) {
  const count = pendingCount ?? initial.participants.filter((participant) => participant.admission.status === "pending").length;
  return <SunkenTabNavigation aria-label="Bagian operasional">
    <SunkenTabLink href={buildMentorTryoutOperationsHref(initial.id, { delivery: "sessions", parent: parentId })} selected={active === "sessions"} aria-current={active === "sessions" ? "page" : undefined}>Jadwal</SunkenTabLink>
    <SunkenTabLink href={buildMentorTryoutOperationsHref(initial.id, { delivery: "participants", parent: parentId })} selected={active === "participants"} aria-current={active === "participants" ? "page" : undefined}>Peserta{count ? ` (${count})` : ""}</SunkenTabLink>
  </SunkenTabNavigation>;
}
