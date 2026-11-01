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

Vera messages, Studio documents, and their sources are readable only by the
student who owns them. Every Vera route checks the session and the owner before
it reads or writes, and a foreign or malformed id reads as missing. The
authorization checks are in `scripts/test-vera-authorization.ts`.

The admin cost view (`/admin/ai`, `/admin/ai/usage`) reads usage counts,
credits, and costs. It never reads messages, prompts, answers, or document text.
Any new admin Vera metric must keep that boundary.

A Studio document that was cut off or failed after some text keeps only that
text, and it is marked incomplete ("Belum selesai").

The learner tools are read-only and scoped to the student (see
[`docs/vera-ai/README.md`](../vera-ai/README.md) for the tool list). The
`VERA_MOCK_MODEL` stand-in never reaches the network, and production ignores
the flag. `test:vera-model` checks that.

Credits are settled per run in `lib/vera/ledger.ts`. A run that is cut off after
it starts generating is charged at least its effort's reserve, because the
provider bills generation once it starts. A run that fails before any output is
released and charged nothing. The day, week, and month limits are enforced
before the provider is called, so a refused request costs nothing.

The `OPENAI_API_KEY` secret stays server-side. Local development calls the real
OpenAI API whenever that key is set, so use `VERA_MOCK_MODEL=1` for offline work.

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
