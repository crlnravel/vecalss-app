import { DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { AlertTriangle } from "@/lib/icons";

function QuestionMobileInventoryOption({
  issueCount,
  prompt,
  questionNumber,
  value,
}: {
  issueCount: number;
  prompt: string;
  questionNumber: number;
  value: string;
}) {
  return (
    <DropdownMenuRadioItem value={value}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-5 shrink-0 text-xs font-semibold text-secondary-500">
          {questionNumber}.
        </span>
        <span className="min-w-0 truncate">{prompt || "Soal tanpa pertanyaan"}</span>
        {issueCount > 0 ? (
          <span
            aria-label={`Soal ${questionNumber} memiliki ${issueCount} masalah`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-student-status-attention-bg text-student-status-attention-fg"
            role="img"
            title={`Soal ${questionNumber} memiliki ${issueCount} masalah`}
          >
            <AlertTriangle aria-hidden="true" className="size-3.5" />
          </span>
        ) : null}
      </span>
    </DropdownMenuRadioItem>
  );
}

export { QuestionMobileInventoryOption };
