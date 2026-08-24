import "server-only";

import { VeraContractError, type VeraRequestState } from "./contracts";

export type RetryRequestSnapshot = {
  id: string;
  studentId: string;
  conversationId: string | null;
  featureKey: string;
  status: VeraRequestState;
  userMessageId: string | null;
  assistantMessageId: string | null;
};

function reject(message: string, details: Record<string, unknown>): never {
  throw new VeraContractError("target_unavailable", message, 409, details);
}

/**
 * A retry is a new logical request, but it must reuse exactly one durable user
 * message and stay inside the original student's conversation/feature.
 */
export function assertRetryReference(
  original: RetryRequestSnapshot,
  retry: RetryRequestSnapshot,
): void {
  if (original.id === retry.id) reject("Retry tidak boleh menunjuk permintaan yang sama.", { reason: "self_retry" });
  if (original.studentId !== retry.studentId) reject("Retry lintas siswa ditolak.", { reason: "student_mismatch" });
  if (original.conversationId !== retry.conversationId) reject("Retry lintas percakapan ditolak.", { reason: "conversation_mismatch" });
  if (original.featureKey !== retry.featureKey) reject("Retry lintas fitur ditolak.", { reason: "feature_mismatch" });
  if (original.status !== "failed" && original.status !== "fallback") {
    reject("Hanya permintaan terminal yang gagal yang dapat diulang.", { reason: "source_not_retryable" });
  }
  if (!original.userMessageId || retry.userMessageId !== original.userMessageId) {
    reject("Retry harus memakai pesan pengguna durable yang sama.", { reason: "user_message_mismatch" });
  }
  if (retry.assistantMessageId) {
    reject("Retry baru tidak boleh memiliki tautan assistant sebelum finalisasi.", { reason: "assistant_link_already_set" });
  }
}

/** Edited Send is a new visible turn, never a retry link to the old message. */
export function assertEditedSend(
  original: RetryRequestSnapshot,
  edited: RetryRequestSnapshot,
): void {
  if (original.id === edited.id
    || original.studentId !== edited.studentId
    || original.conversationId !== edited.conversationId) {
    reject("Edited Send harus tetap di akun dan percakapan yang sama.", { reason: "edited_scope_mismatch" });
  }
  if (edited.userMessageId === original.userMessageId) {
    reject("Edited Send harus membuat pesan pengguna baru.", { reason: "edited_user_message_reused" });
  }
  if (edited.assistantMessageId) {
    reject("Edited Send tidak boleh menautkan assistant sebelum finalisasi.", { reason: "assistant_link_already_set" });
  }
}
