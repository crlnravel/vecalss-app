import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { assert, runChecks } from "./vera-test-support";

const root = process.cwd();
const baseCommit = "f43c0b46f7eb36d3abadef4233ec0026f754132a";
const verifierPath = "scripts/test-vera-sprint5.ts";

const operations = [
  {
    namespace: "conversation_create",
    authority: ["AiConversation", "context", "replay"],
  },
  {
    namespace: "ai_request",
    authority: ["AiRequest", "AiMessage", "reservation", "settlement"],
  },
  {
    namespace: "learning_recommendation_create",
    authority: ["LearningRecommendation", "materialize", "ownership"],
  },
  {
    namespace: "artifact_apply",
    authority: ["AdaptivePracticeSession", "PtnStrategySession", "CAS"],
  },
  {
    namespace: "export_create",
    authority: ["AiExportJob", "exportAsOf", "downloadExpiresAt"],
  },
  {
    namespace: "conversation_delete",
    authority: ["AiConversation", "deletion_pending", "claimedConversationVersion"],
  },
  {
    namespace: "artifact_delete",
    authority: ["AiArtifactLifecycle", "lifecycleRevision", "deletion_pending"],
  },
] as const;

const localValidationDays = Array.from({ length: 30 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);

const releaseChecklistContract = Object.freeze({
  aiDocumentState: "deferred",
  providerGateState: "open_blocked",
  liveProviderEnabled: false,
  rollbackAction: "disable_new_vera_admissions_and_preserve_legacy_evidence",
  restoreEvidenceId: "vera-s5-restore-rehearsal-2026-08-v1",
  keyRegistryEvidenceId: "vera-s5-key-registry-rehearsal-2026-08-v1",
  accountHandoffSignal: "vera_cleanup_ready_v1",
});

const routeContracts = [
  { path: "app/api/vera-ai/exports/route.ts", method: "POST" },
  { path: "app/api/vera-ai/exports/[exportId]/route.ts", method: "GET" },
  { path: "app/api/vera-ai/exports/[exportId]/download/route.ts", method: "GET" },
  { path: "app/api/vera-ai/lifecycle/[operationId]/route.ts", method: "GET" },
  { path: "app/api/vera-ai/conversations/[conversationId]/route.ts", method: "DELETE" },
  { path: "app/api/vera-ai/artifacts/[artifactRevisionId]/route.ts", method: "DELETE" },
] as const;

const forbiddenMigrationPattern = /\b(?:DROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE|INDEX)|TRUNCATE|DELETE\s+FROM)\b/i;
const externalFetchPattern = /\bfetch\s*\(\s*[`'"]https?:\/\/(?!localhost(?::|\/)|127\.0\.0\.1(?::|\/)|\[::1\](?::|\/))/iu;
const liveProviderHosts = ["api.openrouter.ai", "openrouter.ai", "api.decart.com"];

function readProjectFile(path: string): string | null {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch {
    return null;
  }
}

function readGitFile(commit: string, path: string): string | null {
  try {
    return execFileSync("git", ["show", `${commit}:${path}`], { cwd: root, encoding: "utf8" });
  } catch {
    return null;
  }
}

function gitLines(args: string[]): string[] | null {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

function walk(relativeRoot: string): string[] {
  const absoluteRoot = join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = join(relativeRoot, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...walk(relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function migrationDigest(paths: string[], reader: (path: string) => string | null): string {
  return digest(paths.map((path) => `${path}\0${reader(path) ?? "<missing>"}`).join("\n"));
}

function enumValues(source: string, name: string): string[] {
  const block = source.match(new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "u"))?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/u.test(line));
}

function hasAll(source: string, markers: readonly string[]): boolean {
  return markers.every((marker) => source.includes(marker));
}

function hasAny(source: string, markers: readonly string[]): boolean {
  return markers.some((marker) => source.includes(marker));
}

function hasMarker(source: string, marker: string | readonly string[]): boolean {
  return typeof marker === "string" ? source.includes(marker) : hasAny(source, marker);
}

function modelBody(source: string, name: string): string {
  return source.match(new RegExp(`model\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "u"))?.[1] ?? "";
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

type ExecutableIntegrationEvidence = {
  status: "passed";
  operationNamespaces: "verified";
  learnerFlow: "verified";
  t9Http: "verified";
  t10Http: "verified";
  browser: { desktop: "verified"; mobile390: "verified"; port: number };
  providerGateState: "open_blocked";
  liveProvider: false;
  noSharedInfrastructure: true;
};

function runExecutableIntegrationEvidence(): ExecutableIntegrationEvidence {
  const disposableDatabase = process.env.VERA_DISPOSABLE_DATABASE_URL;
  const disposableRedis = process.env.VERA_DISPOSABLE_REDIS_URL ?? process.env.REDIS_URL;
  assert(disposableDatabase, "T12 requires VERA_DISPOSABLE_DATABASE_URL for executable evidence");
  assert(disposableRedis, "T12 requires VERA_DISPOSABLE_REDIS_URL or REDIS_URL for executable evidence");
  const output = execFileSync("pnpm", ["test:vera-sprint5-integration"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: disposableDatabase,
      VERA_DISPOSABLE_DATABASE_URL: disposableDatabase,
      VERA_DISPOSABLE_REDIS_URL: disposableRedis,
      REDIS_URL: disposableRedis,
      VERA_DISPOSABLE_DB_ACK: "1",
      VERA_LIVE_PROVIDER_ENABLED: "false",
      VERA_MOCK_PROVIDER_ENABLED: "true",
    },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  for (const marker of [
    "T11_EVIDENCE callback_namespace=chat",
    "T11_EVIDENCE callback_namespace=analysis",
    "T11_EVIDENCE callback_namespace=route",
    "T11_EVIDENCE callback_namespace=review",
    "T11_EVIDENCE callback_namespace=summary",
      "T11_EVIDENCE callback_namespace=ptn",
      "T11_EVIDENCE callback_namespace=drill",
      "T12_EVIDENCE migration=20260827100000_add_vera_sprint5_lifecycle",
      "T12_EVIDENCE actual_http=",
    "lifecycle=export-create+status+download+grant+expiry+conversation-delete+artifact-delete+reconnect",
    "PASS VERA_BROWSER_LIFECYCLE",
    "PASS VERA_BROWSER_EVIDENCE",
  ]) assert(output.includes(marker), `T12 executable integration output is missing ${marker}`);
  const actualOperationLines = output.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("T12_EVIDENCE operation=") && line.includes(" actual=true") && line.includes(" status=pass"));
  const actualOperationNamespaces = new Set(actualOperationLines.flatMap((line) => {
    const match = line.match(/^T12_EVIDENCE operation=([^ ]+)/u);
    return match?.[1] ? [match[1]] : [];
  }));
  for (const operation of operations) {
    assert(actualOperationNamespaces.has(operation.namespace), `T12 executable integration did not emit a verified ${operation.namespace} operation line`);
  }
  assert(actualOperationNamespaces.size === operations.length, "T12 operation evidence contains an unknown or missing namespace");
  assert(output.includes("T12_EVIDENCE callbacks=chat+analysis+route+review+summary+ptn+drill source=test:vera-prisma-sprint5-t11 actual=true status=pass"), "T12 callback evidence was not forwarded from the executable fixture");
  const evidenceLine = output.split("\n").find((line) => line.trim().startsWith("{") && line.includes('"status":"passed"'));
  assert(evidenceLine, "T12 integration did not emit its structured PASS evidence");
  let parsed: unknown;
  try {
    parsed = JSON.parse(evidenceLine);
  } catch {
    throw new Error("T12 integration emitted malformed structured evidence");
  }
  assert(parsed && typeof parsed === "object", "T12 integration evidence is not an object");
  const evidence = parsed as Partial<ExecutableIntegrationEvidence>;
  assert(evidence.status === "passed", "T12 integration did not pass");
  assert(evidence.operationNamespaces === "verified", "T12 operation namespace evidence is incomplete");
  assert(evidence.learnerFlow === "verified", "T12 learner flow evidence is incomplete");
  assert(evidence.t9Http === "verified" && evidence.t10Http === "verified", "T12 T9/T10 HTTP evidence is incomplete");
  assert(evidence.browser?.desktop === "verified" && evidence.browser.mobile390 === "verified", "T12 browser desktop/mobile evidence is incomplete");
  assert(evidence.providerGateState === "open_blocked" && evidence.liveProvider === false, "T12 integration changed the provider gate");
  assert(evidence.noSharedInfrastructure === true, "T12 integration did not prove isolated infrastructure");
  console.log(output.split("\n").filter((line) => line.startsWith("T12_EVIDENCE") || line.startsWith("PASS vera-sprint5-integration")).join("\n"));
  return evidence as ExecutableIntegrationEvidence;
}

const executableIntegrationEvidence = runExecutableIntegrationEvidence();

const schema = readProjectFile("prisma/schema.prisma") ?? "";
const providerSource = readProjectFile("lib/vera-ai/provider.ts") ?? "";
const contractsSource = readProjectFile("lib/vera-ai/contracts.ts") ?? "";
const idempotencySource = readProjectFile("lib/vera-ai/idempotency.ts") ?? "";
const legacyCutoverSource = readProjectFile("lib/vera-ai/legacy-cutover.ts") ?? "";
const providerTestSource = readProjectFile("scripts/test-vera-provider.ts") ?? "";

const baselineMigrationPaths = gitLines(["ls-tree", "-r", "--name-only", baseCommit, "--", "prisma/migrations"])
  ?? [];
const baselineSqlMigrationPaths = baselineMigrationPaths.filter((path) => path.endsWith("/migration.sql"));
const currentMigrationPaths = walk("prisma/migrations").filter((path) => path.endsWith("/migration.sql"));
const newMigrationPaths = currentMigrationPaths.filter((path) => !baselineSqlMigrationPaths.includes(path));
const newMigration = newMigrationPaths.length === 1 ? readProjectFile(newMigrationPaths[0]!) ?? "" : "";

const implementationPaths = [
  "prisma/schema.prisma",
  ...walk("prisma/migrations"),
  ...walk("lib/vera-ai"),
  ...walk("app/api/vera-ai"),
  ...walk("workers").filter((path) => path.toLowerCase().includes("vera")),
].filter((path) => path !== verifierPath);
const implementationText = implementationPaths
  .map((path) => readProjectFile(path) ?? "")
  .join("\n");

const t11EvidencePaths = walk("scripts")
  .filter((path) => path !== verifierPath)
  .filter((path) => /test-vera.*(?:sprint5|retention|lifecycle|export|cutover)/iu.test(path));
const t11EvidenceText = t11EvidencePaths
  .map((path) => readProjectFile(path) ?? "")
  .join("\n");
const evidenceDigests = Object.freeze(Object.fromEntries(
  t11EvidencePaths.map((path) => [path, digest(readProjectFile(path) ?? "")]),
));

const dirtyPaths = (gitLines(["status", "--short", "--untracked-files=all"]) ?? [])
  .map((line) => line.slice(3).trim())
  .filter(Boolean);

const checks: Array<{ name: string; run: () => void }> = [
  {
    name: "release checklist contract stays immutable and provider-disabled",
    run: () => {
      assert(releaseChecklistContract.aiDocumentState === "deferred", "AiDocument is not explicitly deferred");
      assert(releaseChecklistContract.providerGateState === "open_blocked", "provider gate is not open_blocked");
      assert(releaseChecklistContract.liveProviderEnabled === false, "liveProviderEnabled is not false");
      assert(releaseChecklistContract.restoreEvidenceId === "vera-s5-restore-rehearsal-2026-08-v1", "restore evidence label drifted");
      assert(releaseChecklistContract.keyRegistryEvidenceId === "vera-s5-key-registry-rehearsal-2026-08-v1", "key-registry evidence label drifted");
      assert(releaseChecklistContract.accountHandoffSignal === "vera_cleanup_ready_v1", "account handoff signal drifted");
      assert(releaseChecklistContract.rollbackAction.includes("disable_new_vera_admissions"), "rollback action does not disable admissions");
    },
  },
  {
    name: "accepted f43c0b46 baseline and protected files are unchanged",
    run: () => {
      assert(readGitFile(baseCommit, "DESIGN.md") !== null, "accepted baseline commit is unavailable for DESIGN.md");
      assert(readGitFile(baseCommit, "PRODUCT.md") !== null, "accepted baseline commit is unavailable for PRODUCT.md");
      assert(readProjectFile("DESIGN.md") === readGitFile(baseCommit, "DESIGN.md"), "DESIGN.md changed from the accepted baseline");
      assert(readProjectFile("PRODUCT.md") === readGitFile(baseCommit, "PRODUCT.md"), "PRODUCT.md changed from the accepted baseline");
      assert(baselineSqlMigrationPaths.length === 43, `accepted baseline migration count is ${baselineSqlMigrationPaths.length}, expected 43`);
      assert(currentMigrationPaths.length === baselineSqlMigrationPaths.length + 1, `expected one additive Sprint 5 migration, found ${currentMigrationPaths.length - baselineSqlMigrationPaths.length}`);
      assert(newMigrationPaths.length === 1, `expected one new Sprint 5 migration, found ${newMigrationPaths.length}`);
      for (const path of baselineSqlMigrationPaths) {
       assert(readProjectFile(path) === readGitFile(baseCommit, path), `protected prior migration changed: ${path}`);
     }
      assert(migrationDigest(baselineSqlMigrationPaths, (path) => readProjectFile(path)) === migrationDigest(baselineSqlMigrationPaths, (path) => readGitFile(baseCommit, path)), "prior migration-history digest changed");
      assert(!dirtyPaths.some((path) => path === "DESIGN.md" || path === "PRODUCT.md" || path.startsWith("prisma/migrations/")), "protected files are dirty in the worktree");
    },
  },
  {
    name: "Sprint 5 migration is additive and contains the authorized authority checks",
    run: () => {
      assert(newMigration.length > 0, "Sprint 5 migration is missing; T11 must land before release verification");
      assert(!forbiddenMigrationPattern.test(newMigration), "Sprint 5 migration contains a destructive table/column/data operation");
      const sql = newMigration.toLowerCase();
      for (const marker of ["account_cleanup", "ai_lifecycle_operations", "ai_idempotency_keys", "ai_export_jobs", "ai_retention_holds"]) {
        assert(sql.includes(marker), `Sprint 5 migration is missing ${marker}`);
      }
      assert(/drop\s+not\s+null/iu.test(newMigration), "internal account-cleanup key nullability is not explicitly additive");
      assert(/check[\s\S]*account_cleanup/iu.test(newMigration), "account_cleanup database checks are missing");
    },
  },
  {
    name: "in-place lifecycle enum authority preserves prior values and adds only T11 states",
    run: () => {
      assert(schema.length > 0, "Prisma schema is unavailable");
      assert(sameSet(enumValues(schema, "AiIdempotencyOperation"), [...operations.map(({ namespace }) => namespace), "account_cleanup"]), "operation enum is not the seven public operations plus internal account_cleanup");
      assert(sameSet(enumValues(schema, "AiIdempotencyResultKind"), ["none", "request", "conversation", "artifact_apply", "learning_recommendation", "export_job", "conversation_delete", "artifact_delete", "account_cleanup"]), "result enum does not preserve public results plus internal account_cleanup");
      assert(sameSet(enumValues(schema, "AiLifecycleOperationState"), ["pending", "completed", "conflict", "expired", "processing", "awaiting_dependency", "ready", "failed_retryable", "failed_terminal"]), "lifecycle state enum does not preserve legacy states and add the T11 recovery states");
      const lifecycle = modelBody(schema, "AiLifecycleOperation");
      assert(lifecycle.length > 0, "AiLifecycleOperation model is missing");
      assert(/\bidempotencyKeyId\s+String\?/u.test(lifecycle), "lifecycle idempotency key was not made nullable for the internal carrier");
      assert(lifecycle.includes("accountCleanupCorrelationDigest"), "internal carrier correlation digest is missing");
      assert(!/^\s*kind\s+/mu.test(lifecycle), "a competing lifecycle kind authority was introduced");
      for (const marker of [
        "ownerState",
        "ownerReferenceDigest",
        "targetTombstoneCode",
        "handoffSignal",
        "handoffState",
        "accountCleanupCorrelationDigest",
      ]) assert(lifecycle.includes(marker), `AiLifecycleOperation is missing ${marker}`);
      for (const model of ["AiExportJob", "AiExportPart", "AiRetentionHold", "AiRetentionHoldRelease"]) {
        assert(schema.includes(`model ${model}`), `${model} is missing from the additive schema`);
      }
      for (const marker of [
        "materializationClaimId",
        "materializationOwnerId",
        "materializationLeaseExpiresAt",
        "materializationFence",
        "terminalAt",
        "partialPackagePurgeAt",
        "terminalRetentionExpiresAt",
        "exportAccessGrantState",
      ]) assert(schema.includes(marker), `export recovery field ${marker} is missing`);
    },
  },
  {
    name: "provider gate and default adapter remain closed without a release manifest",
    run: () => {
      assert(/providerGateState\s+AiProviderGateState\s+@default\(open_blocked\)/u.test(schema), "schema default provider gate is not open_blocked");
      assert(!/providerGateState\s+AiProviderGateState\s+@default\(release_ready\)/u.test(schema), "release_ready became a schema default");
      assert(providerSource.includes("MockProviderAdapter"), "mock provider adapter is not available");
      assert(providerSource.includes("DisabledProviderAdapter"), "disabled provider adapter is not available");
      assert(providerSource.includes('env.VERA_LIVE_PROVIDER_ENABLED !== "true"'), "default provider does not fail closed on the live flag");
      assert(providerSource.includes("manifest: null"), "default provider does not require release evidence");
      assert(providerTestSource.includes("MockProviderAdapter"), "provider verification does not exercise the mock adapter");
      assert(providerTestSource.includes('VERA_LIVE_PROVIDER_ENABLED: "false"'), "provider verification does not set the live flag false");
      assert(providerTestSource.includes("liveEnabled: false"), "provider verification does not exercise a disabled live adapter");
      assert(!releaseChecklistContract.liveProviderEnabled, "release checklist enabled live provider traffic");
    },
  },
  {
    name: "all seven operation namespaces have one typed target authority",
    run: () => {
      assert(hasAll(contractsSource, operations.map(({ namespace }) => `"${namespace}"`)), "VeraOperation does not enumerate all seven namespaces");
      const matrixSource = `${implementationText}\n${contractsSource}\n${idempotencySource}\n${t11EvidenceText}`;
      for (const operation of operations) {
        assert(matrixSource.includes(operation.namespace), `${operation.namespace} is absent from the executable matrix`);
        for (const marker of operation.authority) {
          assert(matrixSource.includes(marker), `${operation.namespace} is missing typed authority/evidence marker ${marker}`);
        }
      }
    },
  },
  {
    name: "operation matrix includes replay, conflict, expiry, race, ownership, and worker cases",
    run: () => {
      assert(t11EvidencePaths.length > 0, "no post-T11 Vera integration fixture was discovered; release verification stays blocked");
      const requiredCases = [
        "missing",
        "malformed",
        "overlong",
        "empty",
        "replay",
        "conflict",
        "expired",
        "unique",
        "unauthorized",
        "cross",
        "worker",
        "settle",
        "CAS",
      ];
      for (const marker of requiredCases) assert(t11EvidenceText.toLowerCase().includes(marker.toLowerCase()), `seven-operation fixture is missing ${marker} coverage`);
      assert(hasAny(t11EvidenceText, ["cross-operation", "cross operation", "operation-scoped"]), "cross-operation key/target isolation is not evidenced");
      assert(hasAny(t11EvidenceText, ["same-key", "same key", "idempotency-key"]), "same-key replay is not evidenced");
      assert(hasAny(t11EvidenceText, ["second provider", "provider call", "no duplicate"]), "exactly-once provider/mutation evidence is not present");
    },
  },
  {
    name: "export, hold, and account-cleanup evidence expectations are attached",
    run: () => {
      const evidenceGroups: Record<string, readonly (string | readonly string[])[]> = {
        export: ["AiExportJob", "AiExportPart", "exportAsOf", "downloadExpiresAt", "json_v1", "canonical", "export_expired"],
        hold: ["AiRetentionHold", "erasureOverride", "overrideHoldId", "capability", ["dual", "two-operator", "two operator"]],
        accountCleanup: ["account_cleanup", "vera_cleanup_ready_v1", "handoffState", "handoffConsumedAt", "deletion_pending", "restrictive"],
      };
      assert(t11EvidencePaths.length > 0, "export/hold/account evidence cannot be attached before T11 fixtures exist");
      for (const [name, markers] of Object.entries(evidenceGroups)) {
        for (const marker of markers) {
          assert(hasMarker(t11EvidenceText, marker), name + " evidence is missing " + (typeof marker === "string" ? marker : marker.join("/")));
        }
      }
      for (const label of [releaseChecklistContract.restoreEvidenceId, releaseChecklistContract.keyRegistryEvidenceId, releaseChecklistContract.accountHandoffSignal]) {
        assert(t11EvidenceText.includes(label), `evidence label is not attached: ${label}`);
      }
      assert(hasAny(t11EvidenceText, ["evidenceDigest", "evidence digest", "sha256"]), "immutable evidence digest is not attached");
      assert(hasAny(t11EvidenceText, ["dbClock", "DB_NOW", "database clock", "CURRENT_TIMESTAMP"]), "DB-clock evidence is not attached");
    },
  },
  {
    name: "legacy cutover carries the exact 30-day Asia/Jakarta boundary",
    run: () => {
      assert(localValidationDays.length === 30, "local validation fixture is not 30 days");
      assert(localValidationDays[0] === "2026-09-01" && localValidationDays[29] === "2026-09-30", "local validation date labels drifted");
      assert(legacyCutoverSource.includes("Asia/Jakarta") || implementationText.includes("Asia/Jakarta"), "Asia/Jakarta cutover timezone is missing");
      assert(implementationText.includes("2026-09-01") || t11EvidenceText.includes("2026-09-01"), "cutover start boundary is missing");
      assert(implementationText.includes("2026-10-01") || t11EvidenceText.includes("2026-10-01"), "half-open cutover end boundary is missing");
      assert(hasAny(t11EvidenceText, ["30-day", "30 day", "30 consecutive", "length: 30"]), "30-day validation evidence is missing");
      assert(hasAny(t11EvidenceText, ["zero_rows", "zero rows", "orphan", "unclassified"]), "zero-row/orphan/plaintext cutover checks are missing");
      assert(hasAny(t11EvidenceText, ["pre-drop", "pre_drop", "rollback", "ROLLBACK"]), "pre-drop snapshot or rollback evidence is missing");
      assert(hasAny(t11EvidenceText, ["restore", "key-registry", "key registry"]), "restore/key-registry rehearsal evidence is missing");
    },
  },
  {
    name: "T11 routes expose the contract boundary and no parallel lifecycle route",
    run: () => {
      for (const route of routeContracts) {
        const source = readProjectFile(route.path);
        assert(source !== null, `required T11 route is missing: ${route.path}`);
        assert(source.includes(`export async function ${route.method}`), `${route.path} does not expose ${route.method}`);
        assert(source.includes("getSessionContext") || source.includes("getReadOnlySessionContext"), `${route.path} is not session guarded`);
      }
      const exportPost = readProjectFile("app/api/vera-ai/exports/route.ts")?.toLowerCase() ?? "";
      assert(exportPost.includes("idempotency-key"), "export POST does not read the operation-scoped idempotency header");
      assert(exportPost.includes("json_v1"), "export POST does not pin json_v1");
      assert((readProjectFile("app/api/vera-ai/lifecycle/[operationId]/route.ts") ?? "").includes("operationId"), "lifecycle status route is not operation-scoped");
    },
  },
  {
    name: "verification itself is mock-only, local-only, and service-free",
    run: () => {
      const source = readProjectFile(verifierPath) ?? "";
      assert(source.length > 0, "T12 verifier source is missing");
      assert(!/^import .*?(?:pg|ioredis|undici|axios|got)/mu.test(source), "T12 verifier imports a database, Redis, or network client");
      assert(!/\b(?:fetch|createConnection|connect)\s*\(/u.test(source), "T12 verifier contains a network/service connection call");
      assert(!externalFetchPattern.test(source), "T12 verifier contains an external fetch URL");
      const enabledValue = process.env.VERA_LIVE_PROVIDER_ENABLED?.trim().toLowerCase() ?? "";
      assert(!["true", "1", "yes", "on"].includes(enabledValue), "VERA_LIVE_PROVIDER_ENABLED requests live traffic");
      assert(!externalFetchPattern.test(implementationText), "Vera implementation contains a non-local network URL");
      assert(!liveProviderHosts.some((host) => implementationText.includes(host)), "Vera implementation names a live provider host");
      assert(!t11EvidenceText || !externalFetchPattern.test(t11EvidenceText), "T11 integration fixture contains a non-local fetch URL");
      assert(!t11EvidenceText || !liveProviderHosts.some((host) => t11EvidenceText.includes(host)), "T11 integration fixture names a live provider host");
      assert(providerSource.includes("MockProviderAdapter") && providerSource.includes("DisabledProviderAdapter"), "mock/disabled provider paths are not both present");
      assert(providerTestSource.includes("fault") && providerTestSource.includes("MockProviderAdapter"), "fault-injection mock evidence is missing");
    },
  },
  {
    name: "known limitations are represented without claiming release readiness",
    run: () => {
      assert(releaseChecklistContract.aiDocumentState === "deferred", "deferred AiDocument scope was silently promoted");
      assert(releaseChecklistContract.providerGateState === "open_blocked", "release checklist claims provider readiness");
      assert(releaseChecklistContract.liveProviderEnabled === false, "release checklist claims live provider enablement");
      assert(Object.values(evidenceDigests).every((value) => /^[a-f0-9]{64}$/u.test(value)), "evidence digest attachment is not SHA-256 shaped");
      assert(!dirtyPaths.some((path) => path.startsWith(".env") || path.includes("DATABASE_URL") || path.includes("REDIS_URL")), "service configuration or secrets are dirty");
    },
  },
];

await runChecks("vera-sprint5", checks);

const releaseChecklist = Object.freeze({
  schemaAndMigrationState: "verified",
  legacyInventoryState: "verified",
  restoreAndKeyRegistryState: "evidence_attached",
  retentionPurgeState: "evidence_attached",
  exportState: "evidence_attached",
  deletionAndFkState: "evidence_attached",
  quotaSettlementState: executableIntegrationEvidence.learnerFlow,
  adminPrivacyState: executableIntegrationEvidence.t9Http === "verified" && executableIntegrationEvidence.t10Http === "verified" ? "verified" : "blocked",
  browserState: executableIntegrationEvidence.browser.desktop === "verified" && executableIntegrationEvidence.browser.mobile390 === "verified" ? "verified" : "blocked",
  ...releaseChecklistContract,
  baselineDeviations: dirtyPaths,
  evidenceDigests,
});

console.log(`PASS vera-sprint5: immutable content-free release checklist ${JSON.stringify(releaseChecklist)}`);
