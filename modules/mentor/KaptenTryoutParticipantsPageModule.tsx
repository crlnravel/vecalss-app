"use client";

import Link from "next/link";
import { useState } from "react";
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
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import type { TryoutOperationsView, TryoutParticipantsView } from "@/lib/tryout/operations-view";
import { KaptenTryoutInvitationPicker } from "@/modules/mentor/KaptenTryoutInvitationPicker";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  admissionStatusLabels,
  participantAttemptStateLabels,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import { OperationalPageHeader } from "@/modules/mentor/KaptenTryoutOperationalShared";

function KaptenTryoutParticipantsPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const [participants, setParticipants] = useState(initial.participants);
  const [sessions, setSessions] = useState(initial.sessions);
  const base = `/mentor/tryout/${initial.id}/operations/participants`;
  const Root = embedded ? "section" : "main";

  const applyRefresh = (view: TryoutParticipantsView) => {
    setParticipants(view.participants);
    setSessions(view.sessions);
  };

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? null : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=schedule&delivery=participants`}
        description={initial.title}
        title="Peserta"
      />}

      {initial.admissionMode === "open" ? (
        <ReferenceSurface as="section" aria-labelledby="tryout-open-admission-title" className="mt-5 flex min-h-16 items-center px-4 py-4 sm:px-6" variant="inset">
          <h2 className="text-lg font-semibold text-primary-950" id="tryout-open-admission-title">Semua peserta dapat bergabung</h2>
        </ReferenceSurface>
      ) : (
        <KaptenTryoutInvitationPicker
          onRefresh={applyRefresh}
          sessions={sessions}
          tryoutId={initial.id}
        />
      )}

      {participants.length ? (
        <div className="mt-5 grid gap-3">
          {participants.map((participant) => (
            <Link
              className="group focus-visible:outline-none"
              href={`${base}/${participant.admissionId}`}
              key={participant.id}
            >
              <Card className="border border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] ring-0 transition-colors group-hover:bg-primary-50/45 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40" size="sm">
                <CardHeader>
                  <CardTitle className="font-semibold">{participant.participant.displayName}</CardTitle>
                  <CardAction className="flex items-center gap-2">
                    <StatusBadge status={participant.admission.status} />
                    <ChevronRight aria-hidden="true" className="text-secondary-400" />
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm text-secondary-600 sm:grid-cols-2 lg:grid-cols-4">
                  <span><strong className="block text-xs font-medium uppercase tracking-[0.08em] text-secondary-500">Akses</strong><span className="mt-1 block font-medium text-secondary-800">{admissionStatusLabels[participant.admission.status] ?? participant.admission.status}</span></span>
                  <span><strong className="block text-xs font-medium uppercase tracking-[0.08em] text-secondary-500">Attempt</strong><span className="mt-1 block font-medium text-secondary-800">{participant.attempt ? participantAttemptStateLabels[participant.attempt.attemptState] ?? participant.attempt.attemptState : "Belum mulai"}</span></span>
                  <span><strong className="block text-xs font-medium uppercase tracking-[0.08em] text-secondary-500">Perhatian</strong><span className="mt-1 block font-medium text-secondary-800" title={participant.attention?.reason ?? undefined}>{participant.attention?.label ?? "—"}</span></span>
                  <span><strong className="block text-xs font-medium uppercase tracking-[0.08em] text-secondary-500">Hasil</strong><span className="mt-1 block font-medium text-secondary-800">{participant.score.score === null ? participant.score.scoringState === "not_started" ? "Belum dihitung" : "Menunggu rilis" : Number(participant.score.score).toFixed(2)}</span></span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty className="mt-5 rounded-4xl border border-solid border-primary-100 bg-white shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)]">
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
