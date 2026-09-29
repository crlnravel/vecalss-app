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
  previewPurpose: null,
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

const ROLE_ORDER: RoleName[] = [RoleName.admin, RoleName.developer, RoleName.affiliator, RoleName.tutor, RoleName.student];
const MAX_ACCOUNTS_PER_ROLE = 2;

const SEED_PRIORITY_EMAILS = [
  "admin@vecalss.local",
  "developer@vecalss.local",
  "affiliator@vecalss.local",
  "tutor@vecalss.local",
  "student@vecalss.local",
  "newstudent@vecalss.local",
  "dimas@vecalss.local",
  "leila@vecalss.local",
];

function getSeedPriority(email: string): number {
  const index = SEED_PRIORITY_EMAILS.indexOf(email.toLowerCase());
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function getDebugAccounts(): Promise<DebugAccount[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ fullName: "asc" }, { email: "asc" }],
    select: debugAccountSelect,
    where: activeDebugAccountWhere,
  });

  const accounts = users.flatMap((user) => {
    const account = mapDebugAccount(user);
    return account ? [account] : [];
  });

  const selectedAccountIds = new Set<string>();
  const result: DebugAccount[] = [];

  for (const role of ROLE_ORDER) {
    const roleAccounts = accounts
      .filter((account) => account.roles.includes(role))
      .sort((a, b) => {
        const priorityA = getSeedPriority(a.email);
        const priorityB = getSeedPriority(b.email);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.fullName.localeCompare(b.fullName) || a.email.localeCompare(b.email);
      });

    const topForRole = roleAccounts.slice(0, MAX_ACCOUNTS_PER_ROLE);
    for (const account of topForRole) {
      if (!selectedAccountIds.has(account.id)) {
        selectedAccountIds.add(account.id);
        result.push(account);
      }
    }
  }

  return result;
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
