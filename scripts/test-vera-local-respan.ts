import {
  buildLocalCandidateShortlist,
  buildLocalOutboundPayload,
  validateLocalAutomaticAnswer,
  type LocalContextCandidate,
  type LocalOutboundSource,
} from "@/lib/vera-ai/local-context-decision";
import { createPrismaLocalContextRegistry } from "@/lib/vera-ai/local-context-registry";
import { readPrismaVeraRequestStatus } from "@/lib/vera-ai/prisma-chat-orchestrator";
import {
  buildLocalSpan01Request,
  LocalSpan01SelectorError,
  Span01LocalSelector,
  validateLocalSpan01Response,
  VERA_RESPAN_SCORE_ENDPOINT,
  VERA_RESPAN_SCORE_MODEL,
  type LocalSpan01ResponseEnvelope,
} from "@/lib/vera-ai/local-respan-selector";
import { VeraOpenRouterFreePocProviderAdapter } from "@/lib/vera-ai/openrouter-free-poc-provider";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import type { ProviderTask } from "@/lib/vera-ai/provider";
import { assert, expectReject, runChecks } from "./vera-test-support";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function candidate(overrides: Partial<LocalContextCandidate> = {}): LocalContextCandidate {
  return {
    key: "cand_01",
    kind: "materi",
    stableSourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Persamaan linear",
    topic: "Aljabar",
    teaser: "Materi ringkas yang telah diterbitkan.",
    releasedAt: "2026-09-20T00:00:00.000Z",
    versionDigest: sha256Hex("release-version"),
    evidenceSegments: ["Sumber badan lengkap yang tidak boleh dikirim ke pemilih."],
    ...overrides,
  };
}

function resultEnvelope(rows: unknown[], model = VERA_RESPAN_SCORE_MODEL): LocalSpan01ResponseEnvelope {
  const response = { model, results: rows };
  const responseBytes = encoder.encode(JSON.stringify(response));
  return { response, responseBytes, responseDigest: sha256Hex(responseBytes), observedModel: model, logId: null, inputTokens: null };
}

function validScore(id: string, pPresent = 0.92, pAbsent = 0.06, pNotObservable = 0.02) {
  return { id, p_present: pPresent, p_absent: pAbsent, p_not_observable: pNotObservable };
}

async function captureCode(action: () => unknown | Promise<unknown>): Promise<string | null> {
  try {
    await action();
    return null;
  } catch (error) {
    return error instanceof LocalSpan01SelectorError ? error.code : error instanceof Error ? error.message : String(error);
  }
}

function responseFor(rows: unknown[], model: string = VERA_RESPAN_SCORE_MODEL): Response {
  return new Response(JSON.stringify({ model, results: rows }), {
    status: 200,
    headers: { "content-type": "application/json", "X-Respan-Log-Id": "fixture-log-01" },
  });
}

function freeSseResponse(text: string): Response {
  const chunks = [
    { model: "resolved/free-model", provider: "synthetic-provider", choices: [{ delta: { content: text }, finish_reason: null }] },
    { model: "resolved/free-model", provider: "synthetic-provider", choices: [{ delta: { content: "" }, finish_reason: "stop" }], usage: { prompt_tokens: 32, completion_tokens: 12, total_tokens: 44, cost: 0 } },
  ];
  const wire = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join("");
  return new Response(wire, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function testOnlyDeterministicFake(request: ReturnType<typeof buildLocalSpan01Request>["request"]): LocalSpan01ResponseEnvelope {
  // This fixture stays in this test file. Runtime admission only receives the
  // Span01LocalSelector transport and cannot fall back to deterministic scores.
  const content = request.body.span.input[0].content.toLocaleLowerCase("id-ID");
  const rows = request.body.behaviors.map(({ id }) => content.includes("persamaan")
    ? validScore(id)
    : validScore(id, 0.1, 0.85, 0.05));
  return resultEnvelope(rows);
}

await runChecks("vera-local-respan", [
  {
    name: "Respan request has exact bounded bytes, opaque IDs, disable_log, and no learner/source payload",
    run: async () => {
      const built = buildLocalSpan01Request({ question: "Jelaskan persamaan linear.", candidates: [candidate()] });
      const text = decoder.decode(built.request.bytes);
      assert(text === canonicalJson(built.request.body), "prepared selector bytes are not canonical body bytes");
      assert(sha256Hex(built.request.bytes) === built.request.digest, "selector request digest does not bind the prepared bytes");
      assert(built.request.body.model === "respan-01-free" && built.request.body.respan_params.disable_log, "selector model/log control drifted");
      assert(built.request.candidateKeys.join(",") === "cand_01" && built.request.body.behaviors[0]?.id === "cand_01", "candidate identity is not opaque");
      assert(text.includes("Jelaskan persamaan linear.") && text.includes("Persamaan linear") && text.includes("Aljabar") && text.includes("Materi ringkas"), "allowed query/metadata was omitted");
      for (const forbidden of ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "release-version", "Sumber badan lengkap", "learner_id", "conversation history", "hidden answer"]) {
        assert(!text.includes(forbidden), `selector body leaked ${forbidden}`);
      }
      assert(built.request.bytes.byteLength <= 12_000, "selector body exceeded byte cap");
      await expectReject(() => Promise.resolve(buildLocalSpan01Request({ question: "é".repeat(301), candidates: [candidate()] })), "overlong selector question was accepted");
    },
  },
  {
    name: "intercepted Span-01 transport makes one exact POST and preserves optional usage as unknown",
    run: async () => {
      const built = buildLocalSpan01Request({ question: "Jelaskan persamaan linear.", candidates: [candidate()] });
      let calls = 0;
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const selector = new Span01LocalSelector({
        apiKey: "fixture-respan-secret",
        fetchImpl: async (url, init) => {
          calls += 1;
          capturedUrl = String(url);
          capturedInit = init;
          return responseFor([validScore("cand_01")]);
        },
      });
      const envelope = await selector.score(built.request);
      assert(calls === 1, "selector transport sent more than once");
      assert(capturedUrl === VERA_RESPAN_SCORE_ENDPOINT && capturedInit?.method === "POST", "selector endpoint/method drifted");
      assert((capturedInit?.headers as Record<string, string>).authorization === "Bearer fixture-respan-secret", "server authorization header missing");
      assert(typeof capturedInit?.body === "string" && Buffer.compare(Buffer.from(encoder.encode(capturedInit.body)), Buffer.from(built.request.bytes)) === 0, "fetch body was not byte-identical to persisted prepared bytes");
      assert(envelope.observedModel === VERA_RESPAN_SCORE_MODEL && envelope.inputTokens === null && envelope.logId === "fixture-log-01", "observed response identity or optional metadata was mishandled");
      const decision = validateLocalSpan01Response({ envelope, candidates: built.candidates });
      assert(decision.selected.length === 1 && decision.selected[0]?.key === "cand_01", "valid high-relevance fixture was not selected");

      const fakeNetworkCalls = 0;
      const fakeEnvelope = testOnlyDeterministicFake(built.request);
      const fakeResult = validateLocalSpan01Response({ envelope: fakeEnvelope, candidates: built.candidates });
      assert(fakeResult.selected.length === 1 && fakeNetworkCalls === 0, "test-only deterministic fake dispatched HTTP");
    },
  },
  {
    name: "403, 429, 402, timeout, and schema drift fail closed without retries",
    run: async () => {
      const built = buildLocalSpan01Request({ question: "Jelaskan persamaan linear.", candidates: [candidate()] });
      for (const [status, expected] of [[403, "respan_selector_forbidden"], [429, "respan_selector_rate_limited"], [402, "respan_selector_payment_required"]] as const) {
        let calls = 0;
        const selector = new Span01LocalSelector({ apiKey: "fixture", fetchImpl: async () => { calls += 1; return new Response("", { status }); } });
        const code = await captureCode(() => selector.score(built.request));
        assert(code === expected && calls === 1, `${status} did not fail once with ${expected}`);
      }
      let timeoutCalls = 0;
      const timeoutSelector = new Span01LocalSelector({
        apiKey: "fixture",
        timeoutMs: 5,
        fetchImpl: async (_url, init) => {
          timeoutCalls += 1;
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
      });
      assert(await captureCode(() => timeoutSelector.score(built.request)) === "respan_selector_timeout" && timeoutCalls === 1, "selector timeout retried or was not typed");
      const drift = responseFor([validScore("cand_01")], "respan-01-paid");
      const driftEnvelope = { response: await drift.json(), responseBytes: encoder.encode('{"model":"respan-01-paid","results":[]}'), responseDigest: sha256Hex("drift"), observedModel: "respan-01-paid", logId: null, inputTokens: null };
      assert(await captureCode(() => validateLocalSpan01Response({ envelope: driftEnvelope, candidates: built.candidates })) === "respan_selector_model_or_schema_drift", "unexpected response model was accepted");
      const falseObserved = resultEnvelope([validScore("cand_01")]);
      assert(await captureCode(() => validateLocalSpan01Response({ envelope: { ...falseObserved, observedModel: "respan-01-paid" }, candidates: built.candidates })) === "respan_selector_model_or_schema_drift", "response body was accepted without matching observed model identity");
    },
  },
  {
    name: "score schema, probabilities, threshold, tie order, and explicit prior hints are strict",
    run: async () => {
      const first = candidate({ key: "cand_01", title: "Persamaan linear", priorHint: { citationKey: "materi_prev", ordinal: 1 } });
      const second = candidate({ key: "cand_02", stableSourceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Persamaan kuadrat", priorHint: { citationKey: "kuis_prev", ordinal: 2 } });
      const built = buildLocalSpan01Request({ question: "persamaan", candidates: [first, second] });
      const envelope = resultEnvelope([validScore("cand_02", 0.9, 0.08, 0.02), validScore("cand_01", 0.9, 0.08, 0.02)]);
      const selected = validateLocalSpan01Response({ envelope, candidates: built.candidates }).selected;
      assert(selected.map((row) => row.key).join(",") === "cand_01,cand_02", "score ties did not preserve the persisted shortlist order");
      assert(validateLocalSpan01Response({ envelope: resultEnvelope([validScore("cand_01", 0.79, 0.19, 0.02)]), candidates: [first] }).selected.length === 0, "below-threshold score selected a source");
      assert(validateLocalSpan01Response({ envelope: resultEnvelope([validScore("cand_01", 0.95, 0.01, 0.04)]), candidates: [first] }).selected.length === 1, "valid probability triple was rejected");
      for (const invalid of [
        [validScore("candidate-id", 0.9, 0.08, 0.02)],
        [validScore("cand_01", 0.9, 0.08, 0.02), validScore("cand_01", 0.9, 0.08, 0.02)],
        [validScore("cand_01", Number.NaN, 0.08, 0.02)],
        [validScore("cand_01", 0.9, 0.08, 0.2)],
      ]) {
        await expectReject(() => Promise.resolve(validateLocalSpan01Response({ envelope: resultEnvelope(invalid), candidates: [first] })), "invalid score response was accepted");
      }
      const explicit = buildLocalCandidateShortlist({ candidates: [first, second], query: "lanjutkan dari sumber satu tadi" });
      assert(explicit.length === 1 && explicit[0]?.stableSourceId === first.stableSourceId, "unique reauthorized prior source was not selected for its ordinal");
      assert(buildLocalCandidateShortlist({ candidates: [first, { ...second, priorHint: { citationKey: "materi_other", ordinal: 1 } }], query: "jelaskan sumber satu tadi" }).length === 0, "ambiguous prior ordinal fell through to current/recent candidates");
    },
  },
  {
    name: "phase-one registry remains per-kind bounded and projects metadata only",
    run: async () => {
      const calls: Array<{ kind: string; args: Record<string, unknown> }> = [];
      const empty = (kind: string) => async (args: unknown) => { calls.push({ kind, args: args as Record<string, unknown> }); return []; };
      const registry = createPrismaLocalContextRegistry({
        module: { findMany: empty("module") },
        standaloneQuizAttempt: { findMany: empty("quiz") },
        tryoutAttempt: { findMany: empty("tryout") },
        aiRequestSource: { findMany: empty("prior") },
      });
      await registry.listMetadata({ studentId: "student-id-never-sent", conversationId: "conversation-id-never-sent", query: "persamaan aljabar", now: new Date("2026-09-26T00:00:00.000Z") });
      for (const kind of ["module", "quiz", "tryout"]) {
        const rows = calls.filter((call) => call.kind === kind);
        assert(rows.length === 2 && rows.some((row) => row.args.take === 3) && rows.some((row) => row.args.take === 1), `${kind} did not use fixed lexical/recent row limits (${JSON.stringify(rows.map((row) => row.args.take))})`);
        for (const row of rows) {
          const projection = JSON.stringify(row.args.select);
          assert(!/bodyText|contentSnapshot|formSnapshot|answers|items|runs/iu.test(projection), `${kind} metadata query projected a full body/review tree`);
        }
      }
      assert(calls.some((call) => call.kind === "prior" && call.args.take === 4), "prior-source lookup is not capped at four committed hints");
    },
  },
  {
    name: "local request DTOs remain automatic while pending and report committed Tryout evidence accurately",
    run: async () => {
      const now = new Date("2026-09-26T00:00:00.000Z");
      const request = {
        id: "request-id-fixture",
        status: "pending",
        errorCode: null,
        createdAt: now,
        assistantMessageId: null,
        settlementDeadlineAt: null,
        resultStage: null,
        contextToolInvocation: null,
        contextDecision: { state: "shortlisted", errorCode: null, selectedCandidateCount: 0 },
        contextPack: { provenanceState: "unavailable", purgeState: "available" },
        sources: [] as Array<{ citationKey: string; sourceType: string; titleSnapshot: string; citationLabel: string; snapshotState: string }>,
        artifacts: [],
        quotaUnitsReserved: 1,
        quotaUnitsConsumed: 0,
        tokenUsageState: "unknown",
        usageAccountingState: "unknown",
      };
      const key = { state: "accepted", expiresAt: new Date(now.getTime() + 60_000), resultId: request.id };
      const readStatus = async (requestRow: typeof request) => readPrismaVeraRequestStatus({
        $transaction: async (callback: (tx: unknown) => unknown) => callback({
          $queryRaw: async () => [{ now }],
          aiIdempotencyKey: { findUnique: async () => key },
          aiRequest: { findFirst: async () => requestRow },
        }),
      } as never, { studentId: "student-fixture", conversationId: "conversation-fixture", clientRequestId: "client-fixture" });
      const pending = await readStatus(request);
      assert(pending?.contextMode === "automatic" && pending.evidenceState === "unavailable", "pending local shortlist was presented as legacy or no-match");
      const committed = await readStatus({
        ...request,
        status: "succeeded",
        contextDecision: { state: "frozen", errorCode: null, selectedCandidateCount: 1 },
        contextPack: { provenanceState: "reconstructable", purgeState: "available" },
        sources: [{ citationKey: "tryout_fixture", sourceType: "practice", titleSnapshot: "Tryout A", citationLabel: "Tryout A", snapshotState: "available" }],
      });
      assert(committed?.contextMode === "automatic" && committed.requestSources?.[0]?.kind === "tryout" && committed.evidenceState === "available", "committed local Tryout evidence was not represented as automatic evidence");
      const noMatch = await readStatus({
        ...request,
        status: "fallback",
        contextDecision: { state: "decided", errorCode: null, selectedCandidateCount: 0 },
      });
      assert(noMatch?.contextMode === "automatic" && noMatch.evidenceState === "no_match", "completed local no-match was not reported accurately");
    },
  },
  {
    name: "free POC sends exact bounded body and strict citations require transmitted committed evidence",
    run: async () => {
      const sources: LocalOutboundSource[] = Array.from({ length: 4 }, (_, index) => ({
        citationKey: `materi_${index + 1}`,
        kind: "materi",
        evidenceSegments: [`Bukti faktual utuh ${index + 1}.`],
      }));
      const outbound = buildLocalOutboundPayload({ question: "Jelaskan empat bukti ini.", sources, maxOutputTokens: 64 });
      assert(outbound && outbound.retainedSources.length === 4, "four-source allocation unexpectedly dropped complete short evidence");
      assert(outbound.prompt.length <= 2_000 && Buffer.byteLength(outbound.prompt, "utf8") <= 2_000 && outbound.bytes.byteLength <= 4_096, "prompt/body byte caps were exceeded");
      assert(Buffer.compare(Buffer.from(outbound.bytes), Buffer.from(JSON.stringify(outbound.body))) === 0 && sha256Hex(outbound.bytes) === outbound.digest, "free POC bytes/digest do not match the actual JSON body");
      assert(outbound.retainedSources.every((source) => outbound.body.messages[0].content.includes(`[[e:${source.citationKey}]]\n${source.evidenceSegments[0]}\n[[/e]]`)), "outbound prompt omitted a whole evidence segment/frame");
      assert(buildLocalOutboundPayload({ question: "é".repeat(301), sources, maxOutputTokens: 64 }) === null, "overlong UTF-8 question was admitted");
      assert(buildLocalOutboundPayload({ question: "question", sources: [{ ...sources[0]!, evidenceSegments: ["   "] }], maxOutputTokens: 64 }) === null, "empty evidence was dispatched");

      const answerText = sources.map((source) => `Gunakan bukti ${source.evidenceSegments[0]} [^${source.citationKey}]`).join("\n\n");
      const env: NodeJS.ProcessEnv = { NODE_ENV: "test", DEBUG: "true", VERA_POC_OPENROUTER: "true", VERA_POC_ZDR: "false", OPENROUTER_API_KEY: "fixture-openrouter-secret", OPENROUTER_BASE_URL: "http://127.0.0.1:5999" };
      let calls = 0;
      let capturedBody = "";
      const provider = new VeraOpenRouterFreePocProviderAdapter({ env, fetchImpl: async (_url, init) => { calls += 1; capturedBody = String(init?.body); return freeSseResponse(answerText); } });
      const taskBytes = encoder.encode(canonicalJson({ userText: outbound.prompt }));
      const task: ProviderTask = {
        featureKey: "vera.chat",
        behaviorVersion: "test-v1",
        taskBytes,
        contextTaskDigest: sha256Hex(taskBytes),
        hardOutputQuotaUnits: 64,
        outboundPayloadBytes: outbound.bytes,
        stagePurpose: "answer",
        requestId: "request-id-fixture",
        attemptNo: 2,
        providerRequestKey: "provider-request-fixture",
        finalPayloadHash: outbound.digest,
      };
      const result = await provider.run(await provider.prepare(task));
      assert(calls === 1 && Buffer.compare(Buffer.from(capturedBody), Buffer.from(outbound.bytes)) === 0, "OpenRouter fetch body differed from the frozen persisted bytes");
      assert(result.providerMetadata?.kind === "openrouter_free_poc" && result.providerMetadata.requestBodyDigest === outbound.digest && result.usage.reportedCostMicros === "0", "free answer identity/cost/body provenance was not observed");
      const validated = validateLocalAutomaticAnswer({ text: result.text ?? "", outbound, committedSources: outbound.retainedSources });
      assert(validated.citationKeys.length === 4, "committed source citations were not validated");
      await expectReject(() => Promise.resolve(validateLocalAutomaticAnswer({ text: "Jawaban tanpa sitasi.", outbound, committedSources: outbound.retainedSources })), "uncited output was accepted");
      await expectReject(() => Promise.resolve(validateLocalAutomaticAnswer({ text: "Jawaban [^made_up]", outbound, committedSources: outbound.retainedSources })), "invented citation was accepted");
      await expectReject(() => Promise.resolve(validateLocalAutomaticAnswer({ text: "Jawaban [^materi_1]", outbound, committedSources: [] })), "citation without committed source evidence was accepted");
    },
  },
]);
