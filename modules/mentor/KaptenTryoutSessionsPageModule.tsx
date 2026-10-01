import Link from "next/link";
import { CalendarDays, ChevronRight } from "@/lib/icons";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { OperationalPageHeader } from "@/modules/mentor/KaptenTryoutOperationalShared";

function KaptenTryoutSessionsPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const base = `/mentor/tryout/${initial.id}/operations/sessions`;
  const Root = embedded ? "section" : "main";
  const mainSession = selectMainTryoutSession(initial.sessions);
  const sessions = mainSession ? [mainSession] : [];
  const hasActiveSession = mainSession?.status === "active";

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? <header><div><h2 className="text-xl font-semibold text-secondary-900">Sesi utama</h2>{!hasActiveSession ? <p className="mt-1 text-sm font-medium text-danger-600" role="alert">Sesi utama belum aktif</p> : null}</div></header> : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=operations`}
        description={initial.title}
        title="Sesi utama"
      />}

      {sessions.length ? (
        <>
          <div className="mt-5 grid gap-3">
            {sessions.map((session) => {
              const sessionReady = session.status === "active" && Boolean(session.assessmentRelease);
              return (
                <Card
                  className={session.isDefaultOpenRegistration
                    ? "border border-primary-100 bg-primary-50/70 py-0 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--voyage-surface)_80%,transparent),inset_0_-2px_8px_color-mix(in_oklab,var(--voyage-forest)_8%,transparent)] ring-0"
                    : "border border-primary-100 bg-white py-0 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)] ring-0"}
                  key={session.id}
                  size="sm"
                >
                  <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_3rem] sm:items-center sm:gap-0 sm:p-0">
                    <Link
                      className={session.isDefaultOpenRegistration
                        ? "group min-w-0 transition-colors hover:bg-primary-50/80 focus-visible:bg-primary-50/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/35 sm:px-5 sm:py-4"
                        : "group min-w-0 transition-colors hover:bg-secondary-50 focus-visible:bg-secondary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/40 sm:px-5 sm:py-4"}
                      href={`${base}/${session.id}`}
                    >
                      <div className="grid min-w-0 gap-1">
                        <h3 className="min-w-0 truncate text-base font-semibold text-secondary-900">{session.name}</h3>
                        <p className="text-xs leading-5 text-secondary-600">
                          {formatTryoutDateTime(session.availableFrom)} WIB — {formatTryoutDateTime(session.availableUntil)} WIB
                        </p>
                      </div>
                    </Link>

                    <div className="flex min-w-0 items-center justify-end gap-2 sm:contents">
                      <div className="flex shrink-0 items-center justify-end gap-2 px-2">
                        {!sessionReady ? <span aria-label="Sesi belum siap" className="size-2 rounded-full bg-voyage-warm-sun" role="img" title="Sesi belum siap" /> : null}
                        <StatusBadge status={session.status} />
                      </div>
                      <div className="flex shrink-0 items-center justify-end sm:pl-2 sm:pr-1">
                        <Badge size="sm" tone={sessionReady ? "success" : "attention"}>
                          Sesi utama
                        </Badge>
                      </div>
                      <Link
                        aria-label={`Buka sesi ${session.name}`}
                        className={session.isDefaultOpenRegistration
                          ? "flex size-10 shrink-0 items-center justify-center self-center justify-self-end rounded-2xl text-primary-700 transition-colors hover:bg-primary-100/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/35"
                          : "flex size-10 shrink-0 items-center justify-center self-center justify-self-end rounded-2xl text-secondary-400 transition-colors hover:bg-secondary-50 hover:text-secondary-700 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/40"}
                        href={`${base}/${session.id}`}
                      >
                        <ChevronRight aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Empty className="mt-5 rounded-4xl border border-solid border-primary-100 bg-white shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]">
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
    </Root>
  );
}

export { KaptenTryoutSessionsPageModule };
