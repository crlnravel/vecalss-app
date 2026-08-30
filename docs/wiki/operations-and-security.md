# Operations and security

## Authentication and authorization

- Sessions use opaque cookie tokens whose stored values are hashed; the
  session record carries active/revoked/expired state.
- `requireSession` establishes an authenticated context. Role-specific gates
  (`requireStudentSession`, `requireTutorSession`, and `requireAdminSession`)
  redirect unauthorized users to their authorized home rather than exposing a
  raw permission error.
- Onboarding and must-change-password state are enforced at the access
  boundary before protected data is loaded.
- Admin student preview is read-only by default, resolves a fixed preview
  subject server-side, and uses explicit safe restart/idempotency rules. It is
  not general student impersonation.

## Data and side-effect boundaries

Preview and learner DTOs should expose only the fields needed by their surface.
Do not pass raw Prisma rows to client components. Managed text is sanitized,
known video providers require HTTPS, and private documents/media are delivered
through signed/no-store paths where applicable.

The preview read boundary rejects persistence writes, queues/events, analytics,
notifications, webhooks, external writes, delayed jobs, and learner-state
mutations. A preview restart can create a safe retake assignment only through
its transaction-scoped lock and idempotency contract; it must not create an
attempt or session as a side effect of reading the preview.

## Assessment integrity

Tryout publication pins an immutable `AssessmentRelease`. Runtime delivery,
scoring, and result release read the pinned release and frozen snapshots rather
than mutable authoring rows. Participant operations are owner-scoped and use
safe projections; scores, attempts, release payloads, and integrity events are
hidden until the established release gates allow them.

Kuis version digests include semantic question/choice/source identity and
assembly identity while ignoring generated IDs and operational schedule
fields. Version state transitions are monotonic (`draft → active →
superseded`). A replacement must not rewrite historical attempts or results.

## Vera AI privacy and governance

Vera AI messages use encrypted/digested envelopes with compatibility handling
for legacy records. Requests carry idempotency/fingerprint and retry metadata,
provider/routing state, quota reservations, and retention/lifecycle controls.
The admin control plane reports operational aggregates, not student
conversation text, and suppresses small cohorts and complementary groups when
privacy thresholds are not met.

Policy bundles are immutable/versioned and use validation, preview, dual
approval, scheduled activation, rollback, and audit paths. Provider screens
mask credential fingerprints. Any new AI metric or admin endpoint must preserve
the admitted/rejected taxonomy and privacy-safe projection boundary.

## Media, workers, and headers

- Media preview and thumbnail routes validate scope and asset identity before
  resolving a signed URL.
- Admin import work is separated into API commands and a worker path; worker
  readiness and retry behavior are covered by focused contract scripts.
- The admin preview route family applies CSP, same-origin referrer policy, and
  `nosniff` headers. Embedded media frames are limited to the configured
  YouTube/Vimeo origins.
- Redis/BullMQ and object storage are optional infrastructure at development
  time but become operational dependencies for the workflows that use them.

## Change safety

Protected files include `DESIGN.md`, `PRODUCT.md`, environment files, and
Prisma migrations unless the task explicitly authorizes their change. Avoid
editing generated output directly. Preserve unrelated dirty files in the
shared worktree, make small scoped commits, and leave a handoff describing
verification, blockers, and the next safe step.
