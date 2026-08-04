type Policy = "immediate" | "manual" | "automatic_at_end" | "scheduled";
type DefaultPolicy = Exclude<Policy, "scheduled">;
type Mode = "open" | "approval_required" | "invitation_only";

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

export { modeLabels, policyLabels };
export type { DefaultPolicy, Mode, Policy };
