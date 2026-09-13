const FEATURE_LABELS: Record<string, string> = {
  "vera.chat": "Chat Vera",
  "vera.drill": "Latihan soal",
  "vera.review": "Tinjauan jawaban",
  "vera.analysis": "Analisis belajar",
  "vera.ptn": "Rekomendasi PTN",
  "vera.route": "Rute belajar",
  "vera.summary": "Ringkasan belajar",
};

const AI_CAPABILITY_LABELS: Record<string, string> = {
  canManageAiGovernance: "Pengelolaan tata kelola AI",
  canManageAiPolicy: "Pengelolaan kebijakan AI",
};

const AI_POLICY_ACTION_LABELS: Record<string, string> = {
  activated: "Diaktifkan",
  approved: "Disetujui",
  created: "Dibuat",
  draft_edited: "Draf diedit",
  previewed: "Dipratinjau",
  rejected: "Ditolak",
  retention_extension_requested: "Perpanjangan retensi diminta",
  retired: "Dipensiunkan",
  rollback_created: "Pemulihan dibuat",
  rolled_back: "Dipulihkan",
  scheduled: "Dijadwalkan",
  submitted: "Dikirim",
  validated: "Divalidasi",
};

const AI_POLICY_SECTION_LABELS: Record<string, string> = {
  quota: "kuota",
  report: "laporan",
  retention: "retensi",
  settlement: "penyelesaian",
};

const AI_POLICY_STATE_LABELS: Record<string, string> = {
  active: "Aktif",
  draft: "Draf",
  pending_approval: "Menunggu persetujuan",
  rejected: "Ditolak",
  retired: "Dipensiunkan",
  scheduled: "Terjadwal",
};

const AI_PREVIEW_STATE_LABELS: Record<string, string> = {
  coarsened: "Dikaburkan",
  partial_unavailable: "Sebagian tidak tersedia",
  ready: "Siap",
  suppressed: "Ditekan",
  unavailable: "Tidak tersedia",
};

const AI_IMPACT_STATE_LABELS: Record<string, string> = {
  coarsened: "Dikaburkan",
  forward_only: "Hanya berlaku ke depan",
  suppressed: "Ditekan",
  unchanged: "Tidak berubah",
  unavailable: "Tidak tersedia",
};

const AI_PROVIDER_GATE_STATE_LABELS: Record<string, string> = {
  open_blocked: "Gerbang penyedia: dibatasi",
  release_ready: "Gerbang penyedia: siap dibuka",
};

function humanizeInternalLabel(value: string) {
  return value
    .replace(/^vera[._-]/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function formatAiFeatureLabel(value: string) {
  return FEATURE_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiCapabilityLabel(value: string) {
  return AI_CAPABILITY_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiPolicyAction(value: string) {
  return AI_POLICY_ACTION_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiPolicySection(value: string) {
  return AI_POLICY_SECTION_LABELS[value] ?? humanizeInternalLabel(value).toLocaleLowerCase("id-ID");
}

export function formatAiPolicyState(value: string) {
  return AI_POLICY_STATE_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiPreviewState(value: string) {
  return AI_PREVIEW_STATE_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiImpactState(value: string) {
  return AI_IMPACT_STATE_LABELS[value] ?? humanizeInternalLabel(value);
}

export function formatAiProviderGateState(value: string) {
  return AI_PROVIDER_GATE_STATE_LABELS[value] ?? humanizeInternalLabel(value);
}

const IDR_CURRENCY_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatAiCurrency(value: number) {
  return IDR_CURRENCY_FORMATTER.format(Math.max(0, value));
}
