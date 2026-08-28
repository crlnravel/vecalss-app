"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/lib/icons";
import { updateStudentEnrollmentAction } from "@/modules/admin/actions";
import { SubmitButton } from "@/modules/auth/components/submit-button";

function serializeForm(form: HTMLFormElement) {
  const fields: string[] = [];
  for (const [name, value] of new FormData(form).entries()) {
    if (!name.startsWith("$ACTION_")) {
      fields.push(`${name}\u0000${typeof value === "string" ? value : value.name}`);
    }
  }
  return fields.join("\u0001");
}

function StudentDetailForm({ children }: { children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialValuesRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (formRef.current) {
      initialValuesRef.current = serializeForm(formRef.current);
    }
  }, []);

  function handleFormChange() {
    if (!formRef.current || initialValuesRef.current === null) {
      return;
    }

    setHasUnsavedChanges(serializeForm(formRef.current) !== initialValuesRef.current);
  }

  function handleDiscard() {
    formRef.current?.reset();
    setHasUnsavedChanges(false);
  }

  return (
    <form
      action={updateStudentEnrollmentAction}
      className="min-w-0 space-y-6"
      onChange={handleFormChange}
      ref={formRef}
    >
      {children}

      {hasUnsavedChanges ? (
        <div
          aria-live="polite"
          className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-3xl border border-primary-200 bg-white/95 p-3 pl-4 shadow-[0_18px_48px_-24px_rgba(1,76,56,0.45)] transition-opacity transition-transform duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          role="status"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center text-primary-700">
              <AlertCircle aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </span>
            <p className="text-sm font-medium leading-5 text-secondary-800">Ada perubahan yang belum disimpan.</p>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-auto">
            <Button
              className="w-32 justify-center text-student-status-danger-fg hover:bg-student-status-danger-bg hover:text-student-status-danger-solid-bg"
              onClick={handleDiscard}
              size="sm"
              type="button"
              variant="ghost"
            >
               Buang perubahan
            </Button>
             <SubmitButton className="w-32 justify-center" pendingLabel="Menyimpan…" size="sm" type="submit" variant="brand">
               Simpan perubahan
            </SubmitButton>
          </div>
        </div>
      ) : null}
    </form>
  );
}

export { StudentDetailForm };
