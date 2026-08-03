import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MATERI_CATALOGUE,
  MATERI_DEMO_MODULES,
  MATERI_DEMO_PDF_FILENAME,
  resolveMateriDemoPdfUrl,
} from "../prisma/materi-seed.mjs";
import {
  MATERI_RESET_CONFIRMATION,
  parseMateriResetArgs,
} from "../prisma/materi-reset.mjs";

assert.equal(MATERI_CATALOGUE.length, 7, "the static seed contract has seven subjects");
assert.equal(MATERI_CATALOGUE.every((subject) => subject.sections.length === 3), true, "each subject has three sections");
assert.equal(MATERI_DEMO_MODULES.length, 21, "the static seed contract has 21 demo modules");
assert.equal(new Set(MATERI_DEMO_MODULES.map((module) => module.code)).size, 21, "demo stable codes are unique");
assert.equal(MATERI_DEMO_MODULES.some((module) => module.withVideo), true, "the fixture covers document-plus-video");
assert.equal(MATERI_DEMO_MODULES.some((module) => !module.withVideo), true, "the fixture covers document-only");

const defaultUrl = resolveMateriDemoPdfUrl({ baseUrl: "http://localhost:5023" });
assert.equal(defaultUrl, "http://localhost:5023/api/materi-demo/test.pdf");
assert.equal(new URL(defaultUrl).pathname.endsWith(`/${MATERI_DEMO_PDF_FILENAME}`), true);
assert.throws(
  () => resolveMateriDemoPdfUrl({ pdfUrl: "tmp/test.pdf" }),
  /absolute HTTP\(S\) URL/,
  "a filesystem path cannot enter module_assets",
);
assert.throws(
  () => resolveMateriDemoPdfUrl({ pdfUrl: "https://cdn.example.test/materi/test.txt" }),
  /must end in \/test\.pdf/,
  "a non-PDF URL cannot enter module_assets",
);

assert.deepEqual(parseMateriResetArgs([]), { apply: false, confirmation: null });
assert.throws(() => parseMateriResetArgs(["--apply"]), /--confirm=RESET_CANONICAL_MATERI_DEMO_ONLY/);
assert.throws(() => parseMateriResetArgs(["--confirm", MATERI_RESET_CONFIRMATION]), /only valid together with --apply/);
assert.deepEqual(
  parseMateriResetArgs(["--apply", `--confirm=${MATERI_RESET_CONFIRMATION}`]),
  { apply: true, confirmation: MATERI_RESET_CONFIRMATION },
);
assert.deepEqual(
  parseMateriResetArgs(["--", "--apply", `--confirm=${MATERI_RESET_CONFIRMATION}`]),
  { apply: true, confirmation: MATERI_RESET_CONFIRMATION },
  "pnpm's argument separator must not become an unknown reset option",
);

const fullSeedSource = await readFile(new URL("../prisma/seed.mjs", import.meta.url), "utf8");
assert.equal(fullSeedSource.match(/topics\.code NOT LIKE 'materi:%'/g)?.length, 2, "generic seed history and intervention fixtures must not reference Materi demos");

console.log("Materi demo reset static guards passed without a database connection.");
