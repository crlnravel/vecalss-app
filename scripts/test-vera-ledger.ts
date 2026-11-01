import "dotenv/config";
import assert from "node:assert/strict";

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import { runVeraChat } from "../lib/vera/chat";
import {
  costUsdMicros,
  creditsForUsage,
  creditsFromMicros,
  estimateCreditRange,
  formatCredits,
  formatCreditRange,
  settlementCharge,
} from "../lib/vera/credits-shared";
import {
  getVeraUsageSnapshot,
  releaseVeraReservation,
  reserveVeraCredits,
  settleVeraUsage,
  VeraLimitError,
  type VeraLimitCode,
} from "../lib/vera/ledger";
import { setVeraModelForTests } from "../lib/vera/model";
import { dayWindow, monthWindow, weekWindow } from "../lib/vera/windows";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-ledger only runs against the local dev database on 127.0.0.1:55432.");
}

// A fixed Wednesday in WIB. Windows: day from 04 Nov, week from Mon 02 Nov, month from 01 Nov.
const now = new Date("2026-11-04T10:00:00+07:00");
const earlierToday = new Date("2026-11-04T09:00:00+07:00");
const thisWeekNotToday = new Date("2026-11-02T10:00:00+07:00");
const thisMonthNotThisWeek = new Date("2026-11-01T10:00:00+07:00");

function userInput(text: string, effort: "cepat" | "seimbang" | "mendalam" = "cepat") {
  return {
    message: { id: `msg-${crypto.randomUUID()}`, role: "user" as const, parts: [{ type: "text" as const, text }] },
    effort,
    mentions: [],
  };
}

function answerModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: "Oke." },
          { type: "text-end", id: "answer" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 2, text: 2, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

async function ensureLedgerStudent() {
  const student = await prisma.user.upsert({
    where: { email: "vera-ledger-test@vecalss.local" },
    update: {},
    create: { email: "vera-ledger-test@vecalss.local", fullName: "Vera Ledger Test", passwordHash: "test-only" },
    select: { id: true },
  });
  return student.id;
}

async function clearLedger(studentId: string) {
  await prisma.veraUsageEvent.deleteMany({ where: { studentId } });
  await prisma.veraConversation.deleteMany({ where: { studentId } });
}

async function insertSettled({
  studentId,
  credits,
  createdAt,
  costMicros = 0,
}: {
  studentId: string;
  credits: number;
  createdAt: Date;
  costMicros?: number;
}) {
  await prisma.veraUsageEvent.create({
    data: {
      studentId,
      kind: "chat",
      status: "settled",
      effort: "cepat",
      model: "test",
      reservedCredits: credits,
      credits,
      reservedUsdMicros: BigInt(0),
      costUsdMicros: BigInt(costMicros),
      createdAt,
      settledAt: createdAt,
    },
  });
}

async function expectLimit(promise: Promise<unknown>, code: VeraLimitCode) {
  await assert.rejects(
    promise,
    (error: unknown) => error instanceof VeraLimitError && error.code === code,
    `Expected ${code}`,
  );
}

const studentId = await ensureLedgerStudent();

try {
  // Credit math: micro-USD per token equals USD per million tokens, and credits round up to 0.1.
  assert.equal(creditsFromMicros(0), 0.1, "An answer costs at least 0.1 credit");
  assert.equal(creditsFromMicros(2_350), 1);
  assert.equal(creditsFromMicros(2_351), 1.1, "Partial credits round up to 0.1");
  assert.equal(creditsFromMicros(9_400), 4);
  assert.equal(
    costUsdMicros({ noCacheInputTokens: 1_000, cachedInputTokens: 500, outputTokens: 2_000 }),
    1_105,
    "Input, cached input and output are priced separately",
  );
  assert.equal(creditsForUsage({ noCacheInputTokens: 1_000, cachedInputTokens: 500, outputTokens: 2_000 }), 0.5);
  const range = estimateCreditRange({ effort: "mendalam", historyChars: 40_000, mentionCount: 2 });
  assert.ok(range.low >= 0.1 && range.high >= range.low, "The estimate range is ordered");
  assert.equal(formatCredits(0.6), "0,6");

  // Settlement after a cut-off step. OpenAI bills generation once it starts, so a cut-off step is charged at least the reserve.
  assert.deepEqual(
    settlementCharge({ actualMicros: 0, completedSteps: 0, unfinishedStepStarted: false, reserveCredits: 3 }),
    { kind: "release" },
    "No output at all releases the reservation",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 0, completedSteps: 0, unfinishedStepStarted: true, reserveCredits: 3 }),
    { kind: "settle", chargedMicros: 7_050 },
    "An aborted first step is charged the reserve (3 credits)",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 1_000, completedSteps: 1, unfinishedStepStarted: true, reserveCredits: 3 }),
    { kind: "settle", chargedMicros: 7_050 },
    "A finished step plus a cut-off second step is charged at least the reserve",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 9_000, completedSteps: 1, unfinishedStepStarted: true, reserveCredits: 3 }),
    { kind: "settle", chargedMicros: 9_000 },
    "A higher actual cost is charged in full",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 500, completedSteps: 1, unfinishedStepStarted: false, reserveCredits: 3 }),
    { kind: "settle", chargedMicros: 500 },
    "Finished steps are charged their exact cost",
  );
  assert.equal(formatCreditRange({ low: 0.3, high: 1.2 }), "≈ 0,3–1,2 kredit");

  // Windows in WIB, including the day, week and month edges.
  assert.equal(dayWindow(new Date("2026-11-03T23:59:59+07:00")).start.toISOString(), "2026-11-02T17:00:00.000Z");
  assert.equal(dayWindow(new Date("2026-11-04T00:00:00+07:00")).start.toISOString(), "2026-11-03T17:00:00.000Z");
  assert.equal(weekWindow(new Date("2026-11-08T23:59:59+07:00")).start.toISOString(), "2026-11-01T17:00:00.000Z", "Sunday belongs to the week that began on the previous Monday");
  assert.equal(weekWindow(new Date("2026-11-09T00:00:00+07:00")).start.toISOString(), "2026-11-08T17:00:00.000Z", "Monday starts a new week");
  assert.equal(weekWindow(new Date("2026-11-09T00:00:00+07:00")).resetsAt.toISOString(), "2026-11-15T17:00:00.000Z");
  assert.equal(monthWindow(new Date("2026-10-31T23:59:59+07:00")).start.toISOString(), "2026-09-30T17:00:00.000Z");
  assert.equal(monthWindow(new Date("2026-11-01T00:00:00+07:00")).start.toISOString(), "2026-10-31T17:00:00.000Z");
  assert.equal(monthWindow(new Date("2026-11-01T00:00:00+07:00")).resetsAt.toISOString(), "2026-11-30T17:00:00.000Z");

  // Day limit: refused before the model is called, and nothing is written.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 15, createdAt: earlierToday });
  const dayModel = answerModel();
  setVeraModelForTests(dayModel);
  const conversationsBefore = await prisma.veraConversation.count({ where: { studentId } });
  await expectLimit(
    runVeraChat({ studentId, input: userInput("Halo"), signal: new AbortController().signal, now }),
    "daily_limit",
  );
  assert.equal(dayModel.doStreamCalls.length, 0, "A refused request never reaches the model");
  assert.equal(await prisma.veraConversation.count({ where: { studentId } }), conversationsBefore);

  // Weekly limit: the day is clear, but this week has reached its hard limit.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 80, createdAt: thisWeekNotToday });
  await expectLimit(reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "weekly_limit");

  // Monthly limit: earlier this month, outside the current week.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 300, createdAt: thisMonthNotThisWeek });
  await expectLimit(reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "monthly_limit");

  // Spend cap: USD 0.70 per student per month, even when the credits are still low.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 0.1, createdAt: earlierToday, costMicros: 700_000 });
  await expectLimit(reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "spend_cap");

  // Lower effort hint: 12.5 used today leaves room for Cepat only.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 12.5, createdAt: earlierToday });
  const hinted = await reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }).catch((error: unknown) => error);
  assert.ok(hinted && typeof hinted === "object" && "eventId" in hinted, "Cepat fits in the remaining credits");
  await releaseVeraReservation({ eventId: (hinted as { eventId: string }).eventId, errorCode: "test", now });
  let refusedAtSeimbang: unknown;
  try {
    await reserveVeraCredits({ studentId, effort: "mendalam", model: "test", now });
  } catch (error) {
    refusedAtSeimbang = error;
  }
  assert.ok(refusedAtSeimbang instanceof VeraLimitError, "Mendalam does not fit");
  assert.equal(refusedAtSeimbang.lowerEffortFits, "cepat", "The refusal names the lower effort that fits");
  assert.match(refusedAtSeimbang.message, /Coba mode Cepat/);

  // Burst: five answers in a minute are allowed, and the sixth is refused.
  await clearLedger(studentId);
  for (let index = 0; index < 5; index += 1) {
    const { eventId } = await reserveVeraCredits({ studentId, effort: "cepat", model: "test", now });
    await settleVeraUsage({ eventId, usage: { noCacheInputTokens: 10, cachedInputTokens: 0, outputTokens: 5, reasoningTokens: 0, steps: 1 }, now });
  }
  await expectLimit(reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "burst");

  // A session title is not a request: five titles in the same minute leave the burst limit free.
  await clearLedger(studentId);
  await prisma.veraUsageEvent.createMany({ data: Array.from({ length: 5 }, () => ({ studentId, kind: "title" as const, status: "settled" as const, model: "test", reservedCredits: 0, reservedUsdMicros: BigInt(0), costUsdMicros: BigInt(4), createdAt: now, settledAt: now })) });
  assert.ok(await reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "Title events leave the burst limit free");

  // Concurrency: two simultaneous reservations, one wins and one is busy.
  await clearLedger(studentId);
  const results = await Promise.allSettled([
    reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }),
    reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.equal(fulfilled.length, 1, "Exactly one concurrent reservation succeeds");
  assert.ok(rejected[0]?.reason instanceof VeraLimitError && rejected[0].reason.code === "busy", "The other one is busy");

  // A settled overrun is recorded at its true amount and blocks the next request.
  await clearLedger(studentId);
  const overrun = await reserveVeraCredits({ studentId, effort: "seimbang", model: "test", now });
  const trueCredits = await settleVeraUsage({
    eventId: overrun.eventId,
    usage: { noCacheInputTokens: 0, cachedInputTokens: 0, outputTokens: 70_500, reasoningTokens: 0, steps: 1 },
    now,
  });
  assert.equal(trueCredits, 15, "The overrun is recorded at its true amount");
  const stored = await prisma.veraUsageEvent.findUniqueOrThrow({ where: { id: overrun.eventId }, select: { credits: true, status: true } });
  assert.equal(Number(stored.credits), 15);
  assert.equal(stored.status, "settled");
  await expectLimit(reserveVeraCredits({ studentId, effort: "cepat", model: "test", now }), "daily_limit");

  // A released reservation costs nothing and stops counting.
  await clearLedger(studentId);
  const released = await reserveVeraCredits({ studentId, effort: "mendalam", model: "test", now });
  await releaseVeraReservation({ eventId: released.eventId, errorCode: "test", now });
  const afterRelease = await getVeraUsageSnapshot({ studentId, now });
  assert.equal(afterRelease.day.used, 0, "A released reservation does not count");
  await reserveVeraCredits({ studentId, effort: "mendalam", model: "test", now });

  // The sweep touches only the student who is reserving. Another student's stale reservation waits for their own request.
  const otherStudent = await prisma.user.upsert({
    where: { email: "vera-ledger-other@vecalss.local" },
    update: {},
    create: { email: "vera-ledger-other@vecalss.local", fullName: "Vera Ledger Lain", passwordHash: "test-only" },
    select: { id: true },
  });
  await clearLedger(studentId);
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: otherStudent.id } });
  const staleAt = new Date(now.getTime() - 20 * 60_000);
  const staleReservation = (owner: string) => ({
    studentId: owner,
    kind: "chat" as const,
    status: "reserved" as const,
    effort: "cepat" as const,
    model: "test",
    reservedCredits: 2,
    credits: 2,
    reservedUsdMicros: BigInt(4_700),
    createdAt: staleAt,
  });
  const otherStale = await prisma.veraUsageEvent.create({ data: staleReservation(otherStudent.id), select: { id: true } });
  const ownStale = await prisma.veraUsageEvent.create({ data: staleReservation(studentId), select: { id: true } });
  const fresh = await reserveVeraCredits({ studentId, effort: "cepat", model: "test", now });
  await releaseVeraReservation({ eventId: fresh.eventId, errorCode: "test", now });
  assert.equal(
    (await prisma.veraUsageEvent.findUniqueOrThrow({ where: { id: ownStale.id }, select: { status: true } })).status,
    "failed",
    "This student's stale reservation is swept by their own request",
  );
  assert.equal(
    (await prisma.veraUsageEvent.findUniqueOrThrow({ where: { id: otherStale.id }, select: { status: true } })).status,
    "reserved",
    "Another student's stale reservation is left for their own request",
  );
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: otherStudent.id } });

  // Soft warnings: the day warns at 10 and the week at 70. The monthly window has no soft limit.
  await clearLedger(studentId);
  await insertSettled({ studentId, credits: 10, createdAt: earlierToday });
  const dayWarning = await getVeraUsageSnapshot({ studentId, now });
  assert.equal(dayWarning.day.softWarning, true);
  assert.equal(dayWarning.week.softWarning, false);
  await insertSettled({ studentId, credits: 60, createdAt: thisWeekNotToday });
  const weekWarning = await getVeraUsageSnapshot({ studentId, now });
  assert.equal(weekWarning.week.used, 70);
  assert.equal(weekWarning.week.softWarning, true);
  assert.equal(weekWarning.month.softWarning, false);
  assert.equal(weekWarning.day.resetsAt, dayWindow(now).resetsAt.toISOString(), "Each window reports its reset time");

  await clearLedger(studentId);
  console.log("Vera ledger checks passed.");
} finally {
  await clearLedger(studentId);
  setVeraModelForTests(undefined);
  await prisma.$disconnect();
}
