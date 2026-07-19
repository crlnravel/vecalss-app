"use client";

import { notFound } from "next/navigation";

import type { SessionContext } from "@/lib/auth/types";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutModules";
import { useTryoutDraft } from "@/modules/mentor/tryout-draft-storage";

function PersistedTryoutBuilderRoute({ id, session }: { id: string; session: SessionContext }) {
  const stored = useTryoutDraft(id);
  if (stored === undefined) return null;
  if (!stored) notFound();
  return <KaptenTryoutBuilderPageModule id={id} session={session} />;
}

export { PersistedTryoutBuilderRoute };
