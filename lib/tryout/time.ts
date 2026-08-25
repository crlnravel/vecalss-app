const TRYOUT_TIME_ZONE = "Asia/Jakarta";
const WIB_OFFSET = "+07:00";

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

/**
 * Parse a Tryout date input without depending on the server's local timezone.
 * Values from datetime-local controls are intentionally timezone-less; in this
 * product they are always WIB. Already-zoned ISO values and Date instances are
 * kept as absolute instants.
 */
function parseTryoutDateTime(value: Date | string) {
  if (value instanceof Date) return value;

  const normalized = value.trim();
  return localDateTimePattern.test(normalized)
    ? new Date(`${normalized}${WIB_OFFSET}`)
    : new Date(normalized);
}

function wibParts(value: Date | string) {
  const date = parseTryoutDateTime(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: TRYOUT_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  return Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
}

function formatTryoutDateTimeLocal(value: Date | string) {
  const parts = wibParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function formatTryoutDateTime(value: Date | string) {
  const date = parseTryoutDateTime(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TRYOUT_TIME_ZONE,
  }).format(date);
}

export { formatTryoutDateTime, formatTryoutDateTimeLocal, parseTryoutDateTime, TRYOUT_TIME_ZONE };
