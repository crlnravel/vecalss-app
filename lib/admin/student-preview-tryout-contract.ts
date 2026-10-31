const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type PreviewTryoutScheduleStatus = "active" | "archived" | "closed" | "draft" | "future";

type PreviewTryoutSourceSession = {
  availableFrom: Date;
  availableUntil: Date;
  status: "active" | "archived" | "closed" | "draft";
};

function isUuid(value: string) {
  return UUID_PATTERN.test(value.trim());
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

export { getPreviewTryoutScheduleStatus, isUuid };

export type { PreviewTryoutScheduleStatus, PreviewTryoutSourceSession };
