import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VERA_EFFORT_IDS, VERA_EFFORTS, VERA_LIMITS, type VeraEffortId } from "./config";
import {
  costUsdMicros,
  creditsFromMicros,
  VERA_DEFAULT_PRICES,
  type VeraPrices,
  type VeraTokenUsage,
} from "./credits-shared";
import { dayWindow, monthWindow, weekWindow } from "./windows";

/**
 * The usage ledger. A reservation is taken before any provider call, and the
 * settled amount replaces it when the answer ends. Windows are sums over
 * `VeraUsageEvent.credits`, so a reservation counts at its reserved amount
 * until it settles. Released events do not count.
 */

const BURST_WINDOW_MS = 60_000;
const CONCURRENCY_WINDOW_MS = 3 * 60_000;
const STALE_RESERVATION_MS = 10 * 60_000;

export function getVeraPrices(): VeraPrices {
  return {
    input: readNumberEnv("VERA_PRICE_INPUT_USD_PER_M", VERA_DEFAULT_PRICES.input),
    cachedInput: readNumberEnv("VERA_PRICE_CACHED_INPUT_USD_PER_M", VERA_DEFAULT_PRICES.cachedInput),
    output: readNumberEnv("VERA_PRICE_OUTPUT_USD_PER_M", VERA_DEFAULT_PRICES.output),
  };
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export type VeraLimitCode = "daily_limit" | "weekly_limit" | "monthly_limit" | "spend_cap" | "burst" | "busy";

export class VeraLimitError extends Error {
  readonly code: VeraLimitCode;
  readonly resetsAt: Date;
  readonly lowerEffortFits: VeraEffortId | null;

  constructor(code: VeraLimitCode, resetsAt: Date, lowerEffortFits: VeraEffortId | null) {
    super(limitMessage(code, lowerEffortFits));
    this.name = "VeraLimitError";
    this.code = code;
    this.resetsAt = resetsAt;
    this.lowerEffortFits = lowerEffortFits;
  }
}

function limitMessage(code: VeraLimitCode, lowerEffortFits: VeraEffortId | null) {
  const lower = lowerEffortFits
    ? ` Sisa kredit tidak cukup untuk mode ini. Coba mode ${VERA_EFFORTS[lowerEffortFits].label}.`
    : "";
  switch (code) {
    case "daily_limit":
      return `Kredit Vera hari ini sudah habis. Coba lagi besok, mulai pukul 00.00 WIB.${lower}`;
    case "weekly_limit":
      return `Kredit Vera minggu ini sudah habis. Coba lagi minggu depan.${lower}`;
    case "monthly_limit":
      return `Kredit Vera bulan ini sudah habis. Coba lagi bulan depan.${lower}`;
    case "spend_cap":
      return "Pemakaian Vera bulan ini sudah mencapai batas. Coba lagi bulan depan.";
    case "burst":
      return "Terlalu banyak pertanyaan dalam semenit. Tunggu sebentar lalu coba lagi.";
    case "busy":
      return "Vera masih menjawab pertanyaan sebelumnya. Tunggu sampai jawabannya selesai.";
  }
}

type LedgerTotals = {
  dayCredits: number;
  weekCredits: number;
  monthCredits: number;
  monthUsdMicros: number;
  burstCount: number;
  busyCount: number;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Reads every window in one query. Only reservations and settlements that fall inside the widest window are scanned. */
async function readTotals(db: Prisma.TransactionClient, studentId: string, now: Date): Promise<LedgerTotals> {
  const dayStart = dayWindow(now).start;
  const weekStart = weekWindow(now).start;
  const monthStart = monthWindow(now).start;
  const burstSince = new Date(now.getTime() - BURST_WINDOW_MS);
  const busySince = new Date(now.getTime() - CONCURRENCY_WINDOW_MS);
  const oldest = new Date(
    Math.min(dayStart.getTime(), weekStart.getTime(), monthStart.getTime(), burstSince.getTime(), busySince.getTime()),
  );
  const [row] = await db.$queryRaw<
    Array<{
      day_credits: string | number;
      week_credits: string | number;
      month_credits: string | number;
      month_usd_micros: string | number;
      burst_count: bigint | number;
      busy_count: bigint | number;
    }>
  >`
    SELECT
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${dayStart}), 0) AS day_credits,
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${weekStart}), 0) AS week_credits,
      COALESCE(SUM(credits) FILTER (WHERE created_at >= ${monthStart}), 0) AS month_credits,
      COALESCE(SUM(CASE WHEN status = 'settled' THEN cost_usd_micros ELSE reserved_usd_micros END)
        FILTER (WHERE created_at >= ${monthStart}), 0) AS month_usd_micros,
      COUNT(*) FILTER (WHERE created_at >= ${burstSince}) AS burst_count,
      COUNT(*) FILTER (WHERE status = 'reserved' AND created_at >= ${busySince}) AS busy_count
    FROM vera_usage_events
    WHERE student_id = ${studentId}::uuid
      AND status IN ('reserved', 'settled', 'failed')
      AND created_at >= ${oldest}
  `;
  return {
    dayCredits: round1(Number(row.day_credits)),
    weekCredits: round1(Number(row.week_credits)),
    monthCredits: round1(Number(row.month_credits)),
    monthUsdMicros: Number(row.month_usd_micros),
    burstCount: Number(row.burst_count),
    busyCount: Number(row.busy_count),
  };
}

/**
 * Marks this student's stale reservations as failed. They keep their reserved
 * amount, which is the conservative charge. The filter on student_id keeps the
 * update on the (studentId, createdAt) index, and other students are swept
 * on their own requests.
 */
async function sweepStaleReservations(db: Prisma.TransactionClient, studentId: string, now: Date) {
  await db.$executeRaw`
    UPDATE vera_usage_events
    SET status = 'failed', credits = reserved_credits, settled_at = ${now}
    WHERE student_id = ${studentId}::uuid
      AND status = 'reserved'
      AND created_at < ${new Date(now.getTime() - STALE_RESERVATION_MS)}
  `;
}

type LimitHit = { code: VeraLimitCode; resetsAt: Date };

/** Window checks for one effort. Used for the refusal message and for the lower-effort hint. */
function windowLimit(totals: LedgerTotals, effort: VeraEffortId, now: Date): LimitHit | null {
  const reserve = VERA_EFFORTS[effort].reserveCredits;
  if (totals.dayCredits + reserve > VERA_LIMITS.day.hardCredits) {
    return { code: "daily_limit", resetsAt: dayWindow(now).resetsAt };
  }
  if (totals.weekCredits + reserve > VERA_LIMITS.week.hardCredits) {
    return { code: "weekly_limit", resetsAt: weekWindow(now).resetsAt };
  }
  if (totals.monthCredits + reserve > VERA_LIMITS.month.hardCredits) {
    return { code: "monthly_limit", resetsAt: monthWindow(now).resetsAt };
  }
  if (totals.monthUsdMicros + reserve * VERA_LIMITS.microUsdPerCredit > VERA_LIMITS.spendCapMicroUsd) {
    return { code: "spend_cap", resetsAt: monthWindow(now).resetsAt };
  }
  return null;
}

/** Burst and concurrency first, then the windows, in the order the spec gives. */
function admissionLimit(totals: LedgerTotals, effort: VeraEffortId, now: Date): LimitHit | null {
  if (totals.burstCount >= VERA_LIMITS.burstPerMinute) {
    return { code: "burst", resetsAt: new Date(now.getTime() + BURST_WINDOW_MS) };
  }
  if (totals.busyCount >= VERA_LIMITS.concurrentAnswers) {
    return { code: "busy", resetsAt: now };
  }
  return windowLimit(totals, effort, now);
}

function lowerEffortThatFits(totals: LedgerTotals, effort: VeraEffortId, now: Date): VeraEffortId | null {
  const requested = VERA_EFFORT_IDS.indexOf(effort);
  for (let index = requested - 1; index >= 0; index -= 1) {
    const candidate = VERA_EFFORT_IDS[index];
    if (windowLimit(totals, candidate, now) === null) return candidate;
  }
  return null;
}

/**
 * Takes a reservation, or throws VeraLimitError before anything is sent to the
 * provider. The check and the insert share one transaction under a per-student
 * advisory lock, so two concurrent requests cannot both pass.
 */
export async function reserveVeraCredits({
  studentId,
  effort,
  model,
  conversationId = null,
  kind = "chat",
  now = new Date(),
}: {
  studentId: string;
  effort: VeraEffortId;
  model: string;
  conversationId?: string | null;
  kind?: "chat" | "studio" | "title";
  now?: Date;
}): Promise<{ eventId: string; reservedCredits: number }> {
  type Outcome =
    | { refused: LimitHit & { lowerEffortFits: VeraEffortId | null } }
    | { eventId: string; reservedCredits: number };

  const outcome: Outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vera:${studentId}`}))`;
    await sweepStaleReservations(tx, studentId, now);
    const totals = await readTotals(tx, studentId, now);
    const hit = admissionLimit(totals, effort, now);
    if (hit) {
      const lowerEffortFits =
        hit.code === "burst" || hit.code === "busy" ? null : lowerEffortThatFits(totals, effort, now);
      return { refused: { ...hit, lowerEffortFits } };
    }
    const reservedCredits = VERA_EFFORTS[effort].reserveCredits;
    const event = await tx.veraUsageEvent.create({
      data: {
        studentId,
        kind,
        status: "reserved",
        effort,
        model,
        conversationId,
        reservedCredits,
        credits: reservedCredits,
        reservedUsdMicros: BigInt(reservedCredits * VERA_LIMITS.microUsdPerCredit),
        createdAt: now,
      },
      select: { id: true },
    });
    return { eventId: event.id, reservedCredits };
  });

  if ("refused" in outcome) {
    throw new VeraLimitError(outcome.refused.code, outcome.refused.resetsAt, outcome.refused.lowerEffortFits);
  }
  return outcome;
}

export async function attachReservationConversation(eventId: string, conversationId: string) {
  await prisma.veraUsageEvent.update({ where: { id: eventId }, data: { conversationId } });
}

/** Replaces the reservation with the true amount. Overruns above the reservation are recorded as they happened. */
export async function settleVeraUsage({
  eventId,
  usage,
  chargedMicros,
  errorCode = null,
  now = new Date(),
}: {
  eventId: string;
  usage: VeraTokenUsage & { reasoningTokens: number; steps: number };
  /** Defaults to the provider cost of the recorded tokens. Pass a floor for a step that was cut off. */
  chargedMicros?: number;
  /** Null for a finished answer. "aborted" or "error" marks an answer that ended early. */
  errorCode?: string | null;
  now?: Date;
}): Promise<number> {
  const micros = chargedMicros ?? costUsdMicros(usage, getVeraPrices());
  const credits = creditsFromMicros(micros);
  await prisma.veraUsageEvent.update({
    where: { id: eventId },
    data: {
      status: "settled",
      credits,
      costUsdMicros: BigInt(micros),
      inputTokens: usage.noCacheInputTokens + usage.cachedInputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
      steps: usage.steps,
      errorCode,
      settledAt: now,
    },
  });
  return credits;
}

/** Drops a reservation that never reached the provider. It costs nothing and stops counting. */
export async function releaseVeraReservation({
  eventId,
  errorCode,
  now = new Date(),
}: {
  eventId: string;
  errorCode: string;
  now?: Date;
}) {
  await prisma.veraUsageEvent.updateMany({
    where: { id: eventId, status: "reserved" },
    data: { status: "released", credits: 0, errorCode, settledAt: now },
  });
}

export type VeraWindowUsage = {
  used: number;
  hardLimit: number;
  softLimit: number | null;
  softWarning: boolean;
  resetsAt: string;
};

export type VeraUsageSnapshot = {
  day: VeraWindowUsage;
  week: VeraWindowUsage;
  month: VeraWindowUsage;
  /** Non-secret. The composer uses them so its estimate matches what the server charges. */
  prices: VeraPrices;
};

function windowUsage(used: number, limit: { hardCredits: number; softCredits: number | null }, resetsAt: Date): VeraWindowUsage {
  return {
    used,
    hardLimit: limit.hardCredits,
    softLimit: limit.softCredits,
    softWarning: limit.softCredits !== null && used >= limit.softCredits,
    resetsAt: resetsAt.toISOString(),
  };
}

/** What the usage popover shows: used and limit for each window, with the reset time. */
export async function getVeraUsageSnapshot({
  studentId,
  now = new Date(),
}: {
  studentId: string;
  now?: Date;
}): Promise<VeraUsageSnapshot> {
  const totals = await readTotals(prisma, studentId, now);
  return {
    day: windowUsage(totals.dayCredits, VERA_LIMITS.day, dayWindow(now).resetsAt),
    week: windowUsage(totals.weekCredits, VERA_LIMITS.week, weekWindow(now).resetsAt),
    month: windowUsage(totals.monthCredits, { hardCredits: VERA_LIMITS.month.hardCredits, softCredits: null }, monthWindow(now).resetsAt),
    prices: getVeraPrices(),
  };
}
