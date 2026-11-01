import type { TryoutSessionReadiness } from "@/lib/tryout/result-readiness";
import { formatTryoutDateTime } from "@/lib/tryout/time";

type ParticipantResultStatusInput = {
  inProgress: boolean;
  result?: { releaseState: string; resultReadiness: string } | null;
};

type ParticipantResultStatus = {
  hint: string | null;
  label: string;
  tone: "attention" | "info" | "neutral" | "success";
};

/**
 * Kapten-facing release status for one participant, derived from the operations
 * result projection. Raw scoring/review reasons never reach this label; the
 * participant detail page is where a Kapten reads those.
 */
function describeParticipantResultStatus({ inProgress, result }: ParticipantResultStatusInput): ParticipantResultStatus | null {
  if (inProgress || !result || result.resultReadiness === "not_started") return null;
  if (result.resultReadiness === "review_required") {
    return { hint: "Peserta belum bisa membuka hasilnya. Buka pengerjaan ini untuk melihat penyebabnya.", label: "Perlu diperiksa", tone: "attention" };
  }
  if (result.resultReadiness === "scoring_pending") {
    return { hint: "Skor belum selesai dihitung.", label: "Menunggu penilaian", tone: "neutral" };
  }
  if (result.releaseState === "released") return { hint: null, label: "Dirilis", tone: "success" };
  if (result.releaseState === "scheduled") return { hint: "Hasil terbuka otomatis sesuai jadwal rilis.", label: "Terjadwal", tone: "info" };
  return { hint: "Skor sudah siap. Peserta bisa melihatnya setelah hasil dirilis.", label: "Belum dirilis", tone: "neutral" };
}

/**
 * Why the "Rilis hasil" action cannot be used right now, in words a Kapten can
 * act on. Returns null when the action is available or not applicable. Order
 * follows what the Kapten can change soonest.
 */
function describePublishBlockedReason(snapshot: TryoutSessionReadiness, available: boolean): string | null {
  // Only manual release has an action to explain; other rules open results on their own.
  if (snapshot.effectivePolicy !== "manual") return null;
  // A release with a receipt opens "Lihat catatan rilis"; one without (older data) leaves the button off, so say why.
  if (snapshot.publication) return snapshot.publication.receipt ? null : `Hasil sesi ini sudah dirilis pada ${formatTryoutDateTime(snapshot.publication.releasedAt)} WIB.`;
  if (!available) return "Kesiapan hasil sedang diperiksa. Tunggu sebentar atau muat ulang halaman.";
  if (snapshot.ready) return null;
  const has = (category: TryoutSessionReadiness["blockers"][number]["category"]) => snapshot.blockers.some((blocker) => blocker.category === category);
  if (has("end")) return `Sesi belum berakhir. Hasil bisa dirilis setelah ${formatTryoutDateTime(snapshot.availableUntil)} WIB.`;
  if (has("empty")) return "Belum ada pengerjaan yang bisa disertakan dalam rilis.";
  const attention = snapshot.counts.blocked;
  if (has("unfinished")) {
    const unfinished = new Set(snapshot.blockers.filter((blocker) => blocker.category === "unfinished" && blocker.attemptId).map((blocker) => blocker.attemptId)).size;
    return `${unfinished || attention} pengerjaan belum selesai. Hasil bisa dirilis setelah semuanya selesai.`;
  }
  if (attention > 0) return `${attention} dari ${snapshot.counts.candidates} pengerjaan perlu diperiksa. Cari peserta berstatus “Perlu diperiksa” di daftar ini.`;
  return "Hasil sesi ini belum siap dirilis. Muat ulang halaman, lalu periksa lagi.";
}

/**
 * One line naming the release rule in effect for the selected session, so a
 * Kapten can tell why "Rilis hasil" exists (or does not) without a settings widget.
 */
function describeResultReleaseRule(input: { availableUntil?: string | null; defaultPolicy: string; scheduledReleaseAt?: string | null; sessionPolicy?: string | null }): string {
  const policy = !input.sessionPolicy || input.sessionPolicy === "inherit" ? input.defaultPolicy : input.sessionPolicy;
  const at = (value?: string | null) => (value ? ` ${formatTryoutDateTime(value)} WIB` : "");
  switch (policy) {
    case "manual":
      return "Aturan rilis: Kapten merilis hasil setelah sesi berakhir.";
    case "automatic_at_end":
      return input.availableUntil ? `Aturan rilis: terbuka otomatis setelah sesi berakhir,${at(input.availableUntil)}.` : "Aturan rilis: terbuka otomatis setelah sesi berakhir.";
    case "scheduled":
      return input.scheduledReleaseAt ? `Aturan rilis: terbuka otomatis pada${at(input.scheduledReleaseAt)}.` : "Aturan rilis: terbuka otomatis sesuai jadwal.";
    case "immediate":
      return "Aturan rilis: terbuka otomatis setelah semua skor siap.";
    default:
      return "Aturan rilis belum tersedia.";
  }
}

export { describeParticipantResultStatus, describePublishBlockedReason, describeResultReleaseRule };
export type { ParticipantResultStatus };
