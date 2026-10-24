"use client";

import { OptionSet } from "@/modules/mentor/KaptenTryoutOperationalShared";
import type { Mode } from "@/modules/mentor/KaptenTryoutOperationsData";

const admissionOptions: Array<{ value: Mode; label: string; description: string }> = [
  { value: "open", label: "Terbuka", description: "Peserta yang mendaftar langsung mendapat akses sesuai jadwal." },
  { value: "approval_required", label: "Perlu persetujuan", description: "Peserta mengajukan pendaftaran. Kapten meninjau sebelum memberi akses." },
  { value: "invitation_only", label: "Undangan saja", description: "Hanya peserta yang diundang Kapten yang mendapat akses." },
];

export function TryoutAdmissionModeField({ value, onChange, disabled = false }: { value: Mode; onChange: (mode: Mode) => void; disabled?: boolean }) {
  return <OptionSet label="Akses peserta" required value={value} onValueChange={onChange} options={admissionOptions.map((option) => ({ ...option, disabled }))} />;
}
