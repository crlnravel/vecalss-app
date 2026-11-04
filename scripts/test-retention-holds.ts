import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { FraudAuthorityError } from "../lib/fraud/errors";
import { RetentionError } from "../lib/retention/errors";
import { placeLegalHold, releaseLegalHold } from "../lib/retention/holds";
import { getOrderRetention } from "../lib/retention/status";
import { requireOwner } from "../lib/fraud/authority";
import { prepareRefund } from "../lib/refunds/cases";
import { openFraudCase } from "../lib/fraud/cases";
import { createRuntimeLogin, ownerClient, ownerQuery, shiftOrderBack } from "./retention-test-kit";
import { cleanUp, ENV, OWNER_EMAIL, paidOrder, prisma, sessionFor, setupAuthority } from "./refund-test-kit";

/**
 * MS-10 phase A, legal holds: placed and released only by the owner (a verified
 * second factor and a written reason, re-checked against the database), stored
 * once and never deleted, on database time, with an audit event each; a hold on
 * an order, a buyer or a case suspends scrub and delete. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const REASON = "Pemeriksaan sengketa dengan penyedia pembayaran";

async function retentionError(work: () => Promise<unknown>, code: RetentionError["code"]) {
  await assert.rejects(work, (error: unknown) => error instanceof RetentionError && error.code === code, `expected a retention error: ${code}`);
}

async function main() {
  const authority = await setupAuthority();
  const { owner } = authority;
  const order = await paidOrder();

  // ---- Placing ---------------------------------------------------------------------------------------------------------------
  const placed = await placeLegalHold(owner, { env: ENV, reason: REASON, scope: "order", subjectId: order.id });
  const row = await prisma.legalHold.findUniqueOrThrow({ where: { id: placed.holdId } });
  assert.equal(row.scope, "order");
  assert.equal(row.subjectId, order.id);
  assert.equal(row.reason, REASON);
  assert.equal(row.placedByUserId, authority.ownerId);
  assert.equal(row.releasedAt, null);
  const [{ skew }] = await ownerQuery<{ skew: number }>("SELECT abs(extract(epoch FROM (now() - $1::timestamptz)))::float AS skew", [row.placedAt]);
  assert.ok(skew < 30, "placed_at is the database's time");
  const audit = await prisma.auditLog.findFirst({ where: { action: "retention.hold.placed", targetId: order.id } });
  assert.ok(audit, "placing a hold is audited");
  assert.equal(audit.actorUserId, authority.ownerId);
  assert.equal(JSON.stringify(audit.metadata).includes(REASON), false, "the audit event carries ids, not the written reason");
  const panel = await getOrderRetention(order.id);
  assert.ok(panel && panel.kind === "present" && panel.held && panel.holds.length === 1 && panel.holds[0].placedByEmail === OWNER_EMAIL);
  pass("the owner places a hold with a written reason; it is stored on database time, audited, and shown on the order");

  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "order", subjectId: order.id }), "already_held");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: "pendek", scope: "buyer", subjectId: order.buyerId }), "invalid_reason");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: "", scope: "buyer", subjectId: order.buyerId }), "invalid_reason");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: "x".repeat(501), scope: "buyer", subjectId: order.buyerId }), "invalid_reason");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "order", subjectId: randomUUID() }), "invalid_subject");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "order", subjectId: "not-a-uuid" }), "invalid_subject");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "case", subjectId: randomUUID() }), "invalid_subject");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "case", caseKind: "refund", subjectId: randomUUID() }), "invalid_subject");
  await retentionError(() => placeLegalHold(owner, { env: ENV, reason: REASON, scope: "bogus" as "order", subjectId: order.id }), "invalid_subject");
  pass("a second hold on the same subject, a short or missing reason, and an unknown order, buyer or case are all refused");

  // ---- Owner only ---------------------------------------------------------------------------------------------------------------
  const forged = { email: authority.otherEmail, userId: authority.otherId } as unknown as typeof owner;
  await assert.rejects(placeLegalHold(forged, { env: ENV, reason: REASON, scope: "buyer", subjectId: order.buyerId }), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
  await assert.rejects(releaseLegalHold(forged, { env: ENV, holdId: placed.holdId, reason: "Pemeriksaan selesai tanpa temuan" }), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
  assert.throws(() => requireOwner(sessionFor(authority.otherEmail, { id: authority.otherId }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL, { id: authority.ownerId, mfa: "challenge" }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "mfa_required");
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL, { id: authority.ownerId, roles: [] }), ENV), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_admin");
  assert.throws(() => requireOwner(sessionFor(OWNER_EMAIL, { id: authority.ownerId }), {}), (error: unknown) => error instanceof FraudAuthorityError && error.code === "owner_unset", "with no owner configured, nobody is the owner");
  // A context that was valid, then the owner role moved elsewhere, is refused at the database too.
  await assert.rejects(placeLegalHold(owner, { env: { FRAUD_OWNER_EMAIL: "someone-else@vecalss.local" }, reason: REASON, scope: "buyer", subjectId: order.buyerId }), (error: unknown) => error instanceof FraudAuthorityError && error.code === "not_owner");
  assert.equal(await prisma.legalHold.count({ where: { subjectId: order.buyerId } }), 0, "no refused attempt left a hold");
  const source = readFileSync(new URL("../modules/admin/retention-actions.ts", import.meta.url), "utf8");
  assert.match(source, /requireOwner\(session\)/u, "the server action re-checks owner authority on the server");
  assert.match(source, /requireAdminSession\(\)/u, "…after a verified admin session");
  pass("owner only: a second admin, a missing second factor, a non-admin, an unset owner and a changed owner are all refused, in the library and by the database");

  // ---- Releasing -------------------------------------------------------------------------------------------------------------------
  await retentionError(() => releaseLegalHold(owner, { env: ENV, holdId: placed.holdId, reason: "pendek" }), "invalid_reason");
  await retentionError(() => releaseLegalHold(owner, { env: ENV, holdId: randomUUID(), reason: "Pemeriksaan selesai tanpa temuan" }), "not_found");
  await releaseLegalHold(owner, { env: ENV, holdId: placed.holdId, reason: "Pemeriksaan selesai tanpa temuan" });
  const released = await prisma.legalHold.findUniqueOrThrow({ where: { id: placed.holdId } });
  assert.ok(released.releasedAt);
  assert.equal(released.releasedByUserId, authority.ownerId);
  assert.equal(released.releaseReason, "Pemeriksaan selesai tanpa temuan");
  assert.equal(released.reason, REASON, "the original reason is kept");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "retention.hold.released", targetId: order.id } }), "a release is audited");
  await retentionError(() => releaseLegalHold(owner, { env: ENV, holdId: placed.holdId, reason: "Dilepas untuk kedua kalinya" }), "already_released");
  const after = await getOrderRetention(order.id);
  assert.ok(after && after.kind === "present" && !after.held && after.holds.length === 1 && after.holds[0].releasedAt, "the released hold stays in the history");
  // After a release the subject can be held again.
  const again = await placeLegalHold(owner, { env: ENV, reason: REASON, scope: "order", subjectId: order.id });
  assert.notEqual(again.holdId, placed.holdId);
  await releaseLegalHold(owner, { env: ENV, holdId: again.holdId, reason: "Pemeriksaan selesai tanpa temuan" });
  pass("a hold is released once with a written reason on database time, audited, and kept in the history; the subject can be held again");

  // ---- Append-only in the database --------------------------------------------------------------------------------------------------------
  const client = await ownerClient();
  try {
    const refuse = async (sql: string, code = "55000", params: unknown[] = []) => {
      await client.query("BEGIN");
      try {
        await client.query(sql, params);
        assert.fail(`${sql} should be refused`);
      } catch (error) {
        assert.equal((error as { code?: string }).code, code, `${sql}: ${(error as Error).message}`);
      } finally {
        await client.query("ROLLBACK");
      }
    };
    await refuse("DELETE FROM legal_holds WHERE id = $1", "55000", [placed.holdId]);
    await refuse("TRUNCATE legal_holds");
    await refuse("UPDATE legal_holds SET reason = 'diubah setelah dipasang' WHERE id = $1", "55000", [placed.holdId]);
    await refuse("UPDATE legal_holds SET released_at = NULL, released_by_user_id = NULL, release_reason = NULL WHERE id = $1", "55000", [placed.holdId]);
    await refuse("UPDATE legal_holds SET release_reason = 'alasan lain yang panjang' WHERE id = $1", "55000", [placed.holdId]);
    await refuse("UPDATE legal_holds SET subject_id = gen_random_uuid() WHERE id = $1", "55000", [placed.holdId]);
    await refuse("INSERT INTO legal_holds (scope, subject_id, reason, placed_by_user_id, released_at, released_by_user_id, release_reason) VALUES ('order', $1, 'ditahan sekaligus dilepas', $2, now(), $2, 'dilepas sekaligus lagi')", "23514", [order.id, authority.ownerId]);
    await refuse("INSERT INTO legal_holds (scope, subject_id, reason, placed_by_user_id) VALUES ('order', $1, 'pendek', $2)", "23514", [order.id, authority.ownerId]);
    await refuse("INSERT INTO legal_holds (scope, subject_id, case_kind, reason, placed_by_user_id) VALUES ('order', $1, 'refund', 'alasan yang cukup panjang', $2)", "23514", [order.id, authority.ownerId]);
    // A release is stamped with the database's clock, whatever the caller sent.
    await client.query("BEGIN");
    const hold = (await client.query("INSERT INTO legal_holds (scope, subject_id, reason, placed_by_user_id, placed_at) VALUES ('order', $1, 'uji jam basis data', $2, '2001-01-01') RETURNING id, placed_at", [order.id, authority.ownerId])).rows[0];
    assert.ok(new Date(hold.placed_at).getFullYear() >= 2026, "a caller cannot backdate placed_at");
    await client.query("UPDATE legal_holds SET released_at = '2001-02-02', released_by_user_id = $2, release_reason = 'dilepas dengan jam palsu' WHERE id = $1", [hold.id, authority.ownerId]);
    const stamped = (await client.query("SELECT released_at FROM legal_holds WHERE id = $1", [hold.id])).rows[0];
    assert.ok(new Date(stamped.released_at).getFullYear() >= 2026, "a caller cannot backdate released_at");
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
  pass("holds are append-only in the database: no delete, truncate, edit or re-opening, a release needs a reason, and both timestamps are the database's");

  // ---- What a hold covers: buyer, order and each kind of case -----------------------------------------------------------------------------------
  const target = await paidOrder();
  const prepared = await prepareRefund(authority.admin, { orderId: target.id, reasonCode: "wrong_amount", requestChannel: "whatsapp", requestNote: "Pembeli menulis lewat WhatsApp dan minta uangnya dikembalikan." });
  const fraud = await prisma.$transaction((tx) =>
    openFraudCase(tx, { evidence: { orderId: target.id }, orderId: target.id, signal: "payment_review", subjectKey: `order:${target.id}`, subjectType: "order", userId: target.buyerId }),
  );
  const held = async () => (await ownerQuery<{ h: boolean }>("SELECT retention_order_held($1) AS h", [target.id]))[0].h;
  // An open refund case holds evidence on its own (its evidence_hold flag).
  assert.equal(await held(), true, "the refund case's evidence_hold flag holds the order");
  await setupClose(prepared.caseId);
  assert.equal(await held(), false, "with the case closed and no hold, nothing holds it");
  for (const input of [
    { caseKind: "refund" as const, scope: "case" as const, subjectId: prepared.caseId },
    { caseKind: "fraud" as const, scope: "case" as const, subjectId: fraud.id },
    { scope: "buyer" as const, subjectId: target.buyerId },
    { scope: "order" as const, subjectId: target.id },
  ]) {
    const hold = await placeLegalHold(owner, { env: ENV, reason: REASON, ...input });
    assert.equal(await held(), true, `a ${input.scope} hold${"caseKind" in input ? ` on a ${input.caseKind} case` : ""} holds the order`);
    await releaseLegalHold(owner, { env: ENV, holdId: hold.holdId, reason: "Pemeriksaan selesai tanpa temuan" });
    assert.equal(await held(), false, "released, it no longer holds");
  }
  // A hold on a case also protects a closed fraud case from deletion.
  const caseHold = await placeLegalHold(owner, { env: ENV, reason: REASON, scope: "case", caseKind: "fraud", subjectId: fraud.id });
  assert.equal((await ownerQuery<{ h: boolean }>("SELECT retention_fraud_case_held($1) AS h", [fraud.id]))[0].h, true);
  await releaseLegalHold(owner, { env: ENV, holdId: caseHold.holdId, reason: "Pemeriksaan selesai tanpa temuan" });
  await shiftOrderBack(target.id, "13 months");
  pass("holds on an order, a buyer, a refund case or a fraud case each hold the order, and a closed case's flag stops holding it");

  // ---- The runtime login does the same through the same checks; the database cannot know who the owner is, so the library does ------------------------------------
  const login = await createRuntimeLogin("holds");
  try {
    const runtime = await login.client();
    try {
      await assert.rejects(runtime.query("DELETE FROM legal_holds WHERE true"), (error: unknown) => (error as { code?: string }).code === "42501");
      await assert.rejects(runtime.query("UPDATE legal_holds SET reason = 'x' WHERE true"), (error: unknown) => (error as { code?: string }).code === "42501");
      await assert.rejects(runtime.query("TRUNCATE legal_holds"), (error: unknown) => (error as { code?: string }).code === "42501");
    } finally {
      await runtime.end();
    }
  } finally {
    await login.drop();
  }
  pass("the runtime login cannot delete, truncate or edit holds; only a release goes through the guarded columns");

  await cleanUp();
  await prisma.$disconnect();
  console.log(`retention holds: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

async function setupClose(caseId: string) {
  const { setupSql } = await import("./retention-test-kit");
  await setupSql("UPDATE refund_cases SET state = 'cancelled', closed_at = now(), closure_reason = 'withdrawn', evidence_hold = false WHERE id = $1", [caseId]);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
