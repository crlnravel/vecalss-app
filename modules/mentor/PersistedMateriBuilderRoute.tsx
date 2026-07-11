"use client";

import { notFound } from "next/navigation";

import type { SessionContext } from "@/lib/auth/types";
import { KaptenMateriBuilderPageModule } from "@/modules/mentor/KaptenMateriBuilderPageModule";
import { useStoredMateriDraft } from "@/modules/mentor/materi-draft-storage";

function PersistedMateriBuilderRoute({
  materiId,
  session,
}: {
  materiId: string;
  session: SessionContext;
}) {
  const storedDraft = useStoredMateriDraft(materiId);

  if (storedDraft === undefined) {
    return <div className="min-h-svh bg-[#f7faf8]" />;
  }

  if (!storedDraft) {
    notFound();
  }

  return (
    <KaptenMateriBuilderPageModule
      initialMateri={storedDraft.materi}
      materiId={materiId}
      mode="edit"
      session={session}
    />
  );
}

export { PersistedMateriBuilderRoute };
