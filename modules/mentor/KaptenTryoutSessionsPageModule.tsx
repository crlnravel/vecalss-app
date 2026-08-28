import Link from "next/link";
import { CalendarDays, ChevronRight, Plus } from "@/lib/icons";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MentorBadge } from "@/components/ui/mentor-badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { formatTryoutDateTime } from "@/lib/tryout/time";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import { OperationalPageHeader } from "@/modules/mentor/KaptenTryoutOperationalShared";
import { KaptenTryoutSessionPrimaryAction } from "@/modules/mentor/KaptenTryoutSessionPrimaryAction";

function KaptenTryoutSessionsPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const base = `/mentor/tryout/${initial.id}/operations/sessions`;
  const Root = embedded ? "section" : "main";
  const hasActiveSession = initial.sessions.some((session) => session.status === "active");
  const orderedSessions = [...initial.sessions].sort((left, right) => Number(right.isDefaultOpenRegistration) - Number(left.isDefaultOpenRegistration));
  const currentPrimarySession = orderedSessions.find((session) => session.isDefaultOpenRegistration) ?? null;

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-secondary-900">Sesi</h2>{!hasActiveSession ? <p className="mt-1 text-sm font-medium text-danger-600" role="alert">Paling tidak harus terdapat satu sesi yang aktif</p> : null}</div><Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="reference"><Plus data-icon="inline-start" />Buat sesi</Button></header> : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=schedule&delivery=sessions`}
        description={initial.title}
        title="Sesi"
        trailing={
          <Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="reference">
            <Plus data-icon="inline-start" />
            Buat sesi
          </Button>
        }
      />}

      {initial.sessions.length ? (
        <>
          <div className="mt-5 grid gap-3">
            {orderedSessions.map((session) => {
              const sessionReady = session.status === "active" && Boolean(session.assessmentRelease);
              const isPrimary = session.isDefaultOpenRegistration;
              return (
                <Card
                  className={isPrimary
                    ? "border border-primary-100 bg-primary-50/70 py-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_8px_rgba(23,107,77,0.08)] ring-0"
                    : "border border-primary-100 bg-white py-0 shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] ring-0"}
                  key={session.id}
                  size="sm"
                >
                  <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_5rem_9rem_3rem] sm:items-center sm:gap-0 sm:p-0">
                    <Link
                      className={isPrimary
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
                        {isPrimary ? (
                          <MentorBadge size="sm" tone="success">
                            Sesi utama
                          </MentorBadge>
                        ) : (
                          <KaptenTryoutSessionPrimaryAction
                            currentPrimaryName={currentPrimarySession?.name}
                            disabled={!sessionReady}
                            sessionId={session.id}
                            sessionName={session.name}
                          />
                        )}
                      </div>
                      <Link
                        aria-label={`Buka sesi ${session.name}`}
                        className={isPrimary
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
        <Empty className="mt-5 rounded-4xl border border-solid border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDays aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Belum ada sesi</EmptyTitle>
            <EmptyDescription>
              Buat sesi pertama untuk menetapkan jadwal dan akses peserta.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="reference">
              <Plus data-icon="inline-start" />
              Buat sesi
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </Root>
  );
}

export { KaptenTryoutSessionsPageModule };
