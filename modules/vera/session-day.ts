import { VERA_TIME_ZONE } from "../../lib/vera/config";

/**
 * How the conversation list groups and times a session's last update, on the Jakarta calendar. Pure and client-safe, so the list and the
 * ledger checks read the same groups.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: VERA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
// `h23` keeps midnight at 00, as the times read in the list.
const CLOCK = new Intl.DateTimeFormat("id-ID", {
  timeZone: VERA_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const CALENDAR = new Intl.DateTimeFormat("id-ID", { timeZone: VERA_TIME_ZONE, day: "numeric", month: "short" });

export type SessionDay = "today" | "yesterday" | "older";

export const SESSION_DAY_LABELS: Record<SessionDay, string> = {
  today: "Hari ini",
  yesterday: "Kemarin",
  older: "Lebih lama",
};

/** The group a session's last update falls in, counted by the Jakarta calendar day. */
export function sessionDay(updatedAt: string, now: Date): SessionDay {
  const day = DAY_KEY.format(new Date(updatedAt));
  if (day === DAY_KEY.format(now)) return "today";
  if (day === DAY_KEY.format(new Date(now.getTime() - DAY_MS))) return "yesterday";
  return "older";
}

/** The time of a session's last update: the clock on the same day, such as "12.40", and the day and month before that. */
export function sessionTime(updatedAt: string, now: Date): string {
  const at = new Date(updatedAt);
  return sessionDay(updatedAt, now) === "today" ? CLOCK.format(at) : CALENDAR.format(at);
}
