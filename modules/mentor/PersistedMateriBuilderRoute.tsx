"use client";

import { notFound } from "next/navigation";

import type { SessionContext } from "@/lib/auth/types";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { useStoredMateriDraft } from "@/modules/mentor/materi-draft-storage";
import type { KaptenMateri } from "@/modules/mentor/mock-data";

function PersistedMateriBuilderRoute({
  initialPreview = false,
  initialMateri = null,
  materiId,
  returnTo,
  session,
}: {
  initialPreview?: boolean;
  initialMateri?: KaptenMateri | null;
  materiId: string;
  returnTo?: string;
  session: SessionContext;
}) {
  const storedDraft = useStoredMateriDraft(materiId);

  if (storedDraft === undefined) {
    return <div className="min-h-svh bg-[#f7faf8]" />;
  }

  const resolvedMateri = storedDraft?.materi ?? initialMateri;

  if (!resolvedMateri) {
    notFound();
  }

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={resolvedMateri}
      initialPreview={initialPreview}
      materiId={materiId}
      mode="edit"
      returnTo={returnTo}
      session={session}
    />
  );
}

export { PersistedMateriBuilderRoute };
