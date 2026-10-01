"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { CreateAffiliatorForm } from "./create-affiliator-form";

function AddAffiliatorDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button
            aria-label="Tambah affiliator"
            size="sm"
            title="Tambah affiliator"
            type="button"
            variant="default"
          />
        }
      >
        Tambah affiliator
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100svh-1.5rem)] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        variant="default"
      >
        <div className="max-h-[calc(100svh-1.5rem)] overflow-y-auto">
          <DialogHeader className="border-b border-primary-100 px-5 py-6 pr-16 sm:px-8 sm:py-7">
            <DialogTitle className="text-2xl tracking-[-0.035em] text-secondary-950">Tambah affiliator</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-6 sm:px-8 sm:py-7">
            <CreateAffiliatorForm embedded />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { AddAffiliatorDialog };
