import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const apiUrls = (process.env.SCALABILITY_API_URLS ?? "")
  .split(",")
  .map((value) => value.trim().replace(/\/$/u, ""))
  .filter(Boolean);
const simulationSecret = process.env.SCALABILITY_SIMULATION_SECRET ?? "";

if (apiUrls.length !== 2 || !simulationSecret) {
  throw new Error("SCALABILITY_API_URLS must contain two URLs and SCALABILITY_SIMULATION_SECRET is required");
}

async function readJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${response.status} from ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function readHealth(baseUrl) {
  const body = await readJson(`${baseUrl}/api/health`);
  assert.equal(typeof body?.instanceId, "string");
  assert.equal(typeof body?.pid, "number");
  return body;
}

async function consume(baseUrl, tokenHash) {
  const body = await readJson(
    `${baseUrl}/api/scalability/rate-limit?tokenHash=${tokenHash}`,
    { headers: { "x-scalability-secret": simulationSecret } },
  );
  assert.equal(typeof body?.allowed, "boolean");
  assert.equal(typeof body?.instanceId, "string");
  return body;
}

function indexedToken(prefix, index) {
  return `${prefix}${index.toString(16).padStart(48, "0")}`;
}

function tokenForShard(prefix, index, suffix) {
  const bodyLength = 64 - prefix.length - suffix.length;
  return `${prefix}${index.toString(16).padStart(bodyLength, "0")}${suffix}`;
}

const health = await Promise.all(apiUrls.map(readHealth));
const healthInstances = new Set(health.map((body) => body.instanceId));
assert.equal(healthInstances.size, 2, "health checks must identify two distinct API instances");

const concurrentToken = indexedToken(randomBytes(8).toString("hex"), 0xbbbb);
const concurrentResults = await Promise.all(
  Array.from({ length: 24 }, (_, index) => consume(apiUrls[index % apiUrls.length], concurrentToken)),
);
const concurrentWins = concurrentResults.filter((body) => body.allowed).length;
assert.equal(concurrentWins, 12, "shared Redis must allow exactly 12 attempts for one token");
assert.deepEqual(
  new Set(concurrentResults.map((body) => body.instanceId)),
  healthInstances,
  "the concurrent requests must be handled by both API instances",
);

const capacityPrefix = randomBytes(8).toString("hex");
const capacityResults = await Promise.all(
  Array.from({ length: 65 }, (_, index) =>
    consume(apiUrls[index % apiUrls.length], tokenForShard(capacityPrefix, index, "aa")),
  ),
);
const capacityWins = capacityResults.filter((body) => body.allowed).length;
assert.equal(capacityWins, 64, "shared Redis must enforce the 64-key shard bound across instances");

const instanceCounts = Object.fromEntries(
  [...healthInstances].map((instanceId) => [
    instanceId,
    concurrentResults.filter((body) => body.instanceId === instanceId).length,
  ]),
);

console.log(JSON.stringify({
  apiInstances: health,
  concurrentAttempts: concurrentResults.length,
  concurrentWins,
  instanceCounts,
  shardCapacityAttempts: capacityResults.length,
  shardCapacityWins: capacityWins,
}, null, 2));
