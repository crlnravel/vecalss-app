# Vera AI OpenRouter Free POC

This is a server-only, development-only proof-of-concept adapter. It is not the Vera production provider, does not implement production `ProviderResult` evidence, and is never wired into learner routes. It uses the OpenRouter free router with non-ZDR settings for synthetic smoke testing only.

Set these flags only in a local shell (never commit a key):

```text
DEBUG=true
VERA_POC_OPENROUTER=true
VERA_POC_ZDR=false
OPENROUTER_API_KEY=<local secret>
OPENROUTER_BASE_URL=https://openrouter.ai
VERA_POC_RUN_REAL_SMOKE=true
```

The adapter fails closed unless the environment is non-production, every explicit debug/opt-in/non-ZDR gate is present, a key is available, and the base URL is configured. `DEBUG=true` alone never enables traffic. The smoke command sends one fixed synthetic sentinel and must not receive learner prompts, conversation content, or other student data.

OpenRouter POC traffic is explicitly non-ZDR (`VERA_POC_ZDR=false`) and uses `data_collection=allow`; do not use it for staging or production. Staging/production remain disabled behind the existing approved Vera release-manifest gate, which requires the approved privacy/data-collection controls and independent release evidence. This POC does not change `VERA_LIVE_PROVIDER_ENABLED`, `providerGateState=open_blocked`, or the default provider factory.

Run offline gate/body tests with:

```bash
pnpm test:vera-openrouter-poc
```

Only run the real synthetic smoke from a local shell after reviewing the destination and secret:

```bash
VERA_POC_RUN_REAL_SMOKE=true pnpm test:vera-openrouter-poc
```
