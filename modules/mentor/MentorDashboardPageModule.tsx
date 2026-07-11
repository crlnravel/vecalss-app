"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import {
  getMateriWithStoredDrafts,
  getRecentlyEditedMateri,
} from "@/modules/mentor/materi-draft-storage";
import {
  allResources,
  recentlyEdited,
  scheduledPublications,
  materi,
} from "@/modules/mentor/mock-data";

function getFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "Kapten";
}

function MentorDashboardPageModule({ session }: { session: SessionContext }) {
  const firstName = getFirstName(session.user.fullName);
  const [storedMateri, setStoredMateri] = useState(materi);

  useEffect(() => {
    const syncStoredDrafts = () => setStoredMateri(getMateriWithStoredDrafts(materi));

    syncStoredDrafts();
    window.addEventListener("storage", syncStoredDrafts);
    return () => window.removeEventListener("storage", syncStoredDrafts);
  }, []);

  const updatedResources = [
    ...storedMateri,
    ...allResources.filter((resource) => resource.resourceType !== "materi"),
  ];
  const updatedRecentlyEdited = [
    ...getRecentlyEditedMateri(storedMateri),
    ...recentlyEdited.filter((resource) => resource.resourceType !== "materi"),
  ];
  const continueEditing = updatedRecentlyEdited[0];
  const draftQueue = updatedResources
    .filter((resource) => resource.status === "draft")
    .slice(0, 4);

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
        action={
          <Button render={<Link href="/mentor/materi/create" />} variant="brand">
            Buat Konten
            <ArrowRight />
          </Button>
        }
      />

      <section className="grid gap-10 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <div className="space-y-4">
          <SectionHeading title="Continue Editing" />
          <div className="max-w-4xl">
            <ResourceRow emphasis resource={continueEditing} />
          </div>
        </div>

        <div className="space-y-4">
          <SectionHeading title="Quick Create" />
          <QuickCreateGrid />
        </div>
      </section>

      <section className="grid gap-10 xl:grid-cols-2">
        <div className="space-y-4">
          <SectionHeading
            title="Draft"
          />
          <div className="space-y-2">
            {draftQueue.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
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
            title="Scheduled"
          />
          <div className="space-y-2">
            {scheduledPublications.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          title="Recently Edited"
        />
        <div className="space-y-2">
          {updatedRecentlyEdited.slice(0, 3).map((resource) => (
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
