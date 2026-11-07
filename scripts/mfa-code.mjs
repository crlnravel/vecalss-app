#!/usr/bin/env node
/**
 * Prints the current verification code for the seeded local admin
 * account, so tests and agents can pass the second factor.
 *
 *   node scripts/mfa-code.mjs            # current code
 *   node scripts/mfa-code.mjs --next     # the following 30-second code
 *
 * Refuses to run unless DATABASE_URL points at this machine, because the secret
 * it uses is a publicly documented test value (prisma/seed-mfa.mjs).
 */
import "dotenv/config";

import { generateSync } from "otplib";

import { SEED_MFA_TEST_SECRET, assertSeedMfaAllowed } from "../prisma/seed-mfa.mjs";

assertSeedMfaAllowed();

const epoch = Math.floor(Date.now() / 1000) + (process.argv.includes("--next") ? 30 : 0);
console.log(generateSync({ epoch, secret: SEED_MFA_TEST_SECRET, strategy: "totp" }));
