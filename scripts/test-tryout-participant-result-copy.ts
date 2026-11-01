import assert from "node:assert/strict";

import { studentResultActionLabel, studentResultBadge, studentResultMessage } from "@/lib/tryout/participant-result-copy";

const future = new Date("2026-11-02T03:00:00.000Z");
const past = new Date("2026-11-01T03:00:00.000Z");
const now = new Date("2026-11-01T12:00:00.000Z");

assert.equal(studentResultBadge("released").label, "Hasil sudah dibuka");
assert.equal(studentResultBadge("unreleased").label, "Hasil belum dibuka");
assert.equal(studentResultBadge("processing").label, "Hasil sedang disiapkan");
assert.equal(studentResultBadge("review").label, "Hasil sedang diperiksa Kapten");
assert.equal(studentResultActionLabel("released"), "Lihat hasil");
for (const state of ["unreleased", "processing", "review", null] as const) assert.equal(studentResultActionLabel(state), "Periksa status hasil");

// The student-facing text names the Kapten and never an internal "operator" or a bare technical state.
const messages = [
  studentResultMessage("released"),
  studentResultMessage("review"),
  studentResultMessage("processing"),
  studentResultMessage("unreleased", { availableUntil: future, now, policy: "manual" }),
  studentResultMessage("unreleased", { availableUntil: past, now, policy: "manual" }),
  studentResultMessage("unreleased", { availableUntil: future, now, policy: "automatic_at_end" }),
  studentResultMessage("unreleased", { availableUntil: past, now, policy: "automatic_at_end" }),
  studentResultMessage("unreleased", { now, policy: "scheduled", scheduledReleaseAt: future }),
  studentResultMessage("unreleased", { now, policy: "scheduled" }),
  studentResultMessage("unreleased", { now, policy: "immediate" }),
];
for (const message of messages) assert.doesNotMatch(message, /operator|AssessmentRelease|snapshot|digest|\bv\d/i, message);
assert.match(studentResultMessage("unreleased", { availableUntil: future, now, policy: "manual" }), /Kapten.*setelah sesi berakhir pada .*WIB/);
assert.match(studentResultMessage("unreleased", { availableUntil: past, now, policy: "manual" }), /Sesi sudah berakhir; Kapten/);
assert.match(studentResultMessage("unreleased", { availableUntil: future, now, policy: "automatic_at_end" }), /otomatis setelah sesi berakhir pada .*WIB/);
assert.match(studentResultMessage("unreleased", { now, policy: "scheduled", scheduledReleaseAt: future }), /otomatis pada .*WIB/);
assert.match(studentResultMessage("unreleased", { now, policy: "scheduled" }), /sesuai jadwal rilis/);
// Every not-yet-open message starts with the same words, so the three student surfaces agree.
for (const message of messages.slice(3)) assert.match(message, /^Hasil belum dibuka\./);

console.log("Tryout participant result copy contracts passed.");
