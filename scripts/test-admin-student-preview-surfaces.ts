import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  sanitizePreviewFileName,
  sanitizePreviewText,
  sanitizePreviewVideo,
} from "@/lib/admin/student-preview-content-contract";
import {
  buildAdminStudentPreviewMateriDocumentRoute,
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [previewReadBoundarySource, previewReadsSource] = await Promise.all([
  readFile(resolve(root, "lib/admin/preview-read-boundary.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/student-preview-reads.ts"), "utf8"),
]);

assert.equal(
  sanitizePreviewText("<p>Bacaan aman</p><script>alert('x')</script>\r\nBaris kedua"),
  "Bacaan aman\nBaris kedua",
  "stored learning HTML must be reduced to text before rendering",
);
assert.equal(
  sanitizePreviewText("<svg onload=alert(1)></svg><!-- comment -->"),
  "",
  "SVG and comments must not survive the text boundary",
);
assert.equal(
  sanitizePreviewFileName("../Materi\\utama.pdf\n"),
  "..-Materi-utama.pdf",
  "download names must not create a path traversal",
);
assert.equal(sanitizePreviewVideo("javascript:alert(1)"), null, "javascript embeds are denied");
assert.equal(
  sanitizePreviewVideo("http://www.youtube.com/watch?v=abc_123"),
  null,
  "HTTP video URLs are denied at the preview CSP/content boundary",
);
assert.equal(sanitizePreviewVideo("https://video.example.test/lesson"), null, "unknown video hosts are denied");
assert.equal(
  sanitizePreviewVideo("https://www.youtube.com/watch?v=abc_123")?.mediaUrl,
  "https://www.youtube.com/watch?v=abc_123",
  "known video providers remain available through the fixed embed renderer",
);

assert.equal(buildAdminStudentPreviewRoute("/courses"), "/admin/student-preview/courses");
assert.equal(
  buildAdminStudentPreviewMateriRoute("penalaran-umum", "materi-pu-1"),
  "/admin/student-preview/courses/penalaran-umum/materi-pu-1",
);
assert.equal(
  buildAdminStudentPreviewMateriDocumentRoute("penalaran-umum", "materi-pu-1", "00000000-0000-4000-8000-000000000001"),
  "/admin/student-preview/courses/penalaran-umum/materi-pu-1/document?assetId=00000000-0000-4000-8000-000000000001",
);
assert.throws(() => buildAdminStudentPreviewRoute("https://evil.example"), /Unsafe admin student preview route/u);
assert.throws(() => buildAdminStudentPreviewRoute("/courses/../admin"), /Unsafe admin student preview route/u);
assert.throws(() => buildAdminStudentPreviewMateriDocumentRoute("penalaran-umum", "materi-pu-1", "not-a-uuid"), /Unsafe admin student preview document reference/u);

const forbiddenPreviewEffects = [
  "database-write",
  "queue-enqueue",
  "event-publish",
  "analytics",
  "redis-write",
  "notification",
  "webhook",
  "external-write",
  "delayed-job",
  "learner-progress",
  "hidden-enrollment",
] as const;

assert.match(previewReadBoundarySource, /forbiddenEffects\s*=\s*\[/u);
for (const effect of forbiddenPreviewEffects) {
  assert.match(
    previewReadBoundarySource,
    new RegExp(`['"]${effect}['"]`, "u"),
    `preview read boundary must name forbidden effect: ${effect}`,
  );
}
assert.match(previewReadBoundarySource, /requireAdminStudentPreviewContext/u);
assert.match(previewReadBoundarySource, /data:\s*await read\(context\)/u);

for (const entryPoint of [
  "getAdminPreviewBeranda",
  "getAdminPreviewMateriCatalogue",
  "getAdminPreviewMateriCatalogueSurface",
  "getAdminPreviewMateriCourse",
  "getAdminPreviewMateriLesson",
  "getAdminPreviewMateriDocument",
]) {
  assert.match(
    previewReadsSource,
    new RegExp(`async function ${entryPoint}\\b[\\s\\S]{0,1200}PreviewReadBoundary\\.run`, "u"),
    `${entryPoint} must remain behind PreviewReadBoundary`,
  );
}

const exportBlock = previewReadsSource.match(/export\s*\{[\s\S]*?\n\};/u)?.[0] ?? "";
assert.ok(exportBlock, "preview reads must expose an explicit public API");
assert.doesNotMatch(exportBlock, /\breadAdminPreview(?:Beranda|MateriCatalogue|MateriCourse)\b/u);
assert.doesNotMatch(exportBlock, /\bresolveAdminPreviewMateriDocument\b/u);

const prismaMutationPattern = /\b(?:prisma|tx)\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert|\$transaction|\$executeRaw|\$queryRaw)\b/u;
assert.doesNotMatch(previewReadBoundarySource, prismaMutationPattern, "the boundary cannot mutate persistence");
assert.doesNotMatch(previewReadsSource, prismaMutationPattern, "preview read entrypoints cannot mutate persistence");
assert.doesNotMatch(
  previewReadsSource,
  /\b(?:queue|event|analytics|notification|webhook|delayed[-_]job|external[-_]write)\b/iu,
  "preview read entrypoints cannot enqueue, publish, notify, or perform external writes",
);
assert.doesNotMatch(
  previewReadsSource,
  /\b(?:completeMateriLesson|skipToMateriLesson|recordMateriProgress|hiddenEnrollment)\b/u,
  "preview reads cannot use learner mutation paths",
);

console.log("Admin student preview surface contract checks passed.");
