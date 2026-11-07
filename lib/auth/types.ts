import type { OnboardingStatus, RoleName, UserStatus } from "@/generated/prisma/client";

/**
 * Where a session stands on the second factor. Only admin
 * accounts are ever anything but "not_required". Until "verified", the
 * session context does not carry the privileged roles at all.
 */
type MfaStatus = "not_required" | "verified" | "enroll" | "challenge" | "unavailable";

type LoginAudience = "student" | "tutor" | "admin" | "affiliator";

type AuthenticatedUser = {
  avatarUrl?: string | null;
  email: string;
  fullName: string;
  id: string;
  mfaStatus?: MfaStatus;
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

export type { AuthenticatedUser, LoginAudience, MfaStatus, SessionContext };
