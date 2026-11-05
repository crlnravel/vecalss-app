/**
 * Asia/Jakarta calendar windows for the Vera limits. WIB has no daylight
 * saving, so a fixed UTC+7 offset is exact. Date.UTC normalises overflowing
 * days and months, which covers month and year rollover.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type VeraWindow = { start: Date; resetsAt: Date };

type WibDate = { year: number; month: number; day: number; weekday: number };

/** `weekday` follows getUTCDay: 0 is Sunday. */
function wibDate(instant: Date): WibDate {
  const shifted = new Date(instant.getTime() + WIB_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function wibMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - WIB_OFFSET_MS);
}

/** The calendar day in WIB, from 00:00 to the next 00:00. */
export function dayWindow(now: Date): VeraWindow {
  const { year, month, day } = wibDate(now);
  return { start: wibMidnight(year, month, day), resetsAt: wibMidnight(year, month, day + 1) };
}

/** ISO week in WIB: Monday 00:00 to the next Monday 00:00. */
export function weekWindow(now: Date): VeraWindow {
  const { year, month, day, weekday } = wibDate(now);
  const sinceMonday = (weekday + 6) % 7;
  return {
    start: wibMidnight(year, month, day - sinceMonday),
    resetsAt: wibMidnight(year, month, day - sinceMonday + 7),
  };
}

/** Calendar month in WIB. */
export function monthWindow(now: Date): VeraWindow {
  const { year, month } = wibDate(now);
  return { start: wibMidnight(year, month, 1), resetsAt: wibMidnight(year, month + 1, 1) };
}
