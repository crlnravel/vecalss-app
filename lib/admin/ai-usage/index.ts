import "server-only";

import { prisma } from "@/lib/prisma";

import { VeraAdminUsageService } from "./service";

let cachedService: VeraAdminUsageService | null = null;

function getAdminVeraUsageService(): VeraAdminUsageService {
  if (!cachedService) cachedService = new VeraAdminUsageService({ db: prisma });
  return cachedService;
}

export { createPolicyPreviewReservationAdapter, VeraAdminUsageError, VeraAdminUsageService } from "./service";
export { buildAdminUsageDto } from "./aggregate";
export { parseAdminUsageQuery, reportCost, reportFingerprint, localDateToUtc } from "./validation";
export type * from "./types";

export { getAdminVeraUsageService };
