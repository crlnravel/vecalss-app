import { cookies } from "next/headers";

import { RoleName, SessionStatus, UserStatus } from "@/generated/prisma/client";
import { isProduction } from "@/lib/config";
import { prisma } from "@/lib/prisma";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./constants";
import { createOpaqueToken, hashToken } from "./crypto";
import type { SessionContext } from "./types";

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  });
}

async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

async function createSession(userId: string) {
  const rawToken = createOpaqueToken();
  const refreshTokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.authSession.create({
    data: {
      expiresAt,
      issuedAt: now,
      refreshTokenHash,
      status: SessionStatus.active,
      userId,
    },
  });

  await setSessionCookie(rawToken);

  return session;
}

async function revokeSessionByHash(refreshTokenHash: string) {
  const now = new Date();

  await prisma.authSession.updateMany({
    data: {
      revokedAt: now,
      status: SessionStatus.revoked,
    },
    where: {
      refreshTokenHash,
      status: SessionStatus.active,
    },
  });
}

async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await revokeSessionByHash(hashToken(sessionToken));
  }

  await clearSessionCookie();
}

async function revokeAllUserSessions(userId: string) {
  const now = new Date();

  await prisma.authSession.updateMany({
    data: {
      revokedAt: now,
      status: SessionStatus.revoked,
    },
    where: {
      status: SessionStatus.active,
      userId,
    },
  });
}

async function getSessionContext() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  const refreshTokenHash = hashToken(sessionToken);
  const now = new Date();
  const session = await prisma.authSession.findFirst({
    include: {
      user: {
        include: {
          roleAssignments: true,
          studentProfile: true,
        },
      },
    },
    where: {
      expiresAt: {
        gt: now,
      },
      refreshTokenHash,
      revokedAt: null,
      status: SessionStatus.active,
    },
  });

  if (!session?.user) {
    return null;
  }

  const isStudent = session.user.roleAssignments.some(
    (assignment) => assignment.revokedAt === null && assignment.role === RoleName.student,
  );

  if (isStudent && !session.user.studentProfile) {
    session.user.studentProfile = await prisma.studentProfile.upsert({
      create: {
        displayName: session.user.fullName,
        userId: session.user.id,
      },
      update: {},
      where: {
        userId: session.user.id,
      },
    });
  }

  const mapped: SessionContext = {
    expiresAt: session.expiresAt,
    sessionId: session.id,
    user: {
      email: session.user.email,
      fullName: session.user.fullName,
      id: session.user.id,
      mustChangePassword: session.user.mustChangePassword,
      onboardingStatus: session.user.studentProfile?.onboardingStatus ?? null,
      roles: session.user.roleAssignments
        .filter((assignment) => assignment.revokedAt === null)
        .map((assignment) => assignment.role),
      status: session.user.status,
    },
  };

  const lockExpired = mapped.user.status === UserStatus.locked
    && session?.user.lockedUntil
    && session.user.lockedUntil <= now;

  if (lockExpired) {
    await prisma.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        status: UserStatus.active,
      },
      where: {
        id: mapped.user.id,
      },
    });

    mapped.user.status = UserStatus.active;
  }

  if (
    mapped.user.status === UserStatus.disabled
    || mapped.user.status === UserStatus.soft_deleted
    || (mapped.user.status === UserStatus.locked && session?.user.lockedUntil && session.user.lockedUntil > now)
  ) {
    return null;
  }

  await prisma.authSession.update({
    data: {
      lastSeenAt: now,
    },
    where: {
      id: mapped.sessionId,
    },
  });

  return mapped;
}

function hasRole(session: SessionContext | null, role: RoleName) {
  return Boolean(session?.user.roles.includes(role));
}

export {
  clearSessionCookie,
  createSession,
  getSessionContext,
  hasRole,
  revokeAllUserSessions,
  revokeCurrentSession,
  setSessionCookie,
};
