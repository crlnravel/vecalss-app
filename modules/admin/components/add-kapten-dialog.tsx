"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ModeCardTabs } from "@/components/ui/mode-card-tabs";
import type { ModeCardTabItem } from "@/components/ui/mode-card-tabs";
import styles from "./reui-directory-grid.module.css";
import { UserPlus, Users } from "@/lib/icons";

import { CreateKaptenForm } from "./create-kapten-form";
import { ImportsIntakeModule } from "../imports/ImportsIntakeModule";

type AddKaptenMode = "bulk" | "single";

const modeTabs = [
  {
    description: "Isi detail satu akun Kapten",
    icon: UserPlus,
    id: "single-kapten-import-tab",
    label: "Satu akun",
    panelId: "single-kapten-import-panel",
    value: "single",
  },
  {
    description: "Unggah file CSV berisi beberapa akun Kapten",
    icon: Users,
    id: "bulk-kapten-import-tab",
    label: "Beberapa akun",
    panelId: "bulk-kapten-import-panel",
    value: "bulk",
  },
] satisfies readonly ModeCardTabItem<AddKaptenMode>[];

function AddKaptenDialog({ initialMode = "single" }: { initialMode?: AddKaptenMode } = {}) {
  const [mode, setMode] = useState<AddKaptenMode>(initialMode);
  const [open, setOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const dialogLocked = bulkBusy;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && dialogLocked) {
      return;
    }

    if (!nextOpen) {
      setMode(initialMode);
      setBulkBusy(false);
    }
    setOpen(nextOpen);
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger
        render={
          <button
             aria-label={initialMode === "bulk" ? "Impor Kapten" : "Tambah Kapten"}
            className={initialMode === "bulk" ? styles.button : styles.primaryButton}
             title={initialMode === "bulk" ? "Impor Kapten" : "Tambah Kapten"}
            type="button"
          />
        }
      >
        {initialMode === "bulk" ? "Impor" : "Tambah Kapten"}
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        pending={dialogLocked}
        variant="default"
      >
        <div className="max-h-[calc(100svh-1.5rem)] overflow-y-auto">
          <DialogHeader className="border-b border-primary-100 px-5 py-6 pr-16 sm:px-8 sm:py-7">
         <DialogTitle className="text-2xl tracking-[-0.035em] text-secondary-950">Tambah Kapten</DialogTitle>
          </DialogHeader>

          <div className="border-b border-primary-100 bg-primary-50/55 px-5 py-4 sm:px-8 sm:py-5">
            <ModeCardTabs
              aria-label="Pilih cara menambahkan Kapten"
              disabled={dialogLocked}
              items={modeTabs}
              onValueChange={setMode}
              value={mode}
            />
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <div aria-labelledby="single-kapten-import-tab" hidden={mode !== "single"} id="single-kapten-import-panel" inert={mode !== "single" || dialogLocked || undefined} role="tabpanel">
              <CreateKaptenForm embedded />
            </div>
            <div aria-busy={bulkBusy || undefined} aria-labelledby="bulk-kapten-import-tab" hidden={mode !== "bulk"} id="bulk-kapten-import-panel" inert={mode !== "bulk" || bulkBusy || undefined} role="tabpanel">
              <ImportsIntakeModule embedded initialRole="tutor" onBusyChange={setBulkBusy} showRoleSelect={false} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddKaptenDialog };
