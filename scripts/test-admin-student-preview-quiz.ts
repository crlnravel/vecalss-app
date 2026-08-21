import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PREVIEW_QUIZ_FORBIDDEN_KEYS,
  assertAdminPreviewQuizPayloadSafe,
  getAdminPreviewQuizAvailability,
  toAdminPreviewQuizDetail,
  toPreviewQuizMedia,
  type AdminPreviewQuizRecordInput,
} from "@/lib/admin/student-preview-quiz-contract";
import { buildAdminStudentPreviewQuizRoute } from "@/lib/student/preview-routes";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const now = new Date("2026-01-15T00:00:00.000Z");
const baseRecord: AdminPreviewQuizRecordInput = {
  closesAt: new Date("2026-02-01T00:00:00.000Z"),
  description: "<p>Latihan aman</p>",
  items: [{
    options: [
      {
        asset: {
          libraryScope: "kapten",
          mimeType: "image/png",
          state: "ready",
          trashedAt: null,
          url: "https://cdn.example.test/choice.png",
        },
        content: "Pilihan pertama",
        sortOrder: 0,
      },
      {
        asset: {
          libraryScope: "kapten",
          mimeType: "image/png",
          state: "ready",
          trashedAt: null,
          url: "javascript:alert(1)",
        },
        content: "Pilihan kedua",
        sortOrder: 1,
      },
    ],
    prompt: "<strong>Pertanyaan</strong> aman",
    promptAsset: null,
    sortOrder: 1,
  }],
  opensAt: new Date("2026-01-01T00:00:00.000Z"),
  slug: "kuis-aman",
  subtest: { code: "PU", name: "Penalaran Umum" },
  title: "Kuis aman",
};

const detail = toAdminPreviewQuizDetail(baseRecord, now);
assert.ok(detail);
assert.doesNotThrow(() => assertAdminPreviewQuizPayloadSafe(detail));
assert.equal(detail.description, "Latihan aman");
assert.equal(detail.questions[0]?.prompt, "Pertanyaan aman");
assert.equal(detail.questions[0]?.choices[0]?.media?.url, "https://cdn.example.test/choice.png");
assert.equal(detail.questions[0]?.choices[1]?.media, null);

const serializedDetail = JSON.stringify(detail);
for (const forbiddenKey of PREVIEW_QUIZ_FORBIDDEN_KEYS) {
  const keys = new RegExp(`(?:["']${forbiddenKey}["'])\\s*:`, "u");
  assert.doesNotMatch(serializedDetail, keys, `forbidden quiz DTO field leaked: ${forbiddenKey}`);
}

for (const forbiddenField of [
  "answerKey",
  "explanationText",
  "hiddenChoices",
  "randomSeed",
  "sourceQuestionRevisionId",
  "writeState",
]) {
  assert.throws(
    () => assertAdminPreviewQuizPayloadSafe({ questions: [{ [forbiddenField]: "private" }] }),
    /Forbidden student-preview quiz field/u,
    `nested forbidden quiz field must be rejected: ${forbiddenField}`,
  );
}

assert.equal(getAdminPreviewQuizAvailability(null, null, now).kind, "always");
assert.equal(
  getAdminPreviewQuizAvailability(new Date("2026-01-20T00:00:00.000Z"), new Date("2026-02-01T00:00:00.000Z"), now).kind,
  "upcoming",
);
assert.equal(
  getAdminPreviewQuizAvailability(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-14T00:00:00.000Z"), now).kind,
  "closed",
);
assert.equal(
  getAdminPreviewQuizAvailability(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-02-01T00:00:00.000Z"), now).kind,
  "open",
);

assert.equal(toPreviewQuizMedia({
  libraryScope: "kapten",
  mimeType: "image/png",
  state: "ready",
  trashedAt: null,
  url: "https://cdn.example.test/image.png",
})?.kind, "image");
assert.equal(toPreviewQuizMedia({
  libraryScope: "admin",
  mimeType: "image/png",
  state: "ready",
  trashedAt: null,
  url: "https://cdn.example.test/image.png",
}), null);
assert.equal(toPreviewQuizMedia({
  libraryScope: "kapten",
  mimeType: "image/png",
  state: "ready",
  trashedAt: null,
  url: "http://cdn.example.test/image.png",
}), null);

assert.equal(buildAdminStudentPreviewQuizRoute(), "/admin/student-preview/quiz");
assert.equal(
  buildAdminStudentPreviewQuizRoute("penalaran-umum"),
  "/admin/student-preview/quiz/penalaran-umum",
);
assert.equal(
  buildAdminStudentPreviewQuizRoute("penalaran-umum", "kuis-aman"),
  "/admin/student-preview/quiz/penalaran-umum/kuis-aman",
);
assert.throws(() => buildAdminStudentPreviewQuizRoute("../admin"), /Unsafe admin student preview route/u);

const [readsSource, routeSource] = await Promise.all([
  readFile(resolve(root, "lib/admin/student-preview-quiz-reads.ts"), "utf8"),
  readFile(resolve(root, "app/admin/student-preview/[[...slug]]/page.tsx"), "utf8"),
]);
assert.match(readsSource, /PreviewReadBoundary\.run/u);
assert.match(readsSource, /ContentStatus\.published/u);
assert.doesNotMatch(readsSource, /getAvailableQuiz(?:Subjects|Preview|Attempt)/u);
assert.doesNotMatch(readsSource, /(?:StandaloneQuizParticipation|StandaloneQuizAttempt|StandaloneQuizAnswer)/u);
assert.doesNotMatch(readsSource, /\b(?:create|createMany|update|updateMany|delete|deleteMany|upsert|\$transaction|\$executeRaw|\$queryRaw)\s*\(/u);
for (const entryPoint of [
  "getAdminPreviewQuizCatalogue",
  "getAdminPreviewQuizCatalogueSurface",
  "getAdminPreviewQuizSubject",
  "getAdminPreviewQuizDetail",
]) {
  assert.match(readsSource, new RegExp(`async function ${entryPoint}[\\s\\S]{0,500}PreviewReadBoundary\\.run`, "u"));
}
assert.match(routeSource, /dynamic\s*=\s*["']force-dynamic["']/u);
assert.match(routeSource, /fetchCache\s*=\s*["']force-no-store["']/u);
assert.match(routeSource, /getAdminPreviewQuizCatalogueSurface/u);
assert.match(routeSource, /getAdminPreviewQuizSubject/u);
assert.match(routeSource, /getAdminPreviewQuizDetail/u);
assert.doesNotMatch(routeSource, /getAvailableQuiz(?:Subjects|Preview|Attempt)/u);

console.log("Admin student preview quiz contract checks passed.");
