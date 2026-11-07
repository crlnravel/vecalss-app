import { VERA_TIME_ZONE } from "./config";

/**
 * How the usage meter words its numbers: the share of a limit that is used, and when a window resets. Pure and client-safe, so the
 * header pill, the popover and the ledger checks read the same figures.
 */

const MINUTE_MS = 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// `h23` keeps midnight at hour 0. Some runtimes read `hour12: false` as hour 24 there.
const JAKARTA_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: VERA_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** The share of a limit that is used, from 0 to 100. Past the limit it stays at 100. */
export function usagePercent(used: number, hardLimit: number): number {
  if (used <= 0) return 0;
  if (hardLimit <= 0) return 100;
  return Math.min(100, (used / hardLimit) * 100);
}

/**
 * The share as the meter shows it: "0%" when nothing is used, "<1%" for a small share that would otherwise round to 0, and a whole
 * percent for everything else.
 */
export function formatUsagePercent(used: number, hardLimit: number): string {
  const share = usagePercent(used, hardLimit);
  if (share === 0) return "0%";
  if (share < 0.5) return "<1%";
  return `${Math.round(share)}%`;
}

/** The time until a reset, in hours and minutes: "Reset dalam 3j 40m", or "Reset dalam 40m" under an hour. */
export function formatResetIn(resetsAt: Date | string, now: Date): string {
  const minutes = Math.max(1, Math.floor((new Date(resetsAt).getTime() - now.getTime()) / MINUTE_MS));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `Reset dalam ${rest}m`;
  return rest === 0 ? `Reset dalam ${hours}j` : `Reset dalam ${hours}j ${rest}m`;
}

/** The reset moment on the Jakarta clock: "Reset 9 Nov 00.00". The year appears only when it is not the current year. */
export function formatResetAt(resetsAt: Date | string, now: Date): string {
  const at = jakartaClock(new Date(resetsAt));
  const year = at.year === jakartaClock(now).year ? "" : ` ${at.year}`;
  return `Reset ${at.day} ${MONTHS[at.month - 1]}${year} ${pad(at.hour)}.${pad(at.minute)}`;
}

function jakartaClock(date: Date) {
  const parts = Object.fromEntries(JAKARTA_CLOCK.formatToParts(date).map((part): [string, string] => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
