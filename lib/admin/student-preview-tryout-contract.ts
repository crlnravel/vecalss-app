const ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS = 86_400;
const ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_MAX_SECONDS = 7 * 86_400;
const ADMIN_PREVIEW_TRYOUT_RETAKE_NAME_PREFIX = "Admin preview retake · ";
const ADMIN_PREVIEW_TRYOUT_REASON_MAX_LENGTH = 500;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type PreviewRetakeEnvironment = {
  ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS?: string;
};

type PreviewTryoutScheduleStatus = "active" | "archived" | "closed" | "draft" | "future";

type PreviewTryoutSourceSession = {
  availableFrom: Date;
  availableUntil: Date;
  status: "active" | "archived" | "closed" | "draft";
};

function isUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
}

/**
 * Canonical audit-reason comparison is deliberately separate from storage.
 * Raw text remains the durable display/audit value; this form is only used to
 * decide whether a retried request is the same operation.
 */
function canonicalizeAdminPreviewReason(rawReason: string) {
  const canonical = rawReason
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[^\S\r\n]+/gu, " "))
    .join("\n")
    .trim();

  if (!canonical) {
    throw new Error("Alasan audit wajib diisi.");
  }

  if (canonical.length > ADMIN_PREVIEW_TRYOUT_REASON_MAX_LENGTH) {
    throw new Error(`Alasan audit maksimal ${ADMIN_PREVIEW_TRYOUT_REASON_MAX_LENGTH} karakter.`);
  }

  return canonical;
}

function getPreviewTryoutScheduleStatus(
  session: PreviewTryoutSourceSession,
  now = new Date(),
): PreviewTryoutScheduleStatus {
  if (session.status === "archived") return "archived";
  if (session.status === "draft") return "draft";
  if (session.status === "closed") return "closed";
  if (session.availableFrom > now) return "future";
  if (session.availableUntil <= now) return "closed";
  return "active";
}

function isEligiblePreviewTryoutSource(
  session: PreviewTryoutSourceSession,
  now = new Date(),
) {
  const scheduleStatus = getPreviewTryoutScheduleStatus(session, now);
  return scheduleStatus === "active" || scheduleStatus === "closed";
}

function previewCurrentAssignmentKey(previewStudentId: string, tryoutId: string) {
  return `admin.student-preview:${previewStudentId}:${tryoutId}`;
}

function previewRetakeName(requestId: string) {
  return `${ADMIN_PREVIEW_TRYOUT_RETAKE_NAME_PREFIX}${requestId}`.slice(0, 180);
}

function previewRetakeWindowSeconds(
  env: PreviewRetakeEnvironment = {
    ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS: process.env.ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS,
  },
) {
  const configured = Number.parseInt(env.ADMIN_PREVIEW_RETAKE_WINDOW_SECONDS ?? "", 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS;
  }

  return Math.min(configured, ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_MAX_SECONDS);
}

export {
  ADMIN_PREVIEW_TRYOUT_REASON_MAX_LENGTH,
  ADMIN_PREVIEW_TRYOUT_RETAKE_NAME_PREFIX,
  ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_DEFAULT_SECONDS,
  ADMIN_PREVIEW_TRYOUT_RETAKE_WINDOW_MAX_SECONDS,
  canonicalizeAdminPreviewReason,
  getPreviewTryoutScheduleStatus,
  isEligiblePreviewTryoutSource,
  isUuid,
  previewCurrentAssignmentKey,
  previewRetakeName,
  previewRetakeWindowSeconds,
};

export type { PreviewTryoutScheduleStatus, PreviewTryoutSourceSession };
