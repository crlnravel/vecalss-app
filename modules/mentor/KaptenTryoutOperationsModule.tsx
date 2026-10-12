"use client";

import { CalendarDays } from "@/lib/icons";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { TryoutOperationsNavigation } from "@/modules/mentor/TryoutOperationsNavigation";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { KaptenTryoutSessionDetailPageModule } from "@/modules/mentor/KaptenTryoutSessionDetailPageModule";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";

function KaptenTryoutOperationsModule({
  embedded = false,
  initial,
  draftAdmission,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  draftAdmission?: ReactNode;
}) {
  const mainSession = selectMainTryoutSession(initial.sessions);
  const query = useSearchParams();
  const accessView = query.get("delivery") === "policy";

  return (
    <div className="min-w-0">
      <TryoutOperationsNavigation initial={initial} active={accessView ? "policy" : "sessions"} parentId={query.get("parent") ?? undefined} />
      {embedded ? null : (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-secondary-900">
              Operasional
            </h2>
          </div>
        </header>
      )}

      {accessView ? draftAdmission : <section className="mt-8" aria-labelledby="operational-calendar-title">
        {mainSession ? (
          <>
            <KaptenTryoutSessionDetailPageModule
              embedded
              initial={initial}
              sessionId={mainSession.id}
            />
          </>
        ) : (
          <Empty className="mt-5 border border-dashed border-primary-100 bg-white">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Sesi utama belum tersedia</EmptyTitle>
              <EmptyDescription>
                Sesi utama dibuat otomatis saat Tryout disimpan.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>}
    </div>
  );
}

export { KaptenTryoutOperationsModule, StatusBadge };
export type { DefaultPolicy, Mode, Policy } from "./KaptenTryoutOperationsData";
