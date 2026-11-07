import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * MS-21: the structural controls that no behavioural test can see. Each
 * assertion reads source text and names the control it pins, so removing the
 * control fails here: the CSP that lets Turnstile load, verification only by a
 * POST, a session only for a verified account, the refusal order at sign-in,
 * the migration's guards, and the wording rules for everything a visitor reads.
 */

const read = (path: string) => readFileSync(path, "utf8");
const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// ---- CSP: Cloudflare's script and frame, and only those ------------------------------------------------------
const config = read("next.config.ts");
const script = /`script-src ([^`]*)`/u.exec(config)?.[1] ?? "";
assert.match(script, /'self' 'unsafe-inline' https:\/\/challenges\.cloudflare\.com/u, "script-src allows the Turnstile script");
assert.match(config, /"frame-src [^"]*https:\/\/challenges\.cloudflare\.com"/u, "frame-src allows the Turnstile widget frame");
assert.equal(/script-src[^`]*(\*|https:(?!\/\/))/u.test(script), false, "script-src is not opened up to every https origin");
assert.match(config, /"form-action 'self'"/u, "forms still post only to this app");
pass("the CSP allows Cloudflare's script and frame and nothing broader");

// ---- Verification is a POST: no route handler, and the page only reads ------------------------------------------------
const routeFiles = walk("app/daftar").filter((file) => /route\.(ts|tsx|js)$/u.test(file));
assert.deepEqual(routeFiles, [], "the signup pages have no route handler a GET could verify through");
const verifyPage = read("app/daftar/verifikasi/[token]/page.tsx");
assert.match(verifyPage, /isVerificationLinkUsable\(/u, "the link page only checks that the link is usable");
assert.equal(/\bverifyEmail\b/u.test(verifyPage), false, "the link page never verifies");
const verifyForm = read("modules/auth/components/verify-email-form.tsx");
assert.match(verifyForm, /<form action=\{formAction\}/u, "the button is a form");
assert.match(verifyForm, /verifyEmailAction/u);
const actions = read("modules/auth/registration-actions.ts");
assert.match(actions, /^"use server";/u);
assert.deepEqual(
  [...actions.matchAll(/^export \{ ([^}]+) \};/gmu)].flatMap((match) => match[1].split(",").map((name) => name.trim())).sort(),
  ["registerStudentAction", "resendVerificationAction", "verifyEmailAction"],
  "the signup actions are exactly these three",
);
assert.match(actions, /await verifyEmail\(token, readPasswordField\(formData, "password"\)\)/u);
assert.match(actions, /await registerStudent\(/u);
assert.match(actions, /await resendVerification\(/u);
pass("a link is only ever used by a POST from its button; opening it is a read");

// ---- A session only for a verified account ------------------------------------------------------------------------------
const session = read("lib/auth/session.ts");
assert.equal([...session.matchAll(/email_verified_at === null/gu)].length, 2, "createSession and switchSessionToUser refuse an unverified account");
assert.match(session, /emailVerifiedAt: \{ not: null \}/u, "the sign-in session insert refuses an unverified account");
const service = read("lib/auth/service.ts");
const passwordCheck = service.indexOf("const passwordMatches = await verifyPassword(password, user.passwordHash ?? DECOY_PASSWORD_HASH)");
const unverifiedCheck = service.indexOf("user.emailVerifiedAt === null");
const blockCheck = service.indexOf("hasAccountBlockInForce(prisma, user.id)");
assert.ok(passwordCheck > 0 && unverifiedCheck > passwordCheck, "sign-in says \"unverified\" only after the password matched");
assert.ok(blockCheck > unverifiedCheck, "and before the fraud block answer");
assert.match(service, /code: "unverified"/u);
const loginAction = read("modules/auth/actions.ts");
assert.match(loginAction, /result\.code === "unverified"[\s\S]*verificationNeeded: true/u, "the login form is told to offer a new link");
pass("no session is made for an unverified account, and the refusal comes after the password check");

// ---- The login link and the form ------------------------------------------------------------------------------------------
const loginModule = read("modules/auth/LoginPageModule.tsx");
assert.match(loginModule, /getRegistrationStatus\(\)\.open[\s\S]*\/daftar[\s\S]*getRegistrationFormUrl\(\)/u, "the login link goes to signup while open and stays on the team's form while closed");
assert.match(loginModule, /"email-verified"/u, "the login page can say the email is verified");
const form = read("modules/auth/components/register-form.tsx");
assert.match(form, /name="ageConfirmed"/u);
assert.match(form, /Saya berusia 18 tahun ke atas, atau sudah mendapat izin orang tua\/wali/u, "the age box says exactly what was decided");
assert.match(form, /required/u);
assert.match(form, /href="\/syarat-ketentuan"/u);
assert.match(form, /href="\/kebijakan-privasi"/u);
assert.match(form, /name="returnTo"/u);
assert.match(form, /name="ref"/u);
assert.equal(/name="passwordConfirm|confirmPassword/u.test(form), false, "the form has no password confirmation");
assert.doesNotMatch(form, /name="password"/u, "signup cannot preset a password");
assert.match(read("modules/auth/components/verify-email-form.tsx"), /name="password"/u);
const widget = read("modules/auth/components/turnstile-widget.tsx");
assert.match(widget, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/u, "the script comes from Cloudflare, exactly");
assert.match(widget, /name="cf-turnstile-response"/u);
assert.match(actions, /readTextField\(formData, "cf-turnstile-response"\)/u, "the action reads the field the widget writes");
assert.match(read("components/conditional-speed-insights.tsx"), /\/daftar\/verifikasi\//u, "verification links are not sent to third-party instrumentation");
pass("the login link, the form fields, the age box wording and the Turnstile field are as decided");

// ---- The migration ---------------------------------------------------------------------------------------------------------
const migration = read("prisma/migrations/20261109090000_self_registration/migration.sql");
assert.match(migration, /ADD COLUMN "email_verified_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP/u, "new accounts default to verified (admin-created, imports, seeds)");
assert.match(migration, /UPDATE "users" SET "email_verified_at" = "created_at"/u, "existing accounts are backfilled as verified");
assert.match(migration, /registration_consents_immutable[\s\S]*BEFORE UPDATE OR DELETE/u, "consent rows cannot be changed or removed");
assert.match(migration, /registration_consents_truncate_immutable/u);
assert.match(migration, /INSERT INTO "evidence_tables"[\s\S]*'registration_consents', 'registration_consent', ARRAY\[\]::text\[\], true/u, "and are in the MS-10 registry: insert only");
assert.match(migration, /SELECT public\.retention_apply_runtime_grants\(\);\s*$/u, "the grants are applied");
assert.match(migration, /"registration_consents_age_confirmed_check" CHECK \("age_confirmed"\)/u);
assert.match(migration, /email_verification_tokens"\s*ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE CASCADE/u, "links go with an unverified account");
assert.match(migration, /registration_consents" ADD CONSTRAINT "registration_consents_user_id_fkey" FOREIGN KEY \("user_id"\) REFERENCES "users"\("id"\) ON DELETE RESTRICT/u, "a verified account's consent is never removed with it");
assert.match(read("prisma/schema.prisma"), /emailVerifiedAt\s+DateTime\?\s+@default\(now\(\)\)/u);
pass("the migration verifies existing accounts, guards the consent record and registers it as evidence");

// ---- Everything a visitor reads ------------------------------------------------------------------------------------------------
const copyFiles = [
  "app/daftar/page.tsx",
  "app/daftar/periksa-email/page.tsx",
  "app/daftar/verifikasi/[token]/page.tsx",
  "lib/email/verification-email.ts",
  "modules/auth/CheckEmailPageModule.tsx",
  "modules/auth/RegisterPageModule.tsx",
  "modules/auth/VerifyEmailPageModule.tsx",
  "modules/auth/components/register-form.tsx",
  "modules/auth/components/resend-verification-form.tsx",
  "modules/auth/components/verify-email-form.tsx",
  "modules/auth/registration-actions.ts",
];
for (const file of copyFiles) {
  const text = read(file);
  assert.equal(/vecalss/iu.test(text), false, `${file} says PTN Pro, never Vecalss`);
  // What a visitor can read: every quoted sentence (a literal with a space in it) and every line of JSX text.
  const sentences = [
    ...[...text.matchAll(/"([^"\n]* [^"\n]*)"/gu)].map((match) => match[1]),
    ...[...text.matchAll(/>\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</gu)].map((match) => match[1]),
  ].filter((sentence) => !/^(use server|[a-z-]+( [a-z-]+)*=)/u.test(sentence) && !/(\bclassName\b|\bimport\b|\bfrom\b)/u.test(sentence));
  for (const marker of [/\bUUID\b/u, /\bUTF-8\b/u, /\bAPI\b/u, /\btoken\b/iu, /\bCloudflare\b/u, /\bTurnstile\b/u, /\bv\d+\b/u]) {
    const found = sentences.find((sentence) => marker.test(sentence));
    assert.equal(found, undefined, `${file} shows an implementation word to a visitor: ${found}`);
  }
}
pass("the new pages, emails and messages say PTN Pro and show no implementation words");

// ---- Wiring ------------------------------------------------------------------------------------------------------------------------
assert.match(read("app/api/cron/daily-maintenance/route.ts"), /registration: \(\) => cleanupUnverifiedSignups\(\)/u);
assert.match(read("scripts/test-paid-access-surfaces.ts"), /"modules\/auth\/registration-actions\.ts": \{[\s\S]*public: \["registerStudentAction", "resendVerificationAction", "verifyEmailAction"\]/u, "the surface audit classes every new action");
assert.match(read("lib/maintenance/retention.ts"), /registration_attempts/u);
const stack = read("lib/registration/service.ts");
assert.match(stack, /getRegistrationStatus\(\{ env, privacy: deps\.legal\?\.privacy, terms: deps\.legal\?\.terms \}\)\.open\) return \{ status: "closed" \}/u, "the switch is the first thing checked");
assert.match(stack, /flagBlockedSignup/u, "a blocked signup opens an MS-07 case");
const loggerArguments = [...stack.matchAll(/serverLogger\.\w+\(\s*(?:`[^`]*`|"[^"]*"),([^)]*)\)/gu)].map((match) => match[1]);
assert.ok(loggerArguments.length >= 3, "the service logs its failures");
assert.equal(loggerArguments.some((args) => /\b(email|password|rawToken|verifyUrl|passwordHash)\b/u.test(args)), false, "nothing logs an address, a password or a link");
pass("the daily job, the surface audit and the log cleanup are wired, and the switch is checked first");

process.stdout.write("registration surfaces: all checks passed\n");
