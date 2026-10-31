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
  const session = tryout.assignment ?? tryout.session;
  if (!session) return "upcoming";
  if (new Date(session.availableFrom).getTime() <= now && new Date(session.availableUntil).getTime() > now) return "ongoing";
  if (new Date(session.availableFrom).getTime() > now) return "upcoming";
  return "finished";
}

function canEnterParticipantWaitingRoom(tryout: ParticipantTryout) {
  if (tryout.admissionStatus !== "active") return false;
  const assignment = tryout.assignment;
  if (!assignment) return false;
  return Boolean(
    assignment.attempt ||
      (assignment.status === "active" && !assignment.isExpired),
  );
}

export {
  canEnterParticipantWaitingRoom,
  formatDuration,
  formatSchedule,
  getTryoutState,
};
export type { TryoutState };
