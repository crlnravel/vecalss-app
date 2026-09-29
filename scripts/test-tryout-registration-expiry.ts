import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canRequestNewTryoutAdmission,
  isTryoutAdmissionSessionAvailable,
  isTryoutSessionExpired,
} from "../lib/tryout/registration-availability";

const [delivery, participantRepository, detail, catalogue] = await Promise.all([
  readFile(new URL("../lib/tryout/delivery-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/tryout/participant-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutDetailModule.tsx", import.meta.url), "utf8"),
  readFile(new URL("../modules/tryout/ParticipantTryoutWorkspace.tsx", import.meta.url), "utf8"),
]);

const registrationStart = delivery.indexOf("async function registerForTryout(");
const registrationEnd = delivery.indexOf("async function decideTryoutAdmission(", registrationStart);
assert.ok(registrationStart >= 0 && registrationEnd > registrationStart);
const registration = delivery.slice(registrationStart, registrationEnd);
const defaultWindowCheck = registration.indexOf(
  "findDefaultSessionCandidate(tx, tryoutId)",
);
const admissionCreate = registration.indexOf("tx.tryoutAdmission.create");
assert.ok(defaultWindowCheck >= 0, "approval-required registration checks the default session");
assert.ok(admissionCreate > defaultWindowCheck, "the session check runs before creating an admission");
assert.ok(
  registration.indexOf("lockSessionScope(tx, admissionWindowSession)") < admissionCreate,
  "a configured session is locked before the new admission is created",
);
assert.ok(
  registration.indexOf("admissionWindowSession.id, new Date()") < admissionCreate,
  "the selected registration window is rechecked after locking",
);
assert.match(registration, /status === TryoutAdmissionStatus.active && !admissionWindowSession/);
assert.match(delivery, /isTryoutAdmissionSessionAvailable/);
assert.match(participantRepository, /isTryoutSessionExpired/);
assert.match(detail, /canRequestNewTryoutAdmission/);
assert.match(detail, /registrationWindowClosed/);
assert.match(detail, /Sesi ini sudah berakhir/);
assert.match(catalogue, /canRequestNewTryoutAdmission/);
assert.match(catalogue, /registrationUnavailable/);
assert.match(catalogue, /Lihat detail/);

const now = new Date("2026-09-27T05:00:00.000Z");
const expiredDefaultSession = {
  assessmentReleaseId: "release-expired",
  availableUntil: new Date("2026-09-19T16:00:00.000Z"),
  id: "session-expired",
  isDefaultOpenRegistration: true,
  status: "active",
};
const futureDefaultSession = {
  ...expiredDefaultSession,
  availableUntil: new Date("2026-10-01T16:00:00.000Z"),
  id: "session-future",
};

assert.equal(isTryoutSessionExpired(expiredDefaultSession.availableUntil, now), true);
assert.equal(isTryoutSessionExpired(futureDefaultSession.availableUntil, now), false);
assert.equal(isTryoutAdmissionSessionAvailable(expiredDefaultSession, now), false);
assert.equal(isTryoutAdmissionSessionAvailable(futureDefaultSession, now), true);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [expiredDefaultSession], now),
  false,
  "an expired default session cannot accept an approval-pending admission",
);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [futureDefaultSession], now),
  true,
);
assert.equal(
  canRequestNewTryoutAdmission("approval_required", [], now),
  true,
  "approval-required registration remains available before a session is created",
);
assert.equal(
  canRequestNewTryoutAdmission("open", [expiredDefaultSession], now),
  false,
);
assert.equal(
  canRequestNewTryoutAdmission("open", [], now),
  false,
);
assert.equal(
  canRequestNewTryoutAdmission(
    "open",
    [futureDefaultSession],
    now,
    futureDefaultSession.id,
  ),
  true,
);
assert.equal(isTryoutSessionExpired(now, now), true, "the end instant is exclusive");

console.log("Tryout registration-expiry checks passed.");
