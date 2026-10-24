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

type TryoutAccessGrantBlockReason =
  | "archived_tryout"
  | "unpublished_tryout"
  | "missing_session"
  | "closed_session"
  | "archived_session"
  | "inactive_session"
  | "missing_content"
  | "ended_session";

function tryoutAccessGrantBlockReason(
  tryoutStatus: string,
  session: TryoutAdmissionSession | null,
  now: Date,
): TryoutAccessGrantBlockReason | null {
  if (tryoutStatus === "archived") return "archived_tryout";
  if (tryoutStatus !== "published") return "unpublished_tryout";
  if (!session) return "missing_session";
  if (session.status === "closed") return "closed_session";
  if (session.status === "archived") return "archived_session";
  if (session.status !== "active") return "inactive_session";
  if (!(session.assessmentReleaseId ?? session.assessmentRelease)) return "missing_content";
  if (isTryoutSessionExpired(session.availableUntil, now)) return "ended_session";
  return null;
}

function tryoutAccessGrantBlockMessage(reason: TryoutAccessGrantBlockReason) {
  const messages: Record<TryoutAccessGrantBlockReason, string> = {
    archived_tryout: "Tryout sudah diarsipkan. Akses baru tidak dapat diberikan; buat Tryout baru untuk peserta.",
    unpublished_tryout: "Tryout belum diterbitkan. Terbitkan Tryout sebelum memberi akses.",
    missing_session: "Belum ada sesi. Siapkan sesi dan kontennya sebelum memberi akses.",
    closed_session: "Sesi sudah ditutup. Siapkan sesi yang masih aktif untuk memberi akses.",
    archived_session: "Sesi sudah diarsipkan. Siapkan sesi yang masih aktif untuk memberi akses.",
    inactive_session: "Sesi belum dibuka untuk peserta. Buka sesi sebelum memberi akses.",
    missing_content: "Konten sesi belum siap. Siapkan konten sebelum memberi akses.",
    ended_session: "Waktu sesi sudah berakhir. Siapkan jadwal sesi yang baru untuk memberi akses.",
  };
  return messages[reason];
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
  tryoutAccessGrantBlockReason,
  tryoutAccessGrantBlockMessage,
};
export type { TryoutAdmissionSession, TryoutAccessGrantBlockReason };
