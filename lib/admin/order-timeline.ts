import "server-only";

import { PAYMENT_EVENT_OUTCOME_LABELS, PAYMENT_EVENT_TYPE_LABELS, PENDING_REASON_LABELS, paymentAuditLabel, paymentEventReasonLabel } from "@/lib/admin/payment-audit-labels";
import { accessPlanLabel } from "@/lib/billing/plans";
import { FRAUD_SIGNALS, isFraudSignal } from "@/lib/fraud/constants";
import { getFraudOwnerEmail } from "@/lib/fraud/authority";
import { formatRupiah } from "@/lib/pricing/schedule";
import { prisma } from "@/lib/prisma";
import { REFUND_REASONS, isRefundReasonCode } from "@/lib/refunds/constants";
import { listDisputeRecords, listRefundRecords, type DisputeRecord, type RefundRecord } from "@/lib/refunds/records";
import { maskIp } from "@/lib/retention/mask";
import { getOrderRetention } from "@/lib/retention/status";

/**
 * One order's whole history, read-only, in one list. It is assembled from the
 * tables that already hold each fact (the audit log, payment events, refund and
 * dispute records, access events, the receipt, linked fraud cases, holds and
 * the retention scrub); nothing is written and nothing is invented.
 *
 * Every time shown is a database time: the columns are all stamped by the
 * database clock, and this module never asks the application's clock for one.
 * Several facts of one step share a single transaction time, so entries that
 * tie are ordered by `rank` (what had to happen first), then by their own
 * sequence, then by key, which makes the order the same on every read.
 *
 * What it never shows: the buyer's email, the buyer's or the provider's raw
 * address (only the masked form), provider ids, event ids, digests, tokens or
 * raw provider bodies. Audit metadata is read through a short list of fields,
 * not copied across.
 */

type TimelineTone = "attention" | "danger" | "neutral" | "success";

type TimelineSource = "access" | "audit" | "dispute" | "export" | "fraud" | "payment" | "receipt" | "refund" | "retention" | "usage";

type TimelineEntry = {
  actor: string;
  /** One short line of what, how much, why. Plain words, no codes. */
  detail: string | null;
  href: string | null;
  hrefLabel: string | null;
  key: string;
  source: TimelineSource;
  /** Database time, ISO 8601. */
  at: string;
  title: string;
  tone: TimelineTone;
};

type OrderTimeline =
  | { kind: "present"; entries: TimelineEntry[] }
  /** The order was removed under the retention policy; there is nothing to show but the tombstone. */
  | { kind: "purged"; purgedAt: Date; reference: string | null };

type Db = Pick<typeof prisma, "$queryRaw">;

type UserRef = { fullName: string; id: string; email: string };

type AuditRow = { action: string; actorUserId: string | null; id: string; metadata: Record<string, unknown> | null; occurredAt: Date; targetId: string | null; targetType: string };

type TimelineInput = {
  access: Array<{ actorUserId: string | null; endsAt: Date | null; id: string; kind: string; occurredAt: Date; planCode: string | null; source: string }>;
  audits: AuditRow[];
  buyerId: string;
  cases: Array<{ id: string; openedAt: Date; severity: string; signal: string }>;
  deliveries: Array<{ attemptedAt: Date; channel: string; id: string; outcome: string }>;
  disputes: DisputeRecord[];
  events: Array<{
    amountRupiah: number | null;
    callerIp: string | null;
    id: string;
    outcome: string;
    reason: string | null;
    receivedAt: Date;
    source: string;
    type: string;
  }>;
  holds: Array<{ id: string; placedAt: Date; placedByUserId: string; releasedAt: Date | null; releasedByUserId: string | null; scope: string }>;
  intentCreatedAt: Date;
  order: { amountRupiah: number; buyerIp: string | null; createdAt: Date; expiresAt: Date; id: string };
  ownerEmail: string | null;
  receipt: { createdAt: Date; id: string; receiptNumber: string } | null;
  refunds: RefundRecord[];
  scrubbedAt: Date | null;
  usage: Array<{ firstUsedAt: Date; jakartaDay: string }>;
  users: Map<string, UserRef>;
};

/** What had to happen first when facts share one transaction time. */
const RANK = {
  intent: 10,
  orderCreated: 20,
  providerEvent: 30,
  orderState: 40,
  accessGrant: 50,
  receipt: 55,
  deliveryPending: 60,
  delivery: 65,
  usage: 70,
  refund: 80,
  dispute: 85,
  accessChange: 90,
  fraud: 92,
  export: 95,
  hold: 96,
  scrub: 97,
} as const;

const AUDIT_ACTIONS_NOT_SHOWN = new Set([
  // The provider event line carries the outcome, the reason and the source of these.
  "payment.event.quarantined",
  "payment.event.review",
  // The access event and the receipt already say that access was given.
  "payment.order.delivered",
  // Placed and released holds come from the holds table, which also covers buyer-wide holds.
  "retention.hold.placed",
  "retention.hold.released",
]);

const timeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shorten(value: string, limit = 160) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function joinDetail(parts: Array<string | null | undefined>) {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(" · ") : null;
}

function userName(users: Map<string, UserRef>, ownerEmail: string | null, userId: string | null | undefined, buyerId: string) {
  if (!userId) return null;
  if (userId === buyerId) return "Pembeli";
  const user = users.get(userId);
  if (!user) return "Admin";
  return ownerEmail && user.email.trim().toLowerCase() === ownerEmail ? `Pemilik (${user.fullName})` : `Admin (${user.fullName})`;
}

const ACTOR_KINDS: Record<string, string> = { provider: "Penyedia pembayaran", system: "Sistem" };

function refundActor(input: TimelineInput, kind: string, email: string | null) {
  if (ACTOR_KINDS[kind]) return ACTOR_KINDS[kind];
  return userName(input.users, input.ownerEmail, userIdByEmail(input.users, email), input.buyerId) ?? (kind === "owner" ? "Pemilik" : "Admin");
}

const REFUND_EVENT_TITLES: Record<string, { title: string; tone: TimelineTone }> = {
  approved: { title: "Pengembalian dana disetujui pemilik", tone: "success" },
  cancelled: { title: "Pengembalian dana dibatalkan", tone: "neutral" },
  completed: { title: "Pengembalian dana selesai", tone: "success" },
  execution_accepted: { title: "Penyedia pembayaran menerima permintaan pengembalian dana", tone: "neutral" },
  execution_reconciled: { title: "Status pengembalian dana dicocokkan dengan penyedia pembayaran", tone: "neutral" },
  execution_retried: { title: "Pengembalian dana dikirim ulang ke penyedia pembayaran", tone: "neutral" },
  execution_started: { title: "Pengembalian dana dikirim ke penyedia pembayaran", tone: "neutral" },
  execution_unknown: { title: "Hasil pengiriman pengembalian dana belum jelas, akan dicek ke penyedia", tone: "attention" },
  failed: { title: "Pengembalian dana gagal", tone: "danger" },
  note: { title: "Catatan ditambahkan pada pengembalian dana", tone: "neutral" },
  prepared: { title: "Pengembalian dana disiapkan", tone: "neutral" },
  rejected: { title: "Pengembalian dana ditolak pemilik", tone: "attention" },
};

const ACCESS_EFFECT_LABELS: Record<string, string> = {
  already_ended: "Akses sudah berakhir sebelumnya.",
  kept: "Akses tetap berjalan.",
  none_paid_order: "Pesanan ini tidak memberi akses, jadi tidak ada yang dicabut.",
  revoke_failed: "Akses belum berhasil dicabut, perlu dicek.",
  revoked: "Akses dicabut.",
};

function refundDetail(refund: RefundRecord, event: RefundRecord["events"][number]) {
  const amount = formatRupiah(refund.amountRupiah);
  const reason = isRefundReasonCode(refund.reasonCode) ? REFUND_REASONS[refund.reasonCode].label : null;
  switch (event.kind) {
    case "prepared": {
      const authority = refund.authorityName
        ? `Diperintahkan oleh ${refund.authorityName}, nomor ${refund.authorityReference ?? "—"}`
        : null;
      return joinDetail([amount, authority ?? reason, event.note ? shorten(event.note) : null]);
    }
    case "approved":
      return joinDetail([amount, refund.selfApproved ? "Disiapkan dan disetujui orang yang sama" : null, event.note ? shorten(event.note) : null]);
    case "completed":
      return joinDetail([
        amount,
        refund.method === "manual_transfer" ? "Lewat transfer manual" : "Lewat penyedia pembayaran",
        refund.accessEffect ? ACCESS_EFFECT_LABELS[refund.accessEffect] : null,
      ]);
    default:
      return joinDetail([amount, event.note ? shorten(event.note) : null]);
  }
}

const DISPUTE_EVENT_TITLES: Record<string, { title: string; tone: TimelineTone }> = {
  opened: { title: "Sengketa dibuka, akses pembeli dijeda", tone: "danger" },
  resolved_lost: { title: "Sengketa kalah", tone: "danger" },
  resolved_won: { title: "Sengketa dimenangkan", tone: "success" },
};

/** Builds the ordered entries from rows already read. Pure: no clock, no database. */
function buildOrderTimeline(input: TimelineInput): TimelineEntry[] {
  const { order } = input;
  const rows: Array<TimelineEntry & { rank: number; sequence: number }> = [];
  const add = (entry: Omit<TimelineEntry, "at" | "href" | "hrefLabel" | "detail"> & { at: Date; detail?: string | null; href?: string | null; hrefLabel?: string | null; rank: number; sequence?: number }) => {
    rows.push({
      actor: entry.actor,
      at: entry.at.toISOString(),
      detail: entry.detail ?? null,
      href: entry.href ?? null,
      hrefLabel: entry.hrefLabel ?? null,
      key: entry.key,
      rank: entry.rank,
      sequence: entry.sequence ?? 0,
      source: entry.source,
      title: entry.title,
      tone: entry.tone,
    });
  };
  const person = (userId: string | null | undefined) => userName(input.users, input.ownerEmail, userId, input.buyerId);

  add({
    actor: "Pembeli",
    at: input.intentCreatedAt,
    key: `intent:${order.id}`,
    rank: RANK.intent,
    source: "payment",
    title: "Pembeli menyetujui Syarat Pembelian dan memulai checkout",
    tone: "neutral",
  });

  for (const audit of input.audits) {
    if (AUDIT_ACTIONS_NOT_SHOWN.has(audit.action)) continue;
    // Refund and dispute steps come from their own records below, which also carry who did what.
    if ((audit.action.startsWith("refund.") || (audit.action.startsWith("dispute.") && !audit.action.startsWith("dispute.export."))) && audit.targetType === "payment_order") continue;
    const label = paymentAuditLabel(audit.action);
    if (!label) continue;
    const metadata = audit.metadata ?? {};
    const actor = person(audit.actorUserId);
    const isFraud = audit.action.startsWith("fraud.");
    let detail: string | null = null;
    let rank: number = RANK.orderState;
    let defaultActor = "Sistem";
    let source: TimelineSource = "audit";
    let href: string | null = null;
    let hrefLabel: string | null = null;

    switch (audit.action) {
      case "payment.order.created":
        rank = RANK.orderCreated;
        defaultActor = "Pembeli";
        detail = joinDetail([
          formatRupiah(order.amountRupiah),
          `Bayar sebelum ${timeFormat.format(order.expiresAt)}`,
          order.buyerIp ? `Dari alamat ${maskIp(order.buyerIp)}` : null,
        ]);
        break;
      case "payment.order.paid":
        defaultActor = "Penyedia pembayaran";
        detail = formatRupiah(order.amountRupiah);
        break;
      case "payment.order.failed":
      case "payment.order.expired":
        defaultActor = "Penyedia pembayaran";
        break;
      case "payment.order.review":
        defaultActor = "Penyedia pembayaran";
        detail = paymentEventReasonLabel(text(metadata.reason));
        break;
      case "payment.order.review_accepted":
        detail = metadata.delivery === "delivered" ? "Akses sudah diberikan." : metadata.delivery === "pending" ? "Akses belum bisa diberikan, akan dicoba lagi." : null;
        break;
      case "payment.order.delivery_pending":
        rank = RANK.deliveryPending;
        detail = PENDING_REASON_LABELS[text(metadata.reason) ?? ""] ?? null;
        break;
      case "dispute.export.created":
      case "dispute.export.downloaded":
      case "dispute.export.refused":
        rank = RANK.export;
        source = "export";
        break;
      default:
        if (isFraud) {
          rank = RANK.fraud;
          source = "fraud";
          if (audit.targetType === "fraud_case" && audit.targetId) {
            href = `/admin/fraud/${audit.targetId}`;
            hrefLabel = "Buka kasus";
            const found = input.cases.find((item) => item.id === audit.targetId);
            detail = found && isFraudSignal(found.signal) ? FRAUD_SIGNALS[found.signal].label : null;
          }
        }
    }
    add({
      actor: actor ?? defaultActor,
      at: audit.occurredAt,
      detail,
      href,
      hrefLabel,
      key: `audit:${audit.id}`,
      rank,
      source,
      title: label.label,
      tone: label.tone,
    });
  }

  for (const [index, event] of input.events.entries()) {
    const title = PAYMENT_EVENT_TYPE_LABELS[event.type] ?? "Penyedia pembayaran mengirim kabar";
    const tone: TimelineTone = event.outcome === "quarantined" ? "danger"
      : event.outcome === "review" ? "attention"
      : event.outcome === "accepted" && (event.type === "succeeded" || event.type === "dispute_won") ? "success"
      : "neutral";
    add({
      actor: event.source === "reconciliation" ? "Pengecekan status ke penyedia" : "Penyedia pembayaran",
      at: event.receivedAt,
      detail: joinDetail([
        PAYMENT_EVENT_OUTCOME_LABELS[event.outcome] ?? null,
        paymentEventReasonLabel(event.reason),
        event.amountRupiah !== null ? formatRupiah(event.amountRupiah) : null,
        event.callerIp ? `Dari alamat ${maskIp(event.callerIp)}` : null,
      ]),
      key: `event:${event.id}`,
      rank: RANK.providerEvent,
      sequence: index,
      source: "payment",
      title,
      tone,
    });
  }

  for (const change of input.access) {
    const grants = change.kind === "grant" || change.kind === "extend";
    const titles: Record<string, string> = {
      extend: "Akses diperpanjang",
      grant: "Akses diberikan ke pembeli",
      pause: "Akses pembeli dijeda",
      resume: "Akses pembeli dilanjutkan",
      revoke: "Akses pembeli dicabut",
    };
    add({
      actor: person(change.actorUserId) ?? "Sistem",
      at: change.occurredAt,
      detail: joinDetail([
        change.planCode && grants ? accessPlanLabel(change.planCode) : null,
        change.endsAt && grants ? `Berlaku sampai ${dateFormat.format(change.endsAt)}` : null,
      ]),
      key: `access:${change.id}`,
      rank: grants ? RANK.accessGrant : RANK.accessChange,
      source: "access",
      title: titles[change.kind] ?? "Akses pembeli berubah",
      tone: change.kind === "revoke" ? "danger" : change.kind === "pause" ? "attention" : "success",
    });
  }

  if (input.receipt) {
    add({
      actor: "Sistem",
      at: input.receipt.createdAt,
      detail: `Nomor struk ${input.receipt.receiptNumber}`,
      key: `receipt:${input.receipt.id}`,
      rank: RANK.receipt,
      source: "receipt",
      title: "Struk dibuat",
      tone: "neutral",
    });
  }
  const CHANNELS: Record<string, string> = { email: "email", in_app: "pemberitahuan di aplikasi" };
  for (const [index, delivery] of input.deliveries.entries()) {
    const channel = CHANNELS[delivery.channel] ?? "saluran lain";
    const sent = delivery.outcome === "sent";
    add({
      actor: "Sistem",
      at: delivery.attemptedAt,
      detail: null,
      key: `delivery:${delivery.id}`,
      rank: RANK.delivery,
      sequence: index,
      source: "receipt",
      title: sent ? `Struk terkirim lewat ${channel}` : delivery.outcome === "skipped" ? `Struk tidak dikirim lewat ${channel}` : `Struk gagal dikirim lewat ${channel}`,
      tone: sent ? "success" : delivery.outcome === "skipped" ? "neutral" : "attention",
    });
  }
  for (const use of input.usage) {
    add({
      actor: "Pembeli",
      at: use.firstUsedAt,
      detail: `Hari ${dateFormat.format(new Date(`${use.jakartaDay}T12:00:00+07:00`))}`,
      key: `usage:${use.jakartaDay}`,
      rank: RANK.usage,
      source: "usage",
      title: "Pembeli memakai fitur berbayar",
      tone: "neutral",
    });
  }

  for (const refund of input.refunds) {
    for (const [index, event] of refund.events.entries()) {
      const meta = REFUND_EVENT_TITLES[event.kind] ?? { title: "Pengembalian dana diperbarui", tone: "neutral" as const };
      add({
        actor: refundActor(input, event.actorKind, event.actorEmail),
        at: event.at,
        detail: refundDetail(refund, event),
        key: `refund:${refund.id}:${event.version}:${event.kind}:${index}`,
        rank: RANK.refund,
        sequence: event.version * 10 + index,
        source: "refund",
        title: meta.title,
        tone: meta.tone,
      });
    }
  }
  for (const dispute of input.disputes) {
    for (const [index, event] of dispute.events.entries()) {
      const meta = DISPUTE_EVENT_TITLES[event.kind] ?? { title: "Sengketa diperbarui", tone: "neutral" as const };
      add({
        actor: refundActor(input, event.actorKind, event.actorEmail),
        at: event.at,
        detail: joinDetail([formatRupiah(dispute.amountRupiah), event.kind === "opened" ? shorten(dispute.reasonText) : event.note ? shorten(event.note) : null]),
        key: `dispute:${dispute.id}:${event.version}:${event.kind}:${index}`,
        rank: RANK.dispute,
        sequence: event.version * 10 + index,
        source: "dispute",
        title: meta.title,
        tone: meta.tone,
      });
    }
  }

  const HOLD_SCOPES: Record<string, string> = { buyer: "seluruh bukti pembeli", case: "bukti sebuah kasus", order: "bukti pesanan ini" };
  for (const hold of input.holds) {
    add({
      actor: person(hold.placedByUserId) ?? "Pemilik",
      at: hold.placedAt,
      detail: `Menahan ${HOLD_SCOPES[hold.scope] ?? "bukti"}`,
      key: `hold:${hold.id}:placed`,
      rank: RANK.hold,
      source: "retention",
      title: "Bukti ditahan, tidak akan dihapus",
      tone: "attention",
    });
    if (hold.releasedAt) {
      add({
        actor: person(hold.releasedByUserId) ?? "Pemilik",
        at: hold.releasedAt,
        key: `hold:${hold.id}:released`,
        rank: RANK.hold,
        source: "retention",
        title: "Penahanan bukti dilepas",
        tone: "neutral",
      });
    }
  }
  if (input.scrubbedAt) {
    add({
      actor: "Sistem",
      at: input.scrubbedAt,
      detail: "Pesanan dan pembayarannya tetap disimpan.",
      key: `scrub:${order.id}`,
      rank: RANK.scrub,
      source: "retention",
      title: "Alamat IP dan perangkat pembeli dihapus sesuai kebijakan retensi",
      tone: "neutral",
    });
  }

  rows.sort((a, b) => a.at.localeCompare(b.at) || a.rank - b.rank || a.sequence - b.sequence || a.key.localeCompare(b.key));
  return rows.map((row) => ({
    actor: row.actor,
    at: row.at,
    detail: row.detail,
    href: row.href,
    hrefLabel: row.hrefLabel,
    key: row.key,
    source: row.source,
    title: row.title,
    tone: row.tone,
  }));
}

function userIdByEmail(users: Map<string, UserRef>, email: string | null) {
  if (!email) return null;
  for (const user of users.values()) if (user.email === email) return user.id;
  return null;
}

/** Everything the builder needs for one order, read with one consistent set of queries. */
async function loadTimelineInput(db: Db, orderId: string): Promise<TimelineInput | null> {
  const [order = null] = await db.$queryRaw<Array<{
    amountRupiah: number;
    buyerId: string;
    buyerIp: string | null;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    intentCreatedAt: Date;
  }>>`
    SELECT o.id, o.buyer_id AS "buyerId", o.amount_rupiah AS "amountRupiah", o.created_at AS "createdAt",
           o.expires_at AS "expiresAt", host(o.buyer_ip) AS "buyerIp", i.created_at AS "intentCreatedAt"
    FROM payment_orders o JOIN checkout_intents i ON i.id = o.intent_id
    WHERE o.id = ${orderId}::uuid
  `;
  if (!order) return null;

  const [refunds, disputes] = await Promise.all([listRefundRecords(db, orderId), listDisputeRecords(db, orderId)]);

  const audits = await db.$queryRaw<AuditRow[]>`
    SELECT a.id, a.action, a.actor_user_id AS "actorUserId", a.target_type AS "targetType", a.target_id AS "targetId",
           a.metadata, a.occurred_at AS "occurredAt"
    FROM audit_logs a
    WHERE (a.target_type = 'payment_order' AND a.target_id = ${orderId}::uuid)
       OR (a.target_type = 'fraud_case' AND a.target_id IN (SELECT id FROM fraud_cases WHERE order_id = ${orderId}::uuid))
    ORDER BY a.occurred_at, a.id
  `;
  const events = await db.$queryRaw<TimelineInput["events"]>`
    SELECT id, type::text AS type, source::text AS source, outcome::text AS outcome, reason,
           amount_rupiah AS "amountRupiah", host(caller_ip) AS "callerIp", received_at AS "receivedAt"
    FROM payment_events WHERE order_id = ${orderId}::uuid ORDER BY received_at, id
  `;
  const refundKeys = refunds.map((refund) => `refund:${refund.id}:revoke`);
  const disputeKeys = disputes.flatMap((dispute) => [`dispute:${dispute.id}:pause`, `dispute:${dispute.id}:resume`, `dispute:${dispute.id}:revoke`]);
  const access = await db.$queryRaw<TimelineInput["access"]>`
    SELECT id, kind::text AS kind, source::text AS source, actor_user_id AS "actorUserId", plan_code AS "planCode",
           ends_at AS "endsAt", occurred_at AS "occurredAt"
    FROM billing_access_events
    WHERE idempotency_key = ${`order:${orderId}`}
       OR idempotency_key = ANY(${[...refundKeys, ...disputeKeys]}::text[])
    ORDER BY occurred_at, id
  `;
  const [receipt = null] = await db.$queryRaw<NonNullable<TimelineInput["receipt"]>[]>`
    SELECT id, receipt_number AS "receiptNumber", created_at AS "createdAt" FROM payment_receipts WHERE order_id = ${orderId}::uuid
  `;
  const deliveries = receipt
    ? await db.$queryRaw<TimelineInput["deliveries"]>`
        SELECT id, channel, outcome, attempted_at AS "attemptedAt" FROM receipt_deliveries
        WHERE receipt_id = ${receipt.id}::uuid ORDER BY attempted_at, id
      `
    : [];
  const usage = await db.$queryRaw<TimelineInput["usage"]>`
    SELECT jakarta_day::text AS "jakartaDay", first_used_at AS "firstUsedAt"
    FROM fulfillment_usage_events WHERE order_id = ${orderId}::uuid ORDER BY jakarta_day
  `;
  const cases = await db.$queryRaw<TimelineInput["cases"]>`
    SELECT id, signal, severity::text AS severity, opened_at AS "openedAt" FROM fraud_cases WHERE order_id = ${orderId}::uuid ORDER BY opened_at
  `;
  const holds = await db.$queryRaw<TimelineInput["holds"]>`
    SELECT h.id, h.scope, h.placed_at AS "placedAt", h.placed_by_user_id AS "placedByUserId",
           h.released_at AS "releasedAt", h.released_by_user_id AS "releasedByUserId"
    FROM legal_holds h
    WHERE (h.scope = 'order' AND h.subject_id = ${orderId}::uuid)
       OR (h.scope = 'buyer' AND h.subject_id = ${order.buyerId}::uuid)
       OR (h.scope = 'case' AND (
            (h.case_kind = 'refund' AND h.subject_id IN (SELECT id FROM refund_cases WHERE order_id = ${orderId}::uuid))
         OR (h.case_kind = 'dispute' AND h.subject_id IN (SELECT id FROM payment_disputes WHERE order_id = ${orderId}::uuid))
         OR (h.case_kind = 'fraud' AND h.subject_id IN (SELECT id FROM fraud_cases WHERE order_id = ${orderId}::uuid))))
    ORDER BY h.placed_at, h.id
  `;
  const [scrub = null] = await db.$queryRaw<Array<{ scrubbedAt: Date }>>`
    SELECT scrubbed_at AS "scrubbedAt" FROM retention_scrubs WHERE order_id = ${orderId}::uuid
  `;

  const userIds = [...new Set([
    ...audits.map((audit) => audit.actorUserId),
    ...access.map((change) => change.actorUserId),
    ...holds.flatMap((hold) => [hold.placedByUserId, hold.releasedByUserId]),
  ].filter((id): id is string => Boolean(id)))];
  const emails = [...new Set([...refunds, ...disputes].flatMap((record) => record.events.map((event) => event.actorEmail)).filter((email): email is string => Boolean(email)))];
  const people = userIds.length > 0 || emails.length > 0
    ? await db.$queryRaw<UserRef[]>`
        SELECT id, email, full_name AS "fullName" FROM users
        WHERE id = ANY(${userIds}::uuid[]) OR email = ANY(${emails}::text[])
      `
    : [];

  return {
    access,
    audits,
    buyerId: order.buyerId,
    cases,
    deliveries,
    disputes,
    events,
    holds,
    intentCreatedAt: order.intentCreatedAt,
    order,
    ownerEmail: getFraudOwnerEmail(),
    receipt,
    refunds,
    scrubbedAt: scrub?.scrubbedAt ?? null,
    usage,
    users: new Map(people.map((person) => [person.id, person])),
  };
}

/**
 * The timeline of one order, or its purged state: an order removed under the
 * retention policy has no records left to read, so the answer is the tombstone
 * and no entries at all. Null when the order never existed.
 */
async function getOrderTimeline(orderId: string, db: Db = prisma): Promise<OrderTimeline | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(orderId)) return null;
  const input = await loadTimelineInput(db, orderId);
  if (!input) {
    const retention = await getOrderRetention(orderId, db as typeof prisma);
    return retention?.kind === "purged" ? { kind: "purged", purgedAt: retention.purgedAt, reference: retention.reference } : null;
  }
  return { entries: buildOrderTimeline(input), kind: "present" };
}

export { buildOrderTimeline, getOrderTimeline, loadTimelineInput };
export type { OrderTimeline, TimelineEntry, TimelineInput, TimelineSource, TimelineTone };
