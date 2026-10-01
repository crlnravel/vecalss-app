"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { useFormStatus } from "react-dom";

import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { updateStudentEnrollmentAction } from "@/modules/admin/actions";

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

function StudentDetailPageStatus({
  dirty,
  formRef,
  onDiscard,
}: {
  dirty: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  onDiscard: () => void;
}) {
  const { pending } = useFormStatus();

  usePageStatusToast({
    active: dirty || pending,
    action: dirty && !pending
      ? { label: "Simpan perubahan", onClick: () => formRef.current?.requestSubmit() }
      : undefined,
    cancel: dirty && !pending
      ? { label: "Buang perubahan", onClick: onDiscard }
      : undefined,
    message: pending ? "Menyimpan perubahan…" : "Ada perubahan yang belum disimpan.",
    variant: pending ? "info" : "warning",
  });

  return null;
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

  const updateDirtyState = useCallback((override?: FieldChangeOverride) => {
    if (!formRef.current || initialValuesRef.current === null) {
      return;
    }

    setHasUnsavedChanges(serializeForm(formRef.current, override) !== initialValuesRef.current);
  }, []);

  const fieldChangeHandler = useMemo(
    () => (override: FieldChangeOverride) => updateDirtyState(override),
    [updateDirtyState],
  );

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
    <StudentDetailFormFieldChangeContext.Provider value={fieldChangeHandler}>
      <form
        action={updateStudentEnrollmentAction}
        className="min-w-0 space-y-6"
        onChange={handleFormChange}
        onSubmit={handleFormSubmit}
        ref={formRef}
      >
        {children}
        <StudentDetailPageStatus dirty={hasUnsavedChanges} formRef={formRef} onDiscard={handleDiscard} />
      </form>
    </StudentDetailFormFieldChangeContext.Provider>
  );
}

export { StudentDetailForm, useStudentDetailFormFieldChange };
