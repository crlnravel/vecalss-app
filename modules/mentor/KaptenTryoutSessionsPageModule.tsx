import Link from "next/link";
import { CalendarDays, ChevronRight, Plus } from "@/lib/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
                    ? "border border-primary-100 bg-primary-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),inset_0_-2px_8px_rgba(23,107,77,0.08)] ring-0"
                    : "border border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] ring-0"}
                  key={session.id}
                  size="sm"
                >
                  <div className="flex items-stretch">
                    <Link
                      className={isPrimary
                        ? "group min-w-0 flex-1 transition-colors hover:bg-primary-50/80 focus-visible:bg-primary-50/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/35"
                        : "group min-w-0 flex-1 transition-colors hover:bg-secondary-50 focus-visible:bg-secondary-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/40"}
                      href={`${base}/${session.id}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-base font-semibold">{session.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {formatTryoutDateTime(session.availableFrom)} WIB — {formatTryoutDateTime(session.availableUntil)} WIB
                        </CardDescription>
                        <CardAction className="flex items-center gap-2">
                          {!sessionReady ? <span aria-label="Sesi belum siap" className="size-2 rounded-full bg-voyage-warm-sun" role="img" title="Sesi belum siap" /> : null}
                          <StatusBadge status={session.status} />
                        </CardAction>
                      </CardHeader>
                      {session.releasedAt ? (
                        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-600">
                          <span>Hasil dirilis</span>
                          {session.assessmentRelease ? <span className="font-medium text-primary-800">Konten rilis {session.assessmentRelease.number}</span> : null}
                        </CardContent>
                      ) : null}
                    </Link>

                    <div className="flex shrink-0 items-center justify-end gap-2 px-2 sm:px-3">
                      {isPrimary ? (
                        <Badge className="rounded-full px-2.5 py-1" size="ui" variant="mint">
                          Sesi utama
                        </Badge>
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
                        ? "flex w-10 shrink-0 items-center justify-center rounded-r-4xl text-primary-700 transition-colors hover:bg-primary-100/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/35"
                        : "flex w-10 shrink-0 items-center justify-center rounded-r-4xl text-secondary-400 transition-colors hover:bg-secondary-50 hover:text-secondary-700 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/40"}
                      href={`${base}/${session.id}`}
                    >
                      <ChevronRight aria-hidden="true" />
                    </Link>
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
