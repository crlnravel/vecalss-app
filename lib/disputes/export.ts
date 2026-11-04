import "server-only";

import { randomBytes } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { accessPlanLabel } from "@/lib/billing/plans";
import { FRAUD_SIGNALS, isFraudSignal } from "@/lib/fraud/constants";
import { FraudValidationError } from "@/lib/fraud/errors";
import { requireReason, type OwnerContext } from "@/lib/fraud/authority";
import { getTermsByVersion } from "@/lib/fulfillment/terms";
import { prisma } from "@/lib/prisma";

import { sealPacket, sha256Hex } from "./canonical";

type Tx = Prisma.TransactionClient;

/** How long a download link works. Short on purpose (G4: retrievable fast, exposed briefly). */
const EXPORT_LINK_MINUTES = 10;

const PACKET_VERSION = 1;

type OrderRow = {
  affiliatorReferralCode: string | null;
  amountRupiah: number;
  buyerId: string;
  buyerIp: string | null;
  buyerIpExemption: string | null;
  buyerIpSource: string;
  createdAt: Date;
  currency: string;
  deviceLookupToken: string | null;
  expiresAt: Date;
  id: string;
  intentCreatedAt: Date;
  packageCode: string;
  packageName: string;
  paidAt: Date | null;
  plan: string;
  packagePurchaseId: string | null;
  pricingMonth: string;
  provider: string;
  providerAccount: string;
  providerEnvironment: string;
  providerReference: string | null;
  reference: string;
  status: string;
  statusChangedAt: Date;
  statusReason: string | null;
  termsVersion: string | null;
};

type TimelineEntry = { at: Date; detail: Record<string, unknown>; label: string; source: string };

const REDACTIONS = [
  "Hanya data pesanan ini dan pembelinya yang disertakan.",
  "Pesanan, akun, alamat IP, perangkat, dan identitas siswa lain tidak disertakan, termasuk yang berbagi alamat IP atau perangkat dengan pembeli.",
  "Bukti rinci pada kasus fraud (yang bisa menyebut akun lain) tidak disertakan; hanya jenis sinyal, tingkat, status, dan waktunya.",
  "Identitas affiliator tidak disertakan; hanya kode referral yang tercatat pada pesanan.",
  "Nilai pengenal perangkat yang disimpan hanya berupa token pencarian acak, bukan nilai asli.",
] as const;

/**
 * Collects the genuine evidence of one order into a plain object. Everything
 * here is read from the tables that hold it; nothing is computed to fill a gap.
 * An empty section is left empty (no refund records exist before MS-09).
 */
async function collectPacket(tx: Tx, orderId: string) {
  const [order = null] = await tx.$queryRaw<OrderRow[]>`
    SELECT o.id, o.reference, o.buyer_id AS "buyerId", o.plan, o.pricing_month AS "pricingMonth",
           o.package_code AS "packageCode", o.package_name AS "packageName",
           o.amount_rupiah AS "amountRupiah", o.currency, o.referral_code AS "affiliatorReferralCode",
           host(o.buyer_ip) AS "buyerIp", o.buyer_ip_source AS "buyerIpSource",
           o.buyer_ip_exemption AS "buyerIpExemption", o.device_lookup_token AS "deviceLookupToken",
           o.provider, o.provider_environment AS "providerEnvironment", o.provider_account AS "providerAccount",
           o.created_at AS "createdAt", o.expires_at AS "expiresAt", o.status::text AS status,
           o.status_changed_at AS "statusChangedAt", o.status_reason AS "statusReason",
           o.paid_at AS "paidAt", o.provider_reference AS "providerReference",
           o.terms_version AS "termsVersion", o.package_purchase_id AS "packagePurchaseId",
           i.created_at AS "intentCreatedAt"
    FROM payment_orders o JOIN checkout_intents i ON i.id = o.intent_id
    WHERE o.id = ${orderId}::uuid
  `;
  if (!order) return null;

  const [buyer] = await tx.$queryRaw<Array<{ createdAt: Date; email: string; fullName: string; id: string }>>`
    SELECT id, full_name AS "fullName", email, created_at AS "createdAt" FROM users WHERE id = ${order.buyerId}::uuid
  `;
  const events = await tx.$queryRaw<Array<Record<string, unknown> & { receivedAt: Date }>>`
    SELECT id, type::text AS type, source::text AS source, outcome::text AS outcome, reason,
           provider_payment_id AS "providerPaymentId", amount_rupiah AS "amountRupiah", currency,
           host(caller_ip) AS "providerCallerIp", body_sha256 AS "bodySha256",
           provider_occurred_at AS "providerOccurredAt", received_at AS "receivedAt"
    FROM payment_events WHERE order_id = ${orderId}::uuid ORDER BY received_at, id
  `;
  const audits = await tx.$queryRaw<Array<{ action: string; metadata: unknown; occurredAt: Date }>>`
    SELECT action, metadata, occurred_at AS "occurredAt" FROM audit_logs
    WHERE target_type = 'payment_order' AND target_id = ${orderId}::uuid ORDER BY occurred_at, id
  `;
  const [reservation = null] = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT amount_rupiah AS "amountRupiah", bucket_date::text AS "bucketDate", tier::text AS tier,
           policy_version AS "policyVersion", state::text AS state, state_reason AS "stateReason",
           created_at AS "createdAt", state_changed_at AS "stateChangedAt"
    FROM risk_reservations WHERE order_id = ${orderId}::uuid
  `;
  const [purchase = null] = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT status::text AS status, completed_at AS "completedAt", provenance::text AS provenance
    FROM package_purchases WHERE id = ${order.packagePurchaseId}::uuid
  `;
  const [receipt = null] = await tx.$queryRaw<Array<Record<string, unknown> & { id: string }>>`
    SELECT id, receipt_number AS "receiptNumber", delivery_status::text AS "deliveryStatus",
           pending_reason AS "pendingReason", access_plan_code AS "accessPlanCode",
           amount_rupiah AS "amountRupiah", currency, terms_version AS "termsVersion",
           paid_at AS "paidAt", valid_from AS "validFrom", valid_until AS "validUntil",
           granted_at AS "grantedAt", grant_event_id AS "grantEventId", created_at AS "createdAt"
    FROM payment_receipts WHERE order_id = ${orderId}::uuid
  `;
  const deliveries = receipt
    ? await tx.$queryRaw<Array<Record<string, unknown> & { attemptedAt: Date }>>`
        SELECT d.channel, d.outcome, d.detail, d.provider_message_id AS "providerMessageId",
               d.notification_id AS "notificationId", d.attempted_at AS "attemptedAt",
               n.title AS "notificationTitle", n.read_at AS "notificationReadAt"
        FROM receipt_deliveries d LEFT JOIN notifications n ON n.id = d.notification_id
        WHERE d.receipt_id = ${receipt.id}::uuid ORDER BY d.attempted_at, d.id
      `
    : [];
  const grantEvents = receipt && receipt.grantEventId
    ? await tx.$queryRaw<Array<Record<string, unknown> & { occurredAt: Date }>>`
        SELECT e.kind::text AS kind, e.source::text AS source, e.plan_code AS "planCode",
               e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.resulting_status::text AS "resultingStatus",
               e.idempotency_key AS "idempotencyKey", e.reason, e.actor_user_id AS "actorUserId",
               e.occurred_at AS "occurredAt", (e.id = ${String(receipt.grantEventId)}::uuid) AS "isGrantForThisOrder"
        FROM billing_access_events e
        WHERE e.student_id = ${order.buyerId}::uuid
          AND e.occurred_at >= (SELECT occurred_at FROM billing_access_events WHERE id = ${String(receipt.grantEventId)}::uuid)
        ORDER BY e.occurred_at, e.id LIMIT 50
      `
    : [];
  const usage = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT jakarta_day::text AS "jakartaDay", first_used_at AS "firstUsedAt"
    FROM fulfillment_usage_events WHERE order_id = ${orderId}::uuid ORDER BY jakarta_day
  `;
  const sessions = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT host(s.ip_address) AS "ipAddress", s.user_agent AS "userAgent",
           s.issued_at AS "issuedAt", s.last_seen_at AS "lastSeenAt"
    FROM auth_sessions s
    WHERE s.user_id = ${order.buyerId}::uuid
      AND s.issued_at <= ${order.createdAt}
      AND s.expires_at >= ${order.createdAt}
      AND (s.revoked_at IS NULL OR s.revoked_at >= ${order.createdAt})
    ORDER BY s.issued_at DESC LIMIT 5
  `;
  const cases = await tx.$queryRaw<Array<{ closureReason: string | null; hitCount: number; id: string; openedAt: Date; severity: string; signal: string; state: string }>>`
    SELECT id, signal, severity::text AS severity, state::text AS state, hit_count AS "hitCount",
           opened_at AS "openedAt", closure_reason AS "closureReason"
    FROM fraud_cases WHERE order_id = ${orderId}::uuid ORDER BY opened_at
  `;

  const terms = order.termsVersion ? getTermsByVersion(order.termsVersion) : null;

  const timeline: TimelineEntry[] = [
    { at: order.intentCreatedAt, detail: { termsVersion: order.termsVersion }, label: "Pembeli menyetujui Syarat Pembelian dan memulai checkout", source: "checkout" },
    { at: order.createdAt, detail: { amountRupiah: order.amountRupiah, currency: order.currency, reference: order.reference }, label: "Pesanan dibuat", source: "order" },
    ...events.map((event) => ({
      at: event.receivedAt,
      detail: { amountRupiah: event.amountRupiah, outcome: event.outcome, reason: event.reason, type: event.type },
      label: `Kejadian pembayaran diterima (${String(event.type)})`,
      source: "payment_event",
    })),
    ...audits
      .filter((audit) => audit.action.startsWith("payment."))
      .map((audit) => ({ at: audit.occurredAt, detail: (audit.metadata ?? {}) as Record<string, unknown>, label: audit.action, source: "audit" })),
    ...(receipt
      ? [{ at: receipt.createdAt as Date, detail: { deliveryStatus: receipt.deliveryStatus, receiptNumber: receipt.receiptNumber }, label: "Struk dicatat", source: "receipt" }]
      : []),
    ...grantEvents
      .filter((event) => event.isGrantForThisOrder === true)
      .map((event) => ({ at: event.occurredAt, detail: { endsAt: event.endsAt, planCode: event.planCode }, label: "Akses diberikan", source: "access" })),
    ...deliveries.map((delivery) => ({
      at: delivery.attemptedAt,
      detail: { channel: delivery.channel, detail: delivery.detail, outcome: delivery.outcome },
      label: `Pengiriman struk lewat ${String(delivery.channel)}: ${String(delivery.outcome)}`,
      source: "delivery",
    })),
    ...usage.map((use) => ({ at: use.firstUsedAt as Date, detail: { jakartaDay: use.jakartaDay }, label: "Pembeli memakai fitur berbayar", source: "use" })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    acceptedTerms: {
      acceptedAt: order.intentCreatedAt,
      status: terms?.status ?? null,
      text: terms
        ? terms.sections.map((section) => ({ body: [...section.body], heading: section.heading }))
        : null,
      title: terms?.title ?? null,
      version: order.termsVersion,
    },
    buyer: { createdAt: buyer.createdAt, email: buyer.email, fullName: buyer.fullName, id: buyer.id },
    cases: cases.map((item) => ({
      closureReason: item.closureReason,
      hitCount: item.hitCount,
      openedAt: item.openedAt,
      severity: item.severity,
      signal: isFraudSignal(item.signal) ? FRAUD_SIGNALS[item.signal].label : item.signal,
      state: item.state,
    })),
    communications: {
      receiptDeliveries: deliveries,
      note: "Tidak ada komunikasi lain yang tercatat untuk pesanan ini.",
    },
    financialTimeline: timeline,
    grant: {
      accessHistorySinceGrant: grantEvents,
      planLabel: receipt?.accessPlanCode ? accessPlanLabel(String(receipt.accessPlanCode)) : null,
    },
    order: {
      affiliatorReferralCode: order.affiliatorReferralCode,
      amountRupiah: order.amountRupiah,
      createdAt: order.createdAt,
      currency: order.currency,
      expiresAt: order.expiresAt,
      id: order.id,
      packageCode: order.packageCode,
      packageName: order.packageName,
      paidAt: order.paidAt,
      plan: order.plan,
      pricingMonth: order.pricingMonth,
      provider: order.provider,
      providerAccount: order.providerAccount,
      providerEnvironment: order.providerEnvironment,
      providerPaymentId: order.providerReference,
      reference: order.reference,
      status: order.status,
      statusChangedAt: order.statusChangedAt,
      statusReason: order.statusReason,
    },
    payment: { events, purchaseSummary: purchase, reservation },
    provenance: {
      buyerIp: order.buyerIp,
      buyerIpExemption: order.buyerIpExemption,
      buyerIpSource: order.buyerIpSource,
      deviceTokenRef: order.deviceLookupToken ? order.deviceLookupToken.slice(0, 12) : null,
      sessionsOpenAtCheckout: sessions,
    },
    receipt,
    refunds: { note: "Belum ada catatan pengembalian dana. Fitur pengembalian dana belum aktif.", records: [] as unknown[] },
    usage,
    counts: {
      cases: cases.length,
      deliveries: deliveries.length,
      paymentEvents: events.length,
      timelineEntries: timeline.length,
      usageDays: usage.length,
    },
  };
}

type CreateExportInput = { orderId: string; reason: unknown };

type CreatedExport = {
  digestSha256: string;
  expiresAt: Date;
  exportId: string;
  packetBytes: number;
  /** Shown once. Only its hash is kept. */
  token: string;
};

/**
 * Builds, seals, stores and logs an export in one transaction, so an export
 * cannot exist without its log row and audit event. Only an owner context
 * (verified second factor, FRAUD_OWNER_EMAIL) can call it; the type enforces
 * the check, and callers get one from `requireOwner`.
 */
async function createDisputeExport(owner: OwnerContext, input: CreateExportInput): Promise<CreatedExport> {
  const reason = requireReason(input.reason);
  if (!/^[0-9a-f-]{36}$/iu.test(input.orderId)) throw new FraudValidationError("not_found", "The order was not found.");

  return prisma.$transaction(async (tx) => {
    const collected = await collectPacket(tx, input.orderId);
    if (!collected) throw new FraudValidationError("not_found", "The order was not found.");

    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT now() AS now`;
    const sections = ["order", "financialTimeline", "payment", "grant", "receipt", "usage", "provenance", "acceptedTerms", "refunds", "communications", "cases"];
    const { counts, ...evidence } = collected;
    const sealed = sealPacket({
      manifest: {
        counts,
        generatedAt: now,
        generatedBy: { email: owner.email, userId: owner.userId },
        orderId: input.orderId,
        orderReference: collected.order.reference,
        packetVersion: PACKET_VERSION,
        reason,
        redactions: [...REDACTIONS],
        sections,
        title: "Paket bukti sengketa pembayaran",
      },
      ...evidence,
    });
    const text = JSON.stringify(sealed, null, 2);

    const token = randomBytes(32).toString("base64url");
    const [created] = await tx.$queryRaw<Array<{ expiresAt: Date; id: string }>>`
      INSERT INTO dispute_exports (order_id, requested_by_id, reason, expires_at, token_hash, digest_sha256, packet_bytes, packet)
      VALUES (
        ${input.orderId}::uuid, ${owner.userId}::uuid, ${reason},
        now() + make_interval(mins => ${EXPORT_LINK_MINUTES}::int), ${sha256Hex(token)},
        ${sealed.digest.sha256}, ${Buffer.byteLength(text, "utf8")}, ${text}
      )
      RETURNING id, expires_at AS "expiresAt"
    `;
    await tx.$executeRaw`
      INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
      VALUES (
        'dispute.export.created', ${owner.userId}::uuid, 'payment_order', ${input.orderId}::uuid,
        ${JSON.stringify({ digestSha256: sealed.digest.sha256, exportId: created.id, expiresAt: created.expiresAt })}::jsonb
      )
    `;

    return {
      digestSha256: sealed.digest.sha256,
      expiresAt: created.expiresAt,
      exportId: created.id,
      packetBytes: Buffer.byteLength(text, "utf8"),
      token,
    };
  }, { maxWait: 10_000, timeout: 20_000 });
}

type ClaimResult =
  | { exportId: string; fileName: string; ok: true; text: string }
  | { ok: false; reason: "expired_or_used" };

/**
 * Hands over the packet for a token, once. The first claim takes the packet
 * out of the row and records the download; a second claim, or one after the
 * link expired, gets nothing. Judged on database time.
 */
async function claimDisputeExport(owner: OwnerContext, token: string): Promise<ClaimResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return { ok: false, reason: "expired_or_used" };

  return prisma.$transaction(async (tx) => {
    const [claimed = null] = await tx.$queryRaw<Array<{ id: string; orderId: string; packet: string }>>`
      WITH target AS (
        SELECT id, packet FROM dispute_exports
        WHERE token_hash = ${sha256Hex(token)} AND downloaded_at IS NULL AND packet IS NOT NULL AND expires_at > now()
        FOR UPDATE
      ), taken AS (
        UPDATE dispute_exports d SET downloaded_at = now(), packet = NULL, packet_purged_at = now()
        FROM target WHERE d.id = target.id
        RETURNING d.id, d.order_id AS "orderId", target.packet
      )
      SELECT id, "orderId", packet FROM taken
    `;
    if (!claimed) return { ok: false as const, reason: "expired_or_used" as const };

    await tx.$executeRaw`
      INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
      VALUES (
        'dispute.export.downloaded', ${owner.userId}::uuid, 'payment_order', ${claimed.orderId}::uuid,
        ${JSON.stringify({ exportId: claimed.id })}::jsonb
      )
    `;
    return { exportId: claimed.id, fileName: `bukti-sengketa-${claimed.orderId}.json`, ok: true as const, text: claimed.packet };
  });
}

/** Drops packets whose link ran out unused. The log row and digest stay. */
async function purgeExpiredExportPackets() {
  const purged = await prisma.$executeRaw`
    UPDATE dispute_exports SET packet = NULL, packet_purged_at = now()
    WHERE packet IS NOT NULL AND expires_at <= now()
  `;
  return Number(purged);
}

type ExportLogRow = {
  createdAt: Date;
  digestSha256: string;
  downloadedAt: Date | null;
  expiresAt: Date;
  id: string;
  packetBytes: number;
  reason: string;
  requestedByEmail: string;
};

async function listExportsForOrder(orderId: string): Promise<ExportLogRow[]> {
  return prisma.$queryRaw<ExportLogRow[]>`
    SELECT e.id, e.created_at AS "createdAt", e.expires_at AS "expiresAt", e.downloaded_at AS "downloadedAt",
           e.digest_sha256 AS "digestSha256", e.packet_bytes AS "packetBytes", e.reason, u.email AS "requestedByEmail"
    FROM dispute_exports e JOIN users u ON u.id = e.requested_by_id
    WHERE e.order_id = ${orderId}::uuid ORDER BY e.created_at DESC LIMIT 20
  `;
}

/** Records that someone tried to export without the authority to. Never throws. */
async function logRefusedExport(input: { actorUserId: string | null; orderId: string | null; reason: string }) {
  try {
    await prisma.$executeRaw`
      INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
      VALUES (
        'dispute.export.refused', ${input.actorUserId}::uuid, ${input.orderId ? "payment_order" : null},
        ${input.orderId}::uuid, ${JSON.stringify({ reason: input.reason })}::jsonb
      )
    `;
  } catch {
    // A refusal is already a refusal; failing to note it must not turn into a crash.
  }
}

export {
  EXPORT_LINK_MINUTES,
  PACKET_VERSION,
  claimDisputeExport,
  collectPacket,
  createDisputeExport,
  listExportsForOrder,
  logRefusedExport,
  purgeExpiredExportPackets,
};
export type { ClaimResult, CreatedExport, ExportLogRow };
