"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

function MentorDashboardPageModule({
  materiRecentlyEdited,
  session,
}: {
  materiRecentlyEdited: KaptenMateriView[];
  session: SessionContext;
}) {
  const firstName = getFirstName(session.user.fullName);
  const [savedRecentlyEdited, setSavedRecentlyEdited] = useState(() =>
    [
      ...materiRecentlyEdited.map((resource) => ({
        resource,
        savedAt: resource.updatedAtEpoch,
      })),
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
          ...materiRecentlyEdited.map((resource) => ({
            resource,
            savedAt: resource.updatedAtEpoch,
          })),
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

  const savedResourceIds = new Set(
    savedRecentlyEdited.map(({ resource }) => resource.id),
  );
  const updatedRecentlyEdited = [
    ...savedRecentlyEdited.map(({ resource }) => resource),
    ...recentlyEdited.filter((resource) => !savedResourceIds.has(resource.id)),
  ];

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

      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.42fr)] xl:gap-12">
        <section aria-label="Lanjutkan Editing" className="min-w-0 space-y-5">
          <SectionHeading
            action={
              <Button
                nativeButton={false}
                render={<Link href="/mentor/materi" />}
                size="sm"
                variant="brandOutline"
              >
                Lihat Semua
              </Button>
            }
            description="Konten terbaru dari ruang kerja kamu."
            title="Lanjutkan Editing"
          />
          <div className="space-y-3">
            {updatedRecentlyEdited.length > 0 ? (
              updatedRecentlyEdited.slice(0, 3).map((resource, index) => (
                <ResourceRow
                  emphasis={index === 0}
                  key={resource.id}
                  resource={resource}
                />
              ))
            ) : (
              <EmptyWorkspaceState label="konten terbaru" />
            )}
          </div>
        </section>

        <section aria-label="Terjadwal" className="min-w-0 space-y-5">
          <SectionHeading
            action={
              <Button
                nativeButton={false}
                render={<Link href="/mentor/tryout" />}
                size="sm"
                variant="brandOutline"
              >
                Review Jadwal
              </Button>
            }
            description="Konten yang akan terbit berikutnya."
            title="Terjadwal"
          />
          <div className="space-y-3">
            {scheduledPublications.length > 0 ? (
              scheduledPublications.map((resource) => (
                <ResourceRow compact key={resource.id} resource={resource} />
              ))
            ) : (
              <EmptyWorkspaceState label="rilis terjadwal" />
            )}
          </div>
        </section>
      </div>
    </MentorWorkspaceShell>
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

        <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(19rem,0.42fr)] xl:gap-12">
          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64 rounded-2xl bg-primary-100/80" />
              <Skeleton className="h-5 w-72 rounded-xl bg-primary-100/70" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-3xl bg-primary-100/80" />
              <Skeleton className="h-24 rounded-3xl bg-primary-100/70" />
              <Skeleton className="h-24 rounded-3xl bg-primary-100/70" />
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-8 w-40 rounded-2xl bg-primary-100/80" />
              <Skeleton className="h-5 w-60 rounded-xl bg-primary-100/70" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-2xl bg-primary-100/70" />
              <Skeleton className="h-24 rounded-2xl bg-primary-100/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { MentorDashboardLoadingState, MentorDashboardPageModule };
