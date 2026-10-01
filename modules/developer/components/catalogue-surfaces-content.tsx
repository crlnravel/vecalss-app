"use client";

import Image from "next/image";
import { useState } from "react";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from "@/components/ui/bubble";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";
import { TypedRouteState, type RouteStateKind } from "@/components/ui/typed-route-state";
import { BookOpen, Check, CircleHelp, FileText, Image as ImageIcon } from "@/lib/icons";

export function CardsPreview() {
  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Card · ukuran bawaan dan ringkas</p>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <Card size="default">
            <CardHeader className="border-b border-voyage-soft-border">
              <CardTitle>Ringkasan belajar</CardTitle>
              <CardDescription>Susunan standar dengan jarak bawaan.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-secondary-700">Bagian berikutnya: peluang kejadian.</p>
            </CardContent>
            <CardFooter className="border-t border-voyage-soft-border text-xs text-secondary-600">
              Diperbarui hari ini
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader className="border-b border-voyage-soft-border">
              <CardTitle>Catatan singkat</CardTitle>
              <CardDescription>Jarak lebih padat untuk ringkasan.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-secondary-700">Latihan terakhir masih bisa dilanjutkan.</p>
            </CardContent>
            <CardFooter className="border-t border-voyage-soft-border text-xs text-secondary-600">
              Mode ringkas
            </CardFooter>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">StudentCatalogueCard · materi, kuis, tryout</p>
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <StudentCatalogueCard aria-label="Contoh kartu Materi" href="#cards" variant="materi">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-800">
              <BookOpen aria-hidden="true" className="size-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-primary-700">MATERI</p>
              <h3 className="mt-1 font-heading text-lg font-semibold text-secondary-900">Peluang dan kejadian</h3>
              <p className="mt-1 text-sm text-secondary-600">8 bagian · 3 sudah dipelajari</p>
            </div>
          </StudentCatalogueCard>

          <StudentCatalogueCard aria-label="Contoh kartu Kuis" href="#cards" variant="kuis">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-voyage-sea-glass-wash px-3 py-1 text-xs font-semibold text-voyage-deep">Kuis</span>
              <span className="text-xs text-secondary-500">12 soal</span>
            </div>
            <div className="mt-5">
              <h3 className="font-heading text-xl font-semibold text-secondary-900">Logika dasar</h3>
              <p className="mt-2 text-sm leading-6 text-secondary-600">Latihan singkat untuk mengasah pola dan penalaran.</p>
            </div>
            <span className="mt-auto pt-6 text-sm font-semibold text-primary-800">Lihat kuis</span>
          </StudentCatalogueCard>

          <StudentCatalogueCard aria-label="Contoh kartu Tryout" href="#cards" variant="tryout">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <Image
                alt=""
                className="object-cover"
                fill
                priority={false}
                sizes="(min-width: 1280px) 28rem, (min-width: 1024px) 45vw, 100vw"
                src="/landing-assets/hero-voyage-higgsfield.png"
              />
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold tracking-wide text-primary-700">TRYOUT</p>
              <h3 className="mt-1 font-heading text-lg font-semibold text-secondary-900">Simulasi akhir pekan</h3>
              <p className="mt-1 text-sm text-secondary-600">Contoh kartu dengan area gambar di bagian atas.</p>
            </div>
          </StudentCatalogueCard>
        </div>
      </div>
    </div>
  );
}

const routeStates: Array<{ kind: RouteStateKind; title: string; description: string }> = [
  { kind: "archived", title: "Materi sudah diarsipkan", description: "Materi ini tidak lagi muncul di daftar aktif." },
  { kind: "broken", title: "Tampilan belum bisa dibuka", description: "Ada bagian yang perlu diperiksa. Coba muat ulang halaman." },
  { kind: "cached", title: "Menampilkan data terakhir", description: "Data terbaru belum tersedia, jadi halaman memakai hasil yang tersimpan." },
  { kind: "demo", title: "Ini halaman contoh", description: "Isi ini hanya membantu menunjukkan susunan keadaan halaman." },
  { kind: "empty", title: "Belum ada materi", description: "Materi yang ditambahkan akan muncul di sini." },
  { kind: "error", title: "Data belum dapat dimuat", description: "Periksa koneksi lalu coba muat halaman lagi." },
  { kind: "loading", title: "Sedang memuat halaman", description: "Sebentar, kami sedang menyiapkan isinya." },
  { kind: "no-attempt", title: "Belum ada hasil latihan", description: "Hasil akan tampil setelah latihan selesai." },
  { kind: "not-found", title: "Halaman tidak ditemukan", description: "Periksa tautan atau kembali ke daftar sebelumnya." },
  { kind: "unavailable", title: "Materi sementara tidak tersedia", description: "Coba buka kembali beberapa saat lagi." },
];

const emptyMediaVariants = ["default", "icon"] as const;

export function EmptyStatesPreview() {
  const [routeStateIndex, setRouteStateIndex] = useState(4);
  const routeState = routeStates[routeStateIndex];

  return (
    <div className="space-y-7">
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {emptyMediaVariants.map((variant) => (
          <Empty className="min-h-56 rounded-2xl border border-dashed border-voyage-soft-border bg-white px-5 py-8" key={variant}>
            <EmptyHeader>
              <EmptyMedia variant={variant}>
                {variant === "icon" ? <CircleHelp aria-hidden="true" /> : <BookOpen aria-hidden="true" className="size-8 text-primary-700" />}
              </EmptyMedia>
              <EmptyTitle>{variant === "icon" ? "Belum ada kuis" : "Belum ada materi"}</EmptyTitle>
              <EmptyDescription>
                {variant === "icon"
                  ? "Kuis yang tersedia untukmu akan muncul di daftar ini."
                  : "Materi yang kamu simpan akan muncul di daftar ini."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <p className="text-xs text-secondary-500">EmptyMedia variant: {variant}</p>
            </EmptyContent>
          </Empty>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-voyage-soft-border bg-voyage-canvas/70 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-secondary-800">TypedRouteState · seluruh keadaan rute</p>
            <p aria-live="polite" className="mt-1 text-xs text-secondary-600">
              {routeStateIndex + 1} dari {routeStates.length} · {routeState.kind}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              aria-label="Lihat keadaan rute sebelumnya"
              onClick={() => setRouteStateIndex((current) => (current - 1 + routeStates.length) % routeStates.length)}
              size="sm"
              type="button"
              variant="outline"
            >
              Sebelumnya
            </Button>
            <Button
              aria-label="Lihat keadaan rute berikutnya"
              onClick={() => setRouteStateIndex((current) => (current + 1) % routeStates.length)}
              size="sm"
              type="button"
              variant="outline"
            >
              Berikutnya
            </Button>
          </div>
        </div>
        <TypedRouteState
          as="section"
          className="min-h-0 rounded-2xl bg-transparent px-2 py-5 sm:px-4"
          description={routeState.description}
          kind={routeState.kind}
          title={routeState.title}
        />
      </div>
    </div>
  );
}

export function ProgressSkeletonPreview() {
  const [progress, setProgress] = useState(64);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className="grid min-w-0 gap-7 lg:grid-cols-2">
      <div className="space-y-5">
        <div>
          <h3 className="font-heading text-base font-semibold text-secondary-900">Progress</h3>
          <p className="mt-1 text-sm leading-6 text-secondary-600">Nilai bisa diubah dengan tombol di bawah.</p>
        </div>
        <Progress aria-label="Progres materi Peluang" value={progress}>
          <ProgressLabel>Materi Peluang</ProgressLabel>
          <ProgressValue />
        </Progress>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={progress <= 0}
            onClick={() => setProgress((current) => Math.max(0, current - 10))}
            type="button"
            variant="outline"
          >
            Kurangi 10%
          </Button>
          <Button
            disabled={progress >= 100}
            onClick={() => setProgress((current) => Math.min(100, current + 10))}
            type="button"
            variant="default"
          >
            Tambah 10%
          </Button>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-secondary-900">Skeleton</h3>
            <p className="mt-1 text-sm leading-6 text-secondary-600">Pratinjau pemuatan dapat dinyalakan atau disembunyikan.</p>
          </div>
          <Button onClick={() => setIsLoading((current) => !current)} type="button" variant="outline">
            {isLoading ? "Tampilkan isi" : "Tampilkan skeleton"}
          </Button>
        </div>
        {isLoading ? (
          <div aria-label="Contoh pemuatan" className="space-y-3 rounded-2xl border border-voyage-soft-border bg-white p-5" role="status">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-10 w-36" />
            <span className="sr-only">Contoh isi sedang dimuat.</span>
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-voyage-soft-border bg-white p-5">
            <h4 className="font-semibold text-secondary-900">Peluang kejadian</h4>
            <p className="text-sm leading-6 text-secondary-600">Selesaikan satu bagian lagi untuk menutup materi ini.</p>
            <Button size="sm" type="button" variant="outline">Lanjutkan materi</Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SeparatorPreview() {
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Horizontal</p>
        <div className="space-y-3 rounded-2xl border border-voyage-soft-border bg-white p-4">
          <p className="text-sm text-secondary-700">Informasi materi</p>
          <Separator orientation="horizontal" />
          <p className="text-sm text-secondary-700">Informasi kuis</p>
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Vertical</p>
        <div className="flex min-h-20 items-center justify-center gap-4 rounded-2xl border border-voyage-soft-border bg-white p-4">
          <span className="text-sm text-secondary-700">Materi</span>
          <Separator className="h-8" orientation="vertical" />
          <span className="text-sm text-secondary-700">Kuis</span>
          <Separator className="h-8" orientation="vertical" />
          <span className="text-sm text-secondary-700">Tryout</span>
        </div>
      </div>
    </div>
  );
}

const attachmentStates = [
  ["idle", "Siap dipilih"],
  ["uploading", "Sedang diunggah"],
  ["processing", "Sedang diproses"],
  ["error", "Unggahan gagal"],
  ["done", "Selesai · 320 KB"],
] as const;

const attachmentSizes = ["default", "sm", "xs"] as const;
const attachmentOrientations = ["horizontal", "vertical"] as const;

export function AttachmentsPreview() {
  const [selectedFile, setSelectedFile] = useState("Belum ada lampiran yang dipilih.");
  const [isMarked, setIsMarked] = useState(false);

  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">AttachmentMedia · ikon dan gambar</p>
        <AttachmentGroup className="flex-wrap overflow-visible">
          <Attachment className="max-w-full" size="default" state="done">
            <AttachmentMedia variant="icon">
              <FileText aria-hidden="true" />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>Ringkasan-bab.pdf</AttachmentTitle>
              <AttachmentDescription>PDF · 320 KB</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                aria-label={isMarked ? "Lepas tanda file" : "Tandai file contoh"}
                onClick={() => setIsMarked((current) => !current)}
                type="button"
              >
                <Check aria-hidden="true" />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Attachment className="max-w-full" size="default" state="done">
            <AttachmentMedia variant="image">
              <Image alt="" height={40} src="/landing-assets/program-consultation.svg" width={40} />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>Jadwal-belajar.svg</AttachmentTitle>
              <AttachmentDescription>Gambar · 64 KB</AttachmentDescription>
            </AttachmentContent>
          </Attachment>
        </AttachmentGroup>
        <p aria-live="polite" className="text-xs text-secondary-600">
          {isMarked ? "File contoh ditandai untuk ditinjau." : "Tombol centang menandai file contoh secara lokal."}
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Ukuran × orientasi</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {attachmentSizes.flatMap((size) =>
            attachmentOrientations.map((orientation) => (
              <div className="min-w-0 space-y-2" key={`${size}-${orientation}`}>
                <p className="text-xs font-medium text-secondary-600">{size} · {orientation}</p>
                <Attachment
                  className={orientation === "vertical" ? "max-w-32" : "w-full"}
                  orientation={orientation}
                  size={size}
                  state="done"
                >
                  <AttachmentMedia variant="icon"><FileText aria-hidden="true" /></AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>Materi.pdf</AttachmentTitle>
                    <AttachmentDescription>PDF · siap dibuka</AttachmentDescription>
                  </AttachmentContent>
                </Attachment>
              </div>
            )),
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Attachment · semua status</p>
        <AttachmentGroup aria-label="Contoh status lampiran" className="pb-2">
          {attachmentStates.map(([state, description]) => (
            <Attachment key={state} size="sm" state={state}>
              <AttachmentMedia variant="icon"><FileText aria-hidden="true" /></AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>Catatan.pdf</AttachmentTitle>
                <AttachmentDescription>{description}</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          ))}
        </AttachmentGroup>
        <p className="text-xs text-secondary-500">Status contoh tidak mengunggah file.</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">AttachmentTrigger</p>
        <Attachment className="max-w-md" size="default" state="idle">
          <AttachmentTrigger
            aria-label="Pilih lampiran contoh"
            onClick={() => setSelectedFile("Ringkasan materi dipilih untuk pratinjau.")}
          />
          <AttachmentMedia variant="icon"><ImageIcon aria-hidden="true" /></AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>Pilih lampiran</AttachmentTitle>
            <AttachmentDescription>Seluruh perubahan hanya di galeri.</AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction
              aria-label="Tandai lampiran contoh untuk ditinjau"
              onClick={() => setSelectedFile("Lampiran contoh ditandai untuk ditinjau.")}
              type="button"
              variant="outline"
            >
              <Check aria-hidden="true" />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
        <p aria-live="polite" className="text-xs text-secondary-600">{selectedFile}</p>
      </div>
    </div>
  );
}

const bubbleVariants = [
  "default",
  "secondary",
  "muted",
  "tinted",
  "outline",
  "ghost",
  "destructive",
] as const;

const reactionPositions = [
  { side: "top", align: "start" },
  { side: "top", align: "end" },
  { side: "bottom", align: "start" },
  { side: "bottom", align: "end" },
] as const;

function ReactionPositionExample({ side, align }: (typeof reactionPositions)[number]) {
  const [selected, setSelected] = useState(false);

  return (
    <Bubble
      align="start"
      className={side === "top" ? "w-full max-w-56 pt-4" : "w-full max-w-56 pb-4"}
      variant="outline"
    >
      <BubbleContent>Contoh balasan singkat.</BubbleContent>
      <BubbleReactions align={align} side={side}>
        <button
          aria-pressed={selected}
          className="min-h-[44px] rounded-full px-3 text-xs font-medium text-secondary-800 outline-none focus-visible:ring-2 focus-visible:ring-primary-700/30"
          onClick={() => setSelected((current) => !current)}
          type="button"
        >
          Suka · {selected ? 5 : 4}
        </button>
      </BubbleReactions>
    </Bubble>
  );
}

export function BubblesPreview() {
  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Bubble · seluruh tone</p>
        <BubbleGroup className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {bubbleVariants.map((variant, index) => (
            <div className="min-w-0 space-y-2" key={variant}>
              <p className="text-xs font-medium text-secondary-600">{variant} · {index % 2 === 0 ? "start" : "end"}</p>
              <Bubble align={index % 2 === 0 ? "start" : "end"} variant={variant}>
                <BubbleContent>
                  {variant === "destructive" ? "Ada bagian yang perlu diperiksa." : "Materi sudah siap dipelajari."}
                </BubbleContent>
              </Bubble>
            </div>
          ))}
        </BubbleGroup>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">BubbleReactions · posisi atas/bawah × awal/akhir</p>
        <div className="grid min-w-0 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          {reactionPositions.map((position) => (
            <div className="min-w-0 space-y-2" key={`${position.side}-${position.align}`}>
              <p className="text-xs font-medium text-secondary-600">{position.side} · {position.align}</p>
              <ReactionPositionExample align={position.align} side={position.side} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
