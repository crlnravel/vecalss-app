"use client";

import { useSearchParams } from "next/navigation";
import { SunkenTabLink, SunkenTabNavigation } from "@/components/ui/sunken-tabs";
import { buildMentorTryoutOperationsHref, parseMentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

export function TryoutOperationsNavigation({ initial, active, parentId, pendingCount }: {
  initial: Pick<TryoutOperationsView, "id" | "participants">;
  active: "sessions" | "policy" | "participants";
  parentId?: string;
  pendingCount?: number;
}) {
  const query = useSearchParams();
  const context = parseMentorTryoutContext(query);
  const count = pendingCount ?? initial.participants.filter((participant) => participant.admission.status === "pending").length;
  return <SunkenTabNavigation aria-label="Bagian operasional">
    <SunkenTabLink className="px-3 sm:px-4" href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "sessions", parent: parentId ?? context.parent })} selected={active === "sessions"} aria-current={active === "sessions" ? "page" : undefined}>Jadwal</SunkenTabLink>
    <SunkenTabLink className="px-3 sm:px-4" href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "policy", parent: parentId ?? context.parent })} selected={active === "policy"} aria-current={active === "policy" ? "page" : undefined}>Akses peserta</SunkenTabLink>
    <SunkenTabLink className="px-3 sm:px-4" href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "participants", parent: parentId ?? context.parent })} selected={active === "participants"} aria-current={active === "participants" ? "page" : undefined}>Peserta{count ? ` (${count})` : ""}</SunkenTabLink>
  </SunkenTabNavigation>;
}
