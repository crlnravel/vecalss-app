# Vera automatic context

This document describes the feature-gated replacement for the learner-managed
`Konteks` catalog. The default state remains `off`, so local development
continues to use the free/mock provider path and the legacy request contract.

## Local disposable development: Respan Span-01 Lite

The only local implicit-context path is an explicit, development-only opt-in
against the verified disposable `vecalss_dev` database on port `55432`. It
requires `NODE_ENV=development`, `VERA_AUTOMATIC_CONTEXT_ENABLED=true`,
`VERA_LOCAL_CONTEXT_RESPAN_ENABLED=true`, server-side `RESPAN_API_KEY`, the
existing OpenRouter free POC opt-ins, and current zero-price evidence for both
routes. The local gate also checks the connected database name, schema, and
port. Leave all switches off by default; staging and production remain off.

The selector sends exactly one `POST https://api.respan.ai/api/v1/scores`
request using `model: "respan-01-free"` and `respan_params.disable_log: true`.
Its input contains only the current question and up to twelve server-authorized
candidate titles, topics, and short released teasers. It excludes learner and
database identifiers, conversation history, full source bodies, hidden
assessment answers, unreleased content, and other learners' data. If the
selector returns a schema/model mismatch, invalid probabilities, 403, 429, 402,
or an ambiguous timeout, the request fails closed; it is not retried and does
not fall back to a paid selector.

`disable_log` suppresses input and output from Respan logs while metrics remain
recorded. It does not promise zero data retention, zero data storage, or no
training. Respan may process the submitted question and candidate metadata
through its AI service providers. Only use local data that is appropriate for
this external transfer. Span-01 is early access: a 403 can mean the organization
is not enabled, and the free tier has a daily cap that can produce a 429.

If a source is selected, the existing `openrouter/free` POC receives one
bounded prompt containing the same current question and only whole authorized
evidence segments with citation frames. The prompt and exact JSON body are
persisted and digested before dispatch. The route allows at most one selector
send and one answer send, and never retries an ambiguous send or selects a paid
fallback. Answers must cite committed request sources whose evidence is present
in those transmitted bytes. No match or no evidence produces the fixed
zero-citation limitation and releases the learner-credit reservation.

Configure switches, API keys, and versioned price evidence in the local server
environment using the names documented in `.env.example`. Never put provider
keys in a browser-visible or `NEXT_PUBLIC_` variable. Price snapshots are
operator-supplied provenance: Respan's versioned free-tier record must match
the endpoint/model and be reviewed within 24 hours; the OpenRouter snapshot
must match the observed free model/provider and be refreshed within 15 minutes.
Missing or stale evidence keeps the gate off. Missing optional Respan token
usage is recorded as unavailable and does not establish zero cost.

## Behavior

When the automatic-context gate is enabled for a cohort, the learner sends
only intent and message text. The browser does not send source IDs, load a
source catalog, or choose a persistent context selection. Vera may make one
application-executed function call:

`retrieve_released_learning_context(query, kinds, maxSources)`

The server derives the authenticated learner, feature, and authority. The
closed registry deterministically searches only released Vecalss evidence:
published Materi, the learner's released/scored/reviewable Kuis results, and
the learner's released/scored/ready Tryout results with a valid release
binding. Raw database IDs, arbitrary filters, URLs, uploads, external web
retrieval, vector search, plugins, and server tools are not part of the
contract.

The request has at most two provider dispatches: a selector turn that may emit
the single function call, followed by a final answer turn using the frozen
result with tools disabled. Invocation arguments and the result manifest are
encrypted and digested. `AiRequestSource` and `AiContextPack` remain the
immutable evidence record; `AiContextToolInvocation` stores the tool trace.
Final answers may cite only committed request sources. Empty retrieval
produces an explicit evidence-limited answer rather than an uncited confident
answer.

Each provider stage claims its durable attempt with a compare-and-set before
transport. A reconnect may resume a selector only while its attempt is still
reserved (before the dispatch claim), and only after rebuilding the identical
request body and matching its stored body hash, request key, model, provider,
and release-manifest digest. Dispatching/sent attempts are left to Generation
reconciliation. Selector evidence and encrypted tool arguments are committed
atomically; a reconnect can continue from those arguments or a completed
invocation. A registry callback with an existing dispatch marker is never run
again. Automatic serializer bytes are checked against their stage cap before
dispatch, and a streamed paid response must include the terminal `[DONE]`
marker; an incomplete stream is treated as post-send unknown usage.

## Limits

- Maximum four sources, normally two or three.
- Maximum 6,000 UTF-8 bytes per source before final allocation.
- Three completed conversation pairs (six messages).
- Final serialized input caps: 5,488 bytes for chat/review and 9,488 bytes
  for analysis/route.
- One tool call and two provider dispatches per logical request; no automatic
  stage retry.
- Chat/review consumes one credit; analysis/route consumes two. Existing USD
  reservation and settlement rules cover both stages.

## Rollout and rollback

The rollout sequence is `off -> internal -> 5% -> 25% -> on`, with a stable
student/policy cohort. The server evaluates that cohort per authenticated
student and persists a content-free gate snapshot on an admitted request.
Emergency off blocks new automatic admissions but does not rewrite an admitted
request or completed evidence. While the gate is off, the existing manual
context routes remain available for the legacy cohort and old conversations
remain readable.

In production, `VERA_AUTOMATIC_CONTEXT_ENABLED=true` is an additional required
compatibility switch; the approved policy projection cannot bypass it. When the
server gate is enabled, a new request cannot downgrade to legacy mode and
submit manually selected source IDs. Existing idempotent requests remain
replayable under their stored admission contract.

The production automatic gate also requires the approved paid provider, the
function-tool capability evidence bound to the canonical tool schema and
selector/final serializer hashes, and a non-expired two-turn canary. That
production contract is separate from the local Respan/free POC gate described
above; local capability flags cannot enable Jev or production automatic mode.
The current capability signature is a release-evidence reference; public-key
verification remains a release-operations follow-up.

The paid write-ahead record now hashes the exact UTF-8 request body handed to
`fetch`, including the server-owned provider request key. Selector and final
attempt rows persist that hash and the exact body byte count before dispatch
CAS; a later provider result with a different hash is rejected.

Rollout state is also fail-closed behind the content-free promotion verifier.
Production learner DTOs, legacy-context route gates, and request admission read
the projection from the approved `AiPolicyBundle` report configuration and
require its approval digest to match the bundle's `approvalSnapshotDigest` and
its aggregate to contain only that policy version. The projection contains the
current/target stage, k-anonymous aggregate counters and latency percentiles,
capability/canary evidence, and legacy-retirement review. The server recomputes
the one-stage promotion decision and will not honor the configured cohort/on
state when evidence is missing, stale, mixed-version, or blocked. Environment
promotion JSON is not an authority source in production and cannot bypass the
durable policy-bundle check. No learner prompts, source text, source IDs, or
tool arguments belong in this projection.

Promotion aggregates must have internally consistent, exhaustive outcome
counts; any schema-invalid sample blocks promotion. The `on` state maps only
to the final `on` promotion stage (never to `5%` based on a zero basis-point
value). A recovery dispatch also retains its originally persisted request and
attempt deadlines: once either deadline passes, the request is settled as
unknown rather than receiving a fresh transport window.

Release limitation: the automatic-context event-to-aggregate pipeline and its
admin overview are not yet connected to these promotion inputs. The policy
schema and runtime verifier are present, but until the authorized admin flow
can produce and approve fresh aggregates, keep the production rollout state
`off`. Do not hand-enter or fabricate evidence to enable a cohort.

Automatic mode cannot activate on the free POC provider. A paid route requires
the separately certified model/provider manifest, function-tool canary,
privacy evidence, usage/cost reconciliation, and input-bound certification.

## Verification

Run focused suites through the shared resource guard:

```text
pnpm test:vera-auto-context-foundation
pnpm test:vera-auto-context-orchestrator
pnpm test:vera-auto-context-ui
pnpm test:vera-auto-context-operations
```

Browser verification remains separately permission-gated by the repository
harness. Staging migration application and worker startup require an explicitly
approved deployment target; local validation does not prove staging readiness.
