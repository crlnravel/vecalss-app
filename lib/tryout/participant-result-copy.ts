import type { ParticipantTryoutResultAvailability } from "@/lib/tryout/participant-result-projection";
import { formatTryoutDateTime } from "@/lib/tryout/time";

type StudentResultState = NonNullable<ParticipantTryoutResultAvailability>;

/** Short state name for badges. "dibuka" is the one verb for a result the student can open. */
const RESULT_BADGES: Record<StudentResultState, { label: string; tone: "attention" | "neutral" }> = {
  processing: { label: "Hasil sedang disiapkan", tone: "attention" },
  released: { label: "Hasil sudah dibuka", tone: "neutral" },
  review: { label: "Hasil sedang diperiksa Kapten", tone: "attention" },
  unreleased: { label: "Hasil belum dibuka", tone: "attention" },
};

/** Primary action for a finished attempt: only an open result is a "view". */
function studentResultActionLabel(availability: ParticipantTryoutResultAvailability) {
  return availability === "released" ? "Lihat hasil" : "Periksa status hasil";
}

function studentResultBadge(availability: StudentResultState) {
  return RESULT_BADGES[availability];
}

type ResultWaitInput = {
  availableUntil?: Date | string | null;
  now?: Date;
  policy?: string | null;
  scheduledReleaseAt?: Date | string | null;
};

const wib = (value: Date | string) => `${formatTryoutDateTime(value)} WIB`;

/**
 * Sentence telling a student why their finished attempt has no open result yet
 * and when to expect it. Names the Kapten, not an internal "operator".
 */
function studentResultMessage(availability: ParticipantTryoutResultAvailability, input: ResultWaitInput = {}) {
  if (availability === "released") return "Hasilmu sudah dibuka.";
  if (availability === "review") return "Skormu tersimpan, tetapi hasilnya sedang diperiksa Kapten sebelum bisa dibuka.";
  if (availability === "processing") return "Hasil sedang disiapkan. Kamu bisa memeriksa lagi nanti.";
  const now = input.now ?? new Date();
  const until = input.availableUntil ? new Date(input.availableUntil) : null;
  const ended = until !== null && until.getTime() <= now.getTime();
  switch (input.policy) {
    case "manual":
      return until && !ended
        ? `Hasil belum dibuka. Kapten membukanya setelah sesi berakhir pada ${wib(until)}.`
        : "Hasil belum dibuka. Sesi sudah berakhir; Kapten akan membukanya setelah semua hasil siap.";
    case "automatic_at_end":
      return until && !ended
        ? `Hasil belum dibuka. Hasil terbuka otomatis setelah sesi berakhir pada ${wib(until)}.`
        : "Hasil belum dibuka. Sesi sudah berakhir; hasil terbuka otomatis begitu semua hasil siap.";
    case "scheduled":
      return input.scheduledReleaseAt
        ? `Hasil belum dibuka. Hasil terbuka otomatis pada ${wib(input.scheduledReleaseAt)}.`
        : "Hasil belum dibuka. Hasil terbuka otomatis sesuai jadwal rilis.";
    default:
      return "Hasil belum dibuka. Hasil terbuka begitu semua penilaian selesai. Periksa lagi sebentar lagi.";
  }
}

export { studentResultActionLabel, studentResultBadge, studentResultMessage };
