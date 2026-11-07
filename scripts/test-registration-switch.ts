import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getPrivacyPolicy, getTermsOfService } from "@/lib/legal";
import type { LegalDocument } from "@/lib/legal/types";
import { getRegistrationStatus, isRegistrationOpen, type RegistrationBlocker } from "@/lib/registration/switch";
import { TEST_SECRET_KEY, TEST_SITE_KEY, resolveTurnstileKeys } from "@/lib/registration/turnstile";

/**
 * MS-21: the REGISTRATION_OPEN switch. It is off by default, and even on, the
 * server treats signup as closed unless the paywall is on, the email sender is
 * configured, the Turnstile keys are set and both legal pages are approved. Pure:
 * no database, no network.
 */

const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);

const clean = (title: string): LegalDocument => ({
  draftedOn: "2026-11-09",
  intro: ["Teks uji."],
  sections: [{ heading: "Pasal 1", paragraphs: ["Isi lengkap."] }],
  status: "approved",
  title,
  version: "uji",
});
const APPROVED = { privacy: clean("Privasi"), terms: clean("Syarat") };

/** A deployed environment with every precondition met. */
const READY = {
  EMAIL_FROM: "PTN Pro <no-reply@example.test>",
  FRAUD_LOOKUP_SECRET: "x".repeat(40),
  NODE_ENV: "production",
  PAID_ACCESS_ENFORCED: "1",
  REGISTRATION_OPEN: "1",
  RESEND_API_KEY: "re_key",
  TURNSTILE_SECRET_KEY: "secret",
  TURNSTILE_SITE_KEY: "site",
};
const status = (env: Record<string, string | undefined>, legal = APPROVED) => getRegistrationStatus({ env, ...legal });

// ---- Off by default ----------------------------------------------------------------------------
assert.deepEqual(status(READY), { blockers: [], open: true }, "with every precondition met and the switch on, signup is open");
assert.equal(isRegistrationOpen({ env: READY, ...APPROVED }), true);
assert.ok(status({}).blockers.includes("switch_off"));
assert.equal(status({}).open, false, "an empty environment is closed");
for (const value of [undefined, "", "0", "false", "off", "no", "tru", "2", "enabled"]) {
  assert.deepEqual(status({ ...READY, REGISTRATION_OPEN: value }).blockers, ["switch_off"], `REGISTRATION_OPEN=${String(value)} is off`);
}
for (const value of ["1", "true", "TRUE", "on", "yes", " On "]) {
  assert.equal(status({ ...READY, REGISTRATION_OPEN: value }).open, true, `REGISTRATION_OPEN=${value} is on`);
}
pass("the switch is off by default, and only an explicit on value turns it on");

// ---- Each precondition closes it on its own -------------------------------------------------------
const closers: Array<[string, Record<string, string | undefined>, string]> = [
  ["the paywall is off", { PAID_ACCESS_ENFORCED: "" }, "paywall_off"],
  ["the paywall setting is a typo", { PAID_ACCESS_ENFORCED: "enabeld" }, "paywall_off"],
  ["EMAIL_FROM is missing", { EMAIL_FROM: "" }, "email_not_configured"],
  ["RESEND_API_KEY is missing", { RESEND_API_KEY: undefined }, "email_not_configured"],
  ["the Turnstile secret is missing", { TURNSTILE_SECRET_KEY: "" }, "turnstile_not_configured"],
  ["the Turnstile site key is missing", { TURNSTILE_SITE_KEY: undefined }, "turnstile_not_configured"],
  ["the fraud lookup secret is missing", { FRAUD_LOOKUP_SECRET: undefined }, "fraud_lookup_unavailable"],
  ["the fraud lookup secret is too short", { FRAUD_LOOKUP_SECRET: "short" }, "fraud_lookup_unavailable"],
];
for (const [label, override, blocker] of closers) {
  const result = status({ ...READY, ...override });
  assert.equal(result.open, false, `closed when ${label}`);
  assert.deepEqual(result.blockers, [blocker], `closed when ${label}, for that reason only`);
}
pass("the paywall, the email sender, both Turnstile keys and the fraud lookup secret each close signup on their own");

// ---- The legal pages ----------------------------------------------------------------------------------
assert.deepEqual(status(READY, { ...APPROVED, privacy: { ...APPROVED.privacy, status: "draft" } }).blockers, ["legal_not_approved"], "a draft privacy policy closes it");
assert.deepEqual(status(READY, { ...APPROVED, terms: { ...APPROVED.terms, status: "draft" } }).blockers, ["legal_not_approved"], "a draft terms of service closes it");
const withPlaceholder: LegalDocument = { ...APPROVED.terms, intro: ["Hubungi [email kontak bantuan]."] };
assert.deepEqual(status(READY, { ...APPROVED, terms: withPlaceholder }).blockers, ["legal_not_approved"], "an approved document with a placeholder left in it still closes it");
const shipped = { privacy: getPrivacyPolicy(), terms: getTermsOfService() };
assert.equal(shipped.privacy.status, "draft");
assert.equal(shipped.terms.status, "draft");
assert.deepEqual(status(READY, shipped).blockers, ["legal_not_approved"], "the shipped drafts keep signup closed, with everything else ready");
assert.deepEqual(getRegistrationStatus({ env: READY }).blockers, ["legal_not_approved"], "and so does the default, which reads the shipped pages");
pass("both legal pages must be approved and free of placeholders; the shipped drafts keep signup closed");

// ---- Every blocker is reported -------------------------------------------------------------------------
assert.deepEqual(
  status({ NODE_ENV: "production" }, shipped).blockers.sort(),
  ["email_not_configured", "fraud_lookup_unavailable", "legal_not_approved", "paywall_off", "switch_off", "turnstile_not_configured"],
);
pass("with nothing set, every reason is reported");

// ---- The local exception ---------------------------------------------------------------------------------
const LOCAL = {
  APP_BASE_URL: "http://localhost:5033",
  DATABASE_URL: "postgresql://u:p@127.0.0.1:55432/vecalss_dev",
  FRAUD_LOOKUP_SECRET: "x".repeat(40),
  NODE_ENV: "development",
  PAID_ACCESS_ENFORCED: "1",
  PAYMENT_STAND_IN_LOCAL: "1",
  REGISTRATION_OPEN: "1",
  TURNSTILE_SECRET_KEY: "secret",
  TURNSTILE_SITE_KEY: "site",
};
assert.deepEqual(status(LOCAL, shipped), { blockers: [], open: true }, "on a developer's own machine, draft legal pages and a missing sender do not close signup");
for (const [label, override] of [
  ["PAYMENT_STAND_IN_LOCAL is not set", { PAYMENT_STAND_IN_LOCAL: "" }],
  ["the environment is production", { NODE_ENV: "production" }],
  ["the database is not loopback", { DATABASE_URL: "postgresql://u:p@db.example.test:5432/app" }],
  ["the app URL is not loopback", { APP_BASE_URL: "https://app.example.test" }],
  ["the app URL is not set", { APP_BASE_URL: undefined }],
  ["a hosting platform marker is present", { VERCEL: "1" }],
  ["a hosting platform region is present", { VERCEL_REGION: "sin1" }],
] as Array<[string, Record<string, string | undefined>]>) {
  const result = status({ ...LOCAL, ...override }, shipped);
  assert.equal(result.open, false, `the local exception does not apply when ${label}`);
  assert.ok(result.blockers.includes("legal_not_approved") && result.blockers.includes("email_not_configured"), label);
}
// Even locally, the paywall, the switch, the keys and the fraud secret are still needed.
for (const [override, blocker] of [
  [{ REGISTRATION_OPEN: "" }, "switch_off"],
  [{ PAID_ACCESS_ENFORCED: "" }, "paywall_off"],
  [{ TURNSTILE_SECRET_KEY: "", TURNSTILE_SITE_KEY: "x" }, "turnstile_not_configured"],
  [{ FRAUD_LOOKUP_SECRET: "short" }, "fraud_lookup_unavailable"],
] as Array<[Record<string, string>, string]>) {
  assert.ok(status({ ...LOCAL, ...override }, shipped).blockers.includes(blocker as RegistrationBlocker), `locally, ${blocker} still closes it`);
}
pass("the local exception (draft legal pages, no sender) needs the stand-in gate; the other preconditions still apply there");

// ---- Turnstile keys fail closed outside local development -----------------------------------------------------
assert.deepEqual(resolveTurnstileKeys({ TURNSTILE_SECRET_KEY: "s", TURNSTILE_SITE_KEY: "k" }), { secretKey: "s", siteKey: "k" });
assert.equal(resolveTurnstileKeys({ NODE_ENV: "production" }), null, "production without keys fails closed");
assert.equal(resolveTurnstileKeys({}), null, "an unnamed environment without keys fails closed");
assert.equal(resolveTurnstileKeys({ NODE_ENV: "test" }), null);
assert.equal(resolveTurnstileKeys({ NODE_ENV: "production", TURNSTILE_SITE_KEY: "k" }), null, "one key alone is not enough");
assert.equal(resolveTurnstileKeys({ NODE_ENV: "development", TURNSTILE_SITE_KEY: "k" }), null, "one key alone is not enough in development either");
assert.deepEqual(resolveTurnstileKeys({ NODE_ENV: "development" }), { secretKey: TEST_SECRET_KEY, siteKey: TEST_SITE_KEY }, "next dev falls back to Cloudflare's test keys");
assert.equal(TEST_SITE_KEY, "1x00000000000000000000AA");
assert.equal(TEST_SECRET_KEY, "1x0000000000000000000000000000000AA");
pass("missing Turnstile keys fail closed everywhere except next dev, where Cloudflare's published test keys stand in");

// ---- The setting is documented ------------------------------------------------------------------------------------
const example = readFileSync(".env.example", "utf8");
for (const name of ["REGISTRATION_OPEN", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
  assert.match(example, new RegExp(`^${name}=`, "mu"), `${name} is in .env.example`);
}
assert.match(example, /^REGISTRATION_OPEN=\s*$/mu, "and REGISTRATION_OPEN is shipped empty (off)");

process.stdout.write("registration switch: all checks passed\n");
