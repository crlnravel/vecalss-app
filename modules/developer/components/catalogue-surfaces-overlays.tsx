"use client";

import { useState, type ReactNode } from "react";

import { AccordionList } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModalVariant } from "@/components/ui/modal-variants";
import { AlertCircle, AlertTriangle, CircleCheckBig, CircleHelp, Info } from "@/lib/icons";

const accordionItems = [
  {
    id: "materi",
    number: "01",
    question: "Bagaimana cara mengulang materi?",
    answer: "Buka materi yang ingin dipelajari, lalu pilih bagian yang belum selesai.",
  },
  {
    id: "jadwal",
    number: "02",
    question: "Di mana saya bisa melihat jadwal belajar?",
    answer: "Jadwal dan target mingguan tampil di halaman Beranda.",
  },
  {
    id: "hasil",
    number: "03",
    question: "Kapan hasil latihan diperbarui?",
    answer: "Ringkasan berubah setelah jawaban latihan selesai diproses.",
  },
];

export function AccordionPreview() {
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Default · satu bagian terbuka</p>
        <p className="text-sm leading-6 text-secondary-600">Nomor, pertanyaan, dan jawaban memakai teks antarmuka 14px di semua ukuran layar. Pemicu memiliki tinggi minimal 44px.</p>
        <AccordionList items={accordionItems} variant="default" />
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Minimal · beberapa bagian bisa terbuka</p>
        <AccordionList
          allowMultiple
          items={accordionItems.map((item) => ({ ...item, id: `minimal-${item.id}` }))}
          variant="minimal"
        />
      </div>
    </div>
  );
}

const modalVariants: Array<{ value: ModalVariant; label: string; icon: ReactNode }> = [
  { value: "default", label: "Default", icon: <CircleHelp aria-hidden="true" /> },
  { value: "info", label: "Info", icon: <Info aria-hidden="true" /> },
  { value: "warning", label: "Peringatan", icon: <AlertTriangle aria-hidden="true" /> },
  { value: "danger", label: "Bahaya", icon: <AlertCircle aria-hidden="true" /> },
  { value: "success", label: "Berhasil", icon: <CircleCheckBig aria-hidden="true" /> },
];

const dialogWidthClasses = {
  compact: "sm:max-w-sm",
  default: "sm:max-w-md",
  wide: "sm:max-w-2xl",
} as const;

type DialogWidth = keyof typeof dialogWidthClasses;
type AlertDialogSize = "default" | "sm";

export function DialogsPreview() {
  const [dialogVariant, setDialogVariant] = useState<ModalVariant>("default");
  const [dialogWidth, setDialogWidth] = useState<DialogWidth>("default");
  const [alertDialogSize, setAlertDialogSize] = useState<AlertDialogSize>("sm");
  const [alertDialogVariant, setAlertDialogVariant] = useState<ModalVariant>("warning");
  const [alertOpen, setAlertOpen] = useState(false);

  return (
    <div className="space-y-7">
      <div className="grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-secondary-800">Dialog · tono</p>
            <div aria-label="Tono del modal" className="flex flex-wrap gap-2" role="group">
              {modalVariants.map(({ value, label }) => (
                <Button
                  aria-pressed={dialogVariant === value}
                  key={value}
                  onClick={() => setDialogVariant(value)}
                  size="sm"
                  type="button"
                  variant={dialogVariant === value ? "default" : "outline"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-secondary-800">Dialog · lebar komposisi</p>
            <div aria-label="Lebar contoh modal" className="flex flex-wrap gap-2" role="group">
              {([
                ["compact", "Ringkas"],
                ["default", "Bawaan"],
                ["wide", "Lebar"],
              ] as const).map(([value, label]) => (
                <Button
                  aria-pressed={dialogWidth === value}
                  key={value}
                  onClick={() => setDialogWidth(value)}
                  size="sm"
                  type="button"
                  variant={dialogWidth === value ? "default" : "outline"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <Dialog>
            <DialogTrigger render={<Button type="button" variant="default" />}>
              Buka dialog
            </DialogTrigger>
            <DialogContent className={dialogWidthClasses[dialogWidth]} variant={dialogVariant}>
              <DialogHeader>
                <DialogTitle>Pratinjau dialog</DialogTitle>
                <DialogDescription>
                  Ukuran dialog diatur lewat batas lebar pada komposisi. Pilihan ini hanya mengubah contoh di halaman.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-2xl border border-voyage-soft-border bg-voyage-sea-glass-wash/45 p-4 text-sm text-voyage-ink">
                Tona saat ini: <span className="font-semibold">{dialogVariantsLabel(dialogVariant)}</span>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Tutup contoh
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="min-w-0 space-y-4 rounded-2xl border border-voyage-soft-border bg-white p-4 sm:p-5">
          <div>
            <h3 className="font-heading text-base font-semibold text-voyage-ink">AlertDialog</h3>
            <p className="mt-1 text-sm leading-6 text-voyage-muted-ink">
              Konfirmasi ini hanya menutup contoh; tidak menjalankan tindakan pada data.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-secondary-700">Ukuran AlertDialog</p>
            <div aria-label="Ukuran konfirmasi" className="flex flex-wrap gap-2" role="group">
              {([
                ["sm", "Ringkas"],
                ["default", "Bawaan"],
              ] as const).map(([value, label]) => (
                <Button
                  aria-pressed={alertDialogSize === value}
                  key={value}
                  onClick={() => setAlertDialogSize(value)}
                  size="sm"
                  type="button"
                  variant={alertDialogSize === value ? "default" : "outline"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-secondary-700">Tone AlertDialog</p>
            <div aria-label="Tone konfirmasi" className="flex flex-wrap gap-2" role="group">
              {modalVariants.map(({ value, label }) => (
                <Button
                  aria-pressed={alertDialogVariant === value}
                  key={value}
                  onClick={() => setAlertDialogVariant(value)}
                  size="sm"
                  type="button"
                  variant={alertDialogVariant === value ? "default" : "outline"}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <AlertDialog onOpenChange={setAlertOpen} open={alertOpen}>
            <AlertDialogTrigger render={<Button type="button" variant="warning" />}>
              Buka konfirmasi
            </AlertDialogTrigger>
            <AlertDialogContent size={alertDialogSize} variant={alertDialogVariant}>
              <AlertDialogHeader>
                <AlertDialogMedia variant={alertDialogVariant}>
                  {modalVariants.find(({ value }) => value === alertDialogVariant)?.icon}
                </AlertDialogMedia>
                <AlertDialogTitle>{dialogVariantsLabel(alertDialogVariant)} · pratinjau konfirmasi</AlertDialogTitle>
                <AlertDialogDescription>
                  Tombol lanjut hanya menutup dialog contoh ini. Tidak ada laporan atau file yang diubah.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Batal</AlertDialogCancel>
                <AlertDialogAction onClick={() => setAlertOpen(false)} type="button">
                  Lanjutkan
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-secondary-800">Media AlertDialog · semua tone</p>
        <div className="flex flex-wrap gap-4">
          {modalVariants.map(({ value, label, icon }) => (
            <div className="flex items-center gap-2" key={value}>
              <AlertDialogMedia variant={value}>{icon}</AlertDialogMedia>
              <span className="text-sm text-secondary-700">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function dialogVariantsLabel(variant: ModalVariant) {
  return modalVariants.find((item) => item.value === variant)?.label ?? variant;
}

const sheetSides = ["top", "right", "bottom", "left"] as const;
type SheetSide = (typeof sheetSides)[number];

const sheetSideLabels: Record<SheetSide, string> = {
  top: "Atas",
  right: "Kanan",
  bottom: "Bawah",
  left: "Kiri",
};

export function SheetsPreview() {
  const [openSide, setOpenSide] = useState<SheetSide | null>(null);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm leading-6 text-secondary-600">
        Pilih salah satu sisi untuk melihat panel masuk dari arah yang berbeda.
      </p>
      <div className="flex flex-wrap gap-2">
        {sheetSides.map((side) => (
          <Sheet
            key={side}
            onOpenChange={(open) => setOpenSide(open ? side : null)}
            open={openSide === side}
          >
            <SheetTrigger render={<Button type="button" variant="outline" />}>
              Dari {sheetSideLabels[side].toLowerCase()}
            </SheetTrigger>
            <SheetContent side={side}>
              <SheetHeader>
                <SheetTitle>Panel dari {sheetSideLabels[side].toLowerCase()}</SheetTitle>
                <SheetDescription>
                  Sheet menampilkan detail sementara di atas halaman yang sedang dibuka.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 py-6 text-sm leading-6 text-secondary-700">
                Contoh ini tidak mengubah halaman atau menyimpan pilihan.
              </div>
              <SheetFooter>
                <SheetClose render={<Button type="button" variant="outline" />}>
                  Tutup panel
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}
      </div>
    </div>
  );
}

export function PopoversTooltipsPreview() {
  const [period, setPeriod] = useState("30 hari");

  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="outline" />}>
            Periode: {period}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
            <PopoverHeader>
              <PopoverTitle>Pilih periode</PopoverTitle>
              <PopoverDescription>Rentang ini hanya mengubah label contoh.</PopoverDescription>
            </PopoverHeader>
            <div className="flex flex-wrap gap-2">
              {["7 hari", "30 hari"].map((value) => (
                <Button
                  aria-pressed={period === value}
                  key={value}
                  onClick={() => setPeriod(value)}
                  size="sm"
                  type="button"
                  variant={period === value ? "default" : "outline"}
                >
                  {value}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger render={<Button type="button" variant="outline" />}>
            Petunjuk singkat
          </TooltipTrigger>
          <TooltipContent side="top">Tekan tombol untuk membuka pilihan.</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger render={<Button type="button" variant="outline" />}>
            Tooltip di kanan
          </TooltipTrigger>
          <TooltipContent side="right">Posisi tooltip dapat diatur.</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export function MenusPreview() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortOrder, setSortOrder] = useState("terbaru");
  const [contextAction, setContextAction] = useState("Belum ada aksi konteks dipilih.");

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-secondary-800">DropdownMenu</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Pilihan menu mengubah status contoh di bawah, tanpa memanggil layanan.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>
            Buka menu pilihan
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Program belajar</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setContextAction("Menu program dipilih.")}>
              Buka program
              <DropdownMenuShortcut>Enter</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            >
              Tampilkan arsip
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Urutkan berdasarkan</DropdownMenuLabel>
            <DropdownMenuRadioGroup onValueChange={setSortOrder} value={sortOrder}>
              <DropdownMenuRadioItem value="terbaru">Terbaru</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="nama">Nama</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Ukuran tampilan</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => setContextAction("Tampilan ringkas dipilih.")}>
                  Ringkas
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setContextAction("Tampilan lega dipilih.")}>
                  Lega
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setIncludeArchived(false)} variant="destructive">
              Hapus filter arsip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p aria-live="polite" className="text-sm text-secondary-600">
          Urutan: <span className="font-medium text-secondary-900">{sortOrder}</span>. Arsip {includeArchived ? "ditampilkan" : "disembunyikan"}.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-secondary-800">ContextMenu</p>
          <p className="mt-1 text-sm leading-6 text-secondary-600">
            Klik kanan atau tekan Shift+F10 setelah area dipilih untuk membuka menu konteks.
          </p>
        </div>
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <button className="flex min-h-28 w-full items-center justify-center rounded-2xl border border-dashed border-voyage-soft-border bg-white px-5 text-center text-sm text-secondary-700 outline-none focus-visible:ring-3 focus-visible:ring-primary-700/25" type="button">
                Area contoh menu konteks
              </button>
            }
          />
          <ContextMenuContent>
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => setContextAction("Salin tautan contoh dipilih.")}>
                Salin tautan
              </ContextMenuItem>
              <ContextMenuItem onClick={() => setContextAction("Buka di tab baru dipilih.")}>
                Buka di tab baru
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => setContextAction("Aksi arsip contoh dipilih; tidak ada data yang diubah.")}
              variant="destructive"
            >
              Arsipkan contoh
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <p aria-live="polite" className="text-sm text-secondary-600">{contextAction}</p>
      </div>
    </div>
  );
}
