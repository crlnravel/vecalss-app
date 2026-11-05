import "dotenv/config";
import assert from "node:assert/strict";

import type { LanguageModelUsage } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

import { prisma } from "../lib/prisma";
import { runVeraChat } from "../lib/vera/chat";
import { VERA_EFFORTS } from "../lib/vera/config";
import {
  costUsdMicros,
  creditsForUsage,
  creditsFromMicros,
  estimateCreditRange,
  formatCredits,
  formatCreditRange,
  settlementCharge,
  VERA_DEFAULT_PRICES,
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
import { trackAnswerUsage } from "../lib/vera/usage-tracker";
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

  // Settlement. A completed step costs what the provider reported. A step cut off after it streamed costs an estimate on top of that,
  // because OpenAI bills generation once it starts. An answer that streamed nothing is released.
  assert.deepEqual(
    settlementCharge({ actualMicros: 0, completedSteps: 0, cutOffMicros: null }),
    { kind: "release" },
    "No output at all releases the reservation",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 0, completedSteps: 0, cutOffMicros: 107 }),
    { kind: "settle", chargedMicros: 107 },
    "A cut-off first step is charged its estimate",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 110, completedSteps: 1, cutOffMicros: 1_000 }),
    { kind: "settle", chargedMicros: 1_110 },
    "A finished step plus a cut-off second step is charged both",
  );
  assert.deepEqual(
    settlementCharge({ actualMicros: 500, completedSteps: 1, cutOffMicros: null }),
    { kind: "settle", chargedMicros: 500 },
    "Finished steps are charged their exact cost",
  );
  assert.equal(formatCreditRange({ low: 0.3, high: 1.2 }), "≈ 0,3–1,2 kredit");

  // The tracker settles through the ledger, one reserved answer per case. The rows are written directly, so the limits do not apply.
  const trackedStudent = await prisma.user.upsert({
    where: { email: "vera-ledger-tracker@vecalss.local" },
    update: {},
    create: { email: "vera-ledger-tracker@vecalss.local", fullName: "Vera Ledger Tracker", passwordHash: "test-only" },
    select: { id: true },
  });
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: trackedStudent.id } });
  const reservedAnswer = () =>
    prisma.veraUsageEvent.create({
      data: {
        studentId: trackedStudent.id,
        kind: "chat",
        status: "reserved",
        effort: "cepat",
        model: "test",
        reservedCredits: 2,
        credits: 2,
        reservedUsdMicros: BigInt(4_700),
        createdAt: new Date(),
      },
      select: { id: true },
    });
  const settledRow = (eventId: string) =>
    prisma.veraUsageEvent.findUniqueOrThrow({
      where: { id: eventId },
      select: { status: true, costUsdMicros: true, credits: true, errorCode: true, steps: true, inputTokens: true, outputTokens: true },
    });
  // A step's usage in the shape the SDK reports it. Only the fields the tracker reads are filled in.
  const stepUsage = (inputTokens: number, outputTokens: number) =>
    ({
      inputTokens,
      inputTokenDetails: { noCacheTokens: inputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens,
      outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
      totalTokens: inputTokens + outputTokens,
    }) as unknown as LanguageModelUsage;
  const cepatEffort = VERA_EFFORTS.cepat;
  const prices = VERA_DEFAULT_PRICES;

  // A cut-off first step costs its estimated input and the output it streamed: 50 characters, about 13 tokens. That is below the reserve.
  const firstEvent = await reservedAnswer();
  const firstAnswer = trackAnswerUsage({ eventId: firstEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 1_000 });
  firstAnswer.onChunk({ chunk: { type: "text-delta", text: "a".repeat(30) } });
  firstAnswer.onChunk({ chunk: { type: "text-delta", text: "b".repeat(20) } });
  await firstAnswer.onAbort();
  const firstRow = await settledRow(firstEvent.id);
  const firstMicros = costUsdMicros({ noCacheInputTokens: 1_000, cachedInputTokens: 0, outputTokens: 13 }, prices);
  assert.equal(firstRow.status, "settled", "An aborted first step that streamed is settled");
  assert.equal(Number(firstRow.costUsdMicros), firstMicros, "A cut-off first step costs its estimated input and the output it streamed");
  assert.equal(Number(firstRow.credits), creditsFromMicros(firstMicros));
  assert.ok(firstMicros < 4_700, "The estimate is below the cepat reserve of 2 credits");
  assert.equal(firstRow.errorCode, "aborted");
  assert.equal(firstRow.steps, 0, "No step completed");

  // A finished tool step is charged what it cost. The cut-off step after it is estimated from its input: the step before it, that step's
  // output, and the tool result it read. The token columns keep the finished step only.
  const toolOutput = { hits: [{ title: "Materi uji", href: "/courses/penalaran-umum/uji" }] };
  const secondEvent = await reservedAnswer();
  const secondAnswer = trackAnswerUsage({ eventId: secondEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 900 });
  secondAnswer.onChunk({ chunk: { type: "tool-input-delta", delta: "x".repeat(20) } });
  secondAnswer.onChunk({ chunk: { type: "tool-result", output: toolOutput } });
  secondAnswer.onStepEnd({ usage: stepUsage(1_000, 20) });
  secondAnswer.onChunk({ chunk: { type: "text-delta", text: "y".repeat(30) } });
  await secondAnswer.onAbort();
  const secondRow = await settledRow(secondEvent.id);
  const finishedMicros = costUsdMicros({ noCacheInputTokens: 1_000, cachedInputTokens: 0, outputTokens: 20 }, prices);
  const cutOffMicros = costUsdMicros(
    {
      noCacheInputTokens: 1_000 + 20 + Math.ceil(JSON.stringify(toolOutput).length / 4),
      cachedInputTokens: 0,
      outputTokens: Math.ceil(30 / 4),
    },
    prices,
  );
  assert.equal(Number(secondRow.costUsdMicros), finishedMicros + cutOffMicros, "A finished step is charged, plus the estimate for the cut-off step");
  assert.equal(secondRow.steps, 1, "Only the finished step counts as a completed step");
  assert.equal(secondRow.inputTokens, 1_000, "The token columns keep the finished step's provider count");
  assert.equal(secondRow.outputTokens, 20);

  // A longer partial answer costs more than a shorter one cut off at the same point.
  const shortEvent = await reservedAnswer();
  const shortAnswer = trackAnswerUsage({ eventId: shortEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 1_000 });
  shortAnswer.onChunk({ chunk: { type: "text-delta", text: "z".repeat(8) } });
  await shortAnswer.onAbort();
  const longEvent = await reservedAnswer();
  const longAnswer = trackAnswerUsage({ eventId: longEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 1_000 });
  longAnswer.onChunk({ chunk: { type: "text-delta", text: "z".repeat(400) } });
  await longAnswer.onAbort();
  const shortRow = await settledRow(shortEvent.id);
  const longRow = await settledRow(longEvent.id);
  assert.ok(Number(longRow.costUsdMicros) > Number(shortRow.costUsdMicros), "A longer partial costs more than a shorter one");

  // A completed answer is charged its provider-reported cost, as before.
  const doneEvent = await reservedAnswer();
  const doneAnswer = trackAnswerUsage({ eventId: doneEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 1_000 });
  doneAnswer.onChunk({ chunk: { type: "text-delta", text: "Oke." } });
  doneAnswer.onStepEnd({ usage: stepUsage(500, 100) });
  await doneAnswer.onEnd();
  const doneRow = await settledRow(doneEvent.id);
  assert.equal(doneRow.status, "settled");
  assert.equal(
    Number(doneRow.costUsdMicros),
    costUsdMicros({ noCacheInputTokens: 500, cachedInputTokens: 0, outputTokens: 100 }, prices),
    "A completed answer is charged its provider-reported cost",
  );
  assert.equal(doneRow.errorCode, null, "A completed answer records no error");

  // A provider failure before any output releases the reservation, and nothing is billed.
  const failedEvent = await reservedAnswer();
  const failedAnswer = trackAnswerUsage({ eventId: failedEvent.id, effort: cepatEffort, prices, firstStepInputTokens: 1_000 });
  await failedAnswer.onError();
  const failedRow = await settledRow(failedEvent.id);
  assert.equal(failedRow.status, "released", "A failure before any output releases the reservation");
  assert.equal(Number(failedRow.credits), 0);
  assert.equal(failedRow.errorCode, "error");
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: trackedStudent.id } });

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
