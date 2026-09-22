# Vera automatic context

This document describes the feature-gated replacement for the learner-managed
`Konteks` catalog. The default development state remains `off`, so local
development continues to use the free/mock provider path and the legacy
request contract.

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

The automatic gate also requires the approved paid provider, the function-tool
capability flag, and a non-expired canary. Development, the free POC, and the
mock provider are always fail-closed for automatic mode.

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
