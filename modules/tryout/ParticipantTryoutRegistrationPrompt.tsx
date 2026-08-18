"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function ParticipantTryoutRegistrationPrompt({ href }: { href: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleContinue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        className="w-full"
        onClick={() => setOpen(true)}
        size="lg"
        variant="brand"
      >
        Daftar Sekarang
      </Button>

      <AlertDialog onOpenChange={setOpen} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Daftar ke tryout ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Kamu akan melanjutkan ke pilihan target universitas dan jurusan
              sebelum pendaftaran dikirim.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleContinue}>
              Lanjutkan pendaftaran
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { ParticipantTryoutRegistrationPrompt };
