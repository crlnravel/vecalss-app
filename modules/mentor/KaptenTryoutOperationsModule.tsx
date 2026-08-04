import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Plus,
  SlidersHorizontal,
  Users,
} from "lucide-react";

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
import { modeLabels, policyLabels, type Mode, type Policy } from "./KaptenTryoutOperationsData";

const statusLabels: Record<string, string> = {
  active: "Aktif",
  completed: "Selesai",
  draft: "Draf",
  expired: "Kedaluwarsa",
  in_progress: "Berlangsung",
  pending: "Menunggu",
  published: "Diterbitkan",
  revoked: "Dicabut",
  sealed: "Selesai",
};

function StatusBadge({ status }: { status: string }) {
  const label = statusLabels[status] ?? status.replace(/(^|[_\s-])(\p{L})/gu, (_, prefix: string, character: string) => `${prefix}${character.toLocaleUpperCase()}`);

  return (
    <Badge
      className="min-h-7 rounded-full px-2.5"
      size="ui"
      variant={status === "active" || status === "published" ? "mint" : "accent"}
    >
      {label}
    </Badge>
  );
}

function WorkspaceCard({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href: string;
  icon: typeof SlidersHorizontal;
  title: string;
}) {
  return (
    <Link className="group block focus-visible:outline-none" href={href}>
      <Card className="h-full shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary-100 text-primary-800">
            <Icon aria-hidden="true" />
          </div>
          <CardAction>
            <ChevronRight aria-hidden="true" className="text-secondary-400 transition-transform group-hover:translate-x-0.5" />
          </CardAction>
          <CardTitle className="pt-3 text-lg font-semibold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

function KaptenTryoutOperationsModule({
  initial,
  tryoutId,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  tryoutId: string;
}) {
  const base = `/mentor/tryout/${tryoutId}/operations`;
  const pendingAdmissions = initial.admissions.filter(
    (admission) => admission.status === "pending",
  ).length;
  const activeSessions = initial.sessions.filter(
    (session) => session.status === "active",
  ).length;

  return (
    <div className="min-w-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-secondary-900">
            Operasional
          </h2>
          <p className="mt-1 text-sm text-secondary-600">
            {activeSessions} sesi aktif · {pendingAdmissions} admission menunggu
          </p>
        </div>
        <Button nativeButton={false} render={<Link href={`${base}/sessions/new`} />} variant="brand">
          <Plus data-icon="inline-start" />
          Buat sesi
        </Button>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <WorkspaceCard
          description={`${modeLabels[initial.admissionMode as Mode]} · rilis ${policyLabels[initial.defaultReleasePolicy as Policy]}`}
          href={`${base}/policy`}
          icon={SlidersHorizontal}
          title="Kebijakan"
        />
        <WorkspaceCard
          description={`${initial.sessions.length} sesi · ${activeSessions} aktif`}
          href={`${base}/sessions`}
          icon={CalendarDays}
          title="Sesi"
        />
        <WorkspaceCard
          description={`${initial.admissions.length} peserta · ${pendingAdmissions} menunggu`}
          href={`${base}/participants`}
          icon={Users}
          title="Peserta"
        />
      </div>

      <section className="mt-8" aria-labelledby="operational-sessions-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="operational-sessions-title" className="text-lg font-semibold">
            Sesi terbaru
          </h3>
          {initial.sessions.length ? (
            <Button nativeButton={false} render={<Link href={`${base}/sessions`} />} size="sm" variant="ghost">
              Lihat semua
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : null}
        </div>

        {initial.sessions.length ? (
          <div className="mt-3 grid gap-3">
            {initial.sessions.slice(0, 4).map((session) => (
              <Link
                className="group focus-visible:outline-none"
                href={`${base}/sessions/${session.id}`}
                key={session.id}
              >
                <Card className="shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40" size="sm">
                  <CardHeader>
                    <CardTitle className="font-semibold">{session.name}</CardTitle>
                    <CardDescription>
                      {new Date(session.availableFrom).toLocaleString("id-ID")} — {new Date(session.availableUntil).toLocaleString("id-ID")}
                    </CardDescription>
                    <CardAction className="flex items-center gap-2">
                      <StatusBadge status={session.status} />
                      <ChevronRight aria-hidden="true" className="text-secondary-400" />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="text-sm text-secondary-600">
                    {session.attempts.length} attempt · peringkat {session.rankingRule}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Empty className="mt-3 border border-dashed border-primary-100 bg-white">
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
              <Button nativeButton={false} render={<Link href={`${base}/sessions/new`} />} variant="brand">
                <Plus data-icon="inline-start" />
                Buat sesi
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </section>
    </div>
  );
}

export { KaptenTryoutOperationsModule, StatusBadge };
export type { DefaultPolicy, Mode, Policy } from "./KaptenTryoutOperationsData";
