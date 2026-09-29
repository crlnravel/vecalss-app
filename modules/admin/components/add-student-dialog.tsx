"use client";

import { useActionState, useState } from "react";

import type { ExamEvent } from "@/generated/prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { ModeCardTabs } from "@/components/ui/mode-card-tabs";
import type { ModeCardTabItem } from "@/components/ui/mode-card-tabs";
import { Plus, UserPlus, Users } from "@/lib/icons";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import { CreateStudentForm } from "./create-student-form";
import { createStudentEnrollmentAction } from "../actions";
import { ImportsIntakeModule } from "../imports/ImportsIntakeModule";

type AddStudentMode = "bulk" | "single";

const modeTabs = [
  {
    description: "Isi detail satu akun siswa",
    icon: UserPlus,
    id: "single-student-import-tab",
    label: "Satu akun",
    panelId: "single-student-import-panel",
    value: "single",
  },
  {
    description: "Unggah file CSV berisi beberapa siswa",
    icon: Users,
    id: "bulk-student-import-tab",
    label: "Beberapa akun",
    panelId: "bulk-student-import-panel",
    value: "bulk",
  },
] satisfies readonly ModeCardTabItem<AddStudentMode>[];

function AddStudentDialog({
  examEvents,
}: {
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
}) {
  const [mode, setMode] = useState<AddStudentMode>("single");
  const [open, setOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [singleState, singleFormAction, singleBusy] = useActionState(createStudentEnrollmentAction, EMPTY_FORM_STATE);
  const [acknowledgedHandoffId, setAcknowledgedHandoffId] = useState<string | null>(null);
  const handoffPending = Boolean(
    singleState.handoffId &&
      (singleState.temporaryPassword || singleState.inviteUrl) &&
      acknowledgedHandoffId !== singleState.handoffId,
  );
  const operationBusy = singleBusy || bulkBusy;
  const dialogLocked = operationBusy || handoffPending;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dialogLocked) {
      return;
    }

    if (!nextOpen) {
      setMode("single");
      setBulkBusy(false);
      setAcknowledgedHandoffId(null);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <button
             aria-label="Tambah siswa"
            className={buttonVariants({ className: "lg:mt-1", size: "icon", variant: "brand" })}
             title="Tambah siswa"
            type="button"
          />
        }
      >
        <Plus aria-hidden="true" size={18} />
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        pending={dialogLocked}
        variant="default"
      >
        <div className="max-h-[calc(100svh-1.5rem)] overflow-y-auto">
          <DialogHeader className="border-b border-primary-100 px-5 py-6 pr-16 sm:px-8 sm:py-7">
             <DialogTitle className="text-2xl tracking-[-0.035em] text-secondary-950">Tambah siswa</DialogTitle>
          </DialogHeader>

          <div className="border-b border-primary-100 bg-primary-50/55 px-5 py-4 sm:px-8 sm:py-5">
            <ModeCardTabs
              aria-label="Pilih cara menambahkan siswa"
              disabled={dialogLocked}
              items={modeTabs}
              onValueChange={setMode}
              value={mode}
            />
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <div aria-busy={singleBusy || undefined} aria-labelledby="single-student-import-tab" hidden={mode !== "single"} id="single-student-import-panel" inert={mode !== "single" || operationBusy || undefined} role="tabpanel">
              <CreateStudentForm
                controller={{
                  formAction: singleFormAction,
                  onHandoffResolved: setAcknowledgedHandoffId,
                  pending: singleBusy,
                  state: singleState,
                }}
                embedded
                examEvents={examEvents}
              />
            </div>
            <div aria-busy={bulkBusy || undefined} aria-labelledby="bulk-student-import-tab" hidden={mode !== "bulk"} id="bulk-student-import-panel" inert={mode !== "bulk" || bulkBusy || undefined} role="tabpanel">
              <ImportsIntakeModule embedded initialRole="student" onBusyChange={setBulkBusy} showRoleSelect={false} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddStudentDialog };
