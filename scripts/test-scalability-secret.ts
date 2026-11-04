import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GET as instanceGet } from "../app/api/scalability/instance/route";
import { hasSimulationSecret } from "../lib/scalability/simulation-secret";

/**
 * The two-API simulation endpoints share one secret. It is compared in constant
 * time after a length check, and the endpoints stay 404 without it.
 */

const env = (value?: string) => ({ SCALABILITY_SIMULATION_SECRET: value }) as NodeJS.ProcessEnv;
const requestWith = (secret?: string) =>
  new Request("http://localhost/api/scalability/instance", { headers: secret === undefined ? {} : { "x-scalability-secret": secret } });

assert.equal(hasSimulationSecret(requestWith("s3cret-value"), env("s3cret-value")), true);
assert.equal(hasSimulationSecret(requestWith("s3cret-valuf"), env("s3cret-value")), false, "same length, wrong bytes");
assert.equal(hasSimulationSecret(requestWith("s3cret"), env("s3cret-value")), false, "shorter");
assert.equal(hasSimulationSecret(requestWith("s3cret-value-and-more"), env("s3cret-value")), false, "longer");
assert.equal(hasSimulationSecret(requestWith(""), env("s3cret-value")), false, "empty");
assert.equal(hasSimulationSecret(requestWith(), env("s3cret-value")), false, "missing header");
assert.equal(hasSimulationSecret(requestWith("anything"), env()), false, "no secret configured");
assert.equal(hasSimulationSecret(requestWith(""), env("")), false, "an empty configured secret is not a secret");
assert.equal(hasSimulationSecret(requestWith("pässwörd"), env("pässwörd")), true, "multibyte secrets compare by bytes");

// The endpoint answers 404 unless the simulation is on and the secret matches.
const original = { flag: process.env.SCALABILITY_SIMULATION, secret: process.env.SCALABILITY_SIMULATION_SECRET };
try {
  process.env.SCALABILITY_SIMULATION = "1";
  process.env.SCALABILITY_SIMULATION_SECRET = "route-secret-value";
  assert.equal((await instanceGet(requestWith("route-secret-wrong"))).status, 404);
  assert.equal((await instanceGet(requestWith("short"))).status, 404);
  assert.equal((await instanceGet(requestWith())).status, 404);
  const ok = await instanceGet(requestWith("route-secret-value"));
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(await ok.json()).sort(), ["instanceId", "pid"]);
  process.env.SCALABILITY_SIMULATION = "0";
  assert.equal((await instanceGet(requestWith("route-secret-value"))).status, 404, "off means off");
} finally {
  if (original.flag === undefined) delete process.env.SCALABILITY_SIMULATION; else process.env.SCALABILITY_SIMULATION = original.flag;
  if (original.secret === undefined) delete process.env.SCALABILITY_SIMULATION_SECRET; else process.env.SCALABILITY_SIMULATION_SECRET = original.secret;
}

// Both endpoints use the helper, and neither compares the header with ordinary equality.
for (const route of ["app/api/scalability/instance/route.ts", "app/api/scalability/rate-limit/route.ts"]) {
  const source = readFileSync(route, "utf8");
  assert.match(source, /hasSimulationSecret\(request\)/u, `${route} checks the secret with the shared helper`);
  assert.doesNotMatch(source, /x-scalability-secret/u, `${route} does not read the secret header itself`);
  assert.doesNotMatch(source, /SCALABILITY_SIMULATION_SECRET/u, `${route} does not compare the secret itself`);
}
assert.match(readFileSync("lib/scalability/simulation-secret.ts", "utf8"), /timingSafeEqual\(/u);

console.log("Scalability simulation secret checks passed.");
