"use server";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";
import { parseMentorTryoutContext } from "@/lib/navigation/canonical-context";
import { queryTryoutParticipants } from "@/lib/tryout/participant-list";

async function refreshTryoutRegistrationListAction(tryoutId: string, query: string) {
  const context = parseMentorTryoutContext(new URLSearchParams(query));
  if (context.issues.length) return { ok: false as const, message: "Filter peserta tidak tersedia. Muat ulang halaman." };
  const refreshed = await refreshTryoutLiveAction(tryoutId);
  if (!refreshed.ok) return refreshed;
  return { ...refreshed, list: queryTryoutParticipants(refreshed.result, context) };
}

async function refreshTryoutLiveAction(tryoutId: string) {
  const session = await requireTutorSession();
  try {
    const operations = await getOwnedTryoutOperationsView(tryoutId, session.user.id);
    if (!operations) return { ok: false as const, message: "Tryout tidak ditemukan atau bukan milik Anda." };
    return {
      ok: true as const,
      result: toTryoutWorkspaceView(operations),
      serverUpdatedAt: new Date().toISOString(),
    };
  } catch {
    return { ok: false as const, message: "Refresh operasional tidak dapat diproses saat ini." };
  }
}

export { refreshTryoutLiveAction, refreshTryoutRegistrationListAction };
