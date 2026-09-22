import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  QUESTION_BANK_CSV_GENERATION_HEADER,
  QUESTION_BANK_CSV_REVISION_HEADER,
  QUESTION_BANK_CSV_TOKEN_HEADER,
  isTrustedCsvOrigin,
  isExactCsvMediaType,
  parseQuestionBankCsvLeaseHeaders,
  readBoundedCsvBody,
  responseForCsvCode,
} from "../lib/question-bank/csv-http";

assert.equal(isExactCsvMediaType("text/csv"), true);
assert.equal(isExactCsvMediaType("text/csv; charset=utf-8"), true);
assert.equal(isExactCsvMediaType("text/csv; charset=UTF-8"), true);
assert.equal(isExactCsvMediaType("text/csv; charset=utf-16"), false);
assert.equal(isExactCsvMediaType("text/csv; boundary=x"), false);
assert.equal(isExactCsvMediaType("application/octet-stream"), false);
assert.equal(isTrustedCsvOrigin(new Request("https://app.test")), false);

const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const headers = new Headers({
  [QUESTION_BANK_CSV_TOKEN_HEADER]: token,
  [QUESTION_BANK_CSV_GENERATION_HEADER]: "2",
  [QUESTION_BANK_CSV_REVISION_HEADER]: "7",
});
const parsedHeaders = parseQuestionBankCsvLeaseHeaders(new Request("https://app.test", { headers }));
assert.equal(parsedHeaders.editLease.generation, 2);
assert.equal(parsedHeaders.expectedRevision, 7);

assert.throws(
  () => parseQuestionBankCsvLeaseHeaders(new Request("https://app.test", { headers: new Headers() })),
  (error: unknown) => error instanceof Error && "code" in error && error.code === "csv_structure_invalid",
);

const body = new TextEncoder().encode("question_id,subject_code");
const request = new Request("https://app.test", {
  body,
  headers: { "content-type": "text/csv; charset=utf-8", "content-length": String(body.byteLength) },
  method: "POST",
});
assert.deepEqual(await readBoundedCsvBody(request), body);

const oversized = new Request("https://app.test", {
  body: new Uint8Array(2 * 1024 * 1024 + 1),
  headers: { "content-type": "text/csv", "content-length": String(2 * 1024 * 1024 + 1) },
  method: "POST",
});
await assert.rejects(() => readBoundedCsvBody(oversized), { code: "csv_too_large" });
const wrongMediaType = new Request("https://app.test", {
  body: "not csv",
  headers: { "content-type": "application/json" },
  method: "POST",
});
await assert.rejects(() => readBoundedCsvBody(wrongMediaType), { code: "csv_media_type_required" });

const streamingBody = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new Uint8Array(2 * 1024 * 1024));
    controller.enqueue(new Uint8Array(1));
    controller.close();
  },
});
const streamingOversized = new Request("https://app.test", {
  body: streamingBody,
  headers: { "content-type": "text/csv" },
  method: "POST",
  duplex: "half",
} as RequestInit & { duplex: "half" });
await assert.rejects(() => readBoundedCsvBody(streamingOversized), { code: "csv_too_large" });

const authFailure = responseForCsvCode("unauthenticated");
assert.equal(authFailure.status, 401);
assert.equal(authFailure.headers.get("cache-control"), "no-store, max-age=0");
assert.equal(authFailure.headers.get("referrer-policy"), "no-referrer");
assert.equal(authFailure.headers.get("x-content-type-options"), "nosniff");

const previewRoute = await readFile("app/api/mentor/question-banks/csv/preview/route.ts", "utf8");
const importRoute = await readFile("app/api/mentor/question-banks/[bankId]/csv/import/route.ts", "utf8");
const exportRoute = await readFile("app/api/mentor/question-banks/[bankId]/csv/route.ts", "utf8");
const templateRoute = await readFile("app/api/mentor/question-banks/csv/template/route.ts", "utf8");
const repository = await readFile("lib/question-bank/csv-repository.ts", "utf8");
assert.match(previewRoute, /isTrustedCsvOrigin\(request\)/u);
assert.match(previewRoute, /readTutorCsvSession\(\)/u);
assert.match(previewRoute, /readBoundedCsvBody\(request\)/u);
assert.match(importRoute, /parseQuestionBankCsvLeaseHeaders\(request\)/u);
assert.match(importRoute, /applyQuestionBankCsv\(/u);
assert.match(importRoute, /csv_structure_invalid/u);
assert.match(exportRoute, /Content-Disposition/u);
assert.match(exportRoute, /text\/csv; charset=utf-8/u);
assert.match(templateRoute, /QUESTION_BANK_CSV_HEADER/u);
assert.match(templateRoute, /readTutorCsvSession\(\)/u);
assert.match(templateRoute, /templat-bank-soal\.csv/u);
assert.match(repository, /maxWait: 5_000, timeout: 30_000/u);
assert.match(repository, /assertAuthoringEditLease/u);
assert.match(repository, /assertReadyKaptenImageAssets/u);
assert.doesNotMatch(repository, /tx\.standaloneQuiz|tx\.quiz(?:Item|Attempt)?\.(?:create|update|delete)/u);

console.log("Question Bank CSV route contract passed.");
