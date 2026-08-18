import { RoleName, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import type { AuthenticatedUser } from "./types";

type DebugAccount = {
  email: string;
  fullName: string;
  id: string;
  mustChangePassword: boolean;
  onboardingStatus: AuthenticatedUser["onboardingStatus"];
  roles: RoleName[];
};

const debugAccountSelect = {
  email: true,
  fullName: true,
  id: true,
  mustChangePassword: true,
  roleAssignments: {
    select: { role: true },
    where: { revokedAt: null },
  },
  softDeletedAt: true,
  status: true,
  studentProfile: {
    select: { onboardingStatus: true },
  },
} as const;

const activeDebugAccountWhere = {
  roleAssignments: { some: { revokedAt: null } },
  softDeletedAt: null,
  status: UserStatus.active,
} as const;

function mapDebugAccount(user: {
  email: string;
  fullName: string;
  id: string;
  mustChangePassword: boolean;
  roleAssignments: Array<{ role: RoleName }>;
  softDeletedAt: Date | null;
  status: UserStatus;
  studentProfile: { onboardingStatus: AuthenticatedUser["onboardingStatus"] } | null;
}): DebugAccount | null {
  if (user.status !== UserStatus.active || user.softDeletedAt !== null) {
    return null;
  }

  const roles = user.roleAssignments.map((assignment) => assignment.role);
  if (roles.length === 0) {
    return null;
  }

  return {
    email: user.email,
    fullName: user.fullName,
    id: user.id,
    mustChangePassword: user.mustChangePassword,
    onboardingStatus: user.studentProfile?.onboardingStatus ?? null,
    roles,
  };
}

async function getDebugAccounts() {
  const users = await prisma.user.findMany({
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
    select: debugAccountSelect,
    where: activeDebugAccountWhere,
  });

  return users.flatMap((user) => {
    const account = mapDebugAccount(user);
    return account ? [account] : [];
  });
}

async function getDebugAccountById(id: string) {
  const user = await prisma.user.findFirst({
    select: debugAccountSelect,
    where: {
      ...activeDebugAccountWhere,
      id,
    },
  });

  return user ? mapDebugAccount(user) : null;
}

function toAuthenticatedUser(account: DebugAccount): AuthenticatedUser {
  return {
    email: account.email,
    fullName: account.fullName,
    id: account.id,
    mustChangePassword: account.mustChangePassword,
    onboardingStatus: account.onboardingStatus,
    roles: account.roles,
    status: UserStatus.active,
  };
}

export { getDebugAccountById, getDebugAccounts, toAuthenticatedUser };
export type { DebugAccount };
