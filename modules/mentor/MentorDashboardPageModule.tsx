"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionContext } from "@/lib/auth/types";
import {
  PageIntro,
  QuickCreateGrid,
  ResourceRow,
  SectionHeading,
} from "@/modules/mentor/components/kapten-ui";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";
import { getStoredQuizDrafts } from "@/modules/mentor/quiz-draft-storage";
import {
  recentlyEdited,
  scheduledPublications,
  type KaptenResource,
} from "@/modules/mentor/mock-data";
import type { KaptenMateriView } from "@/modules/mentor/materi-view-model";

type RecentlyEditedResource = {
  resource: KaptenResource;
  savedAt: number;
};

function compareRecentlyEdited(
  a: RecentlyEditedResource,
  b: RecentlyEditedResource,
) {
  return b.savedAt - a.savedAt || a.resource.id.localeCompare(b.resource.id);
}

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Kapten";
}

function MentorDashboardPageModule({ materiRecentlyEdited, session }: { materiRecentlyEdited: KaptenMateriView[]; session: SessionContext }) {
  const firstName = getFirstName(session.user.fullName);
  const [savedRecentlyEdited, setSavedRecentlyEdited] = useState(() =>
    [
      ...materiRecentlyEdited.map((resource) => ({ resource, savedAt: resource.updatedAtEpoch })),
      ...getStoredQuizDrafts().map((draft) => ({
        resource: draft.quiz,
        savedAt: draft.savedAt,
      })),
    ].sort(compareRecentlyEdited),
  );

  useEffect(() => {
    const syncStoredDrafts = () => {
      setSavedRecentlyEdited(
        [
          ...materiRecentlyEdited.map((resource) => ({ resource, savedAt: resource.updatedAtEpoch })),
          ...getStoredQuizDrafts().map((draft) => ({
            resource: draft.quiz,
            savedAt: draft.savedAt,
          })),
        ].sort(compareRecentlyEdited),
      );
    };

    syncStoredDrafts();
    window.addEventListener("storage", syncStoredDrafts);
    return () => {
      window.removeEventListener("storage", syncStoredDrafts);
    };
  }, [materiRecentlyEdited]);

  const savedResourceIds = new Set(savedRecentlyEdited.map(({ resource }) => resource.id));
  const updatedRecentlyEdited = [
    ...savedRecentlyEdited.map(({ resource }) => resource),
    ...recentlyEdited.filter((resource) => !savedResourceIds.has(resource.id)),
  ];

  return (
    <MentorWorkspaceShell
      activeLabel="Dashboard"
      breadcrumbLabel="Dashboard"
      mainClassName="gap-8 lg:gap-9"
      searchPlaceholder="Cari konten, draft, jadwal, atau asset..."
      session={session}
    >
      <PageIntro
        title={`Selamat bekerja, ${firstName}.`}
      />

      <section className="grid gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div className="space-y-4">
          <SectionHeading
            action={
              <Button
                render={<Link href="/mentor/materi" />}
                size="sm"
                variant="brandOutline"
              >
                Lihat Semua Konten
              </Button>
            }
            title="Lanjutkan Penyuntingan"
          />
          <div className="space-y-2">
            {updatedRecentlyEdited.slice(0, 3).map((resource, index) => (
              <ResourceRow
                emphasis={index === 0}
                key={resource.id}
                resource={resource}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeading title="Buat Cepat" />
          <QuickCreateGrid />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          action={
            <Button
              render={<Link href="/mentor/tryout" />}
              size="sm"
              variant="brandOutline"
            >
              Review Jadwal
            </Button>
          }
          title="Terjadwal"
        />
        <div className="space-y-2">
          {scheduledPublications.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </div>
      </section>
    </MentorWorkspaceShell>
  );
}

function MentorDashboardLoadingState() {
  return (
    <div className="min-h-svh bg-[#f7faf8] px-4 py-8 md:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-6">
        <Skeleton className="h-12 w-80 rounded-3xl bg-primary-100/80" />
        <Skeleton className="h-32 rounded-5xl bg-primary-100/80" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-40 rounded-4xl bg-primary-100/80" />
          <Skeleton className="h-40 rounded-4xl bg-primary-100/80" />
          <Skeleton className="h-40 rounded-4xl bg-primary-100/80" />
        </div>
      </div>
    </div>
  );
}

export { MentorDashboardLoadingState, MentorDashboardPageModule };
