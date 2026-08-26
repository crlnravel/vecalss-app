import type { ReactNode } from "react";

import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";

type AssessmentReviewAnswerOptionProps = {
  correct: boolean;
  correctnessAvailable?: boolean;
  label: string;
  selected?: boolean;
  text: ReactNode;
  textClassName?: string;
};

function AssessmentReviewAnswerOption({
  correct,
  correctnessAvailable = true,
  label,
  selected = false,
  text,
  textClassName = "text-lg leading-[1.8]",
}: AssessmentReviewAnswerOptionProps) {
  const isCorrect = correctnessAvailable && correct;
  const isIncorrectSelection = correctnessAvailable && selected && !correct;
  const isNeutral = !correct && !isIncorrectSelection;

  return (
    <div
      className={cn(
        "flex w-full items-start gap-4 rounded-3xl border bg-white px-4 py-4 text-left sm:px-5",
        isCorrect &&
          "border-student-status-success-border bg-student-status-success-bg",
        isIncorrectSelection &&
          "border-student-status-danger-border bg-student-status-danger-bg",
        isNeutral && "border-primary-100",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
          isCorrect &&
            "border-student-status-success-solid-bg bg-student-status-success-solid-bg text-student-status-success-solid-fg",
          isIncorrectSelection &&
            "border-student-status-danger-solid-bg bg-student-status-danger-solid-bg text-student-status-danger-solid-fg",
          isNeutral && "border-secondary-200 bg-secondary-50 text-secondary-500",
        )}
      >
        {isCorrect ? <Check className="size-5" /> : label}
      </span>
      <p className={cn("min-w-0 flex-1 font-medium text-secondary-800", textClassName)}>
        {text}
      </p>
    </div>
  );
}

export { AssessmentReviewAnswerOption };
export type { AssessmentReviewAnswerOptionProps };
