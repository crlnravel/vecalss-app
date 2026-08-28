"use client";

import { useActionState, useRef, useState } from "react";

import type { ExamEvent } from "@/generated/prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { Plus, UserPlus, Users } from "@/lib/icons";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import { CreateStudentForm } from "./create-student-form";
import { createStudentEnrollmentAction } from "../actions";
import { ImportsIntakeModule } from "../imports/ImportsIntakeModule";

type AddStudentMode = "bulk" | "single";

const modeOrder: AddStudentMode[] = ["single", "bulk"];

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
  const modeTabRefs = useRef<Record<AddStudentMode, HTMLButtonElement | null>>({ bulk: null, single: null });
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

  function handleModeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (dialogLocked) return;

    const currentIndex = modeOrder.indexOf(mode);
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % modeOrder.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + modeOrder.length) % modeOrder.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = modeOrder.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextMode = modeOrder[nextIndex];
    setMode(nextMode);
    modeTabRefs.current[nextMode]?.focus();
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
            <div aria-label="Student import mode" aria-orientation="horizontal" className="grid gap-2 sm:grid-cols-2" role="tablist">
              <button
                aria-controls="single-student-import-panel"
                aria-selected={mode === "single"}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${mode === "single" ? "border-primary-500 bg-white text-primary-950 shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-transparent text-secondary-700 hover:border-primary-300 hover:bg-white/70"}`}
                id="single-student-import-tab"
                onKeyDown={handleModeKeyDown}
                onClick={() => setMode("single")}
                ref={(element) => {
                  modeTabRefs.current.single = element;
                }}
                role="tab"
                tabIndex={mode === "single" ? 0 : -1}
                type="button"
                disabled={dialogLocked}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${mode === "single" ? "bg-primary-700 text-white" : "bg-white text-primary-700"}`}>
                  <UserPlus aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0">
                   <span className="block text-sm font-semibold">Import satu akun</span>
                   <span className="mt-0.5 block text-xs leading-5 text-secondary-600">Isi detail satu siswa</span>
                </span>
              </button>
              <button
                aria-controls="bulk-student-import-panel"
                aria-selected={mode === "bulk"}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${mode === "bulk" ? "border-primary-500 bg-white text-primary-950 shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-transparent text-secondary-700 hover:border-primary-300 hover:bg-white/70"}`}
                id="bulk-student-import-tab"
                onKeyDown={handleModeKeyDown}
                onClick={() => setMode("bulk")}
                ref={(element) => {
                  modeTabRefs.current.bulk = element;
                }}
                role="tab"
                tabIndex={mode === "bulk" ? 0 : -1}
                type="button"
                disabled={dialogLocked}
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${mode === "bulk" ? "bg-primary-700 text-white" : "bg-white text-primary-700"}`}>
                  <Users aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0">
                   <span className="block text-sm font-semibold">Import massal</span>
                   <span className="mt-0.5 block text-xs leading-5 text-secondary-600">Upload beberapa siswa dengan CSV</span>
                </span>
              </button>
            </div>
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
