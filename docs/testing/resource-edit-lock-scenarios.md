# Resource edit-lock test scenarios

Use this matrix to validate the edit lock from the mentor workspace and to
track the important lease and concurrency boundaries. These scenarios are a
test plan; they do not claim that browser or database verification has run.

## Current lock behavior

- A resource has at most one active editor at a time; other mentors can read
  it but cannot save changes.
- The lock covers `Materi`, `Kuis`, `Bank Soal`, `Paket Soal`, `Tryout`, Media
  assets, and Media folders.
- An owner renews its two-minute lease every 30 seconds. A lease with no
  renewal expires after two minutes.
- A visible page waiting for a lock retries acquisition every two seconds.
  Polling pauses while that page is hidden.
- A page refresh tries to rotate its saved proof and reclaim the same lease.
  Leaving the page also sends a best-effort release request.

## Test setup

1. Use a local or dedicated test deployment with two Kapten accounts that can
   both access the same saved resource. Keep one browser context for each
   account; use separate resources for parallel scenarios.
2. For same-account, multi-tab cases, open both tabs from the same browser
   profile on the same origin.
3. Start each scenario with no active lease for its resource. Do not clear or
   edit production lease records to prepare a test.
4. For expiry tests, time the wait from the last successful owner heartbeat,
   not from when the contender first sees the warning. Use a disposable test
   resource and allow the full two-minute lease plus one polling interval.

## Mentor workspace scenarios

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| REL-01 | Open an editable saved resource as Kapten A. Observe the page while it checks access, then after acquisition. | Edit controls are disabled while checking and enabled after acquisition. The floating lock notice is absent while checking and while A owns the lock. |
| REL-02 | Keep A editing. Open the same resource as Kapten B. Try each save or edit action available on that page. | B can read the resource, but every authoring change is disabled or rejected. A remains able to edit. On Bank Soal, the notice reads **“Soal Terkunci”** with **“Anda tidak dapat mengedit bank soal ini karena terdapat mentor lain yang sedang mengedit soal yang sama.”** |
| REL-03 | As A, refresh the same tab while A owns the resource. After the page reloads, try to edit. Keep B open as a contender. | A reclaims the lease through its saved proof or reacquires it after release. A becomes editable after checking; B stays read-only. A refresh does not leave a second stale lock behind. |
| REL-04 | With A owning and B waiting visibly, have A leave the editor normally. | A releases its lease. B acquires it on the next successful poll (nominally within two seconds, plus request/render time) and becomes editable without a manual retry. |
| REL-05 | With A owning and B waiting, disconnect A from the network, then close A's tab so the release request cannot reach the server. | B remains read-only while the lease is active, then acquires it after two minutes without a renewal, on the next successful poll. Measure from A's last successful heartbeat. No other editor can save during the wait. |
| REL-06 | Keep A's editor open and responsive for longer than two minutes while B waits. | A's heartbeat keeps the lease active; B remains read-only. A can continue to save. |
| REL-07 | Keep B waiting, hide B's tab, release A's lock, then return B to the foreground. | B does not keep polling while hidden. After it becomes visible, it retries and acquires the available lock within the next polling interval plus request/render time. |
| REL-08 | Open the same resource in two tabs under the same account and attempt to edit in both. | At most one tab is editable. A stale or duplicated tab proof cannot renew or release the current tab's lease. |
| REL-09 | While B is waiting, make the lock request fail transiently, then restore the service without changing the owner. | B stays read-only during the failure and retries automatically. If A still owns the lock, B remains locked; after A releases, B acquires on a later poll. |
| REL-10 | Acquire a lock for resource X as A, then open a different resource Y as B. | X and Y are independent: the lock on X does not prevent B from acquiring Y. |

## Lock and mutation-boundary scenarios

| ID | Scenario and steps | Expected result |
| --- | --- | --- |
| REL-11 | Run two simultaneous acquire requests for the same resource with different holders. | Exactly one request acquires the active lease; the other receives a locked result. There is never a point where both holders can save. |
| REL-12 | Rotate a lease to a new proof, then send renew and release requests with the old proof. | Old requests are rejected and cannot extend or release the new lease. The current holder remains able to edit. |
| REL-13 | Attempt to acquire a resource the signed-in user cannot access, then try an unauthenticated request and a malformed request. | No lease is granted. The resource remains protected, and the response does not reveal private resource details. |
| REL-14 | Acquire a Media asset lock, then try to move or trash a containing folder that would affect that asset. Repeat with a folder transition already in progress, then try to create/finalize an upload into that folder. | Conflicting folder and descendant changes serialize or fail safely. No descendant mutation bypasses an active lease and no partial folder transition remains. |
| REL-15 | In a controlled race, run admin student-preview restart against a Tryout while another request saves, publishes/unpublishes, or deletes it. Repeat against session creation, release, and state-synchronization paths. | Each path takes the Tryout mutex before preview-specific locks, revalidates the source-session mapping after acquiring it, and finishes without deadlock or a write bypassing the shared Tryout boundary. |
| REL-16 | Repeat REL-01 through REL-04 with each resource family: Materi, Kuis, Bank Soal, Paket Soal, Tryout, Media asset, and Media folder. | Each resource family has the same single-editor, read-only, release, and recovery behavior. A lock on one resource does not lock unrelated resources. |

## Existing automated coverage

These focused scripts already exist. Run process-starting commands only
through the shared resource guard. The database script requires
`RESOURCE_EDIT_LOCK_TEST_DATABASE_URL` to point to a local disposable
PostgreSQL database distinct from `DATABASE_URL`; it creates and drops its own
schema.

| Command | Existing coverage |
| --- | --- |
| `./_harness/resource-guard.sh run -- rtk pnpm test:resource-edit-lock` | Token and resource-key validation; route/service source contracts; client lifecycle, heartbeat, and request-shape contracts. |
| `./_harness/resource-guard.sh run -- rtk pnpm test:resource-edit-lock-db` | Isolated PostgreSQL transaction race with one winner, proof rotation, stale renew/release rejection, and the Media mutation mutex. |
| `./_harness/resource-guard.sh run -- rtk pnpm test:authoring-lock-family` | Writer boundaries and lease checks across authoring repositories. |
| `./_harness/resource-guard.sh run -- rtk pnpm test:writer-registry` | Production mutation registry coverage. |

The automated scripts above do not drive a browser. REL-01 through REL-10
still need browser-level acceptance, and REL-14/REL-15 need integration-level
coverage of their cross-resource operations. Browser verification requires
explicit approval naming the route, role/session, and checklist before it is
performed.
