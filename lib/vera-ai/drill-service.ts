import "server-only";

import { createHmac } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { assertMvpFeatureEnabled, canonicalJson } from "./contracts";
import { EnvelopeService, type AiEncryptedPayload } from "./envelope";

type DbClient = typeof defaultPrisma;

export class VeraDrillError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "VeraDrillError";
  }
}

type RenderOption = { key: string; content: string };
type ScoringSnapshot = { correctOptionKey: string; explanation: string | null };

function jsonObject(value: string): unknown {
  try { return JSON.parse(value); } catch { throw new VeraDrillError("result_unavailable", 503); }
}

export class VeraDrillService {
  constructor(private readonly db: DbClient, private readonly envelope: EnvelopeService, private readonly tokenSecret: string) {
    if (!tokenSecret.trim()) throw new VeraDrillError("vera_config_missing", 503);
  }

  private token(studentId: string, sessionId: string, itemId: string, revisionDigest: string): string {
    return createHmac("sha256", this.tokenSecret).update(canonicalJson({ v: "1", studentId, sessionId, itemId, revisionDigest })).digest("base64url");
  }

  private fingerprint(value: unknown): string {
    return createHmac("sha256", this.tokenSecret).update(canonicalJson(value)).digest("hex");
  }

  private async decrypt<T>(value: Prisma.JsonValue): Promise<T> {
    return jsonObject(await this.envelope.decryptTextAsync(value as unknown as AiEncryptedPayload)) as T;
  }

  private async ownedSession(studentId: string, sessionId: string) {
    const session = await this.db.adaptivePracticeSession.findFirst({
      where: { id: sessionId, studentId, lifecycleState: "active", deletionState: "active" },
      include: { items: { orderBy: { ordinal: "asc" }, include: { answers: true } }, answers: true },
    });
    if (!session) throw new VeraDrillError("target_unavailable", 404);
    return session;
  }

  async readSession(studentId: string, sessionId: string) {
    const session = await this.ownedSession(studentId, sessionId);
    const items = await Promise.all(session.items.map(async (item) => ({
      id: item.id,
      ordinal: item.ordinal,
      itemRevisionToken: this.token(studentId, session.id, item.id, item.questionRevisionDigest),
      prompt: await this.envelope.decryptTextAsync(item.promptSnapshotCiphertext as unknown as AiEncryptedPayload),
      options: await this.decrypt<RenderOption[]>(item.optionSnapshotCiphertext!),
      answer: item.answers[0] ? { selectedOptionKey: item.answers[0].selectedOptionKey, answeredAt: item.answers[0].answeredAt.toISOString() } : null,
    })));
    return { id: session.id, revision: session.revision, status: session.status, startedAt: session.startedAt.toISOString(), submittedAt: session.submittedAt?.toISOString() ?? null, itemCount: items.length, answeredCount: session.answers.length, items };
  }

  async answer(input: { studentId: string; sessionId: string; clientAnswerId: string; expectedSessionRevision: number; adaptivePracticeItemId: string; itemRevisionToken: string; selectedOptionKey: string }) {
    assertMvpFeatureEnabled("drill", "adaptive-practice.answer");
    if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(input.clientAnswerId) || !/^[A-Za-z0-9_-]{1,16}$/u.test(input.selectedOptionKey)
      || input.itemRevisionToken.length > 120 || !Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 0) throw new VeraDrillError("invalid_request", 400);
    const fingerprint = this.fingerprint({ sessionId: input.sessionId, expectedSessionRevision: input.expectedSessionRevision, itemId: input.adaptivePracticeItemId, selectedOptionKey: input.selectedOptionKey, itemRevisionToken: input.itemRevisionToken });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM adaptive_practice_sessions WHERE id = ${input.sessionId}::uuid FOR UPDATE`;
      const session = await tx.adaptivePracticeSession.findFirst({ where: { id: input.sessionId, studentId: input.studentId, lifecycleState: "active", deletionState: "active" } });
      if (!session) throw new VeraDrillError("target_unavailable", 404);
      await tx.$queryRaw`SELECT id FROM adaptive_practice_items WHERE id = ${input.adaptivePracticeItemId}::uuid ORDER BY id FOR UPDATE`;
      const item = await tx.adaptivePracticeItem.findFirst({ where: { id: input.adaptivePracticeItemId, adaptiveSessionId: session.id } });
      if (!item || this.token(input.studentId, session.id, item.id, item.questionRevisionDigest) !== input.itemRevisionToken) throw new VeraDrillError("target_unavailable", 404);
      await tx.$queryRaw`SELECT id FROM adaptive_practice_answers WHERE adaptive_practice_item_id = ${item.id}::uuid ORDER BY id FOR UPDATE`;
      const replay = await tx.adaptivePracticeAnswer.findUnique({ where: { adaptiveSessionId_clientAnswerId: { adaptiveSessionId: session.id, clientAnswerId: input.clientAnswerId } } });
      if (replay) {
        if (replay.answerFingerprint !== fingerprint) throw new VeraDrillError("answer_idempotency_conflict", 409);
        return { answer: { id: replay.id, adaptivePracticeItemId: replay.adaptivePracticeItemId, selectedOptionKey: replay.selectedOptionKey, answeredAt: replay.answeredAt.toISOString() }, sessionRevision: session.revision, replayed: true };
      }
      const recorded = await tx.adaptivePracticeAnswer.findUnique({ where: { adaptivePracticeItemId: item.id } });
      if (recorded) throw new VeraDrillError("answer_already_recorded", 409);
      if (session.status !== "in_progress" || session.revision !== input.expectedSessionRevision) throw new VeraDrillError("session_revision_conflict", 409);
      const options = await this.decrypt<RenderOption[]>(item.optionSnapshotCiphertext!);
      if (!options.some((option) => option.key === input.selectedOptionKey)) throw new VeraDrillError("invalid_option", 400);
      const answer = await tx.adaptivePracticeAnswer.create({ data: { adaptiveSessionId: session.id, adaptivePracticeItemId: item.id, clientAnswerId: input.clientAnswerId, answerFingerprint: fingerprint, selectedOptionKey: input.selectedOptionKey, itemRevisionDigest: item.questionRevisionDigest, answerText: null, questionId: null } });
      await tx.adaptivePracticeSession.update({ where: { id: session.id }, data: { revision: { increment: 1 } } });
      return { answer: { id: answer.id, adaptivePracticeItemId: answer.adaptivePracticeItemId, selectedOptionKey: answer.selectedOptionKey, answeredAt: answer.answeredAt.toISOString() }, sessionRevision: session.revision + 1, replayed: false };
    });
  }

  async submit(input: { studentId: string; sessionId: string; clientSubmissionId: string; expectedSessionRevision: number }) {
    assertMvpFeatureEnabled("drill", "adaptive-practice.submit");
    if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(input.clientSubmissionId) || !Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 0) throw new VeraDrillError("invalid_request", 400);
    const fingerprint = this.fingerprint({ sessionId: input.sessionId, expectedSessionRevision: input.expectedSessionRevision });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM adaptive_practice_sessions WHERE id = ${input.sessionId}::uuid FOR UPDATE`;
      const session = await tx.adaptivePracticeSession.findFirst({ where: { id: input.sessionId, studentId: input.studentId, lifecycleState: "active", deletionState: "active" } });
      if (!session) throw new VeraDrillError("target_unavailable", 404);
      if (session.status === "scored") {
        if (session.submissionClientId === input.clientSubmissionId && session.submissionFingerprint !== fingerprint) throw new VeraDrillError("submission_idempotency_conflict", 409);
        return { result: await this.readResultFromTx(tx, input.studentId, session.id), replayed: true };
      }
      if (session.status !== "in_progress" || session.revision !== input.expectedSessionRevision) throw new VeraDrillError("session_revision_conflict", 409);
      await tx.$queryRaw`SELECT id FROM adaptive_practice_items WHERE adaptive_session_id = ${session.id}::uuid ORDER BY ordinal, id FOR UPDATE`;
      const items = await tx.adaptivePracticeItem.findMany({ where: { adaptiveSessionId: session.id }, orderBy: { ordinal: "asc" }, include: { answers: true } });
      if (!items.length || items.some((item) => item.answers.length !== 1)) throw new VeraDrillError("session_incomplete", 409);
      await tx.$queryRaw`SELECT id FROM adaptive_practice_answers WHERE adaptive_session_id = ${session.id}::uuid ORDER BY adaptive_practice_item_id, id FOR UPDATE`;
      const scoredResults = await Promise.all(
        items.map(async (item) => {
          const answer = item.answers[0]!;
          const scoring = await this.decrypt<ScoringSnapshot>(item.scoringSnapshotCiphertext);
          const isCorrect = answer.selectedOptionKey === scoring.correctOptionKey;
          await tx.adaptivePracticeAnswer.update({ where: { id: answer.id }, data: { isCorrect, version: { increment: 1 } } });
          return isCorrect;
        }),
      );
      const correctCount = scoredResults.filter(Boolean).length;
      const clockRows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
      const submittedAt = clockRows[0]?.now;
      if (!(submittedAt instanceof Date)) throw new VeraDrillError("vera_unavailable", 503);
      await tx.adaptivePracticeSession.update({ where: { id: session.id }, data: { status: "scored", score: new Prisma.Decimal((correctCount / items.length) * 100), submittedAt, submissionClientId: input.clientSubmissionId, submissionFingerprint: fingerprint, revision: { increment: 1 } } });
      return { result: await this.readResultFromTx(tx, input.studentId, session.id), replayed: false };
    });
  }

  async result(studentId: string, sessionId: string) {
    return this.db.$transaction((tx) => this.readResultFromTx(tx, studentId, sessionId));
  }

  private async readResultFromTx(tx: Prisma.TransactionClient, studentId: string, sessionId: string) {
    const session = await tx.adaptivePracticeSession.findFirst({ where: { id: sessionId, studentId, lifecycleState: "active", deletionState: "active" }, include: { items: { orderBy: { ordinal: "asc" }, include: { answers: true } } } });
    if (!session) throw new VeraDrillError("target_unavailable", 404);
    const items = await Promise.all(session.items.map(async (item) => {
      const answer = item.answers[0] ?? null;
      const scoring = session.status === "scored" ? await this.envelope.forClient(tx).decryptTextAsync(item.scoringSnapshotCiphertext as unknown as AiEncryptedPayload).then((value) => jsonObject(value) as ScoringSnapshot) : null;
      const answerReleased = session.status === "scored" && item.answerReleaseState === "released";
      const explanationReleased = session.status === "scored" && item.explanationReleaseState === "released";
      return {
        adaptivePracticeItemId: item.id,
        ordinal: item.ordinal,
        selectedOptionKey: answer?.selectedOptionKey ?? null,
        answerReviewState: answerReleased ? "released" as const : "unavailable" as const,
        explanationState: explanationReleased ? "released" as const : "unavailable" as const,
        ...(answerReleased ? { correctness: answer?.isCorrect ?? false } : {}),
        ...(explanationReleased && scoring?.explanation ? { explanation: scoring.explanation } : {}),
      };
    }));
    return { id: session.id, revision: session.revision, status: session.status, submittedAt: session.submittedAt?.toISOString() ?? null, ...(session.status === "scored" ? { score: session.score?.toNumber() ?? null } : {}), items };
  }
}
