import type { OnboardingStatus, RoleName, UserStatus } from "@/generated/prisma/client";

type LoginAudience = "student" | "tutor" | "admin";

type AuthenticatedUser = {
  email: string;
  fullName: string;
  id: string;
  mustChangePassword: boolean;
  onboardingStatus: OnboardingStatus | null;
  roles: RoleName[];
  status: UserStatus;
};

type SessionContext = {
  expiresAt: Date;
  sessionId: string;
  user: AuthenticatedUser;
};

export type { AuthenticatedUser, LoginAudience, SessionContext };
