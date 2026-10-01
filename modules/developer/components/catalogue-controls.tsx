"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";

import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CompactFilterTabs,
  CompactTabsList,
  CompactTabsTrigger,
} from "@/components/ui/compact-filter-tabs";
import { CsvTemplateDownload } from "@/components/ui/csv-template-download";
import {
  Field,
  FieldError,
  FieldInput,
  FieldLabel,
  FieldTextarea,
} from "@/components/ui/field";
import { FileUploadSlot } from "@/components/ui/file-upload-slot";
import {
  FullWidthTabsList,
  FullWidthTabsTrigger,
} from "@/components/ui/full-width-tabs";
import { Input } from "@/components/ui/input";
import { ModeCardTabs } from "@/components/ui/mode-card-tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RadioPillGroup } from "@/components/ui/radio-pill-group";
import {
  SunkenTabButton,
  SunkenTabLink,
  SunkenTabNavigation,
} from "@/components/ui/sunken-tabs";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowRight, BookOpenText, Check, GraduationCap, LoaderCircle, Sparkles } from "@/lib/icons";

type ButtonVariant = NonNullable<ComponentProps<typeof Button>["variant"]>;
type ButtonSize = NonNullable<ComponentProps<typeof Button>["size"]>;
type BadgeTone = NonNullable<ComponentProps<typeof Badge>["tone"]>;
type BadgeSize = NonNullable<ComponentProps<typeof Badge>["size"]>;
type BadgeDepth = NonNullable<ComponentProps<typeof Badge>["depth"]>;

export type ControlSection = {
  id: string;
  title: string;
  description: string;
  sources: string[];
  preview: ReactNode;
};

const BUTTON_VARIANTS = [
  "default",
  "outline",
  "destructive",
  "warning",
  "inverse",
] satisfies readonly ButtonVariant[];

const BUTTON_SIZES = [
  "sm",
  "default",
  "lg",
  "icon-sm",
  "icon",
  "icon-lg",
] satisfies readonly ButtonSize[];

const BADGE_TONES = [
  "category",
  "neutral",
  "active",
  "attention",
  "success",
  "info",
  "danger",
] satisfies readonly BadgeTone[];
const BADGE_SIZES = ["xs", "sm", "md"] satisfies readonly BadgeSize[];
const BADGE_DEPTHS = ["flat", "sunken"] satisfies readonly BadgeDepth[];

const BADGE_TONE_LABELS: Record<BadgeTone, string> = {
  category: "Kategori",
  neutral: "Tersimpan",
  active: "Sedang dipelajari",
  attention: "Perlu ditinjau",
  success: "Selesai",
  info: "Latihan",
  danger: "Keliru",
};

const INPUT_TYPES = ["text", "email", "search", "password"] as const;
type DemoInputType = (typeof INPUT_TYPES)[number];

const AVATAR_PLACEHOLDER_SRC = "/landing-assets/avatar-placeholder.png";
const AVATAR_FAILURE_SRC = "/avatar-katalog-demo-gambar-tidak-tersedia.png";

const CSV_TEMPLATE_HREF =
  "data:text/csv;charset=utf-8," +
  encodeURIComponent("pertanyaan,opsi_a,opsi_b,jawaban\nContoh pertanyaan,A,B,A\n");

function DemoGroup({
  api,
  children,
  title,
}: {
  api: string;
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-3 border-t border-voyage-soft-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold text-voyage-ink">{title}</h3>
        <code className="break-all text-xs text-voyage-muted-ink">{api}</code>
      </div>
      {children}
    </div>
  );
}

function DemoChoice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="min-h-[44px]"
      onClick={onClick}
      type="button"
      variant={active ? "default" : "outline"}
    >
      {children}
    </Button>
  );
}

function ButtonPreview() {
  const [variant, setVariant] = useState<ButtonVariant>("default");
  const [size, setSize] = useState<ButtonSize>("default");
  const [iconMode, setIconMode] = useState<"none" | "start" | "end">("none");
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionCount, setActionCount] = useState(0);
  const isIconSize = String(size).startsWith("icon");

  return (
    <div className="space-y-7">
      <DemoGroup api="Button · variant · size · disabled · aria-busy" title="Pratinjau yang bisa diubah">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ukuran</span>
            {BUTTON_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>
                {option}
              </DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ikon</span>
            <DemoChoice active={iconMode === "none"} onClick={() => setIconMode("none")}>Tanpa ikon</DemoChoice>
            <DemoChoice active={iconMode === "start"} onClick={() => setIconMode("start")}>Di kiri</DemoChoice>
            <DemoChoice active={iconMode === "end"} onClick={() => setIconMode("end")}>Di kanan</DemoChoice>
            <DemoChoice active={disabled} onClick={() => setDisabled((current) => !current)}>Nonaktif</DemoChoice>
            <DemoChoice active={loading} onClick={() => setLoading((current) => !current)}>Memuat</DemoChoice>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button
              aria-busy={loading}
              aria-label={isIconSize ? (loading ? "Aksi sedang dimuat" : "Contoh tombol ikon") : undefined}
              disabled={disabled || loading}
              onClick={() => setActionCount((current) => current + 1)}
              size={size}
              type="button"
              variant={variant}
            >
              {loading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                  data-icon={isIconSize ? undefined : "inline-start"}
                />
              ) : isIconSize || iconMode === "start" ? (
                <Sparkles aria-hidden="true" data-icon="inline-start" size={16} />
              ) : null}
              {!isIconSize ? (loading ? "Memuat…" : "Lanjut") : null}
              {!loading && !isIconSize && iconMode === "end" ? (
                <ArrowRight aria-hidden="true" data-icon="inline-end" size={16} />
              ) : null}
            </Button>
            <p aria-live="polite" className="text-sm text-voyage-muted-ink">
              Aktivasi contoh: {actionCount}
            </p>
          </div>
          <p className="text-xs text-voyage-muted-ink">
            Status memuat dirangkai dari <code>disabled</code>, <code>aria-busy</code>, dan ikon; komponen tidak memiliki prop <code>loading</code>.
          </p>
        </div>
      </DemoGroup>

      <DemoGroup api={`buttonVariants · ${BUTTON_VARIANTS.length} nilai variant`} title="Semua varian">
        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {BUTTON_VARIANTS.map((option) => {
            const usesDarkSurface = option === "inverse";

            return (
              <div
                className={usesDarkSurface ? "flex min-w-0 flex-col items-start gap-2 rounded-2xl bg-voyage-deep p-3" : "flex min-w-0 flex-col items-start gap-2 border-b border-voyage-soft-border py-3"}
                key={option}
              >
                <Button
                  aria-pressed={variant === option}
                  onClick={() => setVariant(option)}
                  size="default"
                  type="button"
                  variant={option}
                >
                  <Sparkles aria-hidden="true" data-icon="inline-start" size={16} />
                  Contoh
                </Button>
                <code className={usesDarkSurface ? "text-xs text-white/80" : "text-xs text-voyage-muted-ink"}>
                  {`variant="${option}"`}
                </code>
              </div>
            );
          })}
        </div>
      </DemoGroup>

      <DemoGroup api={`buttonVariants · ${BUTTON_SIZES.length} nilai size`} title="Semua ukuran">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUTTON_SIZES.map((option) => {
            const isIconOnly = String(option).startsWith("icon");

            return (
              <div className="flex min-w-0 flex-col items-start gap-2 border-b border-voyage-soft-border py-3" key={option}>
                <Button
                  aria-label={isIconOnly ? "Contoh tombol ikon" : undefined}
                  onClick={() => setSize(option)}
                  size={option}
                  type="button"
                  variant="default"
                >
                  {isIconOnly ? <Sparkles aria-hidden="true" size={16} /> : "Lanjut"}
                </Button>
                <code className="text-xs text-voyage-muted-ink">{`size="${option}"`}</code>
              </div>
            );
          })}
        </div>
      </DemoGroup>

      <DemoGroup api="Button · disabled · ikon awal/akhir · icon-only" title="Status dan penempatan ikon">
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled type="button" variant="default">Nonaktif</Button>
          <Button aria-busy="true" disabled type="button" variant="default">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            Memuat…
          </Button>
          <Button type="button" variant="default">
            <Sparkles aria-hidden="true" data-icon="inline-start" size={16} />
            Ikon di kiri
          </Button>
          <Button type="button" variant="outline">
            Ikon di kanan
            <ArrowRight aria-hidden="true" data-icon="inline-end" size={16} />
          </Button>
          <Button aria-label="Simpan contoh" size="icon" type="button" variant="default">
            <Check aria-hidden="true" size={18} />
          </Button>
        </div>
      </DemoGroup>
    </div>
  );
}

function BadgePreview() {
  const [tone, setTone] = useState<BadgeTone>("category");
  const [size, setSize] = useState<BadgeSize>("sm");
  const [depth, setDepth] = useState<BadgeDepth>("sunken");

  return (
    <div className="space-y-7">
      <DemoGroup api="Badge · tone · size · depth" title="Pratinjau yang bisa diubah">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Tone</span>
            {BADGE_TONES.map((option) => (
              <DemoChoice active={tone === option} key={option} onClick={() => setTone(option)}>
                {option}
              </DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ukuran</span>
            {BADGE_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>
                {option}
              </DemoChoice>
            ))}
            <span className="ml-2 text-xs font-semibold text-voyage-muted-ink">Kedalaman</span>
            {BADGE_DEPTHS.map((option) => (
              <DemoChoice active={depth === option} key={option} onClick={() => setDepth(option)}>
                {option}
              </DemoChoice>
            ))}
          </div>
          <Badge depth={depth} size={size} tone={tone}>{BADGE_TONE_LABELS[tone]}</Badge>
        </div>
      </DemoGroup>

      <DemoGroup
        api={`badgeVariants · ${BADGE_TONES.length} tone × ${BADGE_SIZES.length} ukuran × ${BADGE_DEPTHS.length} kedalaman`}
        title="Semua kombinasi"
      >
        <div className="space-y-4">
          {BADGE_TONES.map((badgeTone) => (
            <div className="flex min-w-0 flex-col gap-3 border-b border-voyage-soft-border pb-4" key={badgeTone}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="text-xs font-semibold text-voyage-ink">{`tone="${badgeTone}"`}</code>
                <span className="text-xs text-voyage-muted-ink">{BADGE_TONE_LABELS[badgeTone]}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {BADGE_DEPTHS.map((badgeDepth) => (
                  <div className="flex min-w-0 flex-col gap-2" key={badgeDepth}>
                    <code className="text-xs text-voyage-muted-ink">{`depth="${badgeDepth}"`}</code>
                    <div className="flex flex-wrap items-center gap-3">
                      {BADGE_SIZES.map((badgeSize) => (
                        <div className="flex flex-col items-start gap-1" key={badgeSize}>
                          <Badge depth={badgeDepth} size={badgeSize} tone={badgeTone}>
                            {BADGE_TONE_LABELS[badgeTone]}
                          </Badge>
                          <code className="text-xs text-voyage-muted-ink">{`size="${badgeSize}"`}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DemoGroup>
    </div>
  );
}

function FieldPreview() {
  const [inputType, setInputType] = useState<DemoInputType>("email");
  const [inputValue, setInputValue] = useState("alya@vecalss.id");
  const [fullName, setFullName] = useState("");
  const [summary, setSummary] = useState("");
  const [showNameError, setShowNameError] = useState(false);
  const hasNameError = showNameError && fullName.trim().length === 0;

  return (
    <div className="space-y-7">
      <DemoGroup api="Input · native type · disabled · aria-invalid" title="Input">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">type</span>
            {INPUT_TYPES.map((option) => (
              <DemoChoice active={inputType === option} key={option} onClick={() => setInputType(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-voyage-ink" htmlFor="catalog-control-input">
              Alamat email contoh
              <Input
                autoComplete="off"
                id="catalog-control-input"
                onChange={(event) => setInputValue(event.currentTarget.value)}
                type={inputType}
                value={inputValue}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-voyage-ink" htmlFor="catalog-control-search">
              Pencarian
              <Input id="catalog-control-search" placeholder="Cari materi…" type="search" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-voyage-ink" htmlFor="catalog-control-disabled">
              Tidak dapat diubah
              <Input disabled id="catalog-control-disabled" value="Contoh yang dikunci" />
            </label>
            <label className="grid gap-2 text-sm font-medium text-voyage-ink" htmlFor="catalog-control-invalid">
              Nilai tidak valid
              <Input aria-invalid="true" id="catalog-control-invalid" defaultValue="alamat keliru" />
            </label>
          </div>
          <p className="text-xs text-voyage-muted-ink">
            <code>Input</code> memakai atribut input native dan tidak memiliki varian desain khusus.
          </p>
        </div>
      </DemoGroup>

      <DemoGroup api="Field · FieldLabel · FieldInput · FieldTextarea · FieldError" title="Field">
        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="catalog-control-name" required>Nama lengkap</FieldLabel>
            <FieldInput
              aria-describedby={hasNameError ? "catalog-control-name-error" : undefined}
              aria-invalid={hasNameError}
              id="catalog-control-name"
              onChange={(event) => setFullName(event.currentTarget.value)}
              placeholder="Alya Ramadhani"
              required
              value={fullName}
            />
            <FieldError
              error={hasNameError ? "Isi nama lengkap untuk melanjutkan." : undefined}
              id="catalog-control-name-error"
            />
            <DemoChoice active={showNameError} onClick={() => setShowNameError((current) => !current)}>
              {showNameError ? "Sembunyikan pesan" : "Tampilkan pesan validasi"}
            </DemoChoice>
          </Field>

          <Field>
            <FieldLabel htmlFor="catalog-control-summary">Ringkasan</FieldLabel>
            <FieldTextarea
              id="catalog-control-summary"
              onChange={(event) => setSummary(event.currentTarget.value)}
              placeholder="Tambahkan keterangan singkat"
              value={summary}
            />
            <p className="text-xs text-voyage-muted-ink">Label tanpa tanda wajib bersifat opsional.</p>
          </Field>

          <Field>
            <FieldLabel htmlFor="catalog-control-field-disabled">Field nonaktif</FieldLabel>
            <FieldInput disabled id="catalog-control-field-disabled" value="Nilai tersimpan" />
          </Field>
        </div>
      </DemoGroup>
    </div>
  );
}

function ChoiceControlsPreview() {
  const [checked, setChecked] = useState<boolean | "indeterminate">(false);
  const [radioValue, setRadioValue] = useState("deep");
  const [defaultSwitch, setDefaultSwitch] = useState(true);
  const [smallSwitch, setSmallSwitch] = useState(false);
  const [pillValue, setPillValue] = useState("semua");

  return (
    <div className="space-y-7">
      <DemoGroup api="Checkbox · checked · onCheckedChange" title="Checkbox">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex min-h-11 items-center gap-3 text-sm text-voyage-ink">
            <Checkbox aria-label="Terima pembaruan materi" checked={checked === true} indeterminate={checked === "indeterminate"} id="catalog-control-checkbox" onCheckedChange={setChecked} />
            Terima pembaruan materi
          </label>
          <span aria-live="polite" className="text-xs text-voyage-muted-ink">
            {checked === "indeterminate" ? "Sebagian dipilih" : checked ? "Dipilih" : "Belum dipilih"}
          </span>
          <DemoChoice active={checked === "indeterminate"} onClick={() => setChecked("indeterminate")}>
            Tampilkan keadaan sebagian
          </DemoChoice>
            <label className="inline-flex min-h-11 items-center gap-3 text-sm text-voyage-muted-ink">
            <Checkbox aria-label="Pilihan nonaktif" checked disabled id="catalog-control-checkbox-disabled" />
            Pilihan nonaktif
          </label>
        </div>
      </DemoGroup>

      <DemoGroup api="RadioGroup · RadioGroupItem · value" title="Radio group">
        <RadioGroup
          aria-label="Pilih tema"
          className="max-w-xl grid-cols-1 sm:grid-cols-3"
          onValueChange={(value) => setRadioValue(String(value))}
          value={radioValue}
        >
          {[
            { value: "deep", label: "Voyage Deep", disabled: false },
            { value: "forest", label: "Voyage Forest", disabled: false },
            { value: "leaf", label: "Voyage Leaf", disabled: false },
            { value: "archived", label: "Arsip", disabled: true },
          ].map((option) => (
            <label className="inline-flex min-h-11 items-center gap-3 text-sm text-voyage-ink" key={option.value}>
              <RadioGroupItem aria-label={option.label} disabled={option.disabled} id={"catalog-radio-" + option.value} value={option.value} />
              {option.label}
            </label>
          ))}
        </RadioGroup>
        <p aria-live="polite" className="text-xs text-voyage-muted-ink">Pilihan: {radioValue}</p>
      </DemoGroup>

      <DemoGroup api={'Switch · size="default" | "sm"'} title="Switch">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm text-voyage-ink">
            Pemberitahuan kelas
            <Switch aria-label="Pemberitahuan kelas" checked={defaultSwitch} onCheckedChange={setDefaultSwitch} size="default" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm text-voyage-ink">
            Pengingat email
            <Switch aria-label="Pengingat email" checked={smallSwitch} onCheckedChange={setSmallSwitch} size="sm" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-4 text-sm text-voyage-muted-ink">
            Contoh nonaktif
            <Switch aria-label="Contoh nonaktif" checked disabled onCheckedChange={() => undefined} size="sm" />
          </label>
        </div>
      </DemoGroup>

      <DemoGroup api="RadioPillGroup · options · value · onValueChange" title="Radio pill group">
        <fieldset className="min-w-0">
          <legend className="sr-only">Filter daftar materi</legend>
          <RadioPillGroup
            name="catalog-control-filter"
            onValueChange={setPillValue}
            options={[
              { label: "Semua", value: "semua" },
              { label: "Materi", value: "materi" },
              { label: "Latihan", value: "latihan" },
            ]}
            value={pillValue}
          />
        </fieldset>
        <p aria-live="polite" className="text-xs text-voyage-muted-ink">Filter terpilih: {pillValue}</p>
      </DemoGroup>
    </div>
  );
}

type UploadDemoState = "empty" | "selected" | "uploading" | "complete" | "disabled";

function FileControlsPreview() {
  const [stage, setStage] = useState<UploadDemoState>("empty");
  const [file, setFile] = useState<File | null>(null);

  function setDemoStage(nextStage: UploadDemoState) {
    setStage(nextStage);
    if (nextStage === "empty" || nextStage === "disabled") {
      setFile(null);
      return;
    }
    setFile(new File(["pertanyaan,opsi_a,opsi_b,jawaban\n"], "contoh-soal.csv", { type: "text/csv" }));
  }

  return (
    <div className="space-y-7">
      <DemoGroup api="FileUploadSlot · file · disabled · uploading · progress · completed" title="Status unggah berkas">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["empty", "selected", "uploading", "complete", "disabled"] as const).map((option) => (
              <DemoChoice active={stage === option} key={option} onClick={() => setDemoStage(option)}>
                {{
                  empty: "Kosong",
                  selected: "Berkas dipilih",
                  uploading: "Sedang diunggah",
                  complete: "Selesai",
                  disabled: "Nonaktif",
                }[option]}
              </DemoChoice>
            ))}
          </div>
          <FileUploadSlot
            accept=".csv,text/csv"
            browseLabel="pilih berkas"
            completed={stage === "complete"}
            completionLabel="Contoh siap digunakan"
            disabled={stage === "disabled"}
            file={file}
            maxSizeLabel="Pilih CSV atau seret berkas ke area ini."
            onCancelUpload={() => setDemoStage("selected")}
            onChange={(nextFile) => setFile(nextFile)}
            progress={stage === "uploading" ? 58 : stage === "complete" ? 100 : null}
            uploadLabel="Mengunggah contoh…"
            uploadMeta="Status simulasi"
            uploading={stage === "uploading"}
          />
          <p className="text-xs text-voyage-muted-ink">
            Pilihan status hanya mengubah pratinjau lokal; berkas tidak dikirim.
          </p>
        </div>
      </DemoGroup>

      <MultiFileUploadPreview />

      <DemoGroup api="CsvTemplateDownload · href · fileName · title · description" title="Unduh templat CSV">
        <CsvTemplateDownload
          description="Berkas contoh berisi kolom pertanyaan dan pilihan jawaban."
          fileName="templat-soal-contoh.csv"
          href={CSV_TEMPLATE_HREF}
          title="Templat soal"
        />
      </DemoGroup>
    </div>
  );
}

type MultiFileSlot = {
  id: number;
  file: File | null;
};

function MultiFileUploadPreview() {
  const [slots, setSlots] = useState<MultiFileSlot[]>([{ id: 1, file: null }]);
  const nextSlotId = useRef(2);

  function addSlot() {
    const newSlot = { id: nextSlotId.current++, file: null };
    setSlots((current) => [...current, newSlot]);
  }

  function updateFile(slotId: number, file: File | null) {
    setSlots((current) => current.map((slot) => (slot.id === slotId ? { ...slot, file } : slot)));
  }

  function addSelectedFiles(slotId: number, files: File[]) {
    if (files.length === 0) return;

    const selectedSlots = files.map((file, index) => ({
      id: index === 0 ? slotId : nextSlotId.current++,
      file,
    }));
    const emptySlot = { id: nextSlotId.current++, file: null };

    setSlots((current) => {
      if (!current.some((slot) => slot.id === slotId)) return current;
      return [
        ...current.flatMap((slot) => (slot.id === slotId ? selectedSlots : [slot])),
        emptySlot,
      ];
    });
  }

  return (
    <DemoGroup api="FileUploadSlot · multiple · onFilesSelected · file · onChange" title="Pilih beberapa berkas">
      <div className="space-y-4">
        <p className="max-w-[65ch] text-sm leading-6 text-voyage-muted-ink">
          Pilih satu atau beberapa CSV. Setiap berkas terpilih mendapat slot sendiri; semua perubahan hanya tersimpan di pratinjau ini.
        </p>
        <Button className="min-h-[44px]" onClick={addSlot} type="button" variant="outline">
          Tambah slot berkas
        </Button>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {slots.map((slot, index) => (
            <fieldset className="min-w-0 rounded-card border border-voyage-soft-border bg-white p-4" key={slot.id}>
              <legend className="px-1 text-xs font-semibold text-voyage-muted-ink">Slot {index + 1}</legend>
              <FileUploadSlot
                accept=".csv,text/csv"
                browseLabel="pilih berkas"
                file={slot.file}
                id={`catalogue-multiple-file-${slot.id}`}
                maxSizeLabel="Pilih satu atau beberapa berkas CSV."
                multiple
                onChange={(file) => updateFile(slot.id, file)}
                onFilesSelected={(files) => addSelectedFiles(slot.id, files)}
              />
            </fieldset>
          ))}
        </div>
        <p aria-live="polite" className="text-xs text-voyage-muted-ink">
          {slots.filter((slot) => slot.file !== null).length} berkas dipilih · {slots.filter((slot) => slot.file === null).length} slot siap menerima berkas
        </p>
      </div>
    </DemoGroup>
  );
}

type AvatarSize = NonNullable<ComponentProps<typeof Avatar>["size"]>;
const AVATAR_SIZES = ["sm", "default", "lg"] satisfies readonly AvatarSize[];
const AVATAR_SIZE_PIXELS: Record<AvatarSize, number> = { sm: 24, default: 32, lg: 40 };
type AvatarImageLoadingStatus = "idle" | "loading" | "loaded" | "error";

const AVATAR_IMAGE_STATUS_LABELS: Record<AvatarImageLoadingStatus, string> = {
  idle: "Gambar belum dimuat",
  loading: "Sedang memuat gambar",
  loaded: "Gambar berhasil dimuat",
  error: "Gambar gagal dimuat; inisial tampil",
};

function AvatarPreview() {
  const [size, setSize] = useState<AvatarSize>("default");
  const [simulatedPresence, setSimulatedPresence] = useState(true);
  const [fallbackStatus, setFallbackStatus] = useState<AvatarImageLoadingStatus>("idle");

  return (
    <div className="space-y-7">
      <DemoGroup api="Avatar · size · AvatarImage · AvatarFallback · AvatarBadge" title="Foto dan status simulasi lokal">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>
                {option} · {AVATAR_SIZE_PIXELS[option]} px
              </DemoChoice>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Avatar aria-describedby="catalog-avatar-simulation-note" size={size}>
              <AvatarImage alt="Foto profil contoh AR" src={AVATAR_PLACEHOLDER_SRC} />
              <AvatarFallback>AR</AvatarFallback>
              {simulatedPresence ? (
                <AvatarBadge aria-label="AR, status simulasi lokal: aktif" role="img" />
              ) : null}
            </Avatar>
            <div className="space-y-2">
              <p className="max-w-[56ch] text-sm text-voyage-muted-ink" id="catalog-avatar-simulation-note">
                Simulasi lokal untuk AR; status ini tidak menunjukkan kehadiran pengguna sebenarnya. Saat ini: {simulatedPresence ? "aktif" : "tidak aktif"}.
              </p>
              <DemoChoice active={simulatedPresence} onClick={() => setSimulatedPresence((current) => !current)}>
                Simulasi AR: {simulatedPresence ? "aktif" : "tidak aktif"}
              </DemoChoice>
            </div>
          </div>
        </div>
      </DemoGroup>

      <DemoGroup api={'Avatar · size="sm" | "default" | "lg"'} title="Ukuran yang tersedia">
        <div className="flex flex-wrap items-end gap-8">
          {AVATAR_SIZES.map((avatarSize) => (
            <div className="flex flex-col items-center gap-2" key={avatarSize}>
              <Avatar size={avatarSize}>
                <AvatarFallback>AR</AvatarFallback>
              </Avatar>
              <code className="text-xs text-voyage-muted-ink">{`size="${avatarSize}" · ${AVATAR_SIZE_PIXELS[avatarSize]} px`}</code>
            </div>
          ))}
        </div>
      </DemoGroup>

      <DemoGroup api="AvatarImage · onLoadingStatusChange · AvatarFallback" title="Inisial saat foto gagal dimuat">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarImage
              alt="Foto profil contoh yang sengaja tidak tersedia"
              onLoadingStatusChange={(status) => setFallbackStatus(status)}
              src={AVATAR_FAILURE_SRC}
            />
            <AvatarFallback>RA</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-voyage-ink">Foto tidak tersedia</p>
            <p className="text-sm text-voyage-muted-ink">Inisial tetap tampil pada latar hijau standar.</p>
            <p aria-live="polite" className="text-xs text-voyage-muted-ink" role="status">
              Status gambar: {AVATAR_IMAGE_STATUS_LABELS[fallbackStatus]}.
            </p>
          </div>
        </div>
      </DemoGroup>

      <DemoGroup api="AvatarGroup · AvatarGroupCount" title="Kelompok avatar">
        <div className="flex items-center gap-4">
          <AvatarGroup aria-label="Kelompok contoh: AR, BK, CN, dan dua anggota lain" role="group">
            <Avatar size="default">
              <AvatarFallback>AR</AvatarFallback>
            </Avatar>
            <Avatar size="default"><AvatarFallback>BK</AvatarFallback></Avatar>
            <Avatar size="default"><AvatarFallback>CN</AvatarFallback></Avatar>
            <AvatarGroupCount>+2</AvatarGroupCount>
          </AvatarGroup>
          <span className="text-sm text-voyage-muted-ink">Kelompok contoh: AR, BK, CN, dan dua anggota lain.</span>
        </div>
      </DemoGroup>

      <DemoGroup api={'Button · variant="outline" · size="icon" (44 px) · Avatar size="lg" (40 px)'} title="Komposisi tombol akun">
        <div className="flex items-center gap-4">
          <Button aria-label="Tombol akun contoh" className="rounded-pill" size="icon" type="button" variant="outline">
            <Avatar aria-hidden="true" size="lg">
              <AvatarImage alt="" src={AVATAR_FAILURE_SRC} />
              <AvatarFallback>RA</AvatarFallback>
            </Avatar>
          </Button>
          <p className="max-w-[50ch] text-sm text-voyage-muted-ink">
            Tombol outline 44 px membungkus avatar 40 px. Contoh ini menampilkan komposisi saja dan tidak membuka menu akun.
          </p>
        </div>
      </DemoGroup>
    </div>
  );
}

type TabValue = "materi" | "kuis" | "tryout" | "arsip";

const TAB_ITEMS: { value: TabValue; label: string; summary: string }[] = [
  { value: "materi", label: "Materi", summary: "Daftar materi belajar." },
  { value: "kuis", label: "Kuis", summary: "Latihan soal singkat." },
  { value: "tryout", label: "Tryout", summary: "Hasil tryout." },
  { value: "arsip", label: "Arsip", summary: "Tab yang dinonaktifkan." },
];

function SpecialtyTabsPreview() {
  const [sunkenContentValue, setSunkenContentValue] = useState<TabValue>("materi");
  const [sunkenEqualValue, setSunkenEqualValue] = useState<TabValue>("kuis");
  const [verticalValue, setVerticalValue] = useState<TabValue>("tryout");
  const [filterValue, setFilterValue] = useState("semua");
  const [composedFilterValue, setComposedFilterValue] = useState("semua");
  const [nativeTabValue, setNativeTabValue] = useState("materi");
  const [fullWidthValue, setFullWidthValue] = useState<TabValue>("materi");
  const [modeValue, setModeValue] = useState("materi");
  const [modeDisabled, setModeDisabled] = useState(false);

  const compactFilterItems = [
    { label: "Semua", value: "semua" },
    { label: "Tryout saya", value: "milik-saya" },
    { label: "Selesai", value: "selesai" },
    { label: "Latihan", value: "latihan" },
  ] as const;

  const modeItems = [
    {
      description: "Materi dan pembelajaran.",
      icon: BookOpenText,
      id: "catalog-mode-materi",
      label: "Materi",
      panelId: "catalog-mode-materi-panel",
      value: "materi",
    },
    {
      description: "Kuis dan latihan soal.",
      icon: GraduationCap,
      id: "catalog-mode-kuis",
      label: "Kuis",
      panelId: "catalog-mode-kuis-panel",
      value: "kuis",
    },
  ] as const;

  return (
    <div className="space-y-7">
      <DemoGroup api={'TabsList · TabsTrigger · layout="content" | "equal"'} title="Tabs sunken">
        <div className="space-y-4">
          <Tabs onValueChange={(value) => setSunkenContentValue(value as TabValue)} value={sunkenContentValue}>
            <TabsList aria-label="Filter belajar" layout="content">
              {TAB_ITEMS.slice(0, 3).map((item) => (
                <TabsTrigger key={item.value} layout="content" value={item.value}>{item.label}</TabsTrigger>
              ))}
            </TabsList>
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
                {item.summary}
              </TabsContent>
            ))}
          </Tabs>
          <Tabs onValueChange={(value) => setSunkenEqualValue(value as TabValue)} value={sunkenEqualValue}>
            <TabsList aria-label="Area kerja" layout="equal">
              {TAB_ITEMS.slice(0, 3).map((item) => (
                <TabsTrigger key={item.value} layout="equal" value={item.value}>{item.label}</TabsTrigger>
              ))}
            </TabsList>
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
                {item.summary}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </DemoGroup>

      <DemoGroup api={'Tabs · orientation="vertical" · layout="content"'} title="Susunan vertikal">
        <Tabs
          className="min-h-36 sm:flex-row"
          onValueChange={(value) => setVerticalValue(value as TabValue)}
          orientation="vertical"
          value={verticalValue}
        >
          <TabsList aria-label="Ruang belajar" className="w-fit" layout="content">
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsTrigger key={item.value} layout="content" value={item.value}>{item.label}</TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.slice(0, 3).map((item) => (
            <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
              {item.summary}
            </TabsContent>
          ))}
        </Tabs>
      </DemoGroup>

      <DemoGroup api="CompactFilterTabs · items · value · onValueChange" title="Compact filter tabs">
        <div className="space-y-3">
          <CompactFilterTabs
            aria-label="Filter materi"
            items={compactFilterItems}
            onValueChange={setFilterValue}
            value={filterValue}
          />
          <p aria-live="polite" className="text-xs text-voyage-muted-ink">Filter terpilih: {filterValue}</p>
        </div>
      </DemoGroup>

      <DemoGroup api="CompactTabsList · CompactTabsTrigger" title="Susunan compact tabs">
        <Tabs
          onValueChange={(value) => setComposedFilterValue(String(value))}
          value={composedFilterValue}
        >
          <CompactTabsList aria-label="Kategori kegiatan">
            {compactFilterItems.map((item) => (
              <CompactTabsTrigger key={item.value} value={item.value}>{item.label}</CompactTabsTrigger>
            ))}
          </CompactTabsList>
          <TabsContent className="pt-2 text-sm text-voyage-muted-ink" value={composedFilterValue}>
            Pilihan aktif: {composedFilterValue}
          </TabsContent>
        </Tabs>
      </DemoGroup>

      <DemoGroup api="SunkenTabButton · selected · SunkenTabNavigation · SunkenTabLink" title="Tombol dan navigasi sunken">
        <div className="space-y-4">
          <div aria-label="Pilih area" className="flex flex-wrap gap-2" role="group">
            <SunkenTabButton
              aria-pressed={nativeTabValue === "materi"}
              onClick={() => setNativeTabValue("materi")}
              selected={nativeTabValue === "materi"}
              type="button"
            >
              Materi
            </SunkenTabButton>
            <SunkenTabButton
              aria-pressed={nativeTabValue === "kuis"}
              onClick={() => setNativeTabValue("kuis")}
              selected={nativeTabValue === "kuis"}
              type="button"
            >
              Kuis
            </SunkenTabButton>
          </div>
          <SunkenTabNavigation aria-label="Navigasi pratinjau">
            <SunkenTabLink aria-current="page" href="/developer/components" selected>
              Komponen
            </SunkenTabLink>
            <SunkenTabLink href="/developer/reports" selected={false}>
              Laporan
            </SunkenTabLink>
          </SunkenTabNavigation>
          <p aria-live="polite" className="text-xs text-voyage-muted-ink">
            Tombol terpilih: {nativeTabValue}
          </p>
        </div>
      </DemoGroup>

      <DemoGroup api="FullWidthTabsList · FullWidthTabsTrigger" title="Tabs lebar penuh">
        <Tabs onValueChange={(value) => setFullWidthValue(value as TabValue)} value={fullWidthValue}>
          <FullWidthTabsList aria-label="Area belajar">
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <FullWidthTabsTrigger key={item.value} value={item.value}>{item.label}</FullWidthTabsTrigger>
            ))}
          </FullWidthTabsList>
          {TAB_ITEMS.slice(0, 3).map((item) => (
            <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
              {item.summary}
            </TabsContent>
          ))}
        </Tabs>
      </DemoGroup>

      <DemoGroup api="ModeCardTabs · items · value · disabled" title="Mode card tabs">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <DemoChoice active={modeDisabled} onClick={() => setModeDisabled((current) => !current)}>
              {modeDisabled ? "Aktifkan pilihan" : "Nonaktifkan pilihan"}
            </DemoChoice>
          </div>
          <ModeCardTabs
            aria-label="Pilih jenis kegiatan"
            disabled={modeDisabled}
            items={modeItems}
            onValueChange={setModeValue}
            value={modeValue}
          />
          {modeItems.map((item) => (
            <div aria-labelledby={item.id} hidden={modeValue !== item.value} id={item.panelId} key={item.value} role="tabpanel" tabIndex={0}>
              <p className="text-sm text-voyage-muted-ink">{item.description}</p>
            </div>
          ))}
          <p aria-live="polite" className="text-xs text-voyage-muted-ink">
            Kegiatan terpilih: {modeValue}. <code>disabled</code> berlaku untuk semua pilihan.
          </p>
        </div>
      </DemoGroup>
    </div>
  );
}

export const controlSections: ControlSection[] = [
  {
    id: "buttons",
    title: "Tombol",
    description: "Lima varian, enam ukuran, status nonaktif dan memuat, serta contoh penempatan ikon.",
    sources: [
      "components/ui/button.tsx — Button",
      "components/ui/button-variants.ts — buttonVariants",
    ],
    preview: <ButtonPreview />,
  },
  {
    id: "badges",
    title: "Badge",
    description: "Satu badge untuk semua ruang kerja: tujuh tone, tiga ukuran, dan kedalaman flat atau sunken.",
    sources: [
      "components/ui/badge.tsx — Badge",
      "components/ui/badge-variants.ts — badgeVariants",
    ],
    preview: <BadgePreview />,
  },
  {
    id: "fields",
    title: "Input dan field",
    description: "Input native, label wajib, textarea, keadaan nonaktif, dan pesan validasi.",
    sources: [
      "components/ui/input.tsx — Input",
      "components/ui/field.tsx — Field, FieldLabel, FieldInput, FieldTextarea, FieldError",
      "components/ui/field-constants.ts — fieldControlClassName",
    ],
    preview: <FieldPreview />,
  },
  {
    id: "choice-controls",
    title: "Kontrol pilihan",
    description: "Checkbox, radio group, switch, dan pilihan berbentuk pill dengan state lokal.",
    sources: [
      "components/ui/checkbox.tsx — Checkbox",
      "components/ui/radio-group.tsx — RadioGroup, RadioGroupItem",
      "components/ui/switch.tsx — Switch",
      "components/ui/radio-pill-group.tsx — RadioPillGroup",
    ],
    preview: <ChoiceControlsPreview />,
  },
  {
    id: "file-controls",
    title: "Unggah dan unduh",
    description: "Status unggah lokal, pilihan beberapa berkas ke slot terpisah, dan unduhan templat CSV.",
    sources: [
      "components/ui/file-upload-slot.tsx — FileUploadSlot",
      "components/ui/csv-template-download.tsx — CsvTemplateDownload",
    ],
    preview: <FileControlsPreview />,
  },
  {
    id: "avatars",
    title: "Avatar",
    description: "Avatar 24/32/40 px, fallback inisial, status dan kelompok, serta komposisi tombol akun 44 px.",
    sources: [
      "components/ui/avatar.tsx — Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount",
    ],
    preview: <AvatarPreview />,
  },
  {
    id: "specialty-tabs",
    title: "Tabs",
    description: "Satu treatment sunken dengan susunan content atau equal, orientasi horizontal/vertikal, tab filter, navigasi, dan mode card.",
    sources: [
      "components/ui/tabs.tsx — Tabs, TabsList, TabsTrigger, TabsContent",
      "components/ui/sunken-tabs.tsx — SunkenTabButton, SunkenTabNavigation, SunkenTabLink",
      "components/ui/compact-filter-tabs.tsx — CompactFilterTabs, CompactTabsList, CompactTabsTrigger",
      "components/ui/full-width-tabs.tsx — FullWidthTabsList, FullWidthTabsTrigger",
      "components/ui/mode-card-tabs.tsx — ModeCardTabs",
    ],
    preview: <SpecialtyTabsPreview />,
  },
];
