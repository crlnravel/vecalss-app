import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { MATERI_CATALOGUE } from "../prisma/materi-seed.mjs";

// Exercise real repository writes in an isolated schema; never change the
// configured runtime database or require demo lessons to exist.
const databaseUrl = "postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev";
const schema = `materi_save_${randomUUID().replaceAll("-", "")}`;
const client = new pg.Client({ connectionString: databaseUrl });
let prisma: (typeof import("../lib/prisma"))["prisma"] | undefined;

try {
  await client.connect();
  await client.query(`CREATE SCHEMA "${schema}"`);
  // Prisma qualifies enum casts with its configured schema. Clone the types
  // and convert LIKE's public enum columns to the same isolated types.
  for (const type of ["content_status", "module_asset_type", "module_asset_source_kind", "media_library_scope", "media_asset_state", "edit_lease_resource_type"]) {
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    const labels = await client.query<{ label: string }>(
      "SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=$1 ORDER BY e.enumsortorder", [type],
    );
    const values = labels.rows.map(({ label }) => `'${label.replaceAll("'", "''")}'`).join(", ");
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    await client.query(`CREATE TYPE "${schema}"."${type}" AS ENUM (${values})`);
  }
  for (const table of ["subtests", "topics", "modules", "module_assets", "assets", "edit_leases"]) {
    // Fixed table names and a generated identifier only; LIKE does not copy FKs.
    // react-doctor-disable-next-line async-await-in-loop -- fixture DDL is ordered.
    await client.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  for (const [table, column, type, defaultValue] of [
    ["modules", "status", "content_status", "draft"],
    ["module_assets", "asset_type", "module_asset_type", null],
    ["module_assets", "source_kind", "module_asset_source_kind", null],
    ["assets", "library_scope", "media_library_scope", "admin"],
    ["assets", "state", "media_asset_state", "ready"],
    ["edit_leases", "resource_type", "edit_lease_resource_type", null],
  ] as const) {
    // react-doctor-disable-next-line async-await-in-loop -- defaults must be dropped before enum conversion.
    await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" DROP DEFAULT`);
    // react-doctor-disable-next-line async-await-in-loop -- convert the isolated fixture column after dropping its public default.
    await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" TYPE "${schema}"."${type}" USING "${column}"::text::"${schema}"."${type}"`);
    if (defaultValue) {
      // react-doctor-disable-next-line async-await-in-loop -- restore the fixture's original default after conversion.
      await client.query(`ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}" SET DEFAULT '${defaultValue}'::"${schema}"."${type}"`);
    }
  }
  await client.query(`INSERT INTO "${schema}".subtests (code, name) VALUES ('PU', 'Penalaran Umum'), ('PPU', 'Pengetahuan dan Pemahaman Umum')`);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.searchParams.set("schema", schema);
  isolatedUrl.searchParams.set("options", `-c search_path=${schema},public`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  ({ prisma } = await import("../lib/prisma"));
  const { saveMateriLesson, getMentorMateriCatalogue, MateriValidationError } = await import("../lib/materi/repository");
  const tutorId = randomUUID();
  const input = {
    subjectSlug: "penalaran-umum",
    title: "PU",
    document: { hostedUrl: "https://cdn.example.test/materi/reading.pdf" },
  };

  // This is the reported failure: a valid form in an unseeded Materi subject.
  const lesson = await saveMateriLesson(input, tutorId);
  assert.ok(lesson, "A valid Materi must save without demo topic seeds");
  assert.equal(lesson.readiness, "ready");
  assert.equal(lesson.sequenceNo, 1);
  assert.equal(lesson.lifecycleStatus, "draft");
  assert.equal(await prisma.topic.count(), 3);
  const puTopics = await prisma.topic.findMany({ orderBy: { sortOrder: "asc" } });
  assert.deepEqual(puTopics.map((topic) => ({ name: topic.name, sortOrder: topic.sortOrder })),
    MATERI_CATALOGUE.find((subject) => subject.code === "PU")!.sections.map((section, index) => ({ name: section.name, sortOrder: index + 1 })),
    "Initialized topic metadata must agree with the normal seed contract");
  const second = await saveMateriLesson({ ...input, title: "PU kedua" }, tutorId);
  assert.equal(second?.sequenceNo, 2);
  assert.equal(await prisma.topic.count(), 3, "Repeated saving must not duplicate topics");
  const catalogue = await getMentorMateriCatalogue();
  assert.equal(catalogue.find((subject) => subject.code === "PU")?.lessons.length, 2);

  // A partly initialized subject retains its existing topic identity and name.
  const ppu = await prisma.subtest.findUniqueOrThrow({ where: { code: "PPU" } });
  const existing = await prisma.topic.create({ data: { subtestId: ppu.id, code: "materi:pengetahuan-pemahaman-umum:section-2", name: "Konsep Inti", sortOrder: 2 } });
  await saveMateriLesson({ ...input, subjectSlug: "pengetahuan-pemahaman-umum" }, tutorId);
  assert.equal(await prisma.topic.count({ where: { subtestId: ppu.id } }), 3);
  assert.equal((await prisma.topic.findUniqueOrThrow({ where: { id: existing.id } })).name, "Konsep Inti");

  // Invalid forms must fail before creating internal scaffolding.
  await prisma.module.deleteMany();
  await prisma.moduleAsset.deleteMany();
  await prisma.topic.deleteMany();
  await assert.rejects(saveMateriLesson({ ...input, title: "" }, tutorId), MateriValidationError);
  assert.equal(await prisma.topic.count(), 0);

  // Replay the user's managed PDF payload against the same empty structure.
  const managedPdf = await prisma.asset.create({ data: {
    id: "d8d75e3e-b332-4c95-9458-782dd2b44cc2",
    libraryScope: "kapten",
    mimeType: "application/pdf",
    objectKey: "materi-save-test/art-1.pdf",
    originalName: "Art 1 Meta Jan2022.pdf",
    sizeBytes: 1024,
    state: "ready",
  } });
  const managedInput = { ...input, document: {
    managedAssetId: managedPdf.id,
    mimeType: managedPdf.mimeType,
    originalName: managedPdf.originalName!,
  } };
  const managedLesson = await saveMateriLesson(managedInput, tutorId);
  assert.equal(managedLesson?.document?.managedAssetId, managedPdf.id);
  assert.equal(managedLesson?.readiness, "ready");
  assert.equal(await prisma.topic.count(), 3);
  const concurrent = await Promise.all([
    saveMateriLesson({ ...managedInput, title: "PU paralel A" }, tutorId),
    saveMateriLesson({ ...managedInput, title: "PU paralel B" }, tutorId),
  ]);
  assert.deepEqual(concurrent.map((saved) => saved?.sequenceNo).sort(), [2, 3]);
  assert.equal(await prisma.topic.count(), 3, "Concurrent saves share the subject initialization lock");
  console.log("Materi missing/partial topics, managed PDF payload, concurrent ordering, and validation passed.");
} finally {
  await prisma?.$disconnect();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
