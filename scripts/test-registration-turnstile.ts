import assert from "node:assert/strict";

import {
  SITEVERIFY_URL,
  TEST_SECRET_KEY,
  createTurnstileVerifier,
} from "@/lib/registration/turnstile";

/**
 * MS-21: the Turnstile check, with the network replaced by a stub that fails the
 * test if it is asked to reach Cloudflare for real.
 */

const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);

type Call = { body: Record<string, unknown>; headers: Record<string, string>; method: string; url: string };
function stub(responder: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: init?.headers as Record<string, string>,
      method: String(init?.method),
      url: String(url),
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
const env = { TURNSTILE_SECRET_KEY: "the-secret", TURNSTILE_SITE_KEY: "the-site" };
const verifierFor = (responder: Parameters<typeof stub>[0], extra: Partial<Parameters<typeof createTurnstileVerifier>[0]> = {}) => {
  const { calls, fetchImpl } = stub(responder);
  return { calls, verify: createTurnstileVerifier({ env, fetchImpl, ...extra }) };
};

// The abort timer of AbortSignal.timeout does not keep Node alive, so a stuck check would end the
// process with exit code 0 before the last assertion ran. Hold it open, and fail if it never finishes.
const keepAlive = setInterval(() => undefined, 1_000);
let finished = false;
process.on("exit", () => {
  if (!finished) {
    process.stderr.write("registration turnstile: the test ended before it finished\n");
    process.exitCode = 1;
  }
});

async function main() {
  // Passed, and exactly what is sent.
  {
    const { calls, verify } = verifierFor(() => json({ "error-codes": [], hostname: "example.com", success: true }));
    assert.equal(await verify({ ipAddress: "203.0.113.9", token: "a-token" }), "passed");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SITEVERIFY_URL);
    assert.equal(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { remoteip: "203.0.113.9", response: "a-token", secret: "the-secret" });
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    const noIp = verifierFor(() => json({ success: true }));
    await noIp.verify({ ipAddress: null, token: "t" });
    assert.equal("remoteip" in noIp.calls[0].body, false, "no address, no remoteip");
    pass("a token is checked against siteverify with the secret, the token and the address, and success passes");
  }

  // Failed for the visitor.
  for (const codes of [["invalid-input-response"], ["timeout-or-duplicate"], ["missing-input-response"], []]) {
    const { verify } = verifierFor(() => json({ "error-codes": codes, success: false }));
    assert.equal(await verify({ ipAddress: null, token: "t" }), "failed", `failed: ${codes.join(",") || "no code"}`);
  }
  pass("a rejected, reused or expired token fails");

  // Not the visitor's doing.
  for (const codes of [["internal-error"], ["invalid-input-secret"], ["missing-input-secret"], ["bad-request"]]) {
    const { verify } = verifierFor(() => json({ "error-codes": codes, success: false }));
    assert.equal(await verify({ ipAddress: null, token: "t" }), "unavailable", `unavailable: ${codes.join(",")}`);
  }
  for (const responder of [
    () => new Response("oops", { status: 500 }),
    () => new Response("not json", { status: 200 }),
    () => json({ nothing: true }),
    () => json({ success: "yes" }),
    () => { throw new TypeError("fetch failed"); },
    () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); },
  ] as Array<Parameters<typeof stub>[0]>) {
    const { verify } = verifierFor(responder);
    assert.equal(await verify({ ipAddress: null, token: "t" }), "unavailable");
  }
  pass("Cloudflare's own faults, our misconfigured secret, a bad reply and a network error are \"unavailable\", never a pass");

  // No token: nothing is asked.
  {
    const { calls, verify } = verifierFor(() => json({ success: true }));
    assert.equal(await verify({ ipAddress: null, token: null }), "failed");
    assert.equal(await verify({ ipAddress: null, token: "" }), "failed");
    assert.equal(await verify({ ipAddress: null, token: "x".repeat(2049) }), "failed", "a token over 2048 characters is refused locally");
    assert.equal(calls.length, 0, "no network call for a missing or oversized token");
    pass("a missing or oversized token fails without asking Cloudflare");
  }

  // Missing keys: fail closed, never pass.
  {
    const { calls, fetchImpl } = stub(() => json({ success: true }));
    for (const keys of [{}, { NODE_ENV: "production" }, { TURNSTILE_SITE_KEY: "only-site" }, { NODE_ENV: "test" }]) {
      const verify = createTurnstileVerifier({ env: keys, fetchImpl });
      assert.equal(await verify({ ipAddress: null, token: "t" }), "unavailable", JSON.stringify(keys));
    }
    assert.equal(calls.length, 0);
    // Local development with no keys uses Cloudflare's published test secret.
    const dev = verifierFor(() => json({ success: true }), { env: { NODE_ENV: "development" } });
    assert.equal(await dev.verify({ ipAddress: null, token: "XXXX.DUMMY.TOKEN.XXXX" }), "passed");
    assert.equal(dev.calls[0].body.secret, TEST_SECRET_KEY);
    pass("without keys the check fails closed, except next dev, which uses the published test secret");
  }

  // A slow Cloudflare cannot hold a signup open.
  {
    const verify = createTurnstileVerifier({
      env,
      fetchImpl: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
        })) as unknown as typeof fetch,
      timeoutMs: 30,
    });
    const started = Date.now();
    assert.equal(await verify({ ipAddress: null, token: "t" }), "unavailable");
    assert.ok(Date.now() - started < 2_000, "gives up quickly");
    pass("a slow siteverify call times out as \"unavailable\"");
  }

  finished = true;
  clearInterval(keepAlive);
  process.stdout.write("registration turnstile: all checks passed\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  clearInterval(keepAlive);
});
