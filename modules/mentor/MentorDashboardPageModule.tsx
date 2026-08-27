"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionContext } from "@/lib/auth/types";
import {
  PageIntro,
  QuickCreateMenu,
  ResourceRow,
  SectionHeading,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import {
  overlayDashboardQuizDrafts,
  type DashboardProjection,
  type DashboardResource,
} from "@/modules/mentor/dashboard-types";
import { useStoredQuizDrafts } from "@/modules/mentor/quiz-draft-storage";

type DashboardGroup = {
  actionHref: string;
  actionLabel: string;
  description: string;
  key: keyof DashboardProjection;
  title: string;
};

const dashboardGroups: DashboardGroup[] = [
  {
    actionHref: "/mentor/materi",
    actionLabel: "Lihat Materi",
    description: "Kurikulum bersama yang paling baru diperbarui.",
    key: "recentMateri",
    title: "Materi Terakhir Diedit",
  },
  {
    actionHref: "/mentor/quiz",
    actionLabel: "Lihat Kuis",
    description: "Kuis milikmu yang terakhir diperbarui.",
    key: "recentKuis",
    title: "Kuis Terakhir Diedit",
  },
  {
    actionHref: "/mentor/quiz",
    actionLabel: "Kelola Kuis",
    description: "Kuis milikmu dengan waktu buka yang akan datang.",
    key: "scheduledKuis",
    title: "Kuis Terjadwal",
  },
  {
    actionHref: "/mentor/tryout",
    actionLabel: "Review Tryout",
    description: "Tryout milikmu dengan sesi aktif yang akan datang.",
    key: "scheduledTryout",
    title: "Tryout Terjadwal",
  },
];

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Kapten";
}

function MentorDashboardPageModule({
  dashboard: serverProjection,
  session,
}: {
  dashboard: DashboardProjection;
  session: SessionContext;
}) {
  const firstName = getFirstName(session.user.fullName);
  const storedDrafts = useStoredQuizDrafts(session.user.id);
  const dashboard = useMemo(
    () => overlayDashboardQuizDrafts(serverProjection, storedDrafts ?? []),
    [serverProjection, storedDrafts],
  );

  return (
    <MentorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard"
      mainClassName="gap-10 lg:gap-12"
      searchPlaceholder="Cari konten, draft, jadwal, atau asset..."
      session={session}
    >
      <PageIntro
        action={<QuickCreateMenu label="Buat konten" />}
        description="Lanjutkan pekerjaan yang terakhir dibuka, atau siapkan rilis berikutnya."
        title={`Selamat bekerja, ${firstName}.`}
      />

      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-12">
        {dashboardGroups.map((group) => (
          <DashboardGroupSection
            group={group}
            key={group.key}
            resources={dashboard[group.key]}
          />
        ))}
      </div>
    </MentorWorkspaceShell>
  );
}

function DashboardGroupSection({
  group,
  resources,
}: {
  group: DashboardGroup;
  resources: DashboardResource[];
}) {
  return (
    <section aria-label={group.title} className="min-w-0 space-y-5">
      <SectionHeading
        action={
          <Button
            nativeButton={false}
            render={<Link href={group.actionHref} />}
            size="sm"
            variant="brandOutline"
          >
            {group.actionLabel}
          </Button>
        }
        description={group.description}
        title={group.title}
      />
      <div className="space-y-3">
        {resources.length > 0 ? (
          resources.slice(0, 3).map((resource, index) => (
            <ResourceRow
              emphasis={index === 0 && group.key.startsWith("recent")}
              key={`${resource.kind}:${resource.id}`}
              resource={resource}
            />
          ))
        ) : (
          <EmptyWorkspaceState label={group.title.toLocaleLowerCase("id-ID")} />
        )}
      </div>
    </section>
  );
}

function EmptyWorkspaceState({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-primary-200 bg-white/70 px-5 py-8 text-sm leading-6 text-secondary-500">
      Belum ada {label} untuk ditampilkan.
    </div>
  );
}

function MentorDashboardLoadingState() {
  return (
    <div className="min-h-svh bg-[#f7faf8] px-4 py-8 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-10 lg:gap-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-12 w-80 rounded-3xl bg-primary-100/80" />
            <Skeleton className="h-5 w-[min(30rem,80vw)] rounded-xl bg-primary-100/70" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl bg-primary-100/80" />
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-12">
          {dashboardGroups.map((group) => (
            <div className="space-y-5" key={group.key}>
              <div className="space-y-2">
                <Skeleton className="h-8 w-64 rounded-2xl bg-primary-100/80" />
                <Skeleton className="h-5 w-72 rounded-xl bg-primary-100/70" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-28 rounded-3xl bg-primary-100/80" />
                <Skeleton className="h-24 rounded-3xl bg-primary-100/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { MentorDashboardLoadingState, MentorDashboardPageModule };
