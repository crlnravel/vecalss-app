"use client";

import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertCircle } from "@/lib/icons";
import { updateStudentEnrollmentAction } from "@/modules/admin/actions";
import { SubmitButton } from "@/modules/auth/components/submit-button";

type FieldChangeOverride = {
  name: string;
  value: string;
};

type BlockedField = {
  name: string;
  value: string;
};

const StudentDetailFormFieldChangeContext = createContext<((override: FieldChangeOverride) => void) | null>(null);

function serializeForm(form: HTMLFormElement, override?: FieldChangeOverride) {
  const fields: string[] = [];
  let overrideWritten = false;
  for (const [name, value] of new FormData(form).entries()) {
    if (!name.startsWith("$ACTION_")) {
      if (override?.name === name) {
        if (!overrideWritten) {
          fields.push(`${name}\u0000${override.value}`);
          overrideWritten = true;
        }
        continue;
      }
      fields.push(`${name}\u0000${typeof value === "string" ? value : value.name}`);
    }
  }
  if (override && !overrideWritten) {
    fields.push(`${override.name}\u0000${override.value}`);
  }
  return fields.join("\u0001");
}

function useStudentDetailFormFieldChange() {
  return useContext(StudentDetailFormFieldChangeContext);
}

function StudentDetailForm({
  blockedField,
  children,
}: {
  blockedField?: BlockedField;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialValuesRef = useRef<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    if (formRef.current) {
      initialValuesRef.current = serializeForm(formRef.current);
    }
  }, []);

  function updateDirtyState(override?: FieldChangeOverride) {
    if (!formRef.current || initialValuesRef.current === null) {
      return;
    }

    setHasUnsavedChanges(serializeForm(formRef.current, override) !== initialValuesRef.current);
  }

  function handleFormChange() {
    updateDirtyState();
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (!blockedField) {
      return;
    }

    const currentValue = new FormData(event.currentTarget).get(blockedField.name);
    if (currentValue === blockedField.value) {
      event.preventDefault();
    }
  }

  function handleDiscard() {
    formRef.current?.reset();
    setHasUnsavedChanges(false);
  }

  return (
    <StudentDetailFormFieldChangeContext.Provider value={(override) => updateDirtyState(override)}>
      <form
        action={updateStudentEnrollmentAction}
        className="min-w-0 space-y-6"
        onChange={handleFormChange}
        onSubmit={handleFormSubmit}
        ref={formRef}
      >
        {children}

        {hasUnsavedChanges ? (
          <div
            aria-live="polite"
            className="animate-in fade-in-0 slide-in-from-bottom-3 fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-xl flex-col gap-3 rounded-3xl border border-primary-200 bg-white/95 p-3 pl-4 shadow-[0_18px_48px_-24px_color-mix(in_oklab,var(--voyage-deep)_45%,transparent)] transition-opacity transition-transform duration-300 ease-out backdrop-blur-md motion-reduce:animate-none sm:right-0 sm:left-(--sidebar-offset) sm:w-[min(calc(100vw-3rem),36rem)] sm:flex-row sm:items-center sm:justify-between sm:gap-4"
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
    </StudentDetailFormFieldChangeContext.Provider>
  );
}

export { StudentDetailForm, useStudentDetailFormFieldChange };
