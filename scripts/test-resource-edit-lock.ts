import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  canonicalizeResourceKey,
  decodeBase64Url,
  isLeaseInstanceToken,
} from "../lib/resource-edit-lock/canonical";
import { EDIT_LEASE_RESOURCE_TYPES } from "../lib/resource-edit-lock/types";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const token = "A".repeat(43);
assert.equal(decodeBase64Url(token)?.byteLength, 32, "tokens must decode to exactly 32 bytes");
assert.equal(isLeaseInstanceToken(token), true);
assert.equal(isLeaseInstanceToken(`${token}A`), false);

assert.deepEqual(canonicalizeResourceKey("materi", "  MATERI-01  "), {
  resourceId: "MATERI-01",
  resourceKey: "materi:MATERI-01",
  resourceType: "materi",
});
assert.deepEqual(canonicalizeResourceKey("materi", "  demo:materi:penalaran-umum:unit-1  "), {
  resourceId: "demo:materi:penalaran-umum:unit-1",
  resourceKey: "materi:demo:materi:penalaran-umum:unit-1",
  resourceType: "materi",
});
const uuid = "7ca953d0-0f55-43a4-a644-28bb3c6f741b";
assert.equal(canonicalizeResourceKey("quiz", ` ${uuid.toUpperCase()} `).resourceId, uuid);
assert.throws(() => canonicalizeResourceKey("quiz", "not-a-uuid"), /proof/i);
assert.throws(() => canonicalizeResourceKey("materi", "bad/key"), /proof/i);
assert.throws(() => canonicalizeResourceKey("quiz", `${uuid}:part`), /proof/i);
assert.throws(() => canonicalizeResourceKey("materi", "x".repeat(129)), /proof/i);
assert.deepEqual(EDIT_LEASE_RESOURCE_TYPES, [
  "materi",
  "quiz",
  "question_bank",
  "question_package",
  "tryout",
  "media_asset",
  "media_folder",
]);

const service = read("lib/resource-edit-lock/service.ts");
assert.match(service, /createHash\("sha256"\)/u);
assert.match(service, /clock_timestamp\(\)/u);
assert.match(service, /token_digest/u);
assert.match(service, /generation[\s\S]{0,80}\+ 1/u);
assert.match(service, /acquireBannerMediaMutationLock[\s\S]*acquireResourceEditKey/u);
assert.match(service, /assertResourceAccessible\(tx, resource, holderUserId\)/u);
assert.match(service, /WHERE[\s\S]*token_digest[\s\S]*generation/u);

const locks = read("lib/serialization/locks.ts");
assert.match(locks, /vecalss:resource-edit:/u);
assert.match(locks, /pg_advisory_xact_lock\(hashtextextended\(\$\{key\}, 0\)\)/u);

const http = read("lib/resource-edit-lock/http.ts");
assert.match(http, /application\/json; charset=utf-8/u);
assert.match(http, /MAX_EDIT_LEASE_BODY_BYTES\s*=\s*4 \* 1024/u);
assert.match(http, /getTrustedAppBaseUrl/u);
assert.match(http, /newToken|previousToken|token/u);
assert.match(http, /Object\.keys\(object\)/u);
assert.match(http, /resource_locked/u);

for (const command of ["acquire", "rotate", "renew", "release"]) {
  const route = read(`app/api/mentor/resource-edit-lock/${command}/route.ts`);
  assert.match(route, /export async function POST\(request: Request\)/u);
  assert.match(route, new RegExp(`handleEditLeaseCommand\\(request, "${command}"\\)`));
}

const client = read("modules/mentor/resource-edit-lock-provider.tsx");
assert.match(client, /BroadcastChannel/u);
assert.match(client, /randomBase64Url\(32\)/u);
assert.match(client, /EDIT_LEASE_HEARTBEAT_MS/u);
assert.match(client, /EDIT_LEASE_SAFETY_MARGIN_MS/u);
assert.match(client, /keepalive:\s*true/u);
assert.match(client, /visibilitychange/u);
assert.match(client, /pagehide/u);
assert.match(client, /commandSerialRef/u);
assert.doesNotMatch(client, /resource-edit-lock\/[^"`]*\?/u, "proofs must not appear in URLs");

console.log("resource edit-lock pure/route contract tests passed");
