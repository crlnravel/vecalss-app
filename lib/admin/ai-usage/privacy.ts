import { VERA_REPORT_MIN_GROUP_SIZE } from "./types";

export function distinctStudents(rows: Array<{ studentId: string | null }>): Set<string> {
  return new Set(rows.map(row => row.studentId).filter((id): id is string => Boolean(id)));
}

export function safeCell(baseStudents: Set<string>, cellStudents: Set<string>, minimum = VERA_REPORT_MIN_GROUP_SIZE): boolean {
  return baseStudents.size >= minimum && cellStudents.size >= minimum && baseStudents.size - cellStudents.size >= minimum;
}

export function summarySafe(baseStudents: Set<string>, minimum = VERA_REPORT_MIN_GROUP_SIZE): boolean {
  return baseStudents.size >= minimum;
}
