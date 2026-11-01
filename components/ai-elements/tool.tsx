import { Badge, type BadgeProps } from "@/components/ui/badge";
import { BarChart3, BookOpen, ClipboardList, ListChecks, Search, type AppIcon } from "@/lib/icons";

const TOOL_STEPS: Record<string, { label: string; icon: AppIcon }> = {
  get_learning_overview: { label: "Membaca ringkasan belajar", icon: BarChart3 },
  list_kuis_attempts: { label: "Membaca daftar Kuis", icon: ClipboardList },
  get_kuis_attempt_review: { label: "Membaca pembahasan Kuis", icon: ClipboardList },
  list_tryout_results: { label: "Membaca hasil Tryout", icon: ListChecks },
  get_tryout_result_review: { label: "Membaca pembahasan Tryout", icon: ListChecks },
  search_materi: { label: "Mencari Materi", icon: Search },
  read_materi: { label: "Membaca Materi", icon: BookOpen },
};

const REFUSALS: Record<string, string> = {
  not_found: "Tidak ditemukan",
  under_review: "Masih ditinjau",
  not_available: "Belum tersedia",
};

function statusOf(state: string, output: unknown): { label: string; tone: BadgeProps["tone"] } {
  if (state === "input-streaming" || state === "input-available") return { label: "Sedang dibaca", tone: "info" };
  if (state === "output-error") return { label: "Gagal", tone: "danger" };
  const refusal = output && typeof output === "object" && "error" in output ? String(output.error) : null;
  if (refusal) return { label: REFUSALS[refusal] ?? "Belum tersedia", tone: "attention" };
  return { label: "Selesai", tone: "success" };
}

/** One lookup Vera made: what it read and how it went. The raw input and output stay out of the student's view. */
function ToolStep({ toolName, state, output }: { toolName: string; state: string; output: unknown }) {
  const step = TOOL_STEPS[toolName] ?? { label: "Membaca data PTN Pro", icon: Search };
  const status = statusOf(state, output);
  const Icon = step.icon;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span>{step.label}</span>
      <Badge size="xs" tone={status.tone}>
        {status.label}
      </Badge>
    </div>
  );
}

export { ToolStep };
