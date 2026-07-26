import Link from "next/link";
import { CalendarDays, ChevronRight, Plus } from "lucide-react";

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
  return (
    <main className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      {embedded ? <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-secondary-900">Sesi</h2><p className="mt-1 text-sm text-secondary-600">Jadwal dan status pelaksanaan Tryout.</p></div><Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="brand"><Plus data-icon="inline-start" />Buat sesi</Button></header> : <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=sessions`}
        description={initial.title}
        title="Sesi"
        trailing={
          <Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="brand">
            <Plus data-icon="inline-start" />
            Buat sesi
          </Button>
        }
      />}

      {initial.sessions.length ? (
        <div className="mt-5 grid gap-3">
          {initial.sessions.map((session) => (
            <Link
              className="group focus-visible:outline-none"
              href={`${base}/${session.id}`}
              key={session.id}
            >
              <Card className="shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">{session.name}</CardTitle>
                  <CardDescription>
                    {new Date(session.availableFrom).toLocaleString("id-ID")} — {new Date(session.availableUntil).toLocaleString("id-ID")}
                  </CardDescription>
                  <CardAction className="flex items-center gap-2">
                    <StatusBadge status={session.status} />
                    <ChevronRight aria-hidden="true" className="text-secondary-400" />
                  </CardAction>
                </CardHeader>
                {session.releasedAt ? (
                  <CardContent className="text-sm text-secondary-600">
                    Hasil dirilis
                  </CardContent>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty className="mt-5 border border-dashed border-primary-100 bg-white">
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
            <Button nativeButton={false} render={<Link href={`${base}/new`} />} variant="brand">
              <Plus data-icon="inline-start" />
              Buat sesi
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </main>
  );
}

export { KaptenTryoutSessionsPageModule };
