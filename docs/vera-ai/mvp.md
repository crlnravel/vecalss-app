# Vera AI MVP

> Implementation contract snapshot: 22 September 2026 at commit `4bc2d93`.
> Source code and the Prisma schema remain authoritative if this page becomes
> stale.

This page is the concise product and operations contract for the first paid
Vera release. The MVP uses published Vecalss materials and practice evidence;
it is not an upload-first or open-ended research assistant.

## Launch scope

| Feature | What the learner gets | Credit cost |
| --- | --- | ---: |
| Chat | Ask about released Materi, Kuis, Tryout, or the current learning context | 1 |
| Review | Explain a released question/result, or return a bounded evidence-limited explanation when the question evidence is unavailable | 1 |
| Analysis | Identify weak topics from authorized learning evidence and suggest next steps | 2 |
| Route | A typed 7-day study route with up to three ordered activities; it is advice, not an automatic schedule mutation | 2 |

The server rejects `ptn`, `summary`, and `drill` with the typed feature-disabled
response. Artifact apply/materialization, background generation, web research,
user model selection, automatic provider fallback, and AI-created scored
questions are outside this release.

## Context and privacy boundary

- Context may contain only server-resolved, released/owned `material` and
  `practice` sources. `document` sources and user-upload workflows are disabled
  for the MVP.
- A request selects at most four sources. Each source block is bounded to
  6,000 UTF-8 bytes and is redacted/truncated before serialization.
- The final serialized input is capped at 5,488 bytes for chat/review and
  9,488 bytes for analysis/route. The certified input-token caps are 6,000 and
  10,000 respectively, including a fixed 512-token framing bound.
- History contains at most three complete user/assistant pairs (six messages),
  with a 1,500-byte per-message bound and a 9,000-byte aggregate bound.
- Outputs are validated against feature schemas and citation/identity
  authority before they are exposed to the learner. Route output carries no
  mutable save target.

## Budget contract

The v2 ledger uses `Asia/Jakarta` and enforces both weighted credits and a
monthly monetary exposure guard. Limits are applied before provider dispatch;
actual provider evidence settles or corrects the reservation afterward.

| Window | Warning | Hard limit | Meaning |
| --- | ---: | ---: | --- |
| Day | 10 credits | 15 credits | Local calendar day |
| ISO week | 70 credits | 80 credits | Monday–Sunday local week |
| Month | — | 300 credits | Calendar month |
| Monthly provider exposure | USD 0.55 | USD 0.70 | Reserved + settled + unknown USD micros |

The monthly credit limit is equivalent to at most 300 simple chat/review
credits, or 150 analysis/route credits, before the daily and weekly windows
become the tighter constraint. Mixed usage is charged by the weighted total;
one analysis/route request consumes two credits. A user can therefore reach a
daily or weekly limit before reaching 300 monthly credits.

The USD guard is the enforcement mechanism; the Rp15.000 product target still
requires deployment owners to validate the exchange-rate and payment-fee
assumption before enabling paid traffic. The code does not silently convert
USD to IDR at admission time.

Additional admission protections are five requests per minute, at most two
concurrent requests, and two maximum provider attempts. A provider request is
reserved before dispatch, so ambiguous failures are not automatically retried
as a new spend.

## Provider contract

Production traffic is release-gated to:

- OpenRouter direct routing;
- model `deepseek/deepseek-v4-flash-0731`;
- upstream provider `relace`;
- `allow_fallbacks: false`, `require_parameters: true`, `zdr: true`, and
  `data_collection: "deny"`;
- maximum price policy of USD 0.10/M prompt and USD 0.30/M completion, with
  request and image prices fixed at zero.

The approved release snapshot currently records USD 0.04/M prompt,
USD 0.16/M completion, USD 0.016/M cache read, and cache-write accounting as
included in the uncached prompt. Generation evidence is reconciled with exact
decimal arithmetic and integer USD micros. The certifier artifact is tracked at
`certifiers/deepseek-v4-flash-0731/utf8-byte-bound-v1.json`; the artifact hash
and expiry are verified, while its signature reference is release evidence
rather than a public-key verification system.

The live adapter remains disabled unless the live flag, API key, release
manifest, endpoint metadata, privacy evidence, price evidence, and certifier
evidence all validate together.

## Conversation lifecycle and development provider

- Learners can rename a session inline from the `Sesi` sidebar. The chat pane
  does not duplicate that title as a separate header section.
- Archive is reversible and stores `archived_at`; archived sessions remain
  available from the sidebar archive view. Delete is separate: it submits the
  existing idempotent lifecycle purge request and is not reversible after the
  purge completes.
- Local development is free-only. When the complete OpenRouter free POC gate
  is enabled (`NODE_ENV=development`, debug/POC opt-in, non-ZDR POC mode, and
  local key/base URL), route selection uses `openrouter/free`. If the gate is
  incomplete, development never falls through to the paid release provider;
  it stays on the local mock/outage path. Paid routing remains an explicit
  non-development release operation.

The follow-up plan for replacing the manual `Konteks` catalog with one
application-executed context-retrieval tool is tracked in the Traycer artifact
[`epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/specs/vera-automatic-context-tools/index.md`](epics/788a92f9-1c5a-4fc5-b873-76ac11c9949c/artifacts/specs/vera-automatic-context-tools/index.md).
It is a separate ticketed rollout; this MVP keeps the existing manual context
contract and its four-source cap.

## Rollout checklist

1. Check the target database with
   `./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate status`.
   Apply the current migration set only as an explicitly owned deployment
   operation; migration filenames do not prove database readiness.
2. Confirm the policy cutover. The v2 ledger becomes effective at
   `2026-09-30T17:00:00Z`; requests before that instant remain on the legacy
   `vera_quota_v1` lineage.
3. Provide deployment-owned HMAC/encryption, OpenRouter, and generation
   evidence settings through the secret store. Never copy secrets into this
   page or logs.
4. Run `pnpm vera:reconciliation-worker:check`. Start
   `pnpm vera:reconciliation-worker` only in an approved worker environment;
   use `VERA_RECONCILIATION_ONCE=1` only with disposable or explicitly
   approved credentials.
5. Before live enablement, revalidate the manifest and certifier expiry, then
   verify the usage endpoint reports the v2 ledger, three windows, and USD
   micros as decimal strings.

Focused checks:

```text
pnpm test:vera-mvp-contracts
pnpm test:vera-billing-v2
pnpm test:vera-paid-provider
pnpm vera:reconciliation-worker:check
```

All Node, pnpm, Prisma, test, build, and worker commands must run through the
shared resource guard described in
[`docs/wiki/development-and-verification.md`](../wiki/development-and-verification.md).
