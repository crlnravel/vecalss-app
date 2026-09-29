type TryoutAdmissionMode = "open" | "approval_required" | "invitation_only";

type TryoutAdmissionSession = {
  assessmentRelease?: unknown | null;
  assessmentReleaseId?: string | null;
  availableUntil: Date | number | string;
  id: string;
  isDefaultOpenRegistration: boolean;
  status: string;
};

function isTryoutSessionExpired(availableUntil: Date | number | string, now: Date) {
  const availableUntilTime = availableUntil instanceof Date
    ? availableUntil.getTime()
    : new Date(availableUntil).getTime();
  return !Number.isFinite(availableUntilTime) || availableUntilTime <= now.getTime();
}

function isTryoutAdmissionSessionAvailable(
  session: TryoutAdmissionSession,
  now: Date,
) {
  const hasAssessmentRelease = Boolean(
    session.assessmentReleaseId ?? session.assessmentRelease,
  );

  return (
    session.status === "active" &&
    hasAssessmentRelease &&
    !isTryoutSessionExpired(session.availableUntil, now)
  );
}

function canRequestNewTryoutAdmission(
  admissionMode: TryoutAdmissionMode,
  sessions: TryoutAdmissionSession[],
  now: Date,
  selectedSessionId?: string | null,
) {
  if (admissionMode === "invitation_only") return false;

  const defaultSession = sessions.find(
    (session) => session.isDefaultOpenRegistration,
  );

  // Approval-required admissions may be requested before the first session is
  // created, but an existing default registration session must still be open.
  if (
    admissionMode === "approval_required" &&
    defaultSession &&
    !isTryoutAdmissionSessionAvailable(defaultSession, now)
  ) {
    return false;
  }

  if (selectedSessionId) {
    const selectedSession = sessions.find(
      (session) => session.id === selectedSessionId,
    );
    return Boolean(
      selectedSession &&
        isTryoutAdmissionSessionAvailable(selectedSession, now),
    );
  }

  if (admissionMode === "open") {
    return Boolean(
      defaultSession && isTryoutAdmissionSessionAvailable(defaultSession, now),
    );
  }

  return true;
}

export {
  canRequestNewTryoutAdmission,
  isTryoutAdmissionSessionAvailable,
  isTryoutSessionExpired,
};
export type { TryoutAdmissionSession };
