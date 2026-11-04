#!/usr/bin/env node
/**
 * Exits non-zero when the database is marked as the merchant environment.
 * package.json runs it before db:reset, so a reset never starts there.
 *
 *   node scripts/check-environment-mark.mjs <label>
 */
import "dotenv/config";

import { assertNotMerchantEnvironment } from "../lib/retention/environment-guard.mjs";

const label = process.argv[2] ?? "database reset";

try {
  await assertNotMerchantEnvironment(label);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown error.");
  process.exit(1);
}
