import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function source(path: string) {
  return readFile(resolve(root, path), "utf8");
}

async function exists(path: string) {
  await access(resolve(root, path));
}

const boundaryContracts = [
  ["app/admin/error.tsx", "error", "/admin"],
  ["app/courses/error.tsx", "error", "/courses"],
  ["app/quiz/error.tsx", "error", "/quiz"],
  ["app/tryout/error.tsx", "error", "/tryout"],
  ["app/mentor/error.tsx", "error", "/mentor/tryout"],
  ["app/courses/not-found.tsx", "not-found", "/courses"],
  ["app/tryout/not-found.tsx", "not-found", "/tryout"],
  ["app/mentor/not-found.tsx", "not-found", "/mentor/tryout"],
  ["app/mentor/packages/not-found.tsx", "archived", "/mentor/quiz/question-bank"],
  ["app/mentor/tryout/packages/not-found.tsx", "archived", "/mentor/tryout"],
] as const;

for (const [path, kind, returnHref] of boundaryContracts) {
  const content = await source(path);
  assert.match(content, /TypedRouteState/u, `${path} must render the typed boundary primitive`);
  assert.match(content, new RegExp(`kind="${kind}"`, "u"), `${path} must expose its typed ${kind} state`);
  assert.match(content, new RegExp(`returnHref="${returnHref.replaceAll("/", "\\/")}"`, "u"), `${path} must provide a safe return path`);
}

for (const path of ["app/quiz/error.tsx", "app/tryout/error.tsx", "app/mentor/error.tsx"]) {
  const content = await source(path);
  assert.match(content, /reset: \(\) => void/u, `${path} must use Next's reset callback`);
  assert.match(content, /onRetry=\{reset\}/u, `${path} must make retry actionable`);
}

const loadingBoundaryFiles = ["app/quiz/loading.tsx", "app/mentor/loading.tsx"];
for (const path of loadingBoundaryFiles) {
  const content = await source(path);
  assert.match(content, /TypedRouteState/u, `${path} must render a typed loading state`);
  assert.match(content, /kind="loading"/u, `${path} must expose a loading state`);
  assert.match(content, /description="[^"]+"/u, `${path} must explain what is loading`);
}

const primitive = await source("components/ui/typed-route-state.tsx");
for (const kind of ["loading", "error", "not-found", "unavailable", "empty", "no-attempt", "demo", "cached", "broken", "archived"]) {
  assert.match(primitive, new RegExp(`"${kind}"`, "u"), `typed primitive must support ${kind}`);
}
assert.match(primitive, /onRetry\?: \(\) => void/u);
assert.match(primitive, /returnHref\?: string/u);
assert.match(primitive, /aria-busy=\{kind === "loading"/u);
assert.match(primitive, /role=\{role\}/u);
assert.match(primitive, /motion-safe:animate-spin/u);
assert.doesNotMatch(primitive, /#[0-9a-f]{3,8}/iu, "typed route states must use existing design tokens");

const globalNotFound = await source("app/not-found.tsx");
assert.match(globalNotFound, /kind="not-found"/u);
assert.match(globalNotFound, /Kembali ke beranda/u);
assert.doesNotMatch(globalNotFound, /salah kapal/u, "global fallback must use a direct recovery explanation");

const preview = await source("app/admin/student-preview/[[...slug]]/page.tsx");
assert.match(preview, /TypedRouteState/u);
for (const reason of ["missing", "unsupported", "context"]) {
  assert.match(preview, new RegExp(`reason="${reason}"`, "u"), `preview must distinguish ${reason} state`);
}
assert.doesNotMatch(preview, /Student preview unavailable/u, "preview must not collapse states into a generic card title");

const attempt = await source("modules/tryout/ParticipantAttemptModule.tsx");
assert.match(attempt, /TypedRouteState/u);
assert.match(attempt, /loadState/u);
assert.match(attempt, /loadError/u);
assert.match(attempt, /title="Percobaan Tryout belum dapat dimuat"/u);
assert.match(attempt, /onRetry=\{\(\) => void refresh\(\)\}/u);
assert.match(attempt, /returnHref="\/tryout"/u);

const result = await source("modules/tryout/ParticipantResultModule.tsx");
assert.match(result, /TypedRouteState/u);
assert.match(result, /loadState/u);
assert.match(result, /loadError/u);
assert.match(result, /title="Hasil Tryout belum dapat dimuat"/u);
assert.match(result, /onRetry=\{\(\) => void load\(\)\}/u);
assert.doesNotMatch(result, /Menyiapkan paket hasilmu/u, "failed result loading must not pretend progress is running");
assert.equal(
  result.includes("Memeriksa jawaban") && result.includes("Menghitung skor") && result.includes("Menyusun analisis"),
  false,
  "failed result loading must not show false progress steps",
);

for (const path of [
  "app/tryout/[tryoutId]/loading.tsx",
  "app/tryout/attempt/[attemptId]/loading.tsx",
  "app/mentor/tryout/[tryoutId]/operations/loading.tsx",
]) {
  const content = await source(path);
  assert.match(content, /aria-busy="true"/u, `${path} must announce loading to assistive technology`);
  assert.match(content, /role="status"/u, `${path} must expose a status role`);
}

for (const [layout, fallback] of [
  ["app/mentor/packages/layout.tsx", "app/mentor/packages/not-found.tsx"],
  ["app/mentor/tryout/packages/layout.tsx", "app/mentor/tryout/packages/not-found.tsx"],
] as const) {
  const layoutContent = await source(layout);
  const fallbackContent = await source(fallback);
  assert.match(layoutContent, /requireTutorSession/u, `${layout} must keep Kapten authentication before retirement`);
  assert.match(layoutContent, /notFound\(\)/u, `${layout} must stop archived package children from executing`);
  assert.match(fallbackContent, /kind="archived"/u, `${fallback} must explain retirement`);
  assert.match(fallbackContent, /sudah dipensiunkan/u, `${fallback} must use retirement copy`);
}

assert.match(await source("app/loading.tsx"), /LoadingPageModule/u, "root loading must keep its branded loading module");
for (const path of ["app/admin/loading.tsx", "app/mentor/quiz/question-bank/loading.tsx"]) {
  const content = await source(path);
  assert.match(content, /Memuat|Menyusun|memuat/u, `${path} must keep localized loading copy`);
}

for (const path of ["app/quiz/[slug]/page.tsx", "app/quiz/[slug]/[quizSlug]/page.tsx", "app/quiz/[slug]/[quizSlug]/result/page.tsx"]) {
  const content = await source(path);
  assert.match(content, /notFound\(\)/u, `${path} must emit a typed route outcome for missing content`);
}

for (const path of [
  "app/mentor/packages/not-found.tsx",
  "app/mentor/tryout/packages/not-found.tsx",
  "app/courses/not-found.tsx",
  "app/quiz/error.tsx",
  "app/tryout/error.tsx",
  "app/mentor/error.tsx",
]) {
  await exists(path);
}

console.log("UIX-01 route boundary contracts passed.");
