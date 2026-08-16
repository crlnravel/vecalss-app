"use client";

import { useState } from "react";

import type { ExamEvent } from "@/generated/prisma/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { FileText, Plus, UserPlus, Users } from "@/lib/icons";

import { CreateStudentForm } from "./create-student-form";
import { ImportsIntakeModule } from "../imports/ImportsIntakeModule";

type AddStudentMode = "bulk" | "single";

function AddStudentDialog({
  examEvents,
}: {
  examEvents: Array<Pick<ExamEvent, "id" | "name">>;
}) {
  const [mode, setMode] = useState<AddStudentMode>("single");
  const [open, setOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && bulkBusy) {
      return;
    }

    if (!nextOpen) {
      setMode("single");
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <button
            aria-label="Add student"
            className={buttonVariants({ className: "lg:mt-1", size: "icon", variant: "brand" })}
            title="Add student"
            type="button"
          />
        }
      >
        <Plus aria-hidden="true" size={18} />
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        pending={bulkBusy}
        variant="default"
      >
        <div className="max-h-[calc(100svh-1.5rem)] overflow-y-auto">
          <DialogHeader className="border-b border-primary-100 px-5 py-6 pr-16 sm:px-8 sm:py-7">
            <DialogTitle className="text-2xl tracking-[-0.035em] text-secondary-950">Add student</DialogTitle>
            <DialogDescription className="max-w-[58ch]">
              Create one account or upload a prepared roster. Choose a mode to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="border-b border-primary-100 bg-primary-50/55 px-5 py-4 sm:px-8 sm:py-5">
            <div aria-label="Student import mode" className="grid gap-2 sm:grid-cols-2" role="tablist">
              <button
                aria-controls="single-student-import-panel"
                aria-selected={mode === "single"}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${mode === "single" ? "border-primary-500 bg-white text-primary-950 shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-transparent text-secondary-700 hover:border-primary-300 hover:bg-white/70"}`}
                id="single-student-import-tab"
                onClick={() => setMode("single")}
                role="tab"
                type="button"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${mode === "single" ? "bg-primary-700 text-white" : "bg-white text-primary-700"}`}>
                  <UserPlus aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Single import</span>
                  <span className="mt-0.5 block text-xs leading-5 text-secondary-600">Fill in one student&apos;s details</span>
                </span>
              </button>
              <button
                aria-controls="bulk-student-import-panel"
                aria-selected={mode === "bulk"}
                className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-left transition-[background-color,border-color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${mode === "bulk" ? "border-primary-500 bg-white text-primary-950 shadow-[0_12px_28px_-24px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-transparent text-secondary-700 hover:border-primary-300 hover:bg-white/70"}`}
                id="bulk-student-import-tab"
                onClick={() => setMode("bulk")}
                role="tab"
                type="button"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${mode === "bulk" ? "bg-primary-700 text-white" : "bg-white text-primary-700"}`}>
                  <Users aria-hidden="true" size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Bulk import</span>
                  <span className="mt-0.5 block text-xs leading-5 text-secondary-600">Upload multiple students with CSV</span>
                </span>
              </button>
            </div>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            {mode === "single" ? (
              <div aria-labelledby="single-student-import-tab" id="single-student-import-panel" role="tabpanel">
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/65 px-4 py-3.5">
                  <FileText aria-hidden="true" className="mt-0.5 shrink-0 text-primary-700" size={18} />
                  <p className="text-sm leading-6 text-secondary-700">Add an approved student, set an exam goal, and choose how their first credentials should be delivered.</p>
                </div>
                <CreateStudentForm embedded examEvents={examEvents} />
              </div>
            ) : (
              <div aria-labelledby="bulk-student-import-tab" id="bulk-student-import-panel" role="tabpanel">
                <ImportsIntakeModule embedded initialRole="student" onBusyChange={setBulkBusy} showRoleSelect={false} />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddStudentDialog };
