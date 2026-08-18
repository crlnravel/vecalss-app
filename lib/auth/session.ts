import { cookies } from "next/headers";

import { RoleName, SessionStatus, UserStatus } from "@/generated/prisma/client";
import { isDebugAccountSwitcherEnabled, isProduction } from "@/lib/config";
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

  const session = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{
      soft_deleted_at: Date | null;
      status: UserStatus;
    }>>`
      SELECT status, soft_deleted_at
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

    const user = users[0];

    if (!user || user.status !== UserStatus.active || user.soft_deleted_at !== null) {
      return null;
    }

    return tx.authSession.create({
      data: {
        expiresAt,
        issuedAt: now,
        refreshTokenHash,
        status: SessionStatus.active,
        userId,
      },
    });
  });

  if (!session) {
    return null;
  }

  await setSessionCookie(rawToken);

  return session;
}

/**
 * Replace the current browser session with another active user's session.
 *
 * The new session is created before the previous session is revoked inside
 * one transaction, so a failed account-state check leaves the caller signed
 * in with the original session.
 */
async function switchSessionToUser(userId: string) {
  if (!isDebugAccountSwitcherEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const previousTokenHash = previousToken ? hashToken(previousToken) : null;
  const rawToken = createOpaqueToken();
  const refreshTokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{
      soft_deleted_at: Date | null;
      status: UserStatus;
    }>>`
      SELECT status, soft_deleted_at
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

    const user = users[0];
    if (!user || user.status !== UserStatus.active || user.soft_deleted_at !== null) {
      return null;
    }

    const nextSession = await tx.authSession.create({
      data: {
        expiresAt,
        issuedAt: now,
        refreshTokenHash,
        status: SessionStatus.active,
        userId,
      },
    });

    if (previousTokenHash) {
      await tx.authSession.updateMany({
        data: {
          revokedAt: now,
          status: SessionStatus.revoked,
        },
        where: {
          refreshTokenHash: previousTokenHash,
          status: SessionStatus.active,
        },
      });
    }

    return nextSession;
  });

  if (!session) {
    return null;
  }

  await setSessionCookie(rawToken);

  return session;
}

type CreateSessionIfUserStateMatchesInput = {
  expectedFailedLoginCount: number;
  expectedLockedUntil: Date | null;
  expectedMustChangePassword: boolean;
  expectedPasswordHash: string;
  expectedPasswordUpdatedAt: Date | null;
  userId: string;
};

/**
 * Complete the post-bcrypt login transition and issue its session while the
 * account row is still locked. A password/reset/reissue/status mutation that
 * wins the race changes the credential generation marker (and usually the
 * credential fields), causing this conditional update to return zero and
 * preventing a stale login from creating a session.
 */
async function createSessionIfUserStateMatches(input: CreateSessionIfUserStateMatchesInput) {
  const rawToken = createOpaqueToken();
  const refreshTokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  const session = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      data: {
        failedLoginCount: 0,
        lastLoginAt: now,
        lockedUntil: null,
        status: UserStatus.active,
      },
      where: {
        failedLoginCount: input.expectedFailedLoginCount,
        id: input.userId,
        lockedUntil: input.expectedLockedUntil,
        mustChangePassword: input.expectedMustChangePassword,
        passwordHash: input.expectedPasswordHash,
        passwordUpdatedAt: input.expectedPasswordUpdatedAt,
        softDeletedAt: null,
        status: UserStatus.active,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return tx.authSession.create({
      data: {
        expiresAt,
        issuedAt: now,
        refreshTokenHash,
        status: SessionStatus.active,
        userId: input.userId,
      },
    });
  });

  if (!session) {
    return null;
  }

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

  // Legacy rows can retain active status after a soft-delete timestamp is
  // written. Reject before student-profile auto-provisioning or heartbeat
  // updates so an existing session cannot authorize side effects.
  if (session.user.softDeletedAt !== null) {
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
    const unlocked = await prisma.user.updateMany({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        status: UserStatus.active,
      },
      where: {
        id: mapped.user.id,
        softDeletedAt: null,
        status: UserStatus.locked,
      },
    });

    if (unlocked.count !== 1) {
      return null;
    }

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

/**
 * Read the current session without any authentication side effects.
 *
 * API preview/status endpoints use this path so an otherwise read-only
 * request cannot refresh the heartbeat, auto-provision a student profile, or
 * unlock an account as a consequence of authorization.
 */
async function getReadOnlySessionContextForToken(sessionToken: string) {
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

  // Do not perform the normal getSessionContext lock-expiry transition here:
  // this function is deliberately a pure read. A locked, disabled, or
  // soft-deleted account cannot authorize a preview request.
  if (
    session.user.softDeletedAt !== null
    || session.user.status === UserStatus.disabled
    || session.user.status === UserStatus.soft_deleted
    || session.user.status === UserStatus.locked
  ) {
    return null;
  }

  return {
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
  } satisfies SessionContext;
}

async function getReadOnlySessionContext() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getReadOnlySessionContextForToken(sessionToken ?? "");
}

function hasRole(session: SessionContext | null, role: RoleName) {
  return Boolean(session?.user.roles.includes(role));
}

export {
  clearSessionCookie,
  createSession,
  createSessionIfUserStateMatches,
  getSessionContext,
  getReadOnlySessionContext,
  getReadOnlySessionContextForToken,
  hasRole,
  revokeAllUserSessions,
  revokeCurrentSession,
  switchSessionToUser,
  setSessionCookie,
};
