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
admin preview's embedded-video sanitizer allows only HTTPS YouTube/Vimeo URLs,
and private documents/media are delivered through signed/no-store paths where
applicable. Ordinary Materi hosted-video validation accepts HTTP or HTTPS; do
not apply the stricter preview rule to all content authoring.

The preview read boundary rejects persistence writes, queues/events, analytics,
notifications, webhooks, external writes, delayed jobs, and learner-state
mutations. An explicit Tryout preview restart is the only separate mutation
path: its transaction-scoped lock and idempotency contract may create or reuse
the fixed preview admission, a scoped delivery session/assignment, and audit
records, while reusing an existing published `AssessmentRelease`. Reading the
preview itself must never create a session, attempt, answer, progress mutation,
notification, analytics event, or release.

## Assessment integrity

Tryout publication pins an immutable `AssessmentRelease`. Runtime delivery,
scoring, and result release read the pinned release and frozen snapshots rather
than mutable authoring rows. Participant operations are owner-scoped and use
safe projections; scores, attempts, release payloads, and integrity events are
hidden until the established release gates allow them.

Kuis version digests include semantic question/choice/source identity and
assembly identity while ignoring generated IDs and operational schedule
fields. Version state transitions are monotonic (`draft → active →
superseded`). The default repository runtime resolves an active
`StandaloneQuizVersion`, scopes participation to `(quizVersionId, studentId)`,
and carries that identity into attempts and results. A replacement must not
rewrite historical attempts or results; `KUIS_VERSIONING_CUTOVER=disabled` is
the explicit rollback switch.

## Vera AI privacy and governance

Vera AI messages use encrypted/digested envelopes with compatibility handling
for legacy records. Requests carry idempotency/fingerprint and retry metadata,
provider/routing state, quota reservations, and retention/lifecycle controls.
The admin control plane reports operational aggregates, not student
conversation text, and suppresses small cohorts and complementary groups when
privacy thresholds are not met.

The backend/API policy boundary supports immutable/versioned bundles,
validation, preview, dual approval, scheduled activation, rollback, and audit
paths. The canonical `/admin/ai/policies` page now loads actor-scoped policy
metadata server-side and renders `modules/admin/AiPolicyPageModule.tsx` inside
the admin shell. Its draft, validation, preview, approval, scheduling,
activation, rollback, and retention-extension controls call the corresponding
`/api/admin/ai-policy/*` endpoints and honor the returned mutation capability.
Browser verification remains a separate permission-gated step. Provider screens
mask credential fingerprints. Any new AI metric or admin endpoint must preserve
the admitted/rejected taxonomy and privacy-safe projection boundary.

The learner boundary is deliberately narrower than the historical Vera model;
the exact feature, budget, and rollout contract is recorded in
[`docs/vera-ai/mvp.md`](../vera-ai/mvp.md):
`chat`, `review`, `analysis`, and `route` are the enabled MVP features;
`ptn`, `summary`, and `drill` are rejected as feature-disabled until their
contracts are promoted. Context and history budgets are enforced before
dispatch, and artifact apply has no enabled registry in the MVP. In the
automatic-context cohort, the browser supplies no source IDs: the server
executes one closed released-learning-context tool, persists encrypted
invocation evidence, and disables tools on the final answer turn. The rollout
is off in development and can only advance through the approved cohort gates;
the legacy manual path remains the rollback path.

The `vera_credit_usd_v2` ledger reserves weighted credits and integer USD
micros across daily, ISO-week, and monthly `Asia/Jakarta` windows. It is
scheduled to become effective at `2026-09-30T17:00:00Z`; the policy resolver
uses `vera_quota_v1` before that cutover. A request's provider attempt records
retain dispatch/generation evidence, while reservation settlement preserves
known, unknown, released, and overrun outcomes. The reconciliation worker is
lease-based, bounded, and payload-free in logs; absent generation evidence is
conservatively marked unknown at the fixed settlement deadline.

The live paid-provider path is gated by a validated release manifest and
certifier evidence. It pins the approved OpenRouter/Relace route and model,
privacy flags, and max-price policy; a live flag alone cannot bypass the
manifest or evidence checks. See the MVP contract and
[`domains-and-data.md`](domains-and-data.md) for the data model and
[`development-and-verification.md`](development-and-verification.md) for the
worker and contract commands. Automatic context additionally requires the
function-tool canary, serializer/input-bound evidence, exact provider identity,
and two-stage usage/cost reconciliation. Capability, privacy, citation, or
unknown-settlement drift blocks new automatic admissions rather than falling
back to an uncertified provider or ungrounded answer.

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
