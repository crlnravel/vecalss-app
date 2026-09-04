"use client";

import { useEffect, useRef, useState } from "react";

import {
  ReferenceSelect,
  type ReferenceSelectOption,
} from "@/components/dashboard/reference-dashboard-controls";
import { useStudentDetailFormFieldChange } from "./student-detail-form";

function StudentDetailTargetExamSelect({
  initialValue,
  options,
}: {
  initialValue: string;
  options: readonly ReferenceSelectOption[];
}) {
  const [value, setValue] = useState(initialValue);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const notifyFieldChange = useStudentDetailFormFieldChange();

  useEffect(() => {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;

    const handleReset = () => setValue(initialValue);
    form.addEventListener("reset", handleReset);

    return () => form.removeEventListener("reset", handleReset);
  }, [initialValue]);

  return (
    <div ref={wrapperRef}>
      <ReferenceSelect
        aria-label="Target ujian"
        id="student-target-exam"
        name="targetExamEventId"
        onValueChange={(nextValue) => {
          setValue(nextValue);
          notifyFieldChange?.({ name: "targetExamEventId", value: nextValue });
        }}
        options={options}
        placeholder="Atur nanti"
        value={value}
      />
    </div>
  );
}

export { StudentDetailTargetExamSelect };
