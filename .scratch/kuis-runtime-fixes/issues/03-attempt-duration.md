# 03: Enforce the attempt's configured duration

**What to build:** Voyager sees the real time remaining for a timed attempt, and the server enforces a pinned per-attempt deadline. At or after that deadline, the next request auto-submits the last saved answers through the frozen quiz form and its disclosure policy.

**Blocked by:** 02 — Resume active attempts after close or archive.

**Status:** complete

- [x] A timed attempt captures its admitted duration and server start/deadline atomically from the pinned immutable version, or from the admitted stable definition when the versioning cutover is disabled. Untimed attempts have no relative deadline. Later mentor edits do not change an existing attempt's timing.
- [x] Time runs continuously from first accepted Start. Disconnecting, leaving, reloading, or resuming does not pause it. Reconciliation occurs on the next Start/resume/replay, load, answer, or submit request at/after the deadline; no unattended scheduler is added.
- [x] The server checks the deadline under the transaction lock. New answer changes at or after the deadline never persist; the last successfully saved answers are auto-submitted exactly once and both status axes reflect automatic submission.
- [x] Auto-submission uses existing frozen-form scoring, allowance/retry accounting, and pinned release policy. Malformed forms or invalid scoring evidence remain quarantined with hidden scores rather than receiving a fabricated result.
- [x] Close/archive never create, cap, or shorten the attempt deadline. An attempt can continue after either event until its own duration expires.
- [x] The countdown and terminal state reflect server timing after reload/foreground return; client clock changes cannot bypass enforcement. The unlimited-time message appears only when no duration was configured.
- [x] Historical attempts use provable pinned timing where available; no deadline is guessed from a later mutable quiz setting. Document and test treatment of rows without enough history.
- [x] Registered DB-backed tests prove a timed attempt's duration is snapshotted and enforced on both the pinned-version path and the disabled-cutover stable-definition path, including after later mentor edits.
- [x] Registered DB-backed tests with a controlled clock cover deadline−1 ms/equality/+1 ms, lock waits crossing the deadline, reload/replay, disconnect, auto-submit, answer races, pinned-version changes, untimed attempts, close/archive continuation, authorization, and invalid forms. Rendered tests cover the countdown and terminal UI.

**Verification:** Add registered DB-backed duration-snapshot and enforcement regressions for both the pinned-version and disabled-cutover stable-definition paths. Run versioning/runtime/storage, answer/scoring-release, continuation, and schema/serialization contracts, plus the repository verification gate. Use guarded RTK commands for future Node/package/database operations.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/03-attempt-duration` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.

## Completion evidence (2026-10-10)

- Work is isolated on branch `krf-03-attempt-duration`; the shared `dev` checkout remains untouched.
- Added per-attempt start, duration, and deadline fields; request paths reconcile timed attempts under the existing quiz → participation → attempt locks and use frozen-form scoring/release behavior.
- Migration backfill uses the pinned version as evidence: timed pinned attempts receive their immutable duration and deadline; pinned untimed attempts receive a start marker but no deadline; unversioned history remains unknown and is never inferred from a mutable stable setting.
- Added a registered migration backfill regression, controlled-clock DB duration suite, and UI timer lifecycle suite. Tests cover both cutover paths, mentor duration changes, close/archive continuation, −1 ms/equality/+1 ms boundaries, lock waits, answer/submit/read races, malformed forms, hidden result state, publication changes, and timer refresh/expiry.
- Timer hydration and foreground return use an authenticated server clock sync, monotonic elapsed time, and measured server processing; answer controls lock at expiry and unlock only after an authoritative still-active response. Server-side deadline enforcement remains final.
- Verification passed in one guarded sequential group: migration backfill, KRF-03 DB/UI, Start availability, KRF-02 continuation DB, KRF-01 pending-release DB, Kuis versioning, standalone version storage, TypeScript, lint, and `pnpm verify` (production build included).
- Lint reported two warnings: the existing unused `Badge` in `modules/mentor/KaptenSettingsPageModule.tsx` and the unused `deadlineRequests` counter in the UI test. PostgreSQL emitted its existing concurrent-query deprecation warning. Neither blocked verification.
- Fresh Spec and Standards reviews found no remaining actionable issues after the final timer, historical untimed, and UI lifecycle corrections.
- Existing attempts without persisted timing evidence are not assigned a deadline from current quiz settings; the student sees an em dash and an explanatory note.
