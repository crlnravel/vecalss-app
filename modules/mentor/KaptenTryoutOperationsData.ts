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

const admissionStatusLabels: Record<string, string> = {
  active: "Aktif",
  pending: "Menunggu persetujuan",
  rejected: "Ditolak",
  revoked: "Dicabut",
};

const participantSessionStateLabels: Record<string, string> = {
  assigned: "Terjadwal",
  available: "Tersedia",
  completed: "Selesai",
  expired: "Kedaluwarsa",
  in_progress: "Berlangsung",
  not_assigned: "Belum ditugaskan",
  revoked: "Sesi tidak tersedia",
  unavailable: "Tidak tersedia",
};

const participantAttemptStateLabels: Record<string, string> = {
  abandoned: "Ditinggalkan",
  auto_submitted: "Terkirim otomatis",
  expired: "Kedaluwarsa",
  in_progress: "Berlangsung",
  scored: "Dinilai",
  submitted: "Terkirim",
  void: "Dibatalkan",
};

export { admissionStatusLabels, assignmentStatusLabels, modeLabels, participantAttemptStateLabels, participantSessionStateLabels, policyLabels, rankingLabels };
export type { DefaultPolicy, Mode, Policy, RankingRule };
