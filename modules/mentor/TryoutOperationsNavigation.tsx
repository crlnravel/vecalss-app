"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { SunkenTabLink, SunkenTabNavigation } from "@/components/ui/sunken-tabs";
import { CalendarDays, ShieldCheck, Users } from "@/lib/icons";
import { buildMentorTryoutOperationsHref, parseMentorTryoutContext } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

type TryoutOperationsSection = "sessions" | "policy" | "participants";
type TryoutOperationsNavigationProps = {
  initial: Pick<TryoutOperationsView, "id" | "participants">;
  active: TryoutOperationsSection;
  parentId?: string;
  pendingCount?: number;
};

const tabClassName = "h-auto max-w-full whitespace-normal px-3 sm:px-4 md:w-full md:justify-start md:gap-3";

export function TryoutOperationsNavigation({ initial, active, parentId, pendingCount }: TryoutOperationsNavigationProps) {
  const query = useSearchParams();
  const context = parseMentorTryoutContext(query);
  const count = pendingCount ?? initial.participants.filter((participant) => participant.admission.status === "pending").length;
  return <SunkenTabNavigation aria-label="Bagian operasional" className="flex-wrap md:flex-nowrap md:flex-col md:items-stretch md:self-start">
    <SunkenTabLink className={tabClassName} href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "sessions", parent: parentId ?? context.parent })} selected={active === "sessions"} aria-current={active === "sessions" ? "page" : undefined}><CalendarDays aria-hidden="true" className="size-4" />Jadwal</SunkenTabLink>
    <SunkenTabLink className={tabClassName} href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "policy", parent: parentId ?? context.parent })} selected={active === "policy"} aria-current={active === "policy" ? "page" : undefined}><ShieldCheck aria-hidden="true" className="size-4" />Akses peserta</SunkenTabLink>
    <SunkenTabLink className={tabClassName} href={buildMentorTryoutOperationsHref(initial.id, { ...context, workspace: "operations", delivery: "participants", parent: parentId ?? context.parent })} selected={active === "participants"} aria-current={active === "participants" ? "page" : undefined} aria-label={count > 0 ? `Peserta, ${count} pendaftaran menunggu persetujuan` : "Peserta"}><Users aria-hidden="true" className="size-4" /><span className="min-w-0 text-left">Peserta{count > 0 ? <span aria-hidden="true" className="ml-1">({count})</span> : null}</span></SunkenTabLink>
  </SunkenTabNavigation>;
}

/** Side menu on the left, section content on the right, like Pengaturan. */
export function TryoutOperationsLayout({ children, ...navigation }: TryoutOperationsNavigationProps & { children: ReactNode }) {
  return <div className="grid min-w-0 gap-6 md:grid-cols-[176px_minmax(0,1fr)] md:gap-8">
    <TryoutOperationsNavigation {...navigation} />
    <div className="min-w-0">{children}</div>
  </div>;
}
