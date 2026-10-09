# 01: Move pending result releases with quiz close

**What to build:** When Kapten moves a quiz's close time, Voyager's still-pending `after_close` results follow the new close. The schedule save and affected release updates commit together; already released results stay released, and active students continue working subject only to their own duration.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Extending close moves eligible pending release times to the new close across earlier and current pinned quiz versions. Reads before the new close remain unreleased; reads at the boundary release eligible results.
- [ ] Shortening close updates eligible pending releases. Already released results remain released after schedule changes and repeated saves.
- [ ] Rescheduling uses each attempt's pinned review/scoring policy. Immediate, never, malformed-scoring, and review-required outcomes are not incorrectly released.
- [ ] Clearing close is rejected while any older active attempt or pending result still needs a release date under its pinned `after_close` policy, including when the new draft changes review policy. Rejection leaves the schedule and result records unchanged.
- [ ] Active attempts are not ended, retimed, or detached from their pinned form by close changes. Submitting after the current close follows the `after_close` release rule.
- [ ] Schedule save, submission, and result synchronization use consistent quiz-aggregate-before-attempt lock ordering, deterministic multi-row locks, and post-lock ownership/state checks. Race outcomes are bounded and match a legal serial order.
- [ ] Registered DB-backed tests use a controlled server clock and dedicated fixtures to cover extending, shortening, due/equal boundaries, close clearing, repeated saves, pinned-version policy exclusions, submissions, result reads, and races.

**Verification:** Run the relevant versioning, schedule, scoring-release, storage, and lock/writer-registry contracts, plus the repository verification gate. Helper-only tests do not replace persisted schedule/release assertions.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/01-pending-result-release` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
