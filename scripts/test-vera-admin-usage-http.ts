import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/admin/ai-usage/route.ts", import.meta.url), "utf8");
assert.match(route, /export async function GET/);
assert.match(route, /getReadOnlySessionContext/);
assert.match(route, /RoleName\.admin/);
assert.match(route, /Idempotency-Key/);
assert.match(route, /isSafeReportKey/);
assert.match(route, /getAdminVeraUsageService/);
assert.match(route, /Cache-Control/);
assert.match(route, /status: 401/);
assert.match(route, /status: 403/);
assert.match(route, /status: 503/);
assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE/);

console.log("vera admin usage HTTP route checks passed");
