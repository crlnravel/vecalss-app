import { ReferenceStatusBadge } from "@/components/dashboard/reference-dashboard-primitives";
import type { ReferenceStatusTone } from "@/components/dashboard/reference-dashboard-tokens";

const statusLabels: Record<string, string> = {
  active: "Aktif",
  abandoned: "Ditinggalkan",
  archived: "Diarsipkan",
  auto_submitted: "Terkirim otomatis",
  closed: "Ditutup",
  completed: "Selesai",
  draft: "Draf",
  expired: "Kedaluwarsa",
  failed: "Gagal",
  in_progress: "Berlangsung",
  not_applicable: "Tidak berlaku",
  pending: "Menunggu",
  published: "Diterbitkan",
  rejected: "Ditolak",
  revoked: "Dicabut",
  scored: "Dinilai",
  sealed: "Selesai",
  submitted: "Terkirim",
  superseded: "Digantikan",
  voided: "Dibatalkan",
};

const TRYOUT_STATUS_TONES: Record<string, ReferenceStatusTone> = {
  abandoned: "danger",
  active: "info",
  archived: "neutral",
  auto_submitted: "success",
  closed: "neutral",
  completed: "success",
  draft: "attention",
  expired: "danger",
  failed: "danger",
  in_progress: "info",
  not_applicable: "neutral",
  pending: "attention",
  published: "success",
  rejected: "danger",
  revoked: "danger",
  scored: "success",
  sealed: "success",
  submitted: "success",
  superseded: "neutral",
  voided: "danger",
};

function tryoutStatusTone(status: string): ReferenceStatusTone {
  const statusKey = status.trim().toLowerCase().replace(/-+/g, "_");

  return TRYOUT_STATUS_TONES[statusKey] ?? "neutral";
}

function StatusBadge({ status }: { status: string }) {
  const label = statusLabels[status] ?? status.replace(/(^|[_\s-])(\p{L})/gu, (_, prefix: string, character: string) => `${prefix}${character.toLocaleUpperCase()}`);

  return <ReferenceStatusBadge label={label} size="sm" status={status} tone={tryoutStatusTone(status)} />;
}

export { StatusBadge };
