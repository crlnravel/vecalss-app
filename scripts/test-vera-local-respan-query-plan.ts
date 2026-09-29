import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectIndexNames(value: unknown, output = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  const node = value as Record<string, unknown>;
  if (typeof node["Index Name"] === "string") output.add(node["Index Name"]);
  if (Array.isArray(node.Plans)) for (const child of node.Plans) collectIndexNames(child, output);
  return output;
}

const migrationPath = resolve(process.cwd(), "prisma/migrations/20260926120000_vera_local_implicit_context_decisions/migration.sql");
const migration = readFileSync(migrationPath, "utf8");
for (const indexName of [
  "modules_title_local_context_trgm_idx",
  "topics_name_local_context_trgm_idx",
  "standalone_quizzes_title_local_context_trgm_idx",
  "tryout_packages_title_local_context_trgm_idx",
]) assert(migration.includes(`CREATE INDEX "${indexName}"`), `migration is missing ${indexName}`);

const connectionString = process.env.VERA_DISPOSABLE_DATABASE_URL;
if (!connectionString || process.env.VERA_DISPOSABLE_DB_ACK !== "1") {
  console.log("SKIP vera-local-respan-query-plan: requires VERA_DISPOSABLE_DATABASE_URL and VERA_DISPOSABLE_DB_ACK=1.");
} else {
  const parsed = new URL(connectionString);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname), "query-plan fixture refuses non-local databases");
  assert(parsed.port === "55432", "query-plan fixture requires the disposable local PostgreSQL port 55432");
  assert(parsed.pathname === "/vera_test" || parsed.pathname === "/vera_test/", "query-plan fixture requires database vera_test");

  const client = new Client({ connectionString, statement_timeout: 60_000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await client.query(`
      CREATE TEMP TABLE vera_local_context_catalog_fixture (
        id integer PRIMARY KEY,
        student_id uuid NOT NULL,
        status text NOT NULL,
        release_at timestamptz NOT NULL,
        title text NOT NULL
      ) ON COMMIT DROP
    `);
    await client.query(`CREATE INDEX vera_local_context_fixture_owner_release_idx
      ON vera_local_context_catalog_fixture(student_id, status, release_at DESC, id)`);
    await client.query(`CREATE INDEX vera_local_context_fixture_title_trgm_idx
      ON vera_local_context_catalog_fixture USING GIN(title gin_trgm_ops)`);
    await client.query(`
      INSERT INTO vera_local_context_catalog_fixture (id, student_id, status, release_at, title)
      SELECT n, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'published',
             CURRENT_TIMESTAMP - n * INTERVAL '1 second',
             CASE WHEN n % 10000 = 0 THEN 'Persamaan linear ' || n::text ELSE 'Materi katalog ' || n::text END
      FROM generate_series(1, 100000) AS n
    `);
    await client.query("ANALYZE vera_local_context_catalog_fixture");
    await client.query("SET LOCAL enable_seqscan = off");
    await client.query("SET LOCAL enable_indexscan = off");
    const explain = await client.query(`
      EXPLAIN (ANALYZE, FORMAT JSON)
      SELECT id, title, release_at
      FROM vera_local_context_catalog_fixture
      WHERE student_id = $1 AND status = 'published' AND release_at <= $2
        AND title ILIKE $3
      ORDER BY release_at DESC, id ASC
      LIMIT 3
    `, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", new Date(), "%persamaan%"]);
    const queryPlan = (explain.rows[0]?.["QUERY PLAN"] as Array<{ Plan?: unknown }> | undefined)?.[0]?.Plan;
    const indexes = collectIndexNames(queryPlan);
    assert(indexes.has("vera_local_context_fixture_title_trgm_idx"), `large-catalog query did not use the trigram index (used ${[...indexes].join(",") || "none"})`);
    const rows = await client.query(`
      SELECT id, title, release_at
      FROM vera_local_context_catalog_fixture
      WHERE student_id = $1 AND status = 'published' AND release_at <= $2
        AND title ILIKE $3
      ORDER BY release_at DESC, id ASC
      LIMIT 3
    `, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", new Date(), "%persamaan%"]);
    assert(rows.rowCount === 3, `bounded lexical slot returned ${rows.rowCount ?? 0} rows instead of three`);
    console.log("PASS vera-local-respan-query-plan: 100,000-row disposable fixture uses its indexed lexical plan and limit");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}
