# 03: Enforce the attempt's configured duration

**What to build:** Voyager sees the real time remaining for a timed attempt, and the server enforces a pinned per-attempt deadline. At or after that deadline, the next request auto-submits the last saved answers through the frozen quiz form and its disclosure policy.

**Blocked by:** 02 — Resume active attempts after close or archive.

**Status:** ready-for-agent

- [ ] A timed attempt captures its admitted duration and server start/deadline atomically from the pinned version. Untimed attempts have no relative deadline. Later mentor edits do not change an existing attempt's timing.
- [ ] Time runs continuously from first accepted Start. Disconnecting, leaving, reloading, or resuming does not pause it. Reconciliation occurs on the next Start/resume/replay, load, answer, or submit request at/after the deadline; no unattended scheduler is added.
- [ ] The server checks the deadline under the transaction lock. New answer changes at or after the deadline never persist; the last successfully saved answers are auto-submitted exactly once and both status axes reflect automatic submission.
- [ ] Auto-submission uses existing frozen-form scoring, allowance/retry accounting, and pinned release policy. Malformed forms or invalid scoring evidence remain quarantined with hidden scores rather than receiving a fabricated result.
- [ ] Close/archive never create, cap, or shorten the attempt deadline. An attempt can continue after either event until its own duration expires.
- [ ] The countdown and terminal state reflect server timing after reload/foreground return; client clock changes cannot bypass enforcement. The unlimited-time message appears only when no duration was configured.
- [ ] Historical attempts use provable pinned timing where available; no deadline is guessed from a later mutable quiz setting. Document and test treatment of rows without enough history.
- [ ] Registered DB-backed tests with a controlled clock cover deadline−1 ms/equality/+1 ms, lock waits crossing the deadline, reload/replay, disconnect, auto-submit, answer races, pinned-version changes, untimed attempts, close/archive continuation, authorization, and invalid forms. Rendered tests cover the countdown and terminal UI.

**Verification:** Run versioning/runtime/storage, answer/scoring-release, continuation, and schema/serialization contracts, plus the repository verification gate. Use guarded RTK commands for future Node/package/database operations.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/03-attempt-duration` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
