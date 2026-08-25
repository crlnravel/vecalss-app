"use server";

import { requireTutorSession } from "@/lib/auth/access";
import { getOwnedTryoutOperationsView, toTryoutWorkspaceView } from "@/lib/tryout/operations-view";

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

export { refreshTryoutLiveAction };
