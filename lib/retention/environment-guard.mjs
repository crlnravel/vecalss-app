/**
 * The environment mark (MS-10). At go-live the owner marks the database as the
 * merchant environment (`pnpm env:mark-merchant`). From then on the reset, seed
 * and cleanup scripts call this first and refuse. Local and staging databases
 * are never marked, so the normal local flow does not change.
 *
 * It fails closed: if the mark cannot be read for any reason other than "the
 * database does not exist yet", the script does not run. A database with no mark
 * table counts as unmarked only on this machine (MS-19 H-02); elsewhere it needs
 * the explicit ALLOW_RESET_WITHOUT_MARK=<database name> override.
 */
import pg from "pg";

const { Client } = pg;

/** The connection strings a script might touch: what Prisma migrates, and what the app uses. */
/** @param {Record<string, string | undefined>} [env] */
function candidateUrls(env = process.env) {
  const urls = [env.MIGRATE_DATABASE_URL, env.DATABASE_URL]
    .map((value) => value?.trim())
    .filter((value) => Boolean(value));
  return [...new Set(urls)];
}

/**
 * Reads the mark from one database. The state is one of:
 *  - "marked": the mark row exists;
 *  - "unmarked": the table exists and has no row;
 *  - "no_table": the database exists but has no environment_marks table (never migrated, or the table was dropped);
 *  - "no_database": the database does not exist yet (a reset is about to create it).
 */
async function readEnvironmentState(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "3D000") return { mark: null, state: "no_database" };
    throw error;
  }
  try {
    const result = await client.query('SELECT environment, marked_at AS "markedAt" FROM environment_marks WHERE id = 1');
    return result.rows[0] ? { mark: result.rows[0], state: "marked" } : { mark: null, state: "unmarked" };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "42P01") return { mark: null, state: "no_table" };
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** The mark itself, or null when there is none. Kept for callers that only want the row. */
async function readEnvironmentMark(connectionString) {
  return (await readEnvironmentState(connectionString)).mark;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHost(connectionString) {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function databaseNameOf(connectionString) {
  try {
    return decodeURIComponent(new URL(connectionString).pathname.slice(1));
  } catch {
    return "";
  }
}

/**
 * Whether a reset may start against one database, from what was read there.
 *
 * A missing mark TABLE is not the same as "not marked": a merchant database whose
 * table was dropped or renamed would look unmarked. So a database on this
 * machine (loopback host) may be reset whatever it holds, as before; any other
 * database with no mark table is refused unless the owner passes the explicit
 * override that names it: ALLOW_RESET_WITHOUT_MARK=<database name>.
 */
/**
 * @param {{ connectionString: string, env?: Record<string, string | undefined>, state: string }} input
 */
function decideReset({ connectionString, env = process.env, state }) {
  if (state === "marked") return { allow: false, reason: "marked" };
  if (state !== "no_table") return { allow: true };
  if (isLoopbackHost(connectionString)) return { allow: true };
  const database = databaseNameOf(connectionString);
  if (database && env.ALLOW_RESET_WITHOUT_MARK?.trim() === database) return { allow: true };
  return { allow: false, database, reason: "no_mark_table" };
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

class MissingMarkTableError extends Error {
  constructor(label, database) {
    super(
      `Refusing to run "${label}": the database "${database}" is not on this machine and has no environment mark table, so it cannot be told apart from a merchant database whose table was removed. ` +
        `If it really is a throwaway database, run again with ALLOW_RESET_WITHOUT_MARK=${database}.`,
    );
    this.name = "MissingMarkTableError";
  }
}

/**
 * Throws MerchantEnvironmentError when any database this process could touch carries the mark, and
 * MissingMarkTableError when a database that is not local has no mark table (see decideReset).
 * `read` is injectable so the decision can be exercised without a connection.
 */
/**
 * @param {string} label
 * @param {Record<string, string | undefined>} [env]
 * @param {{ read?: (url: string) => Promise<{ mark: unknown, state: string }> }} [options]
 */
async function assertNotMerchantEnvironment(label, env = process.env, { read = readEnvironmentState } = {}) {
  for (const url of candidateUrls(env)) {
    let state;
    try {
      ({ state } = await read(url));
    } catch {
      throw new Error(
        `Refusing to run "${label}": the environment mark could not be read, and a script that deletes data does not run blind.`,
      );
    }
    const decision = decideReset({ connectionString: url, env, state });
    if (decision.allow) continue;
    if (decision.reason === "marked") throw new MerchantEnvironmentError(label);
    throw new MissingMarkTableError(label, decision.database || "(unnamed)");
  }
}

export {
  assertNotMerchantEnvironment,
  candidateUrls,
  databaseNameOf,
  decideReset,
  isLoopbackHost,
  MerchantEnvironmentError,
  MissingMarkTableError,
  readEnvironmentMark,
  readEnvironmentState,
};
