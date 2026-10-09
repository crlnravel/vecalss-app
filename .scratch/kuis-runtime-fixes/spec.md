# Kuis runtime fixes

**Status:** approved for implementation ticket tracking  
**Approved:** 2026-10-09

This spec publishes the approved lifecycle fixes from the [Kuis runtime validation and fix plan](/Users/ravel/.traycer/epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/reviews/kuis-runtime-claims-validation-20261008/index.md) and [ticket breakdown](/Users/ravel/.traycer/epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/kuis-runtime-fix-tickets/index.md).

## Settled behavior

- Quiz close and archive can block new admissions and ordinary discovery, but do not cancel, expire, auto-submit, or shorten the working time of an owned in-progress attempt. Existing attempts remain resumable; students can save, change, clear, and submit answers after close or archive.
- A per-attempt duration is a separate boundary. It starts at first accepted Start, uses continuous server time, does not pause during disconnect, and is not capped by quiz close or archive. On the next request at or after the deadline, the server auto-submits the last saved answers through the pinned scoring and disclosure rules. No unattended scheduler is included.
- Pending `after_close` result releases follow the current stable quiz close across pinned versions. Already released results remain released. Clearing close is rejected while older active attempts or pending results still need a release date under their pinned `after_close` policy.
- An unavailable current score is not displayed as zero. If an earlier released aggregate exists, show it separately and identify its scope.
- Preserve student ownership checks, attempt snapshots, malformed-scoring quarantine, result redaction, and safe aggregate-before-attempt lock ordering.

## Tickets

1. [Move pending result releases with quiz close](issues/01-pending-result-releases.md) — no blocker.
2. [Resume active attempts after close or archive](issues/02-active-attempt-continuation.md) — blocked by 01.
3. [Enforce the attempt's configured duration](issues/03-attempt-duration.md) — blocked by 02.
4. [Distinguish unavailable scores from released zero](issues/04-unavailable-score.md) — no blocker.

The local status `ready-for-agent` means the ticket has a complete implementation brief; the `Blocked by` field still controls when work may start.
