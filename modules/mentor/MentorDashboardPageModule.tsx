"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  ReferenceActivityFeed,
  ReferenceEmptyState,
  ReferencePageHeader,
  ReferenceSectionHeading,
  ReferenceSurface,
  ReferenceTaskCard,
  type ReferenceActivity,
} from "@/components/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronRight } from "@/lib/icons";
import type { SessionContext } from "@/lib/auth/types";
import { QuickCreateMenu } from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { contentTypeMeta } from "@/modules/mentor/resource-types";
import {
  compareDashboardResourcesBySchedule,
  compareDashboardResourcesByUpdatedAt,
  overlayDashboardQuizDrafts,
  type DashboardProjection,
  type DashboardResource,
} from "@/modules/mentor/dashboard-types";
import { useStoredQuizDrafts } from "@/modules/mentor/quiz-draft-storage";

const dashboardTimestampFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Kapten";
}

function formatDashboardTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dashboardTimestampFormatter.format(date);
}

function getResourceSummary(resource: DashboardResource) {
  const typeLabel = contentTypeMeta[resource.resourceType].label;
  const context = resource.subjectName ? `${resource.subjectName} · ${typeLabel}` : typeLabel;
  const description = resource.description.trim();

  return description ? `${context} · ${description}` : `${context} · ${resource.primaryMetric}`;
}

function toDashboardActivities(resources: readonly DashboardResource[]): ReferenceActivity[] {
  return resources.slice(0, 6).map((resource) => ({
    icon: contentTypeMeta[resource.resourceType].icon,
    id: `${resource.kind}:${resource.id}`,
    href: resource.href,
    label: contentTypeMeta[resource.resourceType].label,
    timestamp: (
      <Link
        aria-label={`Buka detail ${resource.title}`}
        className="inline-flex size-11 items-center justify-center rounded-full text-secondary-400 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-300/40"
        href={resource.href}
      >
        <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2.4} />
      </Link>
    ),
    title: resource.title,
  }));
}

const mentorActivityFeedClassName = [
  "[&>div:first-child]:hidden",
  "[&_[data-activity-id]]:items-center",
  "[&_[data-activity-id]]:py-2",
  "[&>div:last-child]:pt-0",
  "[&_[data-activity-id]>div:first-child]:bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)]",
  "[&_[data-activity-id]>div:first-child]:text-[#176b4d]",
  "[&_[data-activity-id]>div:first-child]:shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)]",
  "[&_[data-activity-id]>div:nth-of-type(2)>span:last-child]:font-medium",
  "[&_[data-activity-id]>div:nth-of-type(2)>span:last-child]:tracking-normal",
  "[&_[data-activity-id]>div:nth-of-type(2)>span:last-child]:normal-case",
  "[&_[data-activity-id]>div:nth-of-type(2)>span:last-child]:text-secondary-500",
].join(" ");

function DashboardResourceTask({ resource }: { resource: DashboardResource }) {
  return (
    <ReferenceTaskCard
      deadline={resource.scheduledFor}
      description={
        <span>
          <span className="line-clamp-2">{getResourceSummary(resource)}</span>
          <span className="mt-1 block text-ui-xs leading-4 text-secondary-400">
            Diperbarui {formatDashboardTimestamp(resource.updatedAt)}
          </span>
        </span>
      }
      href={resource.href}
      status={resource.status}
      title={resource.title}
    />
  );
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
  const recentResources = useMemo(
    () => [...dashboard.recentMateri, ...dashboard.recentKuis].sort(compareDashboardResourcesByUpdatedAt),
    [dashboard.recentKuis, dashboard.recentMateri],
  );
  const scheduledResources = useMemo(
    () => [...dashboard.scheduledKuis, ...dashboard.scheduledTryout].sort(compareDashboardResourcesBySchedule),
    [dashboard.scheduledKuis, dashboard.scheduledTryout],
  );
  const recentActivities = useMemo(
    () => toDashboardActivities(recentResources),
    [recentResources],
  );
  const nextScheduledResource = scheduledResources[0];

  return (
    <MentorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard"
      mainClassName="gap-10 lg:gap-12"
      searchPlaceholder="Cari konten, draft, jadwal, atau asset..."
      session={session}
      sidebarAppearance="reference"
    >
      <ReferencePageHeader
        actions={<QuickCreateMenu label="Buat konten" />}
        description="Lanjutkan pekerjaan yang terakhir dibuka, atau siapkan rilis berikutnya."
        title={`Selamat bekerja, ${firstName}.`}
      />

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
        <section aria-label="Aktivitas terbaru" className="min-w-0 space-y-4">
          <ReferenceSectionHeading title="Aktivitas terbaru" />
          <ReferenceActivityFeed
            activities={recentActivities}
            className={`min-h-0 ${mentorActivityFeedClassName}`}
            nextAction={
              nextScheduledResource ? (
                <Link
                  className="font-semibold text-primary-800 underline-offset-4 hover:underline"
                  href={nextScheduledResource.href}
                >
                  Buka {nextScheduledResource.title}
                </Link>
              ) : undefined
            }
            title="Aktivitas terbaru"
          />
        </section>

        <section aria-label="Jadwal berikutnya" className="min-w-0 space-y-4">
          <ReferenceSectionHeading title="Jadwal berikutnya" />
          {scheduledResources.length > 0 ? (
            <div className="space-y-3">
              {scheduledResources.slice(0, 4).map((resource) => (
                <DashboardResourceTask key={`${resource.kind}:${resource.id}`} resource={resource} />
              ))}
            </div>
          ) : (
            <ReferenceSurface>
              <ReferenceEmptyState
                description="Belum ada kuis atau tryout dengan sesi mendatang."
                icon={CalendarDays}
                title="Jadwal masih kosong"
              />
            </ReferenceSurface>
          )}
        </section>
      </div>
    </MentorWorkspaceShell>
  );
}

function MentorDashboardLoadingState() {
  return (
    <div className="min-h-svh bg-secondary-50 px-4 py-8 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 lg:gap-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <Skeleton className="h-12 w-80 rounded-3xl bg-primary-100/80" />
            <Skeleton className="h-5 w-[min(30rem,80vw)] rounded-xl bg-primary-100/70" />
          </div>
          <Skeleton className="h-10 w-32 rounded-xl bg-primary-100/80" />
        </div>

        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64 rounded-2xl bg-primary-100/80" />
            <Skeleton className="h-56 rounded-4xl bg-primary-100/70" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-8 w-56 rounded-2xl bg-primary-100/80" />
            <Skeleton className="h-32 rounded-4xl bg-primary-100/70" />
            <Skeleton className="h-32 rounded-4xl bg-primary-100/60" />
          </div>
        </div>
      </div>
    </div>
  );
}

export { MentorDashboardLoadingState, MentorDashboardPageModule };
