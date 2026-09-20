import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  AUTHORING_WRITER_REGISTRY,
  getWriterDescriptor,
} from "../lib/serialization/writer-registry";
import {
  PRODUCTION_SOURCE_ROOTS,
  assertProductionRootCovered,
  productionRootForPath,
  productionScriptSourcePaths,
} from "../lib/serialization/production-manifest";

const projectRoot = process.cwd();

function sourceText(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function assertDescriptorSourcesExist() {
  for (const descriptor of AUTHORING_WRITER_REGISTRY) {
    if (descriptor.planned) continue;
    assert.equal(
      fs.existsSync(path.join(projectRoot, descriptor.source)),
      true,
      `${descriptor.name} points to missing source ${descriptor.source}`,
    );
    assert.equal(
      productionRootForPath(descriptor.source) !== null,
      true,
      `${descriptor.name} is outside the production source manifest`,
    );
    assert.deepEqual(
      [...descriptor.lockOrder].sort((left, right) => left - right),
      [...descriptor.lockOrder],
      `${descriptor.name} lock levels must be ascending`,
    );
  }
}

function exportedFunctionNames(text: string) {
  const names = new Set<string>();
  for (const match of text.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const name of match[1].split(",")) {
      const normalized = name.trim().split(/\s+as\s+/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(normalized)) names.add(normalized);
    }
  }
  return names;
}

function assertRegisteredExports() {
  const sourceFiles = new Set(
    AUTHORING_WRITER_REGISTRY.filter((entry) => !entry.planned).map((entry) => entry.source),
  );
  const bySource = new Map<string, Set<string>>();
  for (const descriptor of AUTHORING_WRITER_REGISTRY) {
    if (descriptor.planned) continue;
    const names = bySource.get(descriptor.source) ?? new Set<string>();
    names.add(descriptor.name);
    bySource.set(descriptor.source, names);
  }

  for (const source of sourceFiles) {
    const text = sourceText(source);
    const exported = exportedFunctionNames(text);
    for (const name of bySource.get(source) ?? []) {
      // Internal helpers are intentionally represented in the registry so the
      // architecture boundary survives an export later. For an unreachable
      // entry the export is expected to disappear in the same slice.
      if (exported.has(name) || getWriterDescriptor(name)?.classification === "explicitly-unreachable") continue;
      throw new Error(`Writer ${name} is not exported/defined by ${source}`);
    }
  }
}

function tryoutModelWrites(text: string) {
  return /(?:tx|input\.tx)\.(?:tryoutPackage|tryoutDeliverySession|tryoutAdmission|tryoutDeliveryAssignment|tryoutAttempt|tryoutAttemptTestRun|tryoutAttemptAnswer|tryoutIntegrityEvent|tryoutDeliveryAudit|adminPreviewTryoutRestart)\s*\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)/.test(text)
    || /(?:tryout_packages|tryout_delivery_sessions|tryout_admissions|tryout_delivery_assignments|tryout_attempts|tryout_attempt_test_runs|tryout_attempt_answers|tryout_integrity_events)\b[\s\S]{0,80}\b(?:INSERT|UPDATE|DELETE)/i.test(text);
}

function assertExternalTryoutWritersRegistered() {
  const external = AUTHORING_WRITER_REGISTRY.filter((entry) => entry.source.startsWith("lib/admin/") || entry.source.startsWith("modules/admin/"));
  assert.ok(external.some((entry) => entry.name === "restartAdminStudentPreviewTryout"));
  assert.ok(external.some((entry) => entry.name === "restartAdminStudentPreviewTryoutAction"));
  assert.equal(tryoutModelWrites(sourceText("lib/admin/student-preview-tryout.ts")), true);
}

function assertPackageEntrypointsCovered() {
  const packageJson = JSON.parse(sourceText("package.json")) as { scripts: Record<string, string> };
  const paths = productionScriptSourcePaths(packageJson.scripts);
  assert.deepEqual(paths, ["workers/admin-import-worker.ts"]);
  for (const source of paths) assertProductionRootCovered(source);

  assert.throws(
    () => assertProductionRootCovered("cli/future-production-entrypoint.ts"),
    /outside PRODUCTION_SOURCE_ROOTS/,
  );
}

function assertNegativeWorkerFixture() {
  const fixture = "workers/__fixtures__/unregistered-tryout-writer.ts";
  assert.equal(productionRootForPath(fixture), "workers/**");
  const fixtureText = sourceText(fixture);
  assert.equal(tryoutModelWrites(fixtureText), true);
  assert.equal(
    AUTHORING_WRITER_REGISTRY.some((entry) => entry.source === fixture),
    false,
    "negative worker fixture must remain unregistered",
  );
}

function main() {
  assertDescriptorSourcesExist();
  assertRegisteredExports();
  assertExternalTryoutWritersRegistered();
  assertPackageEntrypointsCovered();
  assertNegativeWorkerFixture();
  console.log(`writer registry ok (${AUTHORING_WRITER_REGISTRY.length} descriptors; roots: ${PRODUCTION_SOURCE_ROOTS.join(", ")})`);
}

main();
