"use server";

import { requireSession } from "@/lib/auth/access";
import { hasRole } from "@/lib/auth/session";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import { requireTryoutCapability, TryoutCapabilityError } from "@/lib/tryout/capabilities";
import { releaseTryoutSessionResults, TryoutResultValidationError } from "@/lib/tryout/result-repository";
import type { TryoutPublicationIntent, TryoutPublicationReply } from "@/lib/tryout/result-publication-recovery";

export async function publishTryoutSessionResultsAction(intent: TryoutPublicationIntent): Promise<TryoutPublicationReply> {
  const session = await requireSession();
  try {
    requireTryoutCapability(session, "tryout.results.manage");
    if (!intent || !isUuid(intent.tryoutId) || !isUuid(intent.sessionId) || typeof intent.reason !== "string" || !intent.reason.trim()) return { ok: false, confirmedRefusal: true, message: "Pilih sesi yang sesuai dan isi alasan rilis terlebih dahulu." };
    const result = await releaseTryoutSessionResults(intent.sessionId, session.user.id, intent.reason, hasRole(session, "admin"), intent.tryoutId);
    return result.receipt ? { ok: true, receipt: result.receipt } : { ok: false, confirmedRefusal: false, message: "Rilis tercatat, tetapi rinciannya belum dapat dipastikan. Periksa status sesi." };
  } catch (error) {
    if (error instanceof TryoutResultValidationError || error instanceof TryoutCapabilityError) return { ok: false, confirmedRefusal: true, message: error.message };
    return { ok: false, confirmedRefusal: false, message: "Hasil rilis belum dapat dipastikan. Periksa status sebelum mencoba lagi." };
  }
}
