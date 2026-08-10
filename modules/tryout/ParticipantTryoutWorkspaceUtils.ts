import type { ParticipantTryout } from "@/lib/tryout/participant-repository";

const scheduleFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});

type TryoutState = "finished" | "ongoing" | "practice" | "upcoming";

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} menit`;
  return minutes ? `${hours}j ${minutes}m` : `${hours} jam`;
}

function formatSchedule(value?: Date) {
  if (!value) return "Jadwal menyusul";
  return `${scheduleFormatter.format(new Date(value))} WIB`;
}

function getTryoutState(tryout: ParticipantTryout, now: number): TryoutState {
  if (tryout.assessmentType === "diagnostic") return "practice";
  const sessions = tryout.assignments.length ? tryout.assignments : tryout.sessions;
  if (sessions.some((item) => new Date(item.availableFrom).getTime() <= now && new Date(item.availableUntil).getTime() > now)) return "ongoing";
  if (sessions.some((item) => new Date(item.availableFrom).getTime() > now)) return "upcoming";
  if (sessions.length && sessions.every((item) => new Date(item.availableUntil).getTime() <= now)) return "finished";
  return "upcoming";
}

export { formatDuration, formatSchedule, getTryoutState };
export type { TryoutState };
