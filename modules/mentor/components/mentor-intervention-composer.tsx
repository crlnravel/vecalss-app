"use client";

import { useState } from "react";
import { Link2, Send, Sparkles, StickyNote } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel, FieldTextarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { MentorRosterStudent } from "@/modules/mentor/mock-data";

function MentorInterventionComposer({
  student,
  disabled = false,
  disabledReason,
}: {
  disabled?: boolean;
  disabledReason?: string;
  student: MentorRosterStudent | null;
}) {
  const [message, setMessage] = useState(student?.detail.messageStarter ?? "");
  const [status, setStatus] = useState("Draft belum disimpan");

  function handleDraft() {
    setStatus("Draft tersimpan lokal");
  }

  function handlePrepareSend() {
    setStatus("Catatan siap, belum terhubung ke dispatch");
  }

  if (!student) {
    return (
      <Card className="border border-primary-100 bg-white shadow-sm">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-secondary-900">
                Composer intervensi
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                Pilih satu siswa dulu untuk mulai menulis pesan singkat.
              </CardDescription>
            </div>
            <Sparkles className="size-4 text-secondary-400" />
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="rounded-3xl border border-dashed border-primary-100 bg-[#fcfdfc] px-4 py-4 text-sm leading-6 text-secondary-500">
            Belum ada siswa aktif, jadi composer menunggu pilihan dari daftar
            roster.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "border shadow-sm",
        disabled
          ? "border-primary-100 bg-[#fcfdfc]"
          : "border-primary-100 bg-white",
      )}
    >
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-secondary-900">
              Composer intervensi
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              Tulis singkat. Simpan dulu, lalu siapkan kirim tanpa formulir yang
              panjang.
            </CardDescription>
          </div>
          <Sparkles className="size-4 text-secondary-400" />
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <Field>
          <FieldLabel htmlFor={`mentor-message-${student.id}`}>
            Pesan singkat
          </FieldLabel>
          <FieldTextarea
            id={`mentor-message-${student.id}`}
            maxLength={240}
            disabled={disabled}
            placeholder={disabled ? "Composer tidak aktif saat data analitik tidak tersedia." : undefined}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
          <p className="text-xs text-secondary-500">
            {disabledReason ?? `${message.length}/240 karakter. Singkat lebih baik.`}
          </p>
        </Field>

        <section className="rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-500">
              Module link
            </div>
            <p className="text-sm text-secondary-500">
              Satu rekomendasi utama saja.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-[#ead9a5] bg-[#fffdf1] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-secondary-900">
                  {student.detail.recommendedModule.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-secondary-600">
                  {student.detail.recommendedModule.reason}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-full border px-2 text-xs font-medium",
                  student.detail.recommendedModule.tone === "warning"
                    ? "border-[#f4e9bf] bg-white text-[#856300]"
                    : "border-primary-100 bg-primary-50 text-primary-800",
                )}
              >
                Rekomendasi
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-medium text-secondary-600">
                {student.detail.recommendedModule.href}
              </span>
              {disabled ? (
                <Button
                  className="h-8"
                  disabled
                  size="sm"
                  type="button"
                  variant="brandOutline"
                >
                  <Link2 />
                  Buka modul
                </Button>
              ) : (
                <Button
                  className="h-8"
                  render={<Link href={student.detail.recommendedModule.href} />}
                  size="sm"
                  type="button"
                  variant="brandOutline"
                >
                  <Link2 />
                  Buka modul
                </Button>
              )}
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="min-w-32"
            disabled={disabled}
            onClick={handleDraft}
            size="sm"
            type="button"
            variant="ghost"
          >
            <StickyNote />
            Simpan draft
          </Button>
          <Button
            className="min-w-32"
            disabled={disabled}
            onClick={handlePrepareSend}
            size="sm"
            type="button"
            variant="brand"
          >
            <Send />
            Siap kirim
          </Button>
          <span className="text-xs text-secondary-500">
            {disabledReason ?? status}
          </span>
        </div>

        <div className="rounded-2xl border border-dashed border-primary-100 bg-white px-4 py-4 text-sm leading-6 text-secondary-500">
          {disabled
            ? "Intervensi sementara dibekukan sampai analitik kembali tersedia."
            : "Aksi ini belum mengirim notifikasi nyata. Itu tetap sengaja supaya panel tetap aman di tahap mock data."}
        </div>
      </CardContent>
    </Card>
  );
}

export { MentorInterventionComposer };
