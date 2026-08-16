import "server-only";

import { randomUUID } from "node:crypto";

import {
  NotificationChannel,
  NotificationEventType,
  NotificationStatus,
  Prisma,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import { isUuid } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import type { StudentNotificationItem } from "@/lib/notifications/types";

const DEFAULT_NOTIFICATION_LIMIT = 20;
const MAX_NOTIFICATION_LIMIT = 50;
const MAX_NOTIFICATION_BODY_LENGTH = 4000;
const ZOOM_LINK_PATTERN = /https:\/\/(?:[a-z0-9-]+\.)?zoom\.(?:us|com)(?:[/:?#]|$)/iu;

type NotificationFeed = {
  items: StudentNotificationItem[];
  unreadCount: number;
};

type StudentNotificationDetail = {
  body: string;
  external: boolean;
  href: string;
  id: string;
  time: string;
  title: string;
  unread: boolean;
};

type SendKelasNotificationInput = {
  actorUserId: string;
  body: string;
  cohortId: string;
  title: string;
};

class KelasNotificationError extends Error {
  code:
    | "cohort_empty"
    | "invalid_cohort_id"
    | "cohort_not_found"
    | "invalid_body"
    | "invalid_title";

  constructor(
    code: KelasNotificationError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "KelasNotificationError";
  }
}

function activeNotificationWhere(userId: string, now: Date) {
  return {
    recipientUserId: userId,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: now } },
    ],
  };
}

function normalizeLimit(limit?: number) {
  if (!Number.isFinite(limit)) {
    return DEFAULT_NOTIFICATION_LIMIT;
  }

  return Math.min(MAX_NOTIFICATION_LIMIT, Math.max(1, Math.floor(limit ?? DEFAULT_NOTIFICATION_LIMIT)));
}

function formatNotificationTime(createdAt: Date, now: Date) {
  const age = Math.max(0, now.getTime() - createdAt.getTime());
  if (age < 60_000) {
    return "Baru saja";
  }

  if (age < 86_400_000) {
    return "Hari ini";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
    year: createdAt.getUTCFullYear() === now.getUTCFullYear() ? undefined : "numeric",
  }).format(createdAt);
}

function safeNotificationHref(deepLink: string | null) {
  if (!deepLink) {
    return { external: false, href: "/notifications" };
  }

  if (/[\\\u0000-\u001f]/u.test(deepLink)) {
    return { external: false, href: "/notifications" };
  }

  if (
    deepLink.startsWith("/")
    && !deepLink.startsWith("//")
  ) {
    return { external: false, href: deepLink };
  }

  try {
    const parsed = new URL(deepLink);
    if (parsed.protocol === "https:") {
      return { external: true, href: parsed.toString() };
    }
  } catch {
    // Invalid legacy links are intentionally kept inside the notification page.
  }

  return { external: false, href: "/notifications" };
}

function validateKelasNotificationInput(input: Omit<SendKelasNotificationInput, "actorUserId" | "cohortId">) {
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title || title.length > 180) {
    throw new KelasNotificationError("invalid_title", "Judul notifikasi wajib diisi dan maksimal 180 karakter.");
  }

  if (!body || body.length > MAX_NOTIFICATION_BODY_LENGTH) {
    throw new KelasNotificationError("invalid_body", "Pesan notifikasi wajib diisi dan maksimal 4.000 karakter.");
  }

  return { body, title };
}

async function getStudentNotificationFeed({
  limit = DEFAULT_NOTIFICATION_LIMIT,
  userId,
}: {
  limit?: number;
  userId: string;
}): Promise<NotificationFeed> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const where = activeNotificationWhere(userId, now);
    const notifications = await tx.notification.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        body: true,
        createdAt: true,
        deepLink: true,
        id: true,
        readAt: true,
        title: true,
      },
      take: normalizeLimit(limit),
      where,
    });
    const unreadCount = await tx.notification.count({
      where: {
        ...where,
        readAt: null,
      },
    });

    return {
      items: notifications.map((notification) => ({
        detail: notification.body,
        ...safeNotificationHref(notification.deepLink),
        id: notification.id,
        time: formatNotificationTime(notification.createdAt, now),
        title: notification.title,
        unread: notification.readAt === null,
      })),
      unreadCount,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });
}

async function getStudentNotificationDetail({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}): Promise<StudentNotificationDetail | null> {
  if (!isUuid(notificationId)) {
    return null;
  }

  const now = new Date();
  const notification = await prisma.notification.findFirst({
    select: {
      body: true,
      createdAt: true,
      deepLink: true,
      id: true,
      readAt: true,
      title: true,
    },
    where: {
      ...activeNotificationWhere(userId, now),
      id: notificationId,
    },
  });

  if (!notification) {
    return null;
  }

  return {
    body: notification.body,
    ...safeNotificationHref(notification.deepLink),
    id: notification.id,
    time: formatNotificationTime(notification.createdAt, now),
    title: notification.title,
    unread: notification.readAt === null,
  };
}

async function getAndMarkStudentNotificationDetail({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}): Promise<StudentNotificationDetail | null> {
  if (!isUuid(notificationId)) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const notification = await tx.notification.findFirst({
      select: {
        body: true,
        createdAt: true,
        deepLink: true,
        id: true,
        readAt: true,
        title: true,
      },
      where: {
        ...activeNotificationWhere(userId, now),
        id: notificationId,
      },
    });

    if (!notification) {
      return null;
    }

    if (notification.readAt === null) {
      await tx.notification.update({
        data: { readAt: now },
        where: { id: notification.id },
      });
    }
    await tx.notificationDelivery.updateMany({
      data: {
        deliveredAt: now,
        status: NotificationStatus.read,
      },
      where: {
        channel: NotificationChannel.in_app,
        notificationId: notification.id,
      },
    });

    return {
      body: notification.body,
      ...safeNotificationHref(notification.deepLink),
      id: notification.id,
      time: formatNotificationTime(notification.createdAt, now),
      title: notification.title,
      unread: false,
    };
  });
}

async function markAllStudentNotificationsRead(userId: string) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const unreadNotifications = await tx.notification.findMany({
      select: { id: true },
      where: {
        ...activeNotificationWhere(userId, now),
        readAt: null,
      },
    });
    const notificationIds = unreadNotifications.map((notification) => notification.id);

    if (notificationIds.length === 0) {
      return { count: 0 };
    }

    await tx.notification.updateMany({
      data: { readAt: now },
      where: { id: { in: notificationIds } },
    });
    await tx.notificationDelivery.updateMany({
      data: {
        deliveredAt: now,
        status: NotificationStatus.read,
      },
      where: {
        channel: NotificationChannel.in_app,
        notificationId: { in: notificationIds },
      },
    });

    return { count: notificationIds.length };
  });
}

async function sendKelasNotification(input: SendKelasNotificationInput) {
  const cohortId = input.cohortId.trim();
  if (!isUuid(cohortId)) {
    throw new KelasNotificationError("invalid_cohort_id", "Pilih kelas sebelum mengirim notifikasi.");
  }

  const { body, title } = validateKelasNotificationInput(input);

  return prisma.$transaction(async (tx) => {
    const cohort = await tx.cohort.findFirst({
      select: {
        id: true,
        name: true,
        students: {
          select: { studentId: true },
          where: {
            leftAt: null,
            student: {
              roleAssignments: {
                some: {
                  revokedAt: null,
                  role: RoleName.student,
                },
              },
              softDeletedAt: null,
              status: UserStatus.active,
            },
          },
        },
      },
      where: {
        id: cohortId,
        isActive: true,
      },
    });

    if (!cohort) {
      throw new KelasNotificationError("cohort_not_found", "Kelas aktif yang dipilih tidak ditemukan.");
    }

    const recipientUserIds = [...new Set(cohort.students.map((student) => student.studentId))];
    if (recipientUserIds.length === 0) {
      throw new KelasNotificationError("cohort_empty", "Kelas ini belum memiliki siswa aktif untuk menerima notifikasi.");
    }

    const now = new Date();
    const notificationRows = recipientUserIds.map((recipientUserId) => ({
      body,
      createdAt: now,
      eventType: NotificationEventType.announcement,
      id: randomUUID(),
      priority: 1,
      recipientUserId,
      sourceEntityId: cohort.id,
      sourceEntityType: "cohort",
      title,
    }));

    await tx.notification.createMany({ data: notificationRows });
    await tx.notificationDelivery.createMany({
      data: notificationRows.map((notification) => ({
        channel: NotificationChannel.in_app,
        deliveredAt: now,
        notificationId: notification.id,
        queuedAt: now,
        status: NotificationStatus.delivered,
      })),
    });
    await tx.auditLog.create({
      data: {
        action: "notification.kelas_sent",
        actorUserId: input.actorUserId,
        metadata: {
          channel: NotificationChannel.in_app,
          cohortName: cohort.name,
          hasZoomLink: ZOOM_LINK_PATTERN.test(body),
          recipientCount: recipientUserIds.length,
        },
        targetId: cohort.id,
        targetType: "cohort",
      },
    });

    return {
      cohortName: cohort.name,
      recipientCount: recipientUserIds.length,
    };
  });
}

export {
  KelasNotificationError,
  getAndMarkStudentNotificationDetail,
  getStudentNotificationDetail,
  getStudentNotificationFeed,
  markAllStudentNotificationsRead,
  sendKelasNotification,
  validateKelasNotificationInput,
};
export type { NotificationFeed, SendKelasNotificationInput, StudentNotificationDetail };
