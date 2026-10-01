import type { UserStatus } from "@/generated/prisma/client";

type StudentStatusTone = "info" | "attention" | "danger" | "neutral";

function formatStudentStatus(status: string) {
  return {
    active: "Aktif",
    disabled: "Dinonaktifkan",
    locked: "Terkunci",
    soft_deleted: "Dihapus sementara",
  }[status] ?? status.replaceAll("_", " ");
}

function studentStatusTone(status: UserStatus): StudentStatusTone {
  if (status === "active") {
    return "info";
  }

  if (status === "disabled" || status === "soft_deleted") {
    return "danger";
  }

  if (status === "locked") {
    return "attention";
  }

  return "neutral";
}

export { formatStudentStatus, studentStatusTone };
export type { StudentStatusTone };
