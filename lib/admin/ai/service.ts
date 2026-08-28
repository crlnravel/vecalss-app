import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  buildVeraAiOverviewDto,
  buildVeraAiProvidersDto,
  buildVeraAiReliabilityDto,
  buildVeraAiUsageDto,
  type AggregateComputationInput,
  type RawAiAdmissionRecord,
  type RawAiRequestRecord,
} from "./aggregators";
import type {
  VeraAiOverviewDto,
  VeraAiProvidersDto,
  VeraAiReliabilityDto,
  VeraAiUsageBreakdownDto,
} from "./contracts";

function parseUsageDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;

  const normalized = value.trim();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : normalized;
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export class VeraAiControlPlaneService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  private async fetchTelemetry(options?: {
    from?: Date;
    to?: Date;
  }): Promise<AggregateComputationInput> {
    const now = new Date();
    const to = options?.to ?? now;
    const from = options?.from ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    // Strict projection: NEVER select message, prompt, or response content!
    const dbRequests = await this.prisma.aiRequest.findMany({
      where: {
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        featureKey: true,
        gateway: true,
        upstreamProvider: true,
        model: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        quotaUnitsReserved: true,
        quotaUnitsConsumed: true,
        quotaOverrunUnits: true,
        tokenUsageState: true,
        latencyMs: true,
        timeToFirstTokenMs: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const prevDbRequests = await this.prisma.aiRequest.findMany({
      where: {
        createdAt: { gte: prevFrom, lt: from },
      },
      select: {
        id: true,
        studentId: true,
        createdAt: true,
        featureKey: true,
        gateway: true,
        upstreamProvider: true,
        model: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        quotaUnitsReserved: true,
        quotaUnitsConsumed: true,
        quotaOverrunUnits: true,
        tokenUsageState: true,
        latencyMs: true,
        timeToFirstTokenMs: true,
      },
      take: 10000,
    });

    const dbAdmissions = await this.prisma.aiAdmissionEvent.findMany({
      where: {
        occurredAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        studentId: true,
        occurredAt: true,
        featureKey: true,
        gateway: true,
        upstreamProvider: true,
        model: true,
        reason: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 10000,
    });

    // Active policy bundle
    const activePolicy = await this.prisma.aiPolicyBundle.findFirst({
      where: { state: "active" },
      orderBy: { effectiveAt: "desc" },
      select: {
        bundleVersion: true,
        effectiveAt: true,
      },
    });

    const requests: RawAiRequestRecord[] = dbRequests.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      createdAt: r.createdAt,
      featureKey: r.featureKey,
      gateway: r.gateway,
      upstreamProvider: r.upstreamProvider,
      model: r.model,
      status: r.status,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      quotaUnitsReserved: r.quotaUnitsReserved,
      quotaUnitsConsumed: r.quotaUnitsConsumed,
      quotaOverrunUnits: r.quotaOverrunUnits,
      tokenUsageState: r.tokenUsageState,
      latencyMs: r.latencyMs,
      timeToFirstTokenMs: r.timeToFirstTokenMs,
    }));

    const previousRequests: RawAiRequestRecord[] = prevDbRequests.map((r) => ({
      id: r.id,
      studentId: r.studentId,
      createdAt: r.createdAt,
      featureKey: r.featureKey,
      gateway: r.gateway,
      upstreamProvider: r.upstreamProvider,
      model: r.model,
      status: r.status,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      quotaUnitsReserved: r.quotaUnitsReserved,
      quotaUnitsConsumed: r.quotaUnitsConsumed,
      quotaOverrunUnits: r.quotaOverrunUnits,
      tokenUsageState: r.tokenUsageState,
      latencyMs: r.latencyMs,
      timeToFirstTokenMs: r.timeToFirstTokenMs,
    }));

    const admissions: RawAiAdmissionRecord[] = dbAdmissions.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      occurredAt: a.occurredAt,
      featureKey: a.featureKey,
      gateway: a.gateway,
      upstreamProvider: a.upstreamProvider,
      model: a.model,
      reason: a.reason,
    }));

    return {
      requests,
      admissions,
      previousRequests,
      now,
      activePolicyVersion: activePolicy?.bundleVersion ?? "VERA-POLICY-027",
      activePolicyActivatedAt: activePolicy?.effectiveAt
        ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(activePolicy.effectiveAt)
        : "27 Aug 2026, 14:20 WIB",
    };
  }

  async getOverview(): Promise<VeraAiOverviewDto> {
    const telemetry = await this.fetchTelemetry();
    return buildVeraAiOverviewDto(telemetry);
  }

  async getUsage(options?: {
    metric?: "quota_units" | "requests" | "tokens" | "cost";
    groupBy?: "feature" | "model" | "gateway" | "status";
    from?: string;
    to?: string;
    timezone?: string;
  }): Promise<VeraAiUsageBreakdownDto> {
    const requestedTo = parseUsageDate(options?.to, true);
    const requestedFrom = parseUsageDate(options?.from);
    const from = requestedFrom ?? (requestedTo ? new Date(requestedTo.getTime() - 24 * 60 * 60 * 1000) : undefined);
    const telemetry = from || requestedTo ? await this.fetchTelemetry({ from, to: requestedTo }) : await this.fetchTelemetry();
    return buildVeraAiUsageDto(telemetry, options);
  }

  async getReliability(): Promise<VeraAiReliabilityDto> {
    const telemetry = await this.fetchTelemetry();
    return buildVeraAiReliabilityDto(telemetry);
  }

  async getProviders(): Promise<VeraAiProvidersDto> {
    return buildVeraAiProvidersDto(new Date());
  }
}

export const veraAiControlPlaneService = new VeraAiControlPlaneService();
