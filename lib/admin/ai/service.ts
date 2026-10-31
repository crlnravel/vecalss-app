import "server-only";

import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  buildVeraAiOverviewDto, buildVeraAiProvidersDto, buildVeraAiReliabilityDto, buildVeraAiUsageDto,
  type AggregateComputationInput,
} from "./aggregators";
import { startOfWibDay, startOfWibMonth } from "./periods";

// Explicit projections exclude prompts, messages, responses and credential material.
const REQUEST_FIELDS = {
  id: true, studentId: true, createdAt: true, featureKey: true, gateway: true,
  upstreamProvider: true, model: true, status: true, inputTokens: true, outputTokens: true,
  quotaUnitsReserved: true, quotaUnitsConsumed: true, quotaOverrunUnits: true,
  tokenUsageState: true, latencyMs: true, timeToFirstTokenMs: true,
  chargedProviderCostUsdMicros: true, errorCode: true,
} as const;
const ADMISSION_FIELDS = {
  id: true, studentId: true, occurredAt: true, featureKey: true, gateway: true,
  upstreamProvider: true, model: true, reason: true,
} as const;

export class VeraAiControlPlaneService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma, private readonly clock = () => new Date()) {}

  private async fetchTelemetry(options?: { from?: Date; to?: Date; now?: Date }): Promise<AggregateComputationInput> {
    const now = options?.now ?? this.clock();
    const to = options?.to ?? now;
    const from = options?.from ?? startOfWibDay(now);
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const today = startOfWibDay(now);
    const [requests, previousRequests, admissions, activePolicy, monthRequests, todayRequests, todayAdmissions] = await Promise.all([
      this.prisma.aiRequest.findMany({where:{createdAt:{gte:from,lte:to}},select:REQUEST_FIELDS}),
      this.prisma.aiRequest.findMany({where:{createdAt:{gte:prevFrom,lt:from}},select:REQUEST_FIELDS}),
      this.prisma.aiAdmissionEvent.findMany({where:{occurredAt:{gte:from,lte:to}},select:ADMISSION_FIELDS}),
      this.prisma.aiPolicyBundle.findFirst({where:{state:"active"},orderBy:{effectiveAt:"desc"},select:{bundleVersion:true,effectiveAt:true}}),
      // Month and daily quota sources are independent of the selected feature-report range.
      this.prisma.aiRequest.findMany({where:{createdAt:{gte:startOfWibMonth(now),lte:now}},select:REQUEST_FIELDS}),
      this.prisma.aiRequest.findMany({where:{createdAt:{gte:today,lte:now}},select:REQUEST_FIELDS}),
      this.prisma.aiAdmissionEvent.findMany({where:{occurredAt:{gte:today,lte:now}},select:ADMISSION_FIELDS}),
    ]);
    return { requests, previousRequests, admissions, monthRequests, todayRequests, todayAdmissions,
      now, activePolicyVersion: activePolicy?.bundleVersion,
      activePolicyActivatedAt: activePolicy?.effectiveAt?.toISOString(),
    };
  }

  async getOverview() {
    return buildVeraAiOverviewDto(await this.fetchTelemetry());
  }

  async getUsage(options?: {
    metric?: "quota_units" | "requests" | "tokens" | "cost";
    groupBy?: "feature" | "model" | "gateway" | "status";
    from?: string; to?: string; timezone?: string;
  }) {
    const now = this.clock();
    const from = options?.from ? new Date(options.from) : startOfWibDay(now);
    const to = options?.to ? new Date(Math.min(new Date(options.to).getTime(), now.getTime())) : now;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || to.getTime() - from.getTime() > 31 * 86400000) {
      throw new Error("Invalid usage range");
    }
    const telemetry = await this.fetchTelemetry({from,to,now});
    return buildVeraAiUsageDto(telemetry,{...options,from:from.toISOString(),to:to.toISOString()});
  }

  async getReliability() {
    return buildVeraAiReliabilityDto(await this.fetchTelemetry());
  }

  async getProviders() {
    // No current health probe, credential audit or capacity source is connected.
    return buildVeraAiProvidersDto(this.clock());
  }
}

export const veraAiControlPlaneService = new VeraAiControlPlaneService();
