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
import { OperationalPageHeader } from "@/modules/mentor/KaptenTryoutOperationalShared";

function KaptenTryoutParticipantsPageModule({
  embedded = false,
  initial,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
}) {
  const base = `/mentor/tryout/${initial.id}/operations/participants`;
  return (
    <main className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? <header><h2 className="text-xl font-semibold text-secondary-900">Peserta</h2><p className="mt-1 text-sm text-secondary-600">Admission dan penugasan sesi peserta.</p></header> : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=participants`}
        description={initial.title}
        title="Peserta"
      />}

      {initial.admissions.length ? (
        <div className="mt-5 grid gap-3">
          {initial.admissions.map((admission) => (
            <Link
              className="group focus-visible:outline-none"
              href={`${base}/${admission.id}`}
              key={admission.id}
            >
              <Card className="shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40" size="sm">
                <CardHeader>
                  <CardTitle className="font-semibold">{admission.student}</CardTitle>
                  <CardAction className="flex items-center gap-2">
                    <StatusBadge status={admission.status} />
                    <ChevronRight aria-hidden="true" className="text-secondary-400" />
                  </CardAction>
                </CardHeader>
                <CardContent className="text-sm text-secondary-600">
                  {admission.assignments.length
                    ? `${admission.assignments.length} penugasan sesi`
                    : "Belum ditugaskan ke sesi"}
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
    </main>
  );
}

export { KaptenTryoutParticipantsPageModule };
