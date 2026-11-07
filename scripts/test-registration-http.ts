import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, openSync, readFileSync } from "node:fs";

import { prisma } from "../lib/prisma";
import { registerStudent } from "../lib/registration/service";

/**
 * MS-21 against the real app (next dev on port 5033, so it never touches the
 * 5023 server of the main checkout): the pages a visitor sees while signup is
 * closed and while it is open, the Content-Security-Policy that lets Turnstile
 * load, and the whole verification path through the actual server actions: an
 * unverified account is refused at sign-in (and gets no session), opening the
 * link verifies nothing, the button verifies, and the next sign-in lands on the
 * checkout the buyer came from. Turnstile's transport is injected in the child
 * process, so successful signup actions are exercised without a network call.
 * Local database only.
 */
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:registration-http only runs against the local dev database on 127.0.0.1:55432.");
}

const PORT = 5033;
const BASE = `http://localhost:${PORT}`;
const ROOT = process.cwd();
const runId = randomUUID().slice(0, 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);
const PASSWORD = "Sandi-Uji-2026!";
const CHECKOUT = "/pricing/checkout?plan=monthly&ref=AFF-77";
const SITE_KEY = "1x00000000000000000000AA";

const SERVER_ENV: Record<string, string> = {
  APP_BASE_URL: BASE,
  EMAIL_FROM: "",
  FRAUD_LOOKUP_SECRET: process.env.FRAUD_LOOKUP_SECRET && process.env.FRAUD_LOOKUP_SECRET.length >= 32
    ? process.env.FRAUD_LOOKUP_SECRET
    : "ms21-local-test-fraud-lookup-secret-0123456789",
  PAID_ACCESS_ENFORCED: "1",
  PAYMENT_STAND_IN_LOCAL: "0",
  REGISTRATION_FORM_URL: "https://linktr.ee/ptnpro-test",
  REGISTRATION_OPEN: "1",
  RESEND_API_KEY: "",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  TURNSTILE_SITE_KEY: SITE_KEY,
};

let server: ChildProcess | null = null;
function startServer(extra: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...SERVER_ENV, ...extra };
  // This script runs under the react-server condition (the service imports server-only); the app must not.
  env.NODE_OPTIONS = `--import=${ROOT}/scripts/fixtures/registration-turnstile-fetch.mjs`;
  env.NEXT_TELEMETRY_DISABLED = "1";
  const log = process.env.REGISTRATION_TEST_SERVER_LOG ? openSync(process.env.REGISTRATION_TEST_SERVER_LOG, "a") : "ignore";
  server = spawn(`${ROOT}/node_modules/.bin/next`, ["dev", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", log, log] });
  return server;
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = null;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 8000);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      await fetch(`${BASE}/login`);
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("the dev server did not start");
}

const get = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

function actionIds() {
  const manifest = [`${ROOT}/.next/dev/server/server-reference-manifest.json`, `${ROOT}/.next/server/server-reference-manifest.json`].find(existsSync);
  assert.ok(manifest, "the server reference manifest is missing");
  const node = JSON.parse(readFileSync(manifest, "utf8")).node as Record<string, { exportedName: string; filename: string }>;
  return new Map(Object.entries(node).map(([id, value]) => [`${value.filename}#${value.exportedName}`, id]));
}

/** An action that takes (previousState, formData), called the way React's own client encodes it. */
function callFormAction(id: string, pagePath: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(`_1_${name}`, value);
  form.set("0", JSON.stringify([{ status: "idle" }, "$K1"]));
  return fetch(`${BASE}${pagePath}`, { body: form, headers: { "Next-Action": id }, method: "POST", redirect: "manual" });
}

async function redirectTarget(response: Response) {
  const header = response.headers.get("x-action-redirect") ?? response.headers.get("location");
  if (header) return new URL(header.split(";")[0], BASE);
  const body = await response.text();
  const tag = body.match(/http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/u)?.[1];
  return tag ? new URL(tag.replace(/&amp;/gu, "&"), BASE) : null;
}

async function rows() {
  const [row] = await prisma.$queryRaw<Array<{ attempts: bigint; consents: bigint; tokens: bigint; users: bigint }>>`
    SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM email_verification_tokens) AS tokens,
           (SELECT count(*) FROM registration_attempts) AS attempts, (SELECT count(*) FROM registration_consents) AS consents`;
  return { attempts: Number(row.attempts), consents: Number(row.consents), tokens: Number(row.tokens), users: Number(row.users) };
}

async function main() {
  // ============ Signup closed (the legal pages are still drafts) ============
  startServer({});
  try {
    await waitForServer();

    const closedPage = await (await get("/daftar")).text();
    assert.match(closedPage, /Pendaftaran mandiri belum dibuka/u, "closed: /daftar shows a calm notice");
    assert.match(closedPage, /linktr\.ee\/ptnpro-test/u, "closed: it points at the registration form the team uses");
    assert.equal(/name="fullName"|name="ageConfirmed"/u.test(closedPage), false, "closed: no signup form is rendered");
    assert.equal(closedPage.includes("challenges.cloudflare.com"), false, "closed: no Turnstile script is loaded");

    const closedLogin = await (await get("/login")).text();
    assert.match(closedLogin, /href="https:\/\/linktr\.ee\/ptnpro-test"/u, "closed: the login page's register link stays on the form");
    assert.equal(/href="\/daftar/u.test(closedLogin), false);

    // The form action writes nothing while closed, even with every field right.
    await get("/daftar/periksa-email");
    await get("/daftar/verifikasi/x");
    const ids = actionIds();
    const registerId = ids.get("modules/auth/registration-actions.ts#registerStudentAction");
    assert.ok(registerId, "the register action is a server action");
    const before = await rows();
    const refused = await callFormAction(registerId, "/daftar", {
      ageConfirmed: "yes",
      "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX",
      email: `closed-${runId}@ms21.test`,
      fullName: "Siswa Uji",
      password: PASSWORD,
    });
    assert.match(await refused.text(), /Pendaftaran mandiri belum dibuka/u, "closed: the action says so");
    assert.deepEqual(await rows(), before, "closed: the action wrote nothing");
    pass("closed: /daftar shows the notice, the login link stays on the team's form, and the form action writes nothing");

    // Legal pages: drafts with visible placeholders and the footer links.
    for (const [path, title] of [["/kebijakan-privasi", "Kebijakan Privasi"], ["/syarat-ketentuan", "Syarat dan Ketentuan"], ["/syarat-pembelian", "Syarat Pembelian"]] as const) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(html.includes(title), `${path} has its title`);
      for (const href of ["/kebijakan-privasi", "/syarat-ketentuan", "/syarat-pembelian"]) {
        assert.ok(html.includes(`href="${href}"`), `${path} links to ${href} in the footer`);
      }
      if (path !== "/syarat-pembelian") {
        assert.match(html, /Ini masih draf per/u, `${path} says it is a draft`);
        assert.match(html, /\[nama badan usaha\]/u, `${path} shows the placeholder`);
        assert.match(html, /PTN Pro/u);
        assert.equal(/Vecalss/u.test(html.replace(/vecalss\.academy|vecalss\.png|mascot-vecalss|vecalss_/gu, "")), false, `${path} says PTN Pro, not Vecalss`);
      }
    }
    pass("both legal pages are served as drafts with placeholders, and every page carries the three footer links");

    // The CSP lets Cloudflare's script and widget frame load, and nothing else new.
    const csp = (await get("/daftar")).headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/u);
    assert.match(csp, /frame-src [^;]*https:\/\/challenges\.cloudflare\.com/u);
    assert.match(csp, /form-action 'self'/u);
    assert.match(csp, /object-src 'none'/u);
    pass("the CSP allows Turnstile's script and frame");

    // A made-up verification link is a calm dead end.
    const dead = await (await get("/daftar/verifikasi/not-a-real-token")).text();
    assert.match(dead, /Tautan tidak berlaku/u);
  } finally {
    await stopServer();
  }

  // ============ Signup open (locally: draft legal pages allowed through the stand-in gate) ============
  startServer({ PAYMENT_STAND_IN_LOCAL: "1" });
  const createdEmails: string[] = [];
  try {
    await waitForServer();

    const page = await (await get(`/daftar?returnTo=${encodeURIComponent(CHECKOUT)}`)).text();
    assert.match(page, /name="fullName"/u);
    assert.match(page, /name="email"/u);
    assert.doesNotMatch(page, /name="password"/u);
    assert.match(page, /name="ageConfirmed"/u, "the age box is part of the form");
    assert.match(page, /Saya berusia 18 tahun ke atas, atau sudah mendapat izin orang tua\/wali/u, "with the decided wording");
    assert.match(page, /name="returnTo"/u, "returnTo rides along");
    assert.ok(page.includes(encodeURIComponent(CHECKOUT)) || page.includes(CHECKOUT.replace(/&/gu, "&amp;")) || page.includes(CHECKOUT), "and is the one the buyer came with");
    assert.ok(page.includes(SITE_KEY), "the Turnstile site key reaches the widget");
    assert.equal(page.includes("1x0000000000000000000000000000000AA"), false, "the secret key never reaches the browser");
    assert.match(page, /href="\/syarat-ketentuan"/u);
    assert.match(page, /href="\/kebijakan-privasi"/u);
    pass("open: /daftar renders the form with the age box, the carried returnTo and the Turnstile site key (never the secret)");

    const login = await (await get(`/login?returnTo=${encodeURIComponent(CHECKOUT)}`)).text();
    assert.match(login, /href="\/daftar\?returnTo=/u, "open: the login page links to signup, keeping where the buyer was headed");
    assert.equal(/linktr\.ee\/ptnpro-test/u.test(login), false);
    pass("open: the login page's register link goes to /daftar and carries returnTo");

    // An account made through the service, the way the form would, with Turnstile supplied by the test.
    const email = `http-${runId}@ms21.test`;
    createdEmails.push(email);
    const created = await registerStudent(
      { ageConfirmed: true, email, fullName: "Siswa HTTP", ref: "AFF-77", returnTo: CHECKOUT, turnstileToken: "t" },
      {
        env: { ...process.env, ...SERVER_ENV, NODE_ENV: "development", PAYMENT_STAND_IN_LOCAL: "1" } as unknown as NodeJS.ProcessEnv,
        getMetadata: async () => ({ ipAddress: `10.${Math.floor(Math.random() * 250) + 1}.9.9` }),
        mailer: async () => ({ id: "x", ok: true, redirected: false }),
        schedule: () => undefined,
        verifyTurnstile: async () => "passed",
      },
    );
    assert.equal(created.status, "accepted");
    const link = created.status === "accepted" ? created.deliveredVerificationUrl : null;
    assert.ok(link, "the link is handed back outside production");
    const linkUrl = new URL(link);
    assert.match(linkUrl.pathname, /^\/daftar\/verifikasi\//u);
    const query = linkUrl.search;

    for (const path of ["/login", "/daftar", "/daftar/periksa-email", "/daftar/verifikasi/x"]) await get(path);
    const ids = actionIds();
    const loginId = ids.get("modules/auth/actions.ts#loginAction");
    const verifyId = ids.get("modules/auth/registration-actions.ts#verifyEmailAction");
    const resendId = ids.get("modules/auth/registration-actions.ts#resendVerificationAction");
    const registerId = ids.get("modules/auth/registration-actions.ts#registerStudentAction");
    assert.ok(loginId && verifyId && resendId && registerId);

    // A real successful signup action, with only the outbound Siteverify transport injected.
    const actionEmail = `signup-action-${runId}@ms21.test`;
    createdEmails.push(actionEmail);
    const registered = await callFormAction(registerId, "/daftar", {
      email: actionEmail, fullName: "Nama Pemilik", ageConfirmed: "yes",
      "cf-turnstile-response": "ms21-http-pass", returnTo: CHECKOUT, ref: "AFF-77",
      password: "Attacker-2026!", // An unsolicited credential must be ignored.
    });
    const registrationTarget = await redirectTarget(registered);
    assert.ok(registrationTarget);
    assert.equal(registrationTarget?.pathname, "/daftar/periksa-email");
    assert.equal(registrationTarget.searchParams.get("returnTo"), CHECKOUT);
    assert.equal(registrationTarget.searchParams.get("ref"), "AFF-77");
    const actionUser = await prisma.user.findUniqueOrThrow({ where: { email: actionEmail } });
    assert.equal(actionUser.emailVerifiedAt, null);
    assert.equal(actionUser.passwordHash, null, "even a forged signup password is never persisted");
    const repeated = await callFormAction(registerId, "/daftar", {
      email: actionEmail, fullName: "Nama Penyerang", ageConfirmed: "yes",
      "cf-turnstile-response": "ms21-http-pass", password: "Another-Attack-2026!",
    });
    assert.equal((await redirectTarget(repeated))?.pathname, "/daftar/periksa-email");
    const stillOriginal = await prisma.user.findUniqueOrThrow({ where: { email: actionEmail } });
    assert.equal(stillOriginal.fullName, "Nama Pemilik");
    assert.equal(stillOriginal.passwordHash, null);
    pass("successful signup action preserves returnTo/ref and ignores unsolicited passwords, including repeated signup");

    // Signing in is refused until the email is verified, whatever the password.
    const sessionsFor = async () => prisma.authSession.count({ where: { user: { email } } });
    const refusedLogin = await callFormAction(loginId, "/login", { email, password: PASSWORD });
    const refusedText = await refusedLogin.text();
    assert.match(refusedText, /Email atau kata sandi belum cocok/u, "pending accounts have no usable password");
    assert.equal(refusedLogin.headers.get("set-cookie")?.includes("vecalss_session") ?? false, false, "no session cookie");
    assert.equal(await sessionsFor(), 0, "and no session exists");
    const wrong = await callFormAction(loginId, "/login", { email, password: "Salah-Sandi-1!" });
    const wrongText = await wrong.text();
    assert.equal(/belum diverifikasi/u.test(wrongText), false, "a wrong password learns nothing about verification");
    assert.match(wrongText, /Email atau kata sandi belum cocok/u);
    const unknown = await callFormAction(loginId, "/login", { email: `nobody-${runId}@ms21.test`, password: PASSWORD });
    assert.match(await unknown.text(), /Email atau kata sandi belum cocok/u);
    const attempt = await prisma.loginAttempt.findFirst({ orderBy: { attemptedAt: "desc" }, where: { email, failureReason: "invalid_password" } });
    assert.ok(attempt, "the refusal is recorded as a login attempt");
    pass("an unverified account is refused at sign-in (no session), and only with the right password; wrong passwords and unknown emails get the usual answer");

    // The link only reads. An email scanner that opens it verifies nothing.
    const verifyPage = await get(`${linkUrl.pathname}${query}`);
    assert.equal(verifyPage.status, 200);
    const verifyHtml = await verifyPage.text();
    assert.match(verifyHtml, /Verifikasi email/u);
    assert.match(verifyHtml, /name="token"/u);
    await get(`${linkUrl.pathname}${query}`);
    const stillPending = await prisma.user.findUniqueOrThrow({ include: { emailVerificationTokens: true }, where: { email } });
    assert.equal(stillPending.emailVerifiedAt, null, "opening the link twice verified nothing");
    assert.equal(stillPending.emailVerificationTokens.every((token) => token.usedAt === null), true);
    pass("opening the verification link (a GET) verifies nothing");

    // The resend form answers the same for an address with a pending signup and one with none.
    const pendingAnswer = await (await callFormAction(resendId, "/daftar/periksa-email", { email })).text();
    const noneAnswer = await (await callFormAction(resendId, "/daftar/periksa-email", { email: `nobody2-${runId}@ms21.test` })).text();
    for (const answer of [pendingAnswer, noneAnswer]) {
      assert.match(answer, /Kalau email itu punya pendaftaran yang belum diverifikasi, kami sudah mengirim tautan baru/u);
    }
    // That resend replaced the link; the one from the signup is no longer good, the new one is.
    const linkAfterResend = await prisma.emailVerificationToken.findMany({ orderBy: { createdAt: "asc" }, where: { user: { email } } });
    assert.equal(linkAfterResend.filter((token) => token.usedAt === null).length, 1, "exactly one link works");
    pass("the resend form gives one answer for a pending signup and for an address with none");

    // Using the first link now fails (the resend ended it); verify with the newest one, read from the new on-screen link.
    const deadVerify = await callFormAction(verifyId, linkUrl.pathname, { token: linkUrl.pathname.split("/").pop()!, returnTo: CHECKOUT, ref: "AFF-77", password: PASSWORD });
    assert.match(await deadVerify.text(), /tidak valid atau sudah kedaluwarsa/u, "a link ended by a resend is refused");
    const resendFormAnswer = await (await callFormAction(resendId, "/daftar/periksa-email", { email })).text();
    const newLink = /\/daftar\/verifikasi\/([A-Za-z0-9_-]{20,})/u.exec(resendFormAnswer.replace(/\\u0026/gu, "&"));
    assert.ok(newLink, "outside production the new link is on screen");
    const token = newLink[1];

    const missingPassword = await callFormAction(verifyId, `/daftar/verifikasi/${token}`, { token });
    assert.match(await missingPassword.text(), /kata sandi/u);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt, null);
    const verified = await callFormAction(verifyId, `/daftar/verifikasi/${token}`, { ref: "AFF-77", returnTo: CHECKOUT, token, password: PASSWORD });
    const target = await redirectTarget(verified);
    assert.ok(target, "verifying redirects");
    assert.equal(target.pathname, "/login");
    assert.equal(target.searchParams.get("notice"), "email-verified");
    assert.equal(target.searchParams.get("returnTo"), CHECKOUT, "returnTo (with the referral inside it) survives verification");
    const verifiedUser = await prisma.user.findUniqueOrThrow({ include: { registrationConsents: true }, where: { email } });
    assert.ok(verifiedUser.emailVerifiedAt, "verified by the button");
    assert.equal(verifiedUser.registrationConsents.length, 1, "the consent record exists");
    assert.equal(verifiedUser.registrationConsents[0].ageConfirmed, true);
    const reuse = await callFormAction(verifyId, `/daftar/verifikasi/${token}`, { returnTo: CHECKOUT, token, password: PASSWORD });
    assert.match(await reuse.text(), /tidak valid atau sudah kedaluwarsa/u, "a link works once");
    pass("the verify button verifies, writes the consent record, and sends the buyer to sign in with returnTo intact; a second use fails");

    // A referral alone (no checkout) lands on pricing with the code.
    const refOnlyEmail = `http-ref-${runId}@ms21.test`;
    createdEmails.push(refOnlyEmail);
    const refOnly = await registerStudent(
      { ageConfirmed: true, email: refOnlyEmail, fullName: "Siswa Ref", ref: "AFF-88", turnstileToken: "t" },
      {
        env: { ...process.env, ...SERVER_ENV, NODE_ENV: "development", PAYMENT_STAND_IN_LOCAL: "1" } as unknown as NodeJS.ProcessEnv,
        getMetadata: async () => ({ ipAddress: `10.${Math.floor(Math.random() * 250) + 1}.8.8` }),
        mailer: async () => ({ id: "x", ok: true, redirected: false }),
        schedule: () => undefined,
        verifyTurnstile: async () => "passed",
      },
    );
    const refToken = new URL(refOnly.status === "accepted" ? refOnly.deliveredVerificationUrl! : "").pathname.split("/").pop()!;
    const refTarget = await redirectTarget(await callFormAction(verifyId, `/daftar/verifikasi/${refToken}`, { ref: "AFF-88", token: refToken, password: PASSWORD }));
    assert.equal(refTarget?.searchParams.get("returnTo"), "/pricing?ref=AFF-88", "a referral with no checkout lands on pricing with the code");
    pass("a referral code alone survives verification as a pricing link");

    // Now the sign-in works and goes back to checkout.
    const signedIn = await callFormAction(loginId, "/login", { email, password: PASSWORD, returnTo: CHECKOUT });
    const landing = await redirectTarget(signedIn);
    assert.equal(`${landing?.pathname}${landing?.search}`, CHECKOUT, "after verifying, signing in lands back on the checkout, referral intact");
    assert.ok(signedIn.headers.get("set-cookie")?.includes("vecalss_session"), "a session cookie is set");
    assert.equal(await sessionsFor(), 1, "and one session exists");
    pass("after verifying, sign-in works and lands back on the checkout with the referral intact");

    // The form with no Turnstile token is refused before any network call, and writes nothing.
    const beforeRefusal = await rows();
    const noToken = await callFormAction(registerId, "/daftar", {
      ageConfirmed: "yes",
      email: `notoken-${runId}@ms21.test`,
      fullName: "Tanpa Token",
      password: PASSWORD,
    });
    assert.match(await noToken.text(), /Pemeriksaan keamanan belum berhasil/u, "no Turnstile token, no signup");
    assert.deepEqual(await rows(), beforeRefusal, "and nothing was written");
    const noBox = await callFormAction(registerId, "/daftar", {
      "cf-turnstile-response": "t",
      email: `nobox-${runId}@ms21.test`,
      fullName: "Tanpa Centang",
      password: PASSWORD,
    });
    assert.match(await noBox.text(), /Centang pernyataan ini untuk melanjutkan/u, "no age box, no signup");
    assert.deepEqual(await rows(), beforeRefusal);
    pass("the form is refused without a Turnstile token and without the age box, and writes nothing");
  } finally {
    await stopServer();
  }
  void createdEmails;

  process.stdout.write("registration http: all checks passed\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    await prisma.$disconnect();
  });
