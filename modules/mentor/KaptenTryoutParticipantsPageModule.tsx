import Link from "next/link";
import { ChevronRight, Users } from "@/lib/icons";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  participantAttemptStateLabels,
  participantSessionStateLabels,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import { OperationalPageHeader } from "@/modules/mentor/KaptenTryoutOperationalShared";

function KaptenTryoutParticipantsPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const base = `/mentor/tryout/${initial.id}/operations/participants`;
  const Root = embedded ? "section" : "main";

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? <header><h2 className="text-xl font-semibold text-secondary-900">Peserta</h2><p className="mt-1 text-sm text-secondary-600">Admission dan penugasan sesi peserta.</p></header> : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=participants`}
        description={initial.title}
        title="Peserta"
      />}

      {initial.participants.length ? (
        <div className="mt-5 grid gap-3">
          {initial.participants.map((participant) => (
            <Link
              className="group focus-visible:outline-none"
              href={`${base}/${participant.admissionId}`}
              key={participant.id}
            >
              <Card className="shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40" size="sm">
                <CardHeader>
                  <CardTitle className="font-semibold">{participant.participant.displayName}</CardTitle>
                  <CardAction className="flex items-center gap-2">
                    <StatusBadge status={participant.admission.status} />
                    <ChevronRight aria-hidden="true" className="text-secondary-400" />
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm text-secondary-600 sm:grid-cols-3">
                  <span><strong className="font-medium text-secondary-800">Sesi:</strong> {participant.session?.name ?? "Belum ditugaskan"} · {participantSessionStateLabels[participant.session?.state ?? "not_assigned"]}</span>
                  <span><strong className="font-medium text-secondary-800">Attempt:</strong> {participant.attempt ? participantAttemptStateLabels[participant.attempt.attemptState] ?? participant.attempt.attemptState : "Belum mulai"}</span>
                  <span><strong className="font-medium text-secondary-800">Nilai:</strong> {participant.score.score === null ? participant.score.scoringState === "not_started" ? "Belum dihitung" : "Menunggu rilis" : Number(participant.score.score).toFixed(2)}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty className="mt-5 border border-dashed border-primary-100 bg-white">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Belum ada peserta</EmptyTitle>
            <EmptyDescription>
              Admission peserta akan muncul di halaman ini.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Root>
  );
}

export { KaptenTryoutParticipantsPageModule };
