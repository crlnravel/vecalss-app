import assert from "node:assert/strict";

import {
  formatTryoutDateTime,
  formatTryoutDateTimeLocal,
  parseTryoutDateTime,
} from "../lib/tryout/time";

const start = parseTryoutDateTime("2026-08-25T16:14");
const end = parseTryoutDateTime("2026-08-25T16:23");

assert.equal(start.toISOString(), "2026-08-25T09:14:00.000Z");
assert.equal(end.toISOString(), "2026-08-25T09:23:00.000Z");
assert.equal(formatTryoutDateTimeLocal(start), "2026-08-25T16:14");
assert.equal(formatTryoutDateTimeLocal(end), "2026-08-25T16:23");
assert.equal(formatTryoutDateTime("2026-08-25T09:14:00.000Z"), "25 Agu 2026, 16.14");

const alreadyZoned = parseTryoutDateTime("2026-08-25T09:14:00.000Z");
assert.equal(alreadyZoned.toISOString(), "2026-08-25T09:14:00.000Z");

console.log("Tryout WIB schedule checks passed.");
