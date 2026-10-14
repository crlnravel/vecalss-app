import type { ParticipantActionIntent, ParticipantActionReadReply, ParticipantActionWriteReply } from "@/lib/tryout/participant-action-recovery";

type RegistrationResult = { state: string; status: string | null; deliverySessionId: string | null };
type WriteFailure = { ok: false; confirmedRefusal: boolean; message: string };

/** Ordinary GET deliberately bypasses Next's serialized Server Action queue. */
export async function readParticipantRecovery(intent: ParticipantActionIntent, fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch): Promise<ParticipantActionReadReply> {
  const query = new URLSearchParams({ kind: intent.kind, tryoutId: intent.tryoutId });
  if (intent.sessionId) query.set("sessionId", intent.sessionId);
  const response = await fetcher(`/api/tryout/recovery?${query}`, { cache: "no-store", credentials: "same-origin", method: "GET" });
  if (!response.ok) return { ok: false };
  return await response.json() as ParticipantActionReadReply;
}

/** The UI and behavior tests both use these exact registration/Start adapters. */
export function createParticipantRecoveryTransport(actions: {
  register: (tryoutId: string, target: { majorId: string; universityId: string }, sessionId?: string) => Promise<{ ok: true; result: RegistrationResult } | WriteFailure>;
  start: (sessionId: string) => Promise<{ ok: true; result: { attemptId: string } } | WriteFailure>;
  inspect: (intent: ParticipantActionIntent) => Promise<ParticipantActionReadReply>;
}) {
  return {
    read: actions.inspect,
    write: async (intent: ParticipantActionIntent): Promise<ParticipantActionWriteReply> => {
      if (intent.kind === "start") {
        const reply = await actions.start(intent.sessionId);
        return reply.ok ? { ok: true, destination: { kind: "attempt", attemptId: reply.result.attemptId, sessionId: intent.sessionId, result: false } } : reply;
      }
      const reply = await actions.register(intent.tryoutId, intent.target, intent.sessionId);
      if (!reply.ok) return reply;
      if (reply.result.state === "unavailable") return { ok: false, confirmedRefusal: true, message: "Belum ada sesi tryout yang dapat menerima pendaftaran. Targetmu belum diubah; coba lagi setelah Kapten membuka jadwal baru." };
      const sessionId = reply.result.status === "active" ? reply.result.deliverySessionId : null;
      return { ok: true, destination: sessionId ? { kind: "waiting", sessionId } : { kind: "detail" } };
    },
  };
}
