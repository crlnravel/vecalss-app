import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { MentorLearningGap } from "@/modules/mentor/mock-data";

function MentorGapCard({
  gap,
  tone = "neutral",
}: {
  gap: MentorLearningGap;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-sm",
        tone === "warning"
          ? "border-[#ead9a5] bg-[#fffdf1]"
          : "border-primary-100 bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-secondary-900">{gap.title}</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            {gap.detail}
          </p>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-primary-100 bg-white px-2.5 text-xs font-medium text-secondary-700">
          {gap.mastery}%
        </span>
      </div>

      <Progress className="mt-4 gap-2" value={gap.mastery}>
        <ProgressLabel className="text-xs text-secondary-500">
          {gap.title}
        </ProgressLabel>
        <ProgressValue className="text-xs text-secondary-500">
          {() => `${gap.mastery}%`}
        </ProgressValue>
      </Progress>
    </div>
  );
}

export { MentorGapCard };
