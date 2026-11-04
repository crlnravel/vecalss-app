/**
 * The environment mark (MS-10). At go-live the owner marks the database as the
 * merchant environment (`pnpm env:mark-merchant`). From then on the reset, seed
 * and cleanup scripts call this first and refuse. Local and staging databases
 * are never marked, so the normal local flow does not change.
 *
 * It fails closed: if the mark cannot be read for any reason other than "the
 * database or the table does not exist yet", the script does not run.
 */
import pg from "pg";

const { Client } = pg;

/** The connection strings a script might touch: what Prisma migrates, and what the app uses. */
function candidateUrls(env = process.env) {
  const urls = [env.MIGRATE_DATABASE_URL, env.DATABASE_URL]
    .map((value) => value?.trim())
    .filter((value) => Boolean(value));
  return [...new Set(urls)];
}

/** Reads the mark from one database. Returns null when there is none (or nothing to mark yet). */
async function readEnvironmentMark(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    // The database itself is missing: a reset is about to create it.
    if (error && typeof error === "object" && error.code === "3D000") return null;
    throw error;
  }
  try {
    const result = await client.query('SELECT environment, marked_at AS "markedAt" FROM environment_marks WHERE id = 1');
    return result.rows[0] ?? null;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "42P01") return null;
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

class MerchantEnvironmentError extends Error {
  constructor(label) {
    super(
      `Refusing to run "${label}": this database is marked as the merchant environment, which holds retained payment evidence. ` +
        "Resets, seeds and cleanups only run on local and staging databases. (Basis data ini sudah ditandai sebagai lingkungan merchant, jadi skrip ini ditolak.)",
    );
    this.name = "MerchantEnvironmentError";
  }
}

/** Throws MerchantEnvironmentError when any database this process could touch carries the mark. */
async function assertNotMerchantEnvironment(label, env = process.env) {
  for (const url of candidateUrls(env)) {
    let mark;
    try {
      mark = await readEnvironmentMark(url);
    } catch {
      throw new Error(
        `Refusing to run "${label}": the environment mark could not be read, and a script that deletes data does not run blind.`,
      );
    }
    if (mark) throw new MerchantEnvironmentError(label);
  }
}

export { assertNotMerchantEnvironment, candidateUrls, MerchantEnvironmentError, readEnvironmentMark };
