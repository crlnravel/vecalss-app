import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Run twice by `pnpm test:password-reset-email`: once as a development server
 * and once with NODE_ENV=production (argument "production"), because whether the
 * link may be shown on screen is fixed when the app starts.
 */
const MODE = process.argv[2] === "production" ? "production" : "development";
if (MODE === "production") {
  (process.env as Record<string, string>).NODE_ENV = "production";
  process.env.APP_BASE_URL = "https://app.example.test";
}

if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:password-reset-email only runs against the local dev database on 127.0.0.1:55432.");
}

type MailerModule = typeof import("../lib/email/mailer");
type ServiceModule = typeof import("../lib/auth/service");

const API_KEY = "re_test_SECRET_KEY_do_not_log";
const baseEnv = (extra: Record<string, string> = {}) =>
  ({ EMAIL_FROM: "Vecalss <onboarding@resend.dev>", NODE_ENV: MODE, RESEND_API_KEY: API_KEY, ...extra }) as unknown as NodeJS.ProcessEnv;

type Call = { body: Record<string, unknown>; headers: Record<string, string>; init: RequestInit; url: string };
function stubFetch(responder: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: init?.headers as Record<string, string>,
      init: init ?? {},
      url: String(url),
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });

/** Everything the app (and this test) writes to the console, so the log checks see it all. */
const logs: string[] = [];
for (const method of ["debug", "info", "warn", "error", "log"] as const) {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    if (process.env.TEST_VERBOSE) original(...args);
  };
}
const say = (message: string) => process.stdout.write(`${message}\n`);

async function mailerChecks(mailer: MailerModule) {
  const { RESEND_ENDPOINT, sendEmail } = mailer;
  const message = {
    html: "<p>hai</p>",
    idempotencyKey: "password-reset-abc",
    subject: "Subjek",
    text: "hai",
    to: "orang@example.test",
  };

  // Request shape.
  {
    const { calls, fetchImpl } = stubFetch(() => json(200, { id: "msg_123" }));
    const env = baseEnv({ EMAIL_DEV_REDIRECT: "delivered@resend.dev", EMAIL_REPLY_TO: "bantuan@example.test" });
    const result = await sendEmail(message, { env, fetchImpl });
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.url, RESEND_ENDPOINT);
    assert.equal(call.url, "https://api.resend.com/emails");
    assert.equal(call.init.method, "POST");
    assert.equal(call.headers.Authorization, `Bearer ${API_KEY}`);
    assert.equal(call.headers["Content-Type"], "application/json");
    assert.equal(call.headers["Idempotency-Key"], "password-reset-abc");
    assert.ok(call.init.signal instanceof AbortSignal, "a timeout signal is attached");
    assert.equal(call.body.from, "Vecalss <onboarding@resend.dev>");
    assert.equal(call.body.subject === undefined, false);
    assert.equal(call.body.html, "<p>hai</p>");
    assert.equal(call.body.text, "hai");
    assert.equal(call.body.reply_to, "bantuan@example.test");
    if (MODE === "production") {
      assert.deepEqual(call.body.to, ["orang@example.test"], "production goes to the real recipient");
      assert.equal(call.body.subject, "Subjek");
      assert.deepEqual(result, { id: "msg_123", ok: true, redirected: false });
    } else {
      assert.deepEqual(call.body.to, ["delivered@resend.dev"], "outside production everything goes to the redirect");
      assert.equal(call.body.subject, "[Uji untuk orang@example.test] Subjek");
      assert.deepEqual(result, { id: "msg_123", ok: true, redirected: true });
    }
  }

  // Redirect rules, and no send without configuration.
  {
    const { calls, fetchImpl } = stubFetch(() => json(200, { id: "x" }));
    const redirectedInProduction = await sendEmail(message, {
      env: baseEnv({ EMAIL_DEV_REDIRECT: "delivered@resend.dev", NODE_ENV: "production" }),
      fetchImpl,
    });
    assert.ok(redirectedInProduction.ok);
    assert.deepEqual(calls[0].body.to, ["orang@example.test"], "EMAIL_DEV_REDIRECT is ignored in production");

    const noRedirect = await sendEmail(message, { env: baseEnv({ NODE_ENV: "development" }), fetchImpl });
    assert.deepEqual(noRedirect, { ok: false, reason: "dev_redirect_required" });
    assert.equal(calls.length, 1, "no real recipient outside production without a redirect");

    for (const [env, code] of [
      [{ EMAIL_FROM: "a@b.test", NODE_ENV: "production" }, "missing_api_key"],
      [{ NODE_ENV: "production", RESEND_API_KEY: API_KEY }, "missing_from"],
      [{ NODE_ENV: "production" }, "missing_api_key"],
    ] as const) {
      const before = logs.length;
      const result = await sendEmail(message, { env: env as unknown as NodeJS.ProcessEnv, fetchImpl });
      assert.deepEqual(result, { code, ok: false, reason: "not_configured" });
      const written = logs.slice(before).join("\n");
      assert.match(written, /email\.not_configured/u, "production misconfiguration is reported as an error");
    }
    const quiet = logs.length;
    assert.equal((await sendEmail(message, { env: { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv, fetchImpl })).ok, false);
    assert.ok(!logs.slice(quiet).join("\n").includes('"level":"error"'), "a missing key outside production is not an error");
    assert.equal(calls.length, 1, "nothing is sent without configuration");
  }

  // Failures: timeout, non-2xx, network, odd replies. None throws.
  {
    const env = baseEnv({ EMAIL_DEV_REDIRECT: "delivered@resend.dev", NODE_ENV: MODE });
    const hang = stubFetch((call) => new Promise<Response>((_resolve, reject) => {
      (call.init.signal as AbortSignal).addEventListener("abort", () => reject((call.init.signal as AbortSignal).reason));
    }));
    const started = Date.now();
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: hang.fetchImpl, timeoutMs: 80 }), { ok: false, reason: "timeout" });
    assert.ok(Date.now() - started < 2_000, "the timeout bounds the wait");

    const rejected = stubFetch(() => json(422, { message: "The from address is not verified", name: "validation_error", statusCode: 422 }));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: rejected.fetchImpl }), { code: "validation_error", ok: false, reason: "rejected", status: 422 });
    const limited = stubFetch(() => json(429, { name: "rate_limit_exceeded" }));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: limited.fetchImpl }), { code: "rate_limit_exceeded", ok: false, reason: "rejected", status: 429 });
    const html500 = stubFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: html500.fetchImpl }), { ok: false, reason: "rejected", status: 502 });

    const down = stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: down.fetchImpl }), { ok: false, reason: "network" });
    const noId = stubFetch(() => json(200, {}));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: noId.fetchImpl }), { ok: false, reason: "bad_response", status: 200 });
    const notJson = stubFetch(() => new Response("ok", { status: 200 }));
    assert.deepEqual(await sendEmail(message, { env, fetchImpl: notJson.fetchImpl }), { ok: false, reason: "bad_response", status: 200 });
  }
}

async function main() {
  // AbortSignal.timeout() timers do not keep a bare Node process alive, unlike a server.
  const keepAlive = setInterval(() => {}, 1_000);
  const mailer = await import("../lib/email/mailer");
  const { buildPasswordResetEmail } = await import("../lib/email/password-reset-email");
  const { prisma } = await import("../lib/prisma");
  const { hashEmail, PASSWORD_RESET_REQUEST_LIMITS } = await import("../lib/auth/password-reset-throttle");
  const { requestPasswordReset } = (await import("../lib/auth/service")) as ServiceModule;
  const { sendEmail } = mailer;

  say(`mode: ${MODE}`);
  await mailerChecks(mailer);
  say("mailer checks passed");

  // ---- Fixtures ----------------------------------------------------------
  const runId = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const emails: string[] = [];
  const ips: string[] = [];
  const email = (label: string) => {
    const value = `reset-test-${label}-${runId}@vecalss.local`;
    emails.push(value);
    return value;
  };
  const ipPool = (octet: number) => {
    const value = `198.51.100.${octet}`;
    ips.push(value);
    return value;
  };
  const makeUser = async (label: string, data: Record<string, unknown> = {}) => {
    const created = await prisma.user.create({
      data: { email: email(label), fullName: `Nama <b>${label}</b>`, passwordHash: "not-a-real-hash", ...data } as never,
      select: { email: true, id: true },
    });
    userIds.push(created.id);
    return created;
  };

  const valid = await makeUser("valid");
  const disabled = await makeUser("disabled", { status: "disabled" });
  const softDeleted = await makeUser("softdeleted", { softDeletedAt: new Date(), status: "soft_deleted" });
  // Managed preview subjects cannot be created by hand (a trigger forbids it), so use the seeded one.
  const preview = await prisma.user.findFirst({ select: { email: true, id: true }, where: { previewPurpose: { not: null } } });
  if (!preview) say("skipped: no managed preview account in this database (run pnpm db:seed); the preview case was not checked");
  const unknownEmail = email("unknown");

  // The scheduler stands in for Next's after(): tasks are kept, then run on demand.
  const harness = (clientIp: string | null = ipPool(1), mailerOverride?: typeof sendEmail) => {
    const tasks: Array<() => Promise<void>> = [];
    const sent: Array<Parameters<typeof sendEmail>[0]> = [];
    const stubMailer: typeof sendEmail = mailerOverride ?? (async (message) => {
      sent.push(message);
      return { id: "msg_test", ok: true, redirected: false };
    });
    return {
      deps: { getMetadata: async () => ({ ipAddress: clientIp }), mailer: stubMailer, schedule: (task: () => Promise<void>) => void tasks.push(task) },
      runTasks: async () => { for (const task of tasks.splice(0)) await task(); },
      sent,
      tasks,
    };
  };
  const tokenRows = (userId: string) => prisma.passwordResetToken.findMany({ where: { userId } });

  try {
    // ---- Unknown, disabled, deleted and preview accounts: same response, no send ----
    {
      const results = [];
      for (const target of [unknownEmail, disabled.email, softDeleted.email, ...(preview ? [preview.email] : [])]) {
        const h = harness(ipPool(2));
        results.push(await requestPasswordReset(target, "student", h.deps));
        assert.equal(h.tasks.length, 1, "the same after() work is scheduled for every outcome");
        await h.runTasks();
        assert.equal(h.sent.length, 0, `no email for ${target}`);
      }
      for (const result of results) assert.deepEqual(result, { deliveredResetUrl: null });
      for (const account of [disabled, softDeleted, ...(preview ? [preview] : [])]) assert.equal((await tokenRows(account.id)).length, 0, "no token created");
    }

    // ---- A valid account: link in the email; sent only after the transaction and the response ----
    let validLink = "";
    {
      const h = harness(ipPool(3));
      const result = await requestPasswordReset(valid.email.toUpperCase(), "admin", h.deps);
      const rows = await tokenRows(valid.id);
      assert.equal(rows.length, 1, "the token is committed before any network call");
      assert.equal(h.sent.length, 0, "nothing is sent before the response is on its way");
      assert.equal(h.tasks.length, 1);
      if (MODE === "production") {
        assert.deepEqual(result, { deliveredResetUrl: null }, "production never shows the link on screen");
      } else {
        assert.ok(result.deliveredResetUrl?.includes("/reset-password/"), "development shows the link, as before");
      }

      await h.runTasks();
      assert.equal(h.sent.length, 1);
      const [message] = h.sent;
      assert.equal(message.to, valid.email);
      assert.equal(message.idempotencyKey, `password-reset-${rows[0].id}`);
      assert.equal(message.subject, "Atur ulang kata sandi akun Vecalss-mu");
      const link = message.text.match(/https?:\/\/\S+/u)?.[0] as string;
      assert.ok(link, "the email carries the link");
      validLink = link;
      const token = link.split("/reset-password/")[1].split("?")[0];
      assert.equal(rows[0].tokenHash, (await import("../lib/auth/crypto")).hashToken(token), "the link opens the stored token");
      assert.match(link, /\?audience=admin$/u);
      if (MODE === "production") assert.ok(link.startsWith("https://app.example.test/reset-password/"));
      assert.ok(message.html.includes(`href="${link}"`) || message.html.includes(`href="${link.replace(/&/gu, "&amp;")}"`));
      assert.ok(message.html.includes("Nama &lt;b&gt;valid&lt;/b&gt;"), "the name is escaped in HTML");
      assert.ok(message.text.includes("Halo Nama <b>valid</b>,"));
      for (const phrase of ["berlaku 15 menit", "abaikan saja email ini", "tidak pernah meminta kata sandimu"]) {
        assert.ok(message.text.includes(phrase), phrase);
        assert.ok(message.html.includes(phrase), phrase);
      }
      assert.ok(!/\b(token|API|UUID|HTML)\b/u.test(message.text), "no technical terms in the copy");
      assert.ok(Math.abs(rows[0].expiresAt.getTime() - rows[0].requestedAt.getTime() - 15 * 60_000) < 5_000);

      // A new request voids the earlier token.
      const second = harness(ipPool(3));
      await requestPasswordReset(valid.email, "student", second.deps);
      const after = await tokenRows(valid.id);
      assert.equal(after.length, 2);
      assert.equal(after.filter((row) => row.usedAt === null).length, 1);
      await second.runTasks();
      assert.notEqual(second.sent[0].idempotencyKey, message.idempotencyKey, "one key per message");
    }

    // ---- The template alone ----
    const built = buildPasswordResetEmail({ fullName: "  ", idempotencyKey: "k", resetUrl: "https://x.test/r?a=1&b=2", to: "a@b.test" });
    assert.ok(built.text.startsWith("Halo kamu,"));
    assert.ok(built.html.includes("https://x.test/r?a=1&amp;b=2"));

    // ---- A send failure never reaches the person; the real mailer fails soft ----
    {
      const failing = stubFetch(() => json(422, { message: `bad ${validLink}`, name: "validation_error" }));
      const failingMailer: typeof sendEmail = (message) =>
        sendEmail(message, { env: baseEnv({ EMAIL_DEV_REDIRECT: "delivered@resend.dev", NODE_ENV: MODE }), fetchImpl: failing.fetchImpl });
      const failingUser = await makeUser("failing");
      const h = harness(ipPool(4), failingMailer);
      const result = await requestPasswordReset(failingUser.email, "student", h.deps);
      await h.runTasks();
      assert.equal(failing.calls.length, 1);
      assert.equal(typeof result.deliveredResetUrl === "string" || result.deliveredResetUrl === null, true);

      const throwingMailer: typeof sendEmail = async () => { throw new Error(`boom ${validLink}`); };
      const throwingUser = await makeUser("throwing");
      const g = harness(ipPool(4), throwingMailer);
      await requestPasswordReset(throwingUser.email, "student", g.deps);
      await g.runTasks();
      assert.equal((await tokenRows(throwingUser.id)).length, 1);
    }

    // ---- Throttle per email ------------------------------------------------
    {
      process.env.REDIS_URL = "redis://127.0.0.1:1"; // Redis is not involved; this proves it
      const limit = PASSWORD_RESET_REQUEST_LIMITS.email.max;
      for (const target of [email("throttled-known"), unknownEmail]) {
        const known = target.includes("throttled-known");
        if (known) await makeUser("throttled-known").catch(() => undefined);
      }
      const knownAccount = await prisma.user.findUniqueOrThrow({ select: { id: true }, where: { email: emails.find((value) => value.includes("throttled-known")) as string } }).catch(async () => {
        const created = await prisma.user.create({ data: { email: emails.find((value) => value.includes("throttled-known")) as string, fullName: "Throttle Known", passwordHash: "x" }, select: { id: true } });
        userIds.push(created.id);
        return created;
      });
      const knownEmail = emails.find((value) => value.includes("throttled-known")) as string;
      const unknownTarget = email("throttled-unknown");

      for (const [target, isKnown] of [[knownEmail, true], [unknownTarget, false]] as const) {
        const ip = ipPool(isKnown ? 10 : 11);
        const results = [];
        let sentCount = 0;
        for (let attempt = 0; attempt < limit + 3; attempt += 1) {
          const h = harness(ip);
          results.push(await requestPasswordReset(target, "student", h.deps));
          await h.runTasks();
          sentCount += h.sent.length;
        }
        assert.equal(sentCount, isKnown ? limit : 0, isKnown ? "the first requests send, the rest do not" : "unknown addresses never send");
        if (isKnown) assert.equal((await tokenRows(knownAccount.id)).length, limit, "a throttled request creates no token");
        assert.equal(
          await prisma.passwordResetRequest.count({ where: { emailHash: hashEmail(target) } }),
          limit,
          "the limit applies to unknown addresses just the same",
        );
        if (MODE === "production") for (const result of results) assert.deepEqual(result, { deliveredResetUrl: null });
      }

      // Another address from the same client is unaffected by the email limit.
      const otherUser = await makeUser("other");
      const other = harness(ipPool(10));
      await requestPasswordReset(otherUser.email, "student", other.deps);
      await other.runTasks();
      assert.equal(other.sent.length, 1);

      // Concurrent requests cannot slip past the limit.
      const racer = await prisma.user.create({ data: { email: email("racer"), fullName: "Racer", passwordHash: "x" }, select: { id: true } });
      userIds.push(racer.id);
      const racing = Array.from({ length: 8 }, () => harness(ipPool(12)));
      await Promise.all(racing.map((h) => requestPasswordReset(emails[emails.length - 1], "student", h.deps)));
      await Promise.all(racing.map((h) => h.runTasks()));
      assert.equal(racing.reduce((total, h) => total + h.sent.length, 0), limit, "exactly the limit gets through");
      assert.equal((await tokenRows(racer.id)).length, limit);

      // The block ends when the window passes.
      await prisma.$executeRaw`UPDATE password_reset_requests SET requested_at = now() - interval '16 minutes' WHERE email_hash = ${hashEmail(knownEmail)}`;
      const again = harness(ipPool(10));
      await requestPasswordReset(knownEmail, "student", again.deps);
      await again.runTasks();
      assert.equal(again.sent.length, 1);

      // Throttle activity never deletes older rows: they are security evidence for 90 days, and the
      // daily maintenance job owns expiry. They also stop counting once they leave the window.
      const evidenceHash = hashEmail(email("old-evidence"));
      await prisma.$executeRaw`
        INSERT INTO password_reset_requests (email_hash, requested_at)
        SELECT ${evidenceHash}, now() - make_interval(days => d) FROM unnest(ARRAY[2, 3, 30, 60, 89]) AS d`;
      const agedAccount = await makeUser("aged");
      await prisma.$executeRaw`
        INSERT INTO password_reset_requests (email_hash, requested_at)
        SELECT ${hashEmail(agedAccount.email)}, now() - interval '2 days' FROM generate_series(1, ${limit}::int)`;
      const afterAged = harness(ipPool(30));
      await requestPasswordReset(agedAccount.email, "student", afterAged.deps);
      await afterAged.runTasks();
      assert.equal(afterAged.sent.length, 1, "rows from two days ago no longer count toward the limit");
      assert.equal(
        Number((await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM password_reset_requests WHERE email_hash = ${evidenceHash}`)[0].count),
        5,
        "an accepted request does not delete older rows",
      );
      assert.equal(
        Number((await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM password_reset_requests WHERE email_hash = ${hashEmail(agedAccount.email)} AND requested_at < now() - interval '1 day'`)[0].count),
        limit,
        "the throttled address keeps its own older rows too",
      );
      // The limit itself still holds from timestamps alone.
      for (let attempt = 0; attempt < limit; attempt += 1) {
        const h = harness(ipPool(31));
        await requestPasswordReset(agedAccount.email, "student", h.deps);
        await h.runTasks();
      }
      const blocked = harness(ipPool(31));
      await requestPasswordReset(agedAccount.email, "student", blocked.deps);
      await blocked.runTasks();
      assert.equal(blocked.sent.length, 0, "the limit still blocks without any cleanup");
    }

    // ---- Throttle per client address ---------------------------------------
    {
      const ip = ipPool(20);
      const limit = PASSWORD_RESET_REQUEST_LIMITS.ip.max;
      let sentCount = 0;
      const accounts = [];
      for (let index = 0; index < limit + 2; index += 1) {
        const account = await prisma.user.create({ data: { email: email(`iplimit-${index}`), fullName: "IP Limit", passwordHash: "x" }, select: { email: true, id: true } });
        userIds.push(account.id);
        accounts.push(account);
      }
      for (const account of accounts) {
        const h = harness(ip);
        await requestPasswordReset(account.email, "student", h.deps);
        await h.runTasks();
        sentCount += h.sent.length;
      }
      assert.equal(sentCount, limit, "different addresses from one client stop at the client limit");
      assert.equal(await prisma.passwordResetRequest.count({ where: { ipAddress: ip } }), limit);
      const elsewhere = harness(ipPool(21));
      await requestPasswordReset(accounts[limit].email, "student", elsewhere.deps);
      await elsewhere.runTasks();
      assert.equal(elsewhere.sent.length, 1, "another client is unaffected");

      // No trusted client address: only the email limit applies, and the request still works.
      const noIp = harness(null);
      await requestPasswordReset(accounts[limit + 1].email, "student", noIp.deps);
      await noIp.runTasks();
      assert.equal(noIp.sent.length, 1);
    }

    // ---- Nothing sensitive in the logs ----------------------------------
    {
      const text = logs.join("\n");
      const tokens = (await prisma.passwordResetToken.findMany({ select: { tokenHash: true }, where: { userId: { in: userIds } } })).length;
      assert.ok(tokens > 0);
      assert.ok(!text.includes("reset-password/"), "no reset link in the logs");
      assert.ok(!text.includes(validLink), "the exact link is never logged");
      assert.ok(!text.includes(validLink.split("/reset-password/")[1].split("?")[0]), "the token is never logged");
      assert.ok(!text.includes(API_KEY), "the API key is never logged");
      assert.ok(!emails.some((value) => text.includes(value)), "no email address in the logs");
      assert.ok(/email\.send\.rejected/u.test(text), "the failure itself is logged");
      assert.ok(/validation_error/u.test(text) && /"status":422/u.test(text), "with Resend's error name and status");
    }

    say(`password reset email checks passed (${MODE})`);
  } finally {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetRequest.deleteMany({
      where: { OR: [{ emailHash: { in: [...emails, unknownEmail].map(hashEmail) } }, { ipAddress: { in: ips } }] },
    });
    await prisma.user.updateMany({ data: { status: "disabled" }, where: { id: { in: userIds } } });
    await prisma.$disconnect();
    clearInterval(keepAlive);
  }
}

main().then(() => process.exit(0), (error: unknown) => {
  console.error = (...args: unknown[]) => process.stderr.write(`${args.map(String).join(" ")}\n`);
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
