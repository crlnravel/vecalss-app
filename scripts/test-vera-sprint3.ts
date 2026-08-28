import { readFileSync } from "node:fs";
import { join } from "node:path";

import { strict as assert } from "node:assert";

import { VERA_APPLY_REGISTRY_KEYS } from "@/lib/vera-ai/artifact-commands";
import { canonicalJson, sha256Hex } from "@/lib/vera-ai/contracts";
import { VERA_DURABLE_CALLBACK_REGISTRY } from "@/lib/vera-ai/durable-results";
import { VERA_STUDIO_FEATURES, validateStudioOutput, type VeraStudioToolId } from "@/lib/vera-ai/studio-contracts";
import type { VeraStudioIdentityAuthority } from "@/lib/vera-ai/studio-authority";

const ids = {
  topic: "00000000-0000-4000-8000-000000000001",
  module: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
  question: "00000000-0000-4000-8000-000000000004",
  revision: "00000000-0000-4000-8000-000000000005",
  university: "00000000-0000-4000-8000-000000000006",
  major: "00000000-0000-4000-8000-000000000007",
};

const outputs: Record<VeraStudioToolId, unknown> = {
  analysis: { title: "Analisis", summaryMarkdown: "Fokus pada rasio. [^src_a]", topics: [{ topicId: ids.topic, moduleId: ids.module, rank: 1, weaknessScore: 72, confidence: 0.8, evidenceCitationKeys: ["src_a"], limitations: "Bukti terbatas.", nextStep: "Ulangi latihan." }] },
  route: { title: "Rute", goal: "Kuasai rasio.", activities: [{ ordinal: 1, action: "Baca modul", estimatedMinutes: 20, topicIds: [ids.topic], moduleIds: [ids.module], sourceIds: [ids.source], citationKeys: ["src_a"] }, { ordinal: 2, action: "Kerjakan latihan", estimatedMinutes: 30, topicIds: [ids.topic], moduleIds: [], sourceIds: [ids.source], citationKeys: [] }], saveProjection: { sourceActivityOrdinal: 1, targetKind: "topic", targetId: ids.topic, priority: 80, rationale: "Prioritas berdasarkan bukti." } },
  review: { title: "Ulasan", questionId: ids.question, questionRevisionId: ids.revision, misconception: "Rasio dibalik.", explanationSteps: ["Samakan satuan.", "Susun perbandingan."], citationKeys: ["src_a"] },
  ptn: { title: "Strategi PTN", universityId: ids.university, majorId: ids.major, scoreEvidence: 650, assumptions: ["Nilai yang dirilis digunakan."], actions: ["Perkuat subtes prioritas."], disclaimer: "Ini strategi belajar, bukan prediksi kelulusan.", citationKeys: [] },
  summary: { title: "Ringkasan", focus: "Rasio", decisions: ["Mulai dari modul."], nextActions: ["Latihan 20 menit."], limitations: "Belum ada data tambahan.", citationKeys: ["src_a"] },
  drill: { title: "Drill", topicId: ids.topic, items: [{ ordinal: 1, questionId: ids.question, questionRevisionId: ids.revision, topicId: ids.topic, difficulty: "medium", explanationPlan: "Tinjau setelah submit." }] },
};

const authoritySeed = {
  version: "vera-studio-authority-v1" as const,
  studentId: "00000000-0000-4000-8000-000000000008",
  sourceIds: [ids.source],
  topicIds: [ids.topic],
  moduleIds: [ids.module],
  questions: [{ questionId: ids.question, questionRevisionId: ids.revision, topicId: ids.topic }],
  universityIds: [ids.university],
  majorIds: [ids.major],
};
const identityAuthority: VeraStudioIdentityAuthority = { ...authoritySeed, digest: sha256Hex(canonicalJson(authoritySeed)) };

const checks: Array<[string, () => void | Promise<void>]> = [
  ["six typed schemas normalize deterministically with exact persisted identities", () => {
    assert.deepEqual(Object.keys(VERA_STUDIO_FEATURES), ["analysis", "route", "review", "ptn", "summary", "drill"]);
    for (const toolId of Object.keys(outputs) as VeraStudioToolId[]) {
      const first = validateStudioOutput({ toolId, structured: outputs[toolId], allowedCitationKeys: ["src_a"], identityAuthority });
      const second = validateStudioOutput({ toolId, structured: outputs[toolId], allowedCitationKeys: ["src_a"], identityAuthority });
      assert.equal(first.digest, second.digest);
      assert.equal(first.schemaId, `vera.${toolId}.schema.v1`);
      assert.equal(first.schemaHash, VERA_STUDIO_FEATURES[toolId].schemaHash);
    }
  }],
  ["schema failures reject unknown fields, unauthorized citations, URLs and route ambiguity", () => {
    const materialCitation = `materi_${ids.source}`;
    const materialSummary = { ...(outputs.summary as object), citationKeys: [materialCitation] };
    assert.equal(validateStudioOutput({ toolId: "summary", structured: materialSummary, allowedCitationKeys: [materialCitation], identityAuthority }).citationKeys[0], materialCitation);
    assert.throws(() => validateStudioOutput({ toolId: "summary", structured: { ...(outputs.summary as object), hidden: true }, allowedCitationKeys: ["src_a"], identityAuthority }));
    assert.throws(() => validateStudioOutput({ toolId: "summary", structured: { ...(outputs.summary as object), citationKeys: ["src_other"] }, allowedCitationKeys: ["src_a"], identityAuthority }));
    assert.throws(() => validateStudioOutput({ toolId: "summary", structured: { ...(outputs.summary as object), focus: "http://unsafe.test" }, allowedCitationKeys: ["src_a"], identityAuthority }));
    const route = outputs.route as Record<string, unknown>;
    assert.throws(() => validateStudioOutput({ toolId: "route", structured: { ...route, saveProjection: { sourceActivityOrdinal: 2, targetKind: "module", targetId: ids.module, priority: 50, rationale: "Arbitrary." } }, allowedCitationKeys: ["src_a"], identityAuthority }));
    assert.throws(() => validateStudioOutput({ toolId: "review", structured: { ...(outputs.review as object), questionRevisionId: "00000000-0000-4000-8000-000000000099" }, allowedCitationKeys: ["src_a"], identityAuthority }), /not authorized/);
  }],
  ["Studio stream is progress-only and artifact readiness follows durable finalization", () => {
    const source = readFileSync(join(process.cwd(), "lib/vera-ai/prisma-chat-orchestrator.ts"), "utf8");
    assert.match(source, /admission\.feature\.toolId\s*\?\s*undefined/);
    assert.match(source, /finalizeAcceptedRequest[\s\S]*artifact\.ready/);
    assert.ok(source.indexOf("finalizeAcceptedRequest") < source.indexOf('write("artifact.ready"'));
    const admissionSource = readFileSync(join(process.cwd(), "lib/vera-ai/admission-service.ts"), "utf8");
    assert.match(admissionSource, /createVeraDurableResultCallback/);
    assert.ok(!/settleOverdueRequest\(input:[\s\S]{0,400}persistDurableResult/.test(admissionSource));
  }],
  ["artifact cardinality, encrypted typed fields and immutable drill snapshots are DB enforced", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260824170000_add_vera_sprint3_product/migration.sql"), "utf8");
    for (const marker of ["requestId                 String?                  @unique", "sourceArtifactRevisionId", "outputSchemaId", "outputSchemaHash", "candidateContractVersion", "clientAnswerId", "registryKey"]) assert.ok(schema.includes(marker), marker);
    for (const marker of ["prevent_ai_artifact_revision_mutation", "adaptive_practice_item_immutable", "vera_analysis_plaintext_guard", "vera_recommendation_plaintext_guard", "ai_artifacts_request_id_key"]) assert.ok(migration.includes(marker), marker);
  }],
  ["Apply registry is exact and learner DTO excludes internal target digest", () => {
    assert.deepEqual([...VERA_APPLY_REGISTRY_KEYS], ["learning_recommendation.v1", "adaptive_practice_session.v1", "ptn_strategy_session.v1"]);
    const commands = readFileSync(join(process.cwd(), "lib/vera-ai/artifact-commands.ts"), "utf8");
    const dto = commands.slice(commands.indexOf("private async applyDto"), commands.indexOf("async materializeLearningRecommendation"));
    assert.ok(!dto.includes("targetEntityDigest"));
    assert.match(dto, /target:\s*\{ id: apply\.targetEntityId, revision: apply\.targetEntityRevision, lifecycleState, deletionState \}/);
  }],
  ["learner workspace hydrates authoritative routes and contains no fixture transport", () => {
    const ui = readFileSync(join(process.cwd(), "modules/vera-ai/VeraAiPageModule.tsx"), "utf8");
    assert.ok(!ui.includes('from "./data"'));
    assert.ok(!/initialSessions|initialMessages|veraContextSources|DAILY_TOKEN_USAGE|DAILY_TOKEN_LIMIT/.test(ui));
    for (const route of ["/api/vera-ai/conversations", "/api/vera-ai/sources", "/api/vera-ai/usage", "/requests", "/artifacts"]) assert.ok(ui.includes(route), route);
    assert.match(ui, /sources: \(context\?\.sources/);
    // Lifecycle/export controls are authorized T11 behavior and are covered by
    // the executable Sprint 5 browser matrix. This Sprint 3 boundary only
    // guards against the old fixture transport leaking into the learner page.
  }],
  ["closed recovery registry, bounded keys and learner recovery controls are explicit", () => {
    assert.equal(VERA_DURABLE_CALLBACK_REGISTRY.size, 7);
    assert.deepEqual([...VERA_DURABLE_CALLBACK_REGISTRY.values()].map((entry) => entry.toolId), [null, "analysis", "route", "review", "ptn", "summary", "drill"]);
    const ui = readFileSync(join(process.cwd(), "modules/vera-ai/VeraAiPageModule.tsx"), "utf8");
    for (const marker of ["message.delta", "message.generated", "message.committed", "artifact.ready", "AbortController", "Coba lagi", "applyToExisting", "aria-live=\"polite\""]) assert.ok(ui.includes(marker), marker);
    const http = readFileSync(join(process.cwd(), "lib/vera-ai/http.ts"), "utf8");
    assert.match(http, /value\.length <= 120/);
  }],
];

let failures = 0;
for (const [name, run] of checks) {
  try {
    await run();
    console.log(`PASS vera-sprint3: ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL vera-sprint3: ${name}`);
    console.error(error);
  }
}
if (failures) throw new Error(`vera-sprint3 failed ${failures}/${checks.length} checks.`);
console.log(`PASS vera-sprint3: ${checks.length} checks`);
