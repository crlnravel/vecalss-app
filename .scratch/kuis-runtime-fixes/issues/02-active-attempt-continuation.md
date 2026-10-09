# 02: Resume active attempts after close or archive

**What to build:** Voyager can return to the same active quiz after Kapten closes or archives it, recover saved answers, continue editing, and submit. A student without an active attempt cannot use this continuation path to gain new admission.

**Blocked by:** 01 — Move pending result releases with quiz close.

**Status:** ready-for-agent

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

**Planning source:** Approved ticket artifact `kuis-runtime-fix-tickets/tickets/02-active-attempt-continuation` in epic `788a92f9-1c5a-4fc5-b873-76ac11c9949c`.
