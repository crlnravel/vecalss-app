# Vera AI OpenRouter Free POC

This is a server-only, development-only proof-of-concept adapter. It is not the Vera production provider and does not provide production release evidence. When the explicit gate is enabled, the existing student chat route selects its typed bridge, so normal durable admission, quota, settlement, retry, SSE, and status paths still run. It uses the OpenRouter free router with non-ZDR settings for local testing only.

Set these flags only in a local shell (never commit a key):

```text
DEBUG=true
NODE_ENV=development
VERA_POC_OPENROUTER=true
VERA_POC_ZDR=false
OPENROUTER_API_KEY=<local secret>
OPENROUTER_BASE_URL=https://openrouter.ai
VERA_POC_RUN_REAL_SMOKE=true
```

The adapter fails closed unless `NODE_ENV` is exactly `development` or `test`, every explicit debug/opt-in/non-ZDR gate is present, a key is available, and the base URL is configured. Staging, preview, production, and an unset environment are all rejected. `DEBUG=true` alone never enables traffic. The smoke command sends one fixed synthetic sentinel and must not receive learner prompts, conversation content, or other student data.

OpenRouter POC traffic is explicitly non-ZDR (`VERA_POC_ZDR=false`) and uses `data_collection=allow`; do not use it for staging or production. Staging/production remain disabled behind the existing approved Vera release-manifest gate, which requires the approved privacy/data-collection controls and independent release evidence. This POC does not change `VERA_LIVE_PROVIDER_ENABLED`, `providerGateState=open_blocked`, or the default provider factory.

Development route selection is free-only: even if a shared shell also exports
`VERA_LIVE_PROVIDER_ENABLED=true`, the development selector will not choose the
paid release adapter. If the free gate is incomplete, it uses the local mock /
outage path until the explicit POC settings are corrected.

To exercise the existing student chat page locally, use the same flags in the
server process and then start the normal development server:

```bash
NODE_ENV=development DEBUG=true VERA_POC_OPENROUTER=true VERA_POC_ZDR=false \
  OPENROUTER_API_KEY=<local secret> OPENROUTER_BASE_URL=https://openrouter.ai pnpm dev
```

The free router is non-ZDR and permits provider data collection. Learner text
sent from the chat page therefore leaves the local machine; use only a local
development account and do not enter sensitive or production student data.

Run offline gate/body tests with:

```bash
pnpm test:vera-openrouter-poc
```

Only run the real synthetic smoke from a local shell after reviewing the destination and secret:

```bash
NODE_ENV=development VERA_POC_RUN_REAL_SMOKE=true pnpm test:vera-openrouter-poc
```
