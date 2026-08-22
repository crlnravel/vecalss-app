"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button-variants";
import { Plus } from "@/lib/icons";

import { CreateKaptenForm } from "./create-kapten-form";

function AddKaptenDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <button
            aria-label="Add Kapten"
            className={buttonVariants({ className: "lg:mt-1", size: "icon", variant: "brand" })}
            title="Add Kapten"
            type="button"
          />
        }
      >
        <Plus aria-hidden="true" size={18} />
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        variant="default"
      >
        <div className="max-h-[calc(100svh-1.5rem)] overflow-y-auto">
          <DialogHeader className="border-b border-primary-100 px-5 py-6 pr-16 sm:px-8 sm:py-7">
            <DialogTitle className="text-2xl tracking-[-0.035em] text-secondary-950">Add Kapten</DialogTitle>
          </DialogHeader>

          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <CreateKaptenForm embedded />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddKaptenDialog };
