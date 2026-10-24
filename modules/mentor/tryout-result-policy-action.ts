"use server";

import { requireSession } from "@/lib/auth/access";
import { hasRole } from "@/lib/auth/session";
import { isTryoutPolicyBaseline } from "@/lib/tryout/result-readiness";
import { isUuid } from "@/lib/resource-edit-lock/canonical";
import { requireTryoutCapability, TryoutCapabilityError } from "@/lib/tryout/capabilities";
import { configureTryoutDefaultResultRelease, TryoutDeliveryValidationError } from "@/lib/tryout/delivery-repository";
import type { TryoutPolicyIntent, TryoutPolicyReply } from "@/lib/tryout/result-policy-recovery";

export async function configureTryoutResultPolicyAction(intent: TryoutPolicyIntent): Promise<TryoutPolicyReply> {
  const session = await requireSession();
  try {
    requireTryoutCapability(session, "tryout.delivery.configure");
    if (typeof intent.requestId !== "string" || !isUuid(intent.requestId) || !isTryoutPolicyBaseline(intent.expectedBaseline)) return { ok: false, confirmedRefusal: true, message: "Permintaan penyimpanan tidak dapat digunakan. Mulai perubahan baru." };
    const result = await configureTryoutDefaultResultRelease(intent.tryoutId, intent.policy, session.user.id, intent.reason, hasRole(session, "admin"), intent.requestId, intent.expectedBaseline);
    return { ok: true, receipt: result.receipt };
  } catch (error) {
    if (error instanceof TryoutDeliveryValidationError || error instanceof TryoutCapabilityError) return { ok: false, confirmedRefusal: true, message: error.message.includes("konfigurasi delivery") ? "Aturan rilis terkunci karena peserta sudah mulai mengerjakan Tryout ini." : error.message.includes("Delivery hanya") ? "Aturan rilis hanya dapat diubah pada Tryout yang masih diterbitkan." : error.message.includes("delivery Tryout milik") ? "Anda tidak dapat mengubah aturan rilis Tryout milik Kapten lain." : error.message };
    return { ok: false, confirmedRefusal: false, message: "Hasil penyimpanan belum dapat dipastikan. Periksa status terlebih dahulu." };
  }
}
