import "server-only";

import { randomUUID } from "node:crypto";

import { NotificationChannel, NotificationEventType, NotificationStatus, UserStatus } from "@/generated/prisma/client";
import { buildMentorTryoutAttemptHref } from "@/lib/navigation/canonical-context";
import { prisma } from "@/lib/prisma";
import { reviewRequiredReleasedAttemptIds } from "@/lib/tryout/result-repository";

const TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE = "tryout_result_review";
const MAX_OPEN_ALERTS = 20;

type TryoutResultReviewAlert = {
  body: string;
  createdAt: string;
  href: string;
  id: string;
  title: string;
};

/**
 * Tell the Tryout's organizer that a participant tried to open a released
 * result that failed its integrity check. One notification per attempt, ever:
 * a student reloading the page must not fill the Kapten's alerts.
 */
async function notifyTryoutResultReviewRequired(attemptId: string) {
  const attempt = await prisma.tryoutAttempt.findUnique({
    select: {
      admissionId: true,
      id: true,
      student: { select: { fullName: true } },
      tryout: { select: { createdBy: { select: { id: true, status: true } }, id: true, title: true } },
      tryoutId: true,
    },
    where: { id: attemptId },
  });
  const recipient = attempt?.tryout.createdBy;
  if (!attempt || !recipient || recipient.status !== UserStatus.active) return null;

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent first opens of the same result so only one alert is created.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE}:${attempt.id}`}))`;
    const existing = await tx.notification.findFirst({
      select: { id: true },
      where: { recipientUserId: recipient.id, sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE },
    });
    if (existing) return existing;

    const now = new Date();
    const participant = attempt.student.fullName.trim() || "Seorang peserta";
    const notification = await tx.notification.create({
      data: {
        body: `${participant} belum bisa membuka hasil Tryout “${attempt.tryout.title}”. Periksa pengerjaannya sebelum peserta mencoba lagi.`,
        createdAt: now,
        deepLink: buildMentorTryoutAttemptHref(attempt.tryoutId, attempt.id, { participant: attempt.admissionId, workspace: "participants" }),
        eventType: NotificationEventType.custom,
        id: randomUUID(),
        priority: 2,
        recipientUserId: recipient.id,
        sourceEntityId: attempt.id,
        sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE,
        title: "Hasil Tryout perlu diperiksa",
      },
    });
    await tx.notificationDelivery.create({
      data: { channel: NotificationChannel.in_app, deliveredAt: now, notificationId: notification.id, queuedAt: now, status: NotificationStatus.delivered },
    });
    return notification;
  });
}

/**
 * Open alerts for a Kapten's dashboard. An alert is shown only while its
 * attempt still fails the integrity check; once fixed it marks itself read.
 */
async function listOpenTryoutResultReviewAlerts(userId: string): Promise<TryoutResultReviewAlert[]> {
  const unread = await prisma.notification.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { body: true, createdAt: true, deepLink: true, id: true, sourceEntityId: true, title: true },
    take: MAX_OPEN_ALERTS,
    where: { readAt: null, recipientUserId: userId, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE },
  });
  if (!unread.length) return [];
  const stillBroken = await reviewRequiredReleasedAttemptIds(unread.flatMap((item) => (item.sourceEntityId ? [item.sourceEntityId] : [])));
  const resolved = unread.filter((item) => !item.sourceEntityId || !stillBroken.has(item.sourceEntityId));
  if (resolved.length) {
    await prisma.notification.updateMany({ data: { readAt: new Date() }, where: { id: { in: resolved.map((item) => item.id) }, readAt: null } });
  }
  return unread
    .filter((item) => item.sourceEntityId && stillBroken.has(item.sourceEntityId) && item.deepLink)
    .map((item) => ({ body: item.body, createdAt: item.createdAt.toISOString(), href: item.deepLink!, id: item.id, title: item.title }));
}

export { listOpenTryoutResultReviewAlerts, notifyTryoutResultReviewRequired, TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE };
export type { TryoutResultReviewAlert };
