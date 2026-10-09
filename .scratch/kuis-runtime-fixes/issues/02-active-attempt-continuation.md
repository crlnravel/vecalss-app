# 02: Resume active attempts after close or archive

**What to build:** Voyager can return to the same active quiz after Kapten closes or archives it, recover saved answers, continue editing, and submit. A student without an active attempt cannot use this continuation path to gain new admission.

**Blocked by:** 01 — Move pending result releases with quiz close.

**Status:** in-progress

- [ ] A fresh Start/resume after close or archive returns the student's existing active attempt before new-admission checks. It does not allocate another attempt or activate a newer snapshot for that work.
- [ ] The authenticated quiz route without an attempt ID recovers the student's owned active attempt. Valid known attempt-ID routes continue to work; malformed or foreign IDs fail closed.
- [ ] Existing attempts remain in progress after close/archive and can load, save, change, clear, and submit answers, including at and after close-time equality. Close/archive do not create or shorten the attempt's own duration deadline.
- [ ] New admissions remain blocked by close/archive/visibility/opening rules. Attempt limits and retry delays block only new attempts, not continuation.
- [ ] Accepted Start-command replay remains idempotent. Existing work keeps its original form, saved answers, and attempt number; terminal attempts are never reopened.
- [ ] Both mentor archive entry points preserve active attempt rows and saved answers. Archive copy explains that new access is unavailable while existing work can continue.
- [ ] Pinned scoring and disclosure rules remain intact. Submission after the current close follows the `after_close` policy wired in ticket 01.
- [ ] Registered route/action and DB tests cover close boundaries, both archive paths, fresh resume, replay, no-ID recovery, known attempt IDs, answer changes/clears, submission, no-active admission, ownership, retries, pending drafts, and races with answer/save/submit.
- [ ] Register the existing quiz-start availability check in the package test suite and add behavior-level server assertions; pure helper/source-shape assertions alone are insufficient.

**Verification:** Run availability, versioning/runtime/storage, owned-editing, dashboard lifecycle, and serialization contracts, plus the repository verification gate. Browser verification follows the project's Obscura/Ego approval policy.

## Implementation evidence (2026-10-09, partial)

**Latest:** implementation `9cbf031`/`80d3b36`, test corrections `daaaeb3`/`4744281`.
Final registered continuation DB suite passes (including multiple accepted keys,
terminal replay, both archive/submit races and deterministic submit-before-replay)
in `/tmp/krf02-final.log`. Local migration applied and regenerated client; related
DB/storage/availability checks pass in `/tmp/krf02-migrated.log`. Six approved
normal launch groups used. Lint passes; full verify compiles then fails baseline
Materi `parentHref` prop typing. The three disclosed static checks still fail.
Fresh independent Spec/Standards reviews are pending; integration gate remains
open, so this ticket is not marked complete. The paragraphs below are phase-one
history and are superseded by this latest result.

Isolated branch `krf-02-active-attempt-continuation`, baseline `cadf375`.
Fresh Start at exact close reproduced red, then passed after removing the
continuation availability gate. No-ID route loader then reproduced red; recovery,
explicit-ID failure, locked replay, resume request binding and truthful archive
copy are implemented. The expanded registered DB regression found the original
one-command-per-attempt constraint: multiple accepted resume keys require a
forward migration to a one-to-many Start-command relation. Coordinator approved
that migration and local dependency cloning; work remains in progress.

Three normal guarded groups used. In `/tmp/krf02-green.log`, availability,
Kuis versioning, storage, owned editing, pending release DB, dashboard pure/DB,
and resource edit-lock checks pass. Runtime/source-shape checks fail on pre-existing
`bulkUpdateStandaloneQuizLifecycleVersioned` and `withTransientAuthoringEditLeases`
expectations; writer-registry fails its obsolete production script list. No tests
were weakened. Lint passes with one existing settings warning. Verify build is
blocked by Turbopack refusing the external node_modules symlink. Early tsc reports
missing generated Next route types and an unrelated Materi builder prop mismatch.
Continuation suite is not green yet (P2002 on unique Start-command attempt ID).
No browser, schema migration, or nonlocal database action performed in this phase.

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/02-active-attempt-continuation` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
