type Policy = "immediate" | "manual" | "automatic_at_end" | "scheduled";
type DefaultPolicy = Exclude<Policy, "scheduled">;
type Mode = "open" | "approval_required" | "invitation_only";
type RankingRule = "national" | "cohort" | "none";

const policyLabels: Record<Policy, string> = {
  automatic_at_end: "Setelah sesi",
  immediate: "Segera",
  manual: "Manual",
  scheduled: "Tanggal tertentu",
};

const modeLabels: Record<Mode, string> = {
  approval_required: "Perlu persetujuan",
  invitation_only: "Undangan saja",
  open: "Terbuka",
};

const rankingLabels: Record<RankingRule, string> = {
  cohort: "Peringkat kelompok",
  national: "Peringkat nasional",
  none: "Tanpa peringkat",
};

const assignmentStatusLabels: Record<string, string> = {
  active: "Aktif",
  completed: "Selesai",
  revoked: "Dicabut",
};

export { assignmentStatusLabels, modeLabels, policyLabels, rankingLabels };
export type { DefaultPolicy, Mode, Policy, RankingRule };
