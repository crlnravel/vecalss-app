import type { AuditLogRange, AuditLogTargetType } from "@/lib/admin/operations/audit-query";
import type { AdminAuditLogEntry } from "@/lib/admin/operations/service";

const AUDIT_TIME_ZONE = "Asia/Jakarta";
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: AUDIT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("id-ID", { timeZone: AUDIT_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("id-ID", { timeZone: AUDIT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export const auditRangeLabels: Record<AuditLogRange, string> = {
  all: "Semua waktu", "24h": "24 jam terakhir", "7d": "7 hari terakhir", "30d": "30 hari terakhir",
};
export const auditTargetLabels: Record<AuditLogTargetType, string> = {
  cohort: "Cohort", enrollment_handoff: "Undangan", enrollment_import: "Impor", enrollment_import_row: "Hasil impor", system_config: "Sistem", user: "Pengguna",
};

const subjectLabels: Record<string, string> = {
  user: "Pengguna", student_enrollment: "Pendaftaran Voyager", kapten_enrollment: "Pendaftaran Kapten",
  enrollment_handoff: "Undangan", enrollment_import: "Impor pendaftaran", enrollment_import_row: "Hasil impor",
  cohort: "Cohort", system_config: "Pengaturan sistem", auth: "Akses akun", session: "Sesi pengguna",
  admission: "Pendaftaran peserta", notification: "Notifikasi", result: "Hasil belajar", invite: "Undangan", password_reset: "Pemulihan kata sandi",
  admission_mode: "Akses peserta", delivery_session: "Sesi Tryout", attempt: "Pengerjaan Tryout", admin_preview: "Pratinjau Admin",
};
const actionLabels: Record<string, string> = {
  created: "dibuat", updated: "diperbarui", deleted: "dihapus", password_changed: "kata sandi diganti",
  deactivated: "dinonaktifkan", reactivated: "diaktifkan kembali", expired: "kedaluwarsa", released: "dikirim",
  revoked: "dicabut", completed: "selesai", acknowledged: "diterima", reissued: "dikirim ulang",
  preview_created: "pratinjau dibuat", invalid_rows_skipped: "baris tidak valid dilewati", cancelled: "dibatalkan",
  confirmed: "dikonfirmasi", dispatch_started: "mulai diproses", batch_completed: "batch selesai", row_completed: "baris selesai",
  row_failed: "baris gagal diproses", retry_queued: "dijadwalkan ulang", login_success: "berhasil masuk", login_failed: "gagal masuk",
  approved: "disetujui", rejected: "ditolak", invited: "diundang", kelas_sent: "kelas dikirim", bundle_released: "dirilis",
  accepted: "diterima", handoff_file_released: "berkas undangan dikirim", finalized: "diselesaikan", retry_completed: "pemrosesan ulang selesai",
  configured: "diatur", assigned: "ditetapkan", tryout_restarted: "Tryout dimulai ulang", deadline_expired: "waktunya habis",
  disconnect_started: "koneksi terputus", disconnect_reconciled: "koneksi pulih", disconnect_terminal: "berakhir setelah koneksi terputus",
};

const standaloneActionLabels: Record<string, string> = {
  first_login_password_changed: "Kata sandi awal diganti",
  student_banner_maker_draft_saved: "Draf banner disimpan", student_banner_maker_published: "Banner diterbitkan",
  student_banner_maker_v2_draft_saved: "Draf banner disimpan", student_banner_maker_v2_published: "Banner diterbitkan",
  student_banners_draft_saved: "Draf banner disimpan", student_banners_published: "Banner diterbitkan",
};

export function auditActionLabel(action: string) {
  if (standaloneActionLabels[action]) return standaloneActionLabels[action];
  const separator = action.indexOf(".");
  const subject = subjectLabels[action.slice(0, separator)];
  const verb = actionLabels[action.slice(separator + 1)];
  if (separator > 0 && subject && verb) return `${subject} ${verb}`;
  // Unknown event codes stay in the internal record; the UI uses an honest category description.
  return "Aktivitas tercatat";
}

export function auditTargetLabel(target: string | null) {
  return auditTargetLabels[target as AuditLogTargetType] ?? "Aktivitas lainnya";
}

export function auditReferenceLabel(reference: string) {
  const compact = reference.replaceAll("-", "").toUpperCase();
  return `#${compact.slice(0, 4)}-${compact.slice(-8)}`;
}

export function auditEventStatus(action: string) {
  if (/(?:^|[._])(failed|failure|denied|rejected)(?:$|[._])/u.test(action)) return { label: "Gagal", tone: "danger" as const };
  if (/(?:^|[._])(deleted|revoked|deactivated|password_changed)(?:$|[._])/u.test(action)) return { label: "Perubahan", tone: "attention" as const };
  return { label: "Catatan", tone: "neutral" as const };
}

export function formatAuditTime(value: string) { return `${timeFormatter.format(new Date(value))} WIB`; }
export function formatAuditDate(value: string) { return dateFormatter.format(new Date(value)); }

export function groupAuditEntries(entries: readonly AdminAuditLogEntry[], now: string) {
  const today = dayKeyFormatter.format(new Date(now));
  const yesterday = dayKeyFormatter.format(new Date(new Date(now).getTime() - 86_400_000));
  const groups = new Map<string, { key: string; label: string; entries: AdminAuditLogEntry[] }>();
  for (const entry of entries) {
    const key = dayKeyFormatter.format(new Date(entry.occurredAt));
    let group = groups.get(key);
    if (!group) {
      const prefix = key === today ? "Hari ini, " : key === yesterday ? "Kemarin, " : "";
      group = { key, label: `${prefix}${formatAuditDate(entry.occurredAt)}`, entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()];
}

export function auditPageCsv(entries: readonly AdminAuditLogEntry[]) {
  function cell(value: string | null) {
    // Spreadsheet programs interpret formula prefixes even inside quoted CSV fields.
    const text = value ?? "";
    const safe = /^[\s\u0000-\u001f]*[=+@-]/u.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }
  const rows = [["Referensi", "Aktivitas", "Waktu", "Pengguna", "Email", "Target", "Referensi target", "Alamat IP"],
    ...entries.map(e => [e.id, auditActionLabel(e.action), `${formatAuditDate(e.occurredAt)} ${formatAuditTime(e.occurredAt)}`, e.actorId ? e.actorName : "Sistem", e.actorEmail, auditTargetLabel(e.targetType), e.targetId, e.ipAddress])];
  return `\uFEFF${rows.map(row => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
