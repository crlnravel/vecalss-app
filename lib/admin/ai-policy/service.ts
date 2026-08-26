import "server-only";

import { randomUUID } from "node:crypto";

import {
  AiAdminCommandOperation,
  AiAdminCommandResultKind,
  AiAdminCommandState,
  AiCapabilityName,
  AiPolicyAuditAction,
  AiPolicyPreviewMode,
  AiPolicyState,
  Prisma,
} from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import {
  AI_POLICY_CAPABILITIES,
  AI_POLICY_FINGERPRINT_KEY_VERSION,
  AI_POLICY_PROVIDER_GATE_STATE,
  AI_POLICY_TERMINAL_TTL_DAYS,
  AI_POLICY_TRANSIENT_TTL_HOURS,
  AiPolicyError,
  adminCommandFingerprint,
  assertClientRequestId,
  assertPositiveRevision,
  assertReason,
  capabilitiesForSections,
  defaultPreviewCell,
  policySnapshotDigest,
  policyValidationDigest,
  type AiPolicyCapability,
  type AiPolicyConfig,
  type AiPolicyImpactPreviewDto,
  type AiPolicyMetadataDto,
  type PolicySection,
  type PreviewReservationAdapter,
} from "./contracts";
import {
  parseCompletePolicyConfig,
  sectionsChanged,
} from "./validation";
import { assertPreviewRange } from "./validation";

type DbClient = typeof defaultPrisma;
type Tx = Prisma.TransactionClient;

export type AiPolicyActor = {
  id: string;
  roles?: readonly string[];
  capabilities?: readonly AiPolicyCapability[];
};

export type AiPolicyBundleDto = {
  id: string;
  bundleVersion: string;
  configSchemaVersion: string;
  state: AiPolicyState;
  effectiveAt: string;
  providerGateState: typeof AI_POLICY_PROVIDER_GATE_STATE;
  validationDigest: string;
  changeReason: string | null;
  revision: number;
  editorActorIds: string[];
  requiredCapabilityUnion: AiPolicyCapability[];
  approvedBy: { id: string; display: string } | null;
  approvedAt: string | null;
  activatedAt: string | null;
  quotaConfig: AiPolicyConfig["quotaConfig"];
  settlementConfig: AiPolicyConfig["settlementConfig"];
  reportConfig: AiPolicyConfig["reportConfig"];
  retentionConfig: AiPolicyConfig["retentionConfig"];
};

export type AiPolicyCommandResponse = {
  commandId: string;
  replayed: boolean;
  operation: AiAdminCommandOperation;
  resultKind: AiAdminCommandResultKind;
  result: AiPolicyBundleDto | AiPolicyImpactPreviewDto | {
    state: "pending";
    requestReference: string;
    policyBundleVersion: string;
    auditReference: string;
  };
};

type AiPolicyCommandResultPayload = AiPolicyBundleDto | AiPolicyImpactPreviewDto | {
  state: "pending";
  requestReference: string;
  policyBundleVersion: string;
  auditReference: string;
};

type CommandInput = {
  actor: AiPolicyActor;
  operation: AiAdminCommandOperation;
  resultKind: AiAdminCommandResultKind;
  clientRequestId: string;
  payload: unknown;
  reason?: string | null;
};

type ExistingCommand = {
  id: string;
  state: AiAdminCommandState;
  resultId: string | null;
  resultKind: AiAdminCommandResultKind;
  requestFingerprint: string;
  rejectionCode: string | null;
  expiresAt: Date;
  previewMode: "categorical" | "aggregate" | null;
  previewActiveBundleId: string | null;
  previewActiveBundleVersion: string | null;
  previewEffectiveAt: Date | null;
  previewAsOf: Date | null;
  previewValidationDigest: string | null;
  previewReservationId: string | null;
  retentionPolicyBundleVersion: string | null;
  retentionAuditReference: string | null;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? new Date(value) : new Date(value);
}

function arrayOfStrings(value: readonly string[] | null | undefined): string[] {
  return [...new Set((value ?? []).filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))].sort();
}

function arrayOfCapabilities(value: readonly AiCapabilityName[] | null | undefined): AiPolicyCapability[] {
  return [...new Set(value ?? [])].sort() as AiPolicyCapability[];
}

function rowConfig(row: {
  bundleVersion: string;
  configSchemaVersion: string;
  effectiveAt: Date;
  quotaConfig: Prisma.JsonValue;
  settlementConfig: Prisma.JsonValue;
  reportConfig: Prisma.JsonValue;
  retentionConfig: Prisma.JsonValue;
  providerGateState: "open_blocked" | "release_ready";
  changeReason: string | null;
}): AiPolicyConfig {
  return parseCompletePolicyConfig({
    bundleVersion: row.bundleVersion,
    configSchemaVersion: row.configSchemaVersion,
    effectiveAt: row.effectiveAt,
    quotaConfig: row.quotaConfig,
    settlementConfig: row.settlementConfig,
    reportConfig: row.reportConfig,
    retentionConfig: row.retentionConfig,
    providerGateState: row.providerGateState,
    changeReason: row.changeReason,
  });
}

function toBundleDto(row: {
  id: string;
  bundleVersion: string;
  configSchemaVersion: string;
  state: AiPolicyState;
  effectiveAt: Date;
  providerGateState: "open_blocked" | "release_ready";
  validationDigest: string;
  changeReason: string | null;
  revision: number;
  editorActorIds: string[];
  requiredCapabilityUnion: AiCapabilityName[];
  approvedAt: Date | null;
  activatedAt: Date | null;
  quotaConfig: Prisma.JsonValue;
  settlementConfig: Prisma.JsonValue;
  reportConfig: Prisma.JsonValue;
  retentionConfig: Prisma.JsonValue;
  approvedBy?: { id: string; fullName: string; email: string } | null;
}): AiPolicyBundleDto {
  const config = rowConfig(row);
  return {
    id: row.id,
    bundleVersion: row.bundleVersion,
    configSchemaVersion: row.configSchemaVersion,
    state: row.state,
    effectiveAt: row.effectiveAt.toISOString(),
    providerGateState: AI_POLICY_PROVIDER_GATE_STATE,
    validationDigest: row.validationDigest,
    changeReason: row.changeReason,
    revision: row.revision,
    editorActorIds: arrayOfStrings(row.editorActorIds),
    requiredCapabilityUnion: arrayOfCapabilities(row.requiredCapabilityUnion),
    approvedBy: row.approvedBy ? { id: row.approvedBy.id, display: row.approvedBy.fullName || row.approvedBy.email } : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    activatedAt: row.activatedAt?.toISOString() ?? null,
    quotaConfig: config.quotaConfig,
    settlementConfig: config.settlementConfig,
    reportConfig: config.reportConfig,
    retentionConfig: config.retentionConfig,
  };
}

function changedSectionsFromRows(source: Parameters<typeof rowConfig>[0], candidate: Parameters<typeof rowConfig>[0]): PolicySection[] {
  return sectionsChanged(rowConfig(source), rowConfig(candidate));
}

function buildImpactPreview(input: {
  candidate: Parameters<typeof rowConfig>[0];
  source: Parameters<typeof rowConfig>[0];
  active: Parameters<typeof rowConfig>[0];
  mode: "categorical" | "aggregate";
  validationDigest: string;
  asOf: Date;
  reservationId?: string;
}): AiPolicyImpactPreviewDto {
  const changed = changedSectionsFromRows(input.source, input.candidate);
  return {
    state: "ready",
    candidateBundleVersion: input.candidate.bundleVersion,
    activeBundleVersion: input.active.bundleVersion,
    effectiveAt: input.candidate.effectiveAt.toISOString(),
    asOf: input.asOf.toISOString(),
    nonRetroactive: true,
    effects: {
      futureAdmissions: defaultPreviewCell("quota", changed.includes("quota")),
      futureReportReservations: defaultPreviewCell("report_budget", changed.includes("report")),
      futureContentEvidence: defaultPreviewCell("content_evidence", changed.includes("retention")),
    },
    validationDigest: input.validationDigest,
    mode: input.mode,
    costUnits: input.mode === "aggregate" ? 3 : 0,
    ...(input.reservationId ? { reservationId: input.reservationId } : {}),
  };
}

function commandExpiry(now: Date, terminal: boolean): Date {
  return new Date(now.getTime() + (terminal ? AI_POLICY_TERMINAL_TTL_DAYS * 86_400_000 : AI_POLICY_TRANSIENT_TTL_HOURS * 3_600_000));
}

export class AiPolicyCommandService {
  constructor(
    private readonly db: DbClient = defaultPrisma,
    private readonly options: {
      fingerprintSecret?: string;
      previewReservation?: PreviewReservationAdapter;
      now?: () => Date;
    } = {},
  ) {}

  private secret(): string {
    return this.options.fingerprintSecret ?? process.env.VERA_IDEMPOTENCY_HMAC_SECRET ?? "";
  }

  private async dbNow(tx: Tx): Promise<Date> {
    const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
    const value = rows[0]?.now;
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new AiPolicyError("policy_clock_unavailable", "Jam database kebijakan tidak tersedia.", 503);
    }
    return value;
  }

  private async actorCapabilities(actor: AiPolicyActor, tx: Tx = this.db): Promise<Set<AiPolicyCapability>> {
    if (actor.capabilities) return new Set(actor.capabilities);
    const rows = await tx.aiCapabilityGrant.findMany({
      where: { userId: actor.id, isActive: true },
      select: { capability: true },
    });
    if (rows.length > 0) return new Set(rows.map((row) => row.capability as AiPolicyCapability));
    const anyGrant = await tx.aiCapabilityGrant.findFirst({ where: { isActive: true }, select: { id: true } });
    // Existing installations have only the admin role and no explicit grants.
    // Preserve that established admin behavior until the first explicit grant
    // is provisioned; thereafter the grant table is deny-by-default.
    return !anyGrant && actor.roles?.includes("admin")
      ? new Set(["canManageAiPolicy", "canManageAiGovernance"])
      : new Set();
  }

  async capabilities(actor: AiPolicyActor): Promise<AiPolicyCapability[]> {
    return [...await this.actorCapabilities(actor)].sort() as AiPolicyCapability[];
  }

  private async requireAdmin(actor: AiPolicyActor): Promise<void> {
    const user = await this.db.user.findFirst({ where: { id: actor.id, status: "active", softDeletedAt: null }, select: { id: true } });
    if (!user) throw new AiPolicyError("admin_forbidden", "Akun admin tidak tersedia.", 403);
  }

  private async requireCapabilities(actor: AiPolicyActor, required: readonly AiPolicyCapability[], tx?: Tx): Promise<void> {
    const granted = await this.actorCapabilities(actor, tx);
    const missing = required.filter((capability) => !granted.has(capability));
    if (missing.length) throw new AiPolicyError("capability_required", "Kapabilitas kebijakan tidak mencukupi.", 403, { missing });
  }

  private async requireAnyCapability(actor: AiPolicyActor, tx?: Tx): Promise<void> {
    const granted = await this.actorCapabilities(actor, tx);
    if (![...granted].some((capability) => AI_POLICY_CAPABILITIES.includes(capability))) {
      throw new AiPolicyError("capability_required", "Kapabilitas kebijakan tidak mencukupi.", 403, { requiredAny: AI_POLICY_CAPABILITIES });
    }
  }

  private async lockCommand(tx: Tx, input: CommandInput, fingerprint: string, now: Date): Promise<ExistingCommand | null> {
    const found = await tx.aiAdminCommandLedger.findFirst({
      where: { adminPrincipalId: input.actor.id, operation: input.operation, clientRequestId: input.clientRequestId },
      select: { id: true },
    });
    if (!found) return null;
    await tx.$queryRaw`SELECT id FROM "ai_admin_command_ledgers" WHERE id = ${found.id}::uuid FOR UPDATE`;
    const row = await tx.aiAdminCommandLedger.findUnique({ where: { id: found.id } });
    if (!row) return null;
    if (row.state === AiAdminCommandState.expired || now >= row.expiresAt) {
      if (row.state !== AiAdminCommandState.expired) {
        await tx.aiAdminCommandLedger.update({ where: { id: row.id }, data: { state: AiAdminCommandState.expired, version: { increment: 1 }, lastSeenAt: now } });
      }
      throw new AiPolicyError("idempotency_key_expired", "Kunci perintah kebijakan sudah kedaluwarsa.", 409);
    }
    if (row.requestFingerprint !== fingerprint) {
      throw new AiPolicyError("idempotency_conflict", "Kunci perintah kebijakan dipakai dengan payload berbeda.", 409);
    }
    await tx.aiAdminCommandLedger.update({ where: { id: row.id }, data: { lastSeenAt: now } });
    return row;
  }

  private async createCommand(tx: Tx, input: CommandInput, fingerprint: string, now: Date): Promise<ExistingCommand> {
    try {
      return await tx.aiAdminCommandLedger.create({
        data: {
          adminPrincipalId: input.actor.id,
          operation: input.operation,
          clientRequestId: input.clientRequestId,
          requestFingerprint: fingerprint,
          fingerprintKeyVersion: AI_POLICY_FINGERPRINT_KEY_VERSION,
          state: AiAdminCommandState.pending,
          resultKind: input.resultKind,
          reason: input.reason ?? null,
          firstSeenAt: now,
          lastSeenAt: now,
          expiresAt: commandExpiry(now, true),
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.lockCommand(tx, input, fingerprint, now);
      if (!winner) throw error;
      return winner;
    }
  }

  private async completeCommand(tx: Tx, rowId: string, resultId: string, now: Date): Promise<void> {
    await tx.aiAdminCommandLedger.updateMany({
      where: { id: rowId, state: AiAdminCommandState.pending },
      data: { state: AiAdminCommandState.accepted, resultId, terminalAt: now, expiresAt: commandExpiry(now, true), version: { increment: 1 }, lastSeenAt: now },
    });
  }

  private async rejectCommand(tx: Tx, rowId: string, error: unknown, now: Date): Promise<void> {
    const mapped = error instanceof AiPolicyError ? error : new AiPolicyError("policy_command_failed", "Perintah kebijakan gagal.", 503);
    const terminal = mapped.code !== "policy_clock_unavailable" && mapped.code !== "preview_budget_unavailable";
    await tx.aiAdminCommandLedger.updateMany({
      where: { id: rowId, state: AiAdminCommandState.pending },
      data: {
        state: AiAdminCommandState.rejected,
        rejectionCode: mapped.code,
        rejectionClass: terminal ? "terminal" : "transient",
        terminalAt: now,
        expiresAt: commandExpiry(now, terminal),
        version: { increment: 1 },
        lastSeenAt: now,
      },
    });
  }

  private async getBundle(tx: Tx, id: string) {
    const row = await tx.aiPolicyBundle.findUnique({
      where: { id },
      include: { approvedBy: { select: { id: true, fullName: true, email: true } } },
    });
    if (!row) throw new AiPolicyError("policy_bundle_not_found", "Versi kebijakan tidak ditemukan.", 404);
    return row;
  }

  private async getBundleForReplay(resultId: string): Promise<AiPolicyBundleDto> {
    const row = await this.db.aiPolicyBundle.findUnique({
      where: { id: resultId },
      include: { approvedBy: { select: { id: true, fullName: true, email: true } } },
    });
    if (!row) throw new AiPolicyError("policy_result_unavailable", "Hasil perintah kebijakan tidak tersedia.", 503);
    return toBundleDto(row);
  }

  private async getPreviewForReplay(row: ExistingCommand): Promise<AiPolicyImpactPreviewDto> {
    if (!row.previewMode || !row.previewActiveBundleId || !row.previewActiveBundleVersion || !row.previewEffectiveAt || !row.previewAsOf || !row.previewValidationDigest || !row.resultId) {
      throw new AiPolicyError("policy_result_unavailable", "Snapshot preview tersimpan tidak lengkap.", 503);
    }
    const [candidate, active] = await Promise.all([
      this.db.aiPolicyBundle.findUnique({ where: { id: row.resultId } }),
      this.db.aiPolicyBundle.findUnique({ where: { id: row.previewActiveBundleId } }),
    ]);
    if (!candidate || !active) throw new AiPolicyError("policy_result_unavailable", "Snapshot preview tersimpan tidak tersedia.", 503);
    return buildImpactPreview({
      candidate,
      source: candidate.supersedesBundleId ? (await this.db.aiPolicyBundle.findUnique({ where: { id: candidate.supersedesBundleId } })) ?? candidate : candidate,
      active,
      mode: row.previewMode,
      validationDigest: row.previewValidationDigest,
      asOf: row.previewAsOf,
      reservationId: row.previewReservationId ?? undefined,
    });
  }

  private async responseForExisting(input: CommandInput, row: ExistingCommand): Promise<AiPolicyCommandResponse> {
    if (row.state === AiAdminCommandState.rejected) {
      throw new AiPolicyError(row.rejectionCode ?? "policy_command_rejected", "Perintah kebijakan ditolak.", 422);
    }
    if (row.state !== AiAdminCommandState.accepted || !row.resultId) {
      throw new AiPolicyError("policy_command_pending", "Perintah kebijakan masih diproses.", 202, { commandId: row.id });
    }
    if (input.resultKind === AiAdminCommandResultKind.retention_extension) {
      return {
        commandId: row.id,
        replayed: true,
        operation: input.operation,
        resultKind: input.resultKind,
        result: {
          state: "pending",
          requestReference: row.id,
          policyBundleVersion: row.retentionPolicyBundleVersion ?? "pending",
          auditReference: row.retentionAuditReference ?? row.id,
        },
      };
    }
    if (input.resultKind === AiAdminCommandResultKind.preview) {
      return { commandId: row.id, replayed: true, operation: input.operation, resultKind: input.resultKind, result: await this.getPreviewForReplay(row) };
    }
    return { commandId: row.id, replayed: true, operation: input.operation, resultKind: input.resultKind, result: await this.getBundleForReplay(row.resultId) };
  }

  private async executeBundleCommand(input: CommandInput, handler: (tx: Tx, command: ExistingCommand, now: Date) => Promise<{ resultId: string; result: AiPolicyCommandResultPayload }>): Promise<AiPolicyCommandResponse> {
    assertClientRequestId(input.clientRequestId);
    await this.requireAdmin(input.actor);
    const fingerprint = adminCommandFingerprint({ operation: input.operation, payload: input.payload, secret: this.secret() });
    try {
      const outcome = await this.db.$transaction(async (tx) => {
        const now = await this.dbNow(tx);
        try {
          const existing = await this.lockCommand(tx, input, fingerprint, now);
          if (existing) return this.responseForExisting(input, existing);
          const command = await this.createCommand(tx, input, fingerprint, now);
          if (command.state !== AiAdminCommandState.pending) return this.responseForExisting(input, command);
          try {
            const output = await handler(tx, command, now);
            await this.completeCommand(tx, command.id, output.resultId, now);
            return { commandId: command.id, replayed: false, operation: input.operation, resultKind: input.resultKind, result: output.result };
          } catch (error) {
            await this.rejectCommand(tx, command.id, error, now);
            return { rejected: error } as const;
          }
        } catch (error) {
          // The expiry tombstone must commit before the typed 409 is returned.
          if (error instanceof AiPolicyError && error.code === "idempotency_key_expired") {
            return { rejected: error } as const;
          }
          throw error;
        }
      });
      if ("rejected" in outcome) throw outcome.rejected;
      return outcome;
    } catch (error) {
      if (error instanceof AiPolicyError) throw error;
      throw new AiPolicyError("policy_command_failed", "Perintah kebijakan gagal.", 503);
    }
  }

  private async sourceBundle(tx: Tx, sourceBundleId?: string) {
    const row = sourceBundleId
      ? await tx.aiPolicyBundle.findUnique({ where: { id: sourceBundleId }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } })
      : await tx.aiPolicyBundle.findFirst({
        where: { state: { in: [AiPolicyState.active, AiPolicyState.scheduled] } },
        orderBy: [{ state: "asc" }, { effectiveAt: "desc" }],
        include: { approvedBy: { select: { id: true, fullName: true, email: true } } },
      });
    if (!row) throw new AiPolicyError("active_policy_unavailable", "Tidak ada snapshot kebijakan lengkap untuk disalin.", 503);
    try { rowConfig(row); } catch { throw new AiPolicyError("active_policy_corrupt", "Snapshot kebijakan sumber tidak lengkap.", 503); }
    return row;
  }

  async getMetadata(actor: AiPolicyActor): Promise<AiPolicyMetadataDto> {
    await this.requireAdmin(actor);
    const capabilities = await this.capabilities(actor);
    const [active, scheduled, history] = await Promise.all([
      this.db.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.active }, orderBy: { activatedAt: "desc" }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } }),
      this.db.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.scheduled }, orderBy: { effectiveAt: "asc" }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } }),
      this.db.aiPolicyBundle.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { approvedBy: { select: { id: true, fullName: true, email: true } }, auditEvents: { orderBy: { occurredAt: "desc" }, take: 1 } } }),
    ]);
    return {
      active: active ? {
        bundleVersion: active.bundleVersion,
        effectiveAt: active.effectiveAt.toISOString(),
        providerGateState: AI_POLICY_PROVIDER_GATE_STATE,
        validationDigest: active.validationDigest,
        lastApprover: active.approvedBy ? { id: active.approvedBy.id, display: active.approvedBy.fullName || active.approvedBy.email } : null,
      } : null,
      scheduled: scheduled ? { bundleVersion: scheduled.bundleVersion, effectiveAt: scheduled.effectiveAt.toISOString(), validationDigest: scheduled.validationDigest } : null,
      history: history.map((row) => ({ bundleVersion: row.bundleVersion, state: row.state, effectiveAt: row.effectiveAt.toISOString(), validationDigest: row.validationDigest, reason: row.changeReason, lastAction: row.auditEvents[0]?.action ?? null })),
      capabilities,
      canMutate: capabilities.length > 0,
    };
  }

  async readBundle(actor: AiPolicyActor, bundleId: string): Promise<AiPolicyBundleDto> {
    await this.requireAdmin(actor);
    const row = await this.db.aiPolicyBundle.findUnique({ where: { id: bundleId }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
    if (!row) throw new AiPolicyError("policy_bundle_not_found", "Versi kebijakan tidak ditemukan.", 404);
    try { return toBundleDto(row); } catch { throw new AiPolicyError("policy_bundle_corrupt", "Snapshot kebijakan tidak lengkap.", 503); }
  }

  async createDraft(actor: AiPolicyActor, input: { clientRequestId: string; sourceBundleId?: string; reason: string }): Promise<AiPolicyCommandResponse> {
    assertReason(input.reason);
    await this.requireAnyCapability(actor);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_draft_create, resultKind: AiAdminCommandResultKind.draft, clientRequestId: input.clientRequestId, payload: { sourceBundleId: input.sourceBundleId ?? null, reason: input.reason }, reason: input.reason }, async (tx, _command, now) => {
      const source = await this.sourceBundle(tx, input.sourceBundleId);
      const bundleVersion = `vera-policy-console-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
      const row = await tx.aiPolicyBundle.create({
        data: {
          bundleVersion,
          configSchemaVersion: source.configSchemaVersion,
          state: AiPolicyState.draft,
          effectiveAt: source.effectiveAt,
          supersedesBundleId: source.id,
          quotaConfig: json(source.quotaConfig),
          settlementConfig: json(source.settlementConfig),
          reportConfig: json(source.reportConfig),
          retentionConfig: json(source.retentionConfig),
          providerGateState: AI_POLICY_PROVIDER_GATE_STATE,
          validationDigest: "",
          changeReason: input.reason,
          createdByUserId: actor.id,
          editorActorIds: [actor.id],
          requiredCapabilityUnion: [],
          revision: 0,
        },
        include: { approvedBy: { select: { id: true, fullName: true, email: true } } },
      });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.created, reason: input.reason, toState: AiPolicyState.draft } });
      return { resultId: row.id, result: toBundleDto(row) };
    });
  }

  async editDraft(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; clientRequestId: string; patch: Partial<Record<`${PolicySection}Config`, unknown>>; reason?: string }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    const sections = (Object.keys(input.patch) as string[]).map((key) => key.replace(/Config$/, "") as PolicySection);
    if (!sections.length || sections.some((section) => !["quota", "settlement", "report", "retention"].includes(section))) throw new AiPolicyError("invalid_policy_patch", "Perubahan hanya boleh menyentuh section kebijakan yang diizinkan.", 400);
    await this.requireCapabilities(actor, capabilitiesForSections(sections));
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_draft_edit, resultKind: AiAdminCommandResultKind.draft, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, patch: input.patch, reason: input.reason ?? null }, reason: input.reason ?? null }, async (tx) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.draft || row.revision !== input.expectedRevision) throw new AiPolicyError("policy_revision_conflict", "Draft kebijakan berubah; muat ulang sebelum mengedit.", 409, { currentRevision: row.revision });
      const data: Prisma.AiPolicyBundleUpdateInput = {
        validationDigest: "",
        requiredCapabilityUnion: [],
        approvalSnapshotId: null,
        approvalSnapshotDigest: null,
        approvedBy: { disconnect: true },
        approvedAt: null,
        activatedAt: null,
        changeReason: input.reason ?? row.changeReason,
        editorActorIds: arrayOfStrings([...row.editorActorIds, actor.id]),
        revision: { increment: 1 },
      };
      if (input.patch.quotaConfig !== undefined) data.quotaConfig = json(input.patch.quotaConfig);
      if (input.patch.settlementConfig !== undefined) data.settlementConfig = json(input.patch.settlementConfig);
      if (input.patch.reportConfig !== undefined) data.reportConfig = json(input.patch.reportConfig);
      if (input.patch.retentionConfig !== undefined) data.retentionConfig = json(input.patch.retentionConfig);
      const updated = await tx.aiPolicyBundle.update({ where: { id: row.id }, data, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.draft_edited, reason: input.reason ?? null, fromState: AiPolicyState.draft, toState: AiPolicyState.draft } });
      return { resultId: updated.id, result: toBundleDto(updated) };
    });
  }

  async validateDraft(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; clientRequestId: string }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_validate, resultKind: AiAdminCommandResultKind.validation, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision } }, async (tx) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.draft || row.revision !== input.expectedRevision) throw new AiPolicyError("policy_revision_conflict", "Draft kebijakan berubah; validasi dibatalkan.", 409, { currentRevision: row.revision });
      const source = row.supersedesBundleId ? await this.getBundle(tx, row.supersedesBundleId) : row;
      const candidate = rowConfig(row);
      const changed = changedSectionsFromRows(source, row);
      if (!changed.length) throw new AiPolicyError("no_policy_change", "Draft tidak memiliki perubahan section.", 422);
      await this.requireCapabilities(actor, capabilitiesForSections(changed), tx);
      const digest = policyValidationDigest(candidate);
      const requiredUnion = capabilitiesForSections(changed);
      const updated = await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.pending_approval, validationDigest: digest, requiredCapabilityUnion: requiredUnion, revision: { increment: 1 } }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.validated, diffDigest: digest, validationDigest: digest, reason: row.changeReason, fromState: AiPolicyState.draft, toState: AiPolicyState.pending_approval } });
      return { resultId: updated.id, result: toBundleDto(updated) };
    });
  }

  async previewDraft(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; validationDigest: string; mode: "categorical" | "aggregate"; clientRequestId: string; range?: { from: string; to: string; timezone: string } }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    if (input.mode === "aggregate" && !this.options.previewReservation) throw new AiPolicyError("preview_budget_unavailable", "Preview agregat belum memiliki ledger report yang tersedia.", 503);
    if (input.range !== undefined) assertPreviewRange(input.range);
    const fingerprint = adminCommandFingerprint({ operation: AiAdminCommandOperation.ai_policy_preview, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, validationDigest: input.validationDigest, mode: input.mode, range: input.range ?? null }, secret: this.secret() });
    let aggregateCompletion: { reservationId: string; result: AiPolicyImpactPreviewDto; resultDigest: string } | undefined;
    const response = await this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_preview, resultKind: AiAdminCommandResultKind.preview, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, validationDigest: input.validationDigest, mode: input.mode, range: input.range ?? null } }, async (tx, command, now) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.pending_approval || row.revision !== input.expectedRevision || row.validationDigest !== input.validationDigest) throw new AiPolicyError("validation_stale", "Preview memerlukan validasi terbaru.", 409);
      const source = row.supersedesBundleId ? await this.getBundle(tx, row.supersedesBundleId) : row;
      const active = await tx.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.active }, orderBy: { activatedAt: "desc" } });
      if (!active) throw new AiPolicyError("active_policy_unavailable", "Kebijakan aktif tidak tersedia.", 503);
      const changed = changedSectionsFromRows(source, row);
      await this.requireCapabilities(actor, capabilitiesForSections(changed), tx);
      const candidateConfig = rowConfig(row);
      let reservationId: string | undefined;
      if (input.mode === "aggregate") {
        reservationId = (await this.options.previewReservation!.reserveAggregate({ principalId: actor.id, clientRequestId: input.clientRequestId, requestFingerprint: fingerprint, policyBundleVersion: row.bundleVersion, costUnits: 3, asOf: now })).reservationId;
      }
      const result = buildImpactPreview({ candidate: row, source, active, mode: input.mode, validationDigest: input.validationDigest, asOf: now, reservationId });
      await tx.aiAdminCommandLedger.update({ where: { id: command.id }, data: {
        previewMode: input.mode === "categorical" ? AiPolicyPreviewMode.categorical : AiPolicyPreviewMode.aggregate,
        previewActiveBundleId: active.id,
        previewActiveBundleVersion: active.bundleVersion,
        previewEffectiveAt: row.effectiveAt,
        previewAsOf: now,
        previewValidationDigest: input.validationDigest,
        previewReservationId: reservationId ?? null,
      } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.previewed, diffDigest: input.validationDigest, validationDigest: input.validationDigest, reason: "Impact preview", fromState: row.state, toState: row.state } });
      if (reservationId) aggregateCompletion = { reservationId, result, resultDigest: policyValidationDigest(candidateConfig) };
      return { resultId: row.id, result };
    });
    if (aggregateCompletion) await this.options.previewReservation!.completeAggregate(aggregateCompletion);
    return response;
  }

  async approveDraft(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; validationDigest: string; clientRequestId: string; reason?: string }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_approve, resultKind: AiAdminCommandResultKind.approval, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, validationDigest: input.validationDigest, reason: input.reason ?? null }, reason: input.reason ?? null }, async (tx, command, now) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.pending_approval || row.revision !== input.expectedRevision || row.validationDigest !== input.validationDigest) throw new AiPolicyError("approval_stale", "Approval memerlukan validasi dan revisi terbaru.", 409);
      const union = arrayOfCapabilities(row.requiredCapabilityUnion);
      await this.requireCapabilities(actor, union, tx);
      if (row.editorActorIds.includes(actor.id)) throw new AiPolicyError("approval_separation_required", "Drafter atau editor tidak dapat menyetujui draft sendiri.", 403);
      const nextRevision = row.revision + 1;
      const snapshotDigest = policySnapshotDigest({ bundleId: row.id, bundleRevision: nextRevision, editorActorIds: row.editorActorIds, requiredCapabilityUnion: union });
      const snapshot = await tx.aiPolicyApprovalSnapshot.create({ data: { bundleId: row.id, bundleRevision: nextRevision, snapshotVersion: "vera-policy-approval-v1", editorActorIds: arrayOfStrings(row.editorActorIds), requiredCapabilityUnion: union, snapshotDigest } });
      const audit = await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.approved, diffDigest: input.validationDigest, validationDigest: input.validationDigest, reason: input.reason ?? null, fromState: AiPolicyState.pending_approval, toState: AiPolicyState.pending_approval, approvalSnapshotId: snapshot.id, approvalSnapshotDigest: snapshotDigest } });
      await tx.aiPolicyApprovalSnapshot.update({ where: { id: snapshot.id }, data: { approvalAuditEventId: audit.id } });
      const updated = await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { approvedByUserId: actor.id, approvedAt: now, approvalSnapshotId: snapshot.id, approvalSnapshotDigest: snapshotDigest, revision: nextRevision }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      return { resultId: updated.id, result: toBundleDto(updated) };
    });
  }

  async scheduleDraft(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; validationDigest: string; effectiveAt: Date | string; clientRequestId: string; reason?: string }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    const effectiveAt = asDate(input.effectiveAt);
    if (Number.isNaN(effectiveAt.getTime())) throw new AiPolicyError("invalid_effective_at", "Waktu efektif tidak valid.", 400);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_schedule, resultKind: AiAdminCommandResultKind.schedule, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, validationDigest: input.validationDigest, effectiveAt, reason: input.reason ?? null }, reason: input.reason ?? null }, async (tx, command, now) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.pending_approval || row.revision !== input.expectedRevision || row.validationDigest !== input.validationDigest) throw new AiPolicyError("schedule_stale", "Schedule memerlukan approval terbaru.", 409);
      if (effectiveAt <= now) throw new AiPolicyError("effective_boundary_invalid", "Waktu efektif harus berada di masa depan.", 422);
      await this.requireCapabilities(actor, arrayOfCapabilities(row.requiredCapabilityUnion), tx);
      if (!row.approvalSnapshotId || !row.approvedAt) throw new AiPolicyError("approval_required", "Approval operator kedua belum lengkap.", 409);
      const existing = await tx.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.scheduled, id: { not: row.id } }, select: { id: true } });
      if (existing) throw new AiPolicyError("scheduled_successor_exists", "Sudah ada successor kebijakan terjadwal.", 409);
      const updated = await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.scheduled, effectiveAt, revision: { increment: 1 } }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.scheduled, diffDigest: input.validationDigest, validationDigest: input.validationDigest, reason: input.reason ?? null, fromState: AiPolicyState.pending_approval, toState: AiPolicyState.scheduled } });
      return { resultId: updated.id, result: toBundleDto(updated) };
    });
  }

  async activateDue(actor: AiPolicyActor, input: { bundleId: string; expectedRevision: number; clientRequestId: string; reason?: string }): Promise<AiPolicyCommandResponse> {
    assertPositiveRevision(input.expectedRevision);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_activate, resultKind: AiAdminCommandResultKind.activation, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, expectedRevision: input.expectedRevision, reason: input.reason ?? null }, reason: input.reason ?? null }, async (tx, command, now) => {
      const row = await this.getBundle(tx, input.bundleId);
      if (row.state !== AiPolicyState.scheduled || row.revision !== input.expectedRevision) throw new AiPolicyError("activation_stale", "Successor kebijakan tidak lagi terjadwal pada revisi ini.", 409);
      if (row.effectiveAt > now) throw new AiPolicyError("effective_boundary_not_reached", "Batas efektif database belum tercapai.", 409);
      const candidate = rowConfig(row);
      if (!row.validationDigest || policyValidationDigest(candidate) !== row.validationDigest || !row.approvalSnapshotId || !row.approvedByUserId) throw new AiPolicyError("policy_incomplete", "Successor kebijakan tidak lengkap atau digest tidak cocok.", 503);
      await this.requireCapabilities(actor, arrayOfCapabilities(row.requiredCapabilityUnion), tx);
      const active = await tx.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.active }, orderBy: { activatedAt: "desc" } });
      if (active && active.id !== row.id) {
        await tx.aiPolicyBundle.update({ where: { id: active.id }, data: { state: AiPolicyState.retired } });
        await tx.aiPolicyAuditEvent.create({ data: { bundleId: active.id, actorId: actor.id, action: AiPolicyAuditAction.retired, reason: "Successor policy activated", fromState: AiPolicyState.active, toState: AiPolicyState.retired } });
      }
      const updated = await tx.aiPolicyBundle.update({ where: { id: row.id }, data: { state: AiPolicyState.active, activatedAt: now }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: row.id, actorId: actor.id, action: AiPolicyAuditAction.activated, diffDigest: row.validationDigest, validationDigest: row.validationDigest, reason: input.reason ?? null, fromState: AiPolicyState.scheduled, toState: AiPolicyState.active } });
      return { resultId: updated.id, result: toBundleDto(updated) };
    });
  }

  async rollback(actor: AiPolicyActor, input: { bundleId: string; clientRequestId: string; reason: string }): Promise<AiPolicyCommandResponse> {
    assertReason(input.reason);
    const target = await this.db.aiPolicyBundle.findUnique({ where: { id: input.bundleId } });
    if (!target) throw new AiPolicyError("policy_bundle_not_found", "Versi kebijakan untuk rollback tidak ditemukan.", 404);
    await this.requireCapabilities(actor, arrayOfCapabilities(target.requiredCapabilityUnion.length ? target.requiredCapabilityUnion : ["canManageAiPolicy", "canManageAiGovernance"]));
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_rollback, resultKind: AiAdminCommandResultKind.rollback, clientRequestId: input.clientRequestId, payload: { bundleId: input.bundleId, reason: input.reason }, reason: input.reason }, async (tx, command, now) => {
      const row = await this.getBundle(tx, input.bundleId);
      const bundleVersion = `vera-policy-rollback-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
      const created = await tx.aiPolicyBundle.create({ data: { bundleVersion, configSchemaVersion: row.configSchemaVersion, state: AiPolicyState.draft, effectiveAt: now, supersedesBundleId: row.id, quotaConfig: json(row.quotaConfig), settlementConfig: json(row.settlementConfig), reportConfig: json(row.reportConfig), retentionConfig: json(row.retentionConfig), providerGateState: AI_POLICY_PROVIDER_GATE_STATE, validationDigest: "", changeReason: input.reason, createdByUserId: actor.id, editorActorIds: [actor.id], requiredCapabilityUnion: [], revision: 0 }, include: { approvedBy: { select: { id: true, fullName: true, email: true } } } });
      await tx.aiPolicyAuditEvent.create({ data: { bundleId: created.id, actorId: actor.id, action: AiPolicyAuditAction.rollback_created, reason: input.reason, fromState: row.state, toState: AiPolicyState.draft } });
      return { resultId: created.id, result: toBundleDto(created) };
    });
  }

  async requestRetentionExtension(actor: AiPolicyActor, input: { clientRequestId: string; targetReference: string; requestedUpperBound: Date | string; reason: string }): Promise<AiPolicyCommandResponse> {
    assertReason(input.reason);
    if (!input.targetReference || input.targetReference.length > 160) throw new AiPolicyError("invalid_retention_reference", "Referensi retention tidak valid.", 400);
    const requestedUpperBound = asDate(input.requestedUpperBound);
    if (Number.isNaN(requestedUpperBound.getTime())) throw new AiPolicyError("invalid_retention_bound", "Batas retention tidak valid.", 400);
    await this.requireCapabilities(actor, ["canManageAiGovernance"]);
    return this.executeBundleCommand({ actor, operation: AiAdminCommandOperation.ai_policy_retention_extension_request, resultKind: AiAdminCommandResultKind.retention_extension, clientRequestId: input.clientRequestId, payload: { targetReference: input.targetReference, requestedUpperBound, reason: input.reason }, reason: input.reason }, async (tx, command) => {
      const active = await tx.aiPolicyBundle.findFirst({ where: { state: AiPolicyState.active }, orderBy: { activatedAt: "desc" } });
      if (!active) throw new AiPolicyError("active_policy_unavailable", "Kebijakan aktif tidak tersedia.", 503);
      const audit = await tx.aiPolicyAuditEvent.create({ data: { bundleId: active.id, actorId: actor.id, action: AiPolicyAuditAction.retention_extension_requested, reason: input.reason, diffDigest: "pending-t11", validationDigest: active.validationDigest, toState: active.state } });
      await tx.aiAdminCommandLedger.update({ where: { id: command.id }, data: { retentionTargetRef: input.targetReference, retentionUpperBound: requestedUpperBound, retentionPolicyBundleVersion: active.bundleVersion, retentionAuditReference: audit.id } });
      return { resultId: command.id, result: { state: "pending", requestReference: command.id, policyBundleVersion: active.bundleVersion, auditReference: audit.id } };
    });
  }
}

export function createAiPolicyCommandService(options?: ConstructorParameters<typeof AiPolicyCommandService>[1]): AiPolicyCommandService {
  return new AiPolicyCommandService(defaultPrisma, options);
}

export { changedSectionsFromRows };
