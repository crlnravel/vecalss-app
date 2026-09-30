"use client";

import { useState, type ComponentProps, type ReactNode } from "react";

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
  FullWidthLineTabsList,
  FullWidthLineTabsTrigger,
} from "@/components/ui/full-width-line-tabs";
import { Input } from "@/components/ui/input";
import { MentorBadge } from "@/components/ui/mentor-badge";
import { ModeCardTabs } from "@/components/ui/mode-card-tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RadioPillGroup } from "@/components/ui/radio-pill-group";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  SunkenTabButton,
  SunkenTabLink,
  SunkenTabNavigation,
  SunkenTabsList,
  SunkenTabsTrigger,
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
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;
type BadgeSize = NonNullable<ComponentProps<typeof Badge>["size"]>;
type StudentTone = NonNullable<ComponentProps<typeof StudentBadge>["tone"]>;
type StudentSize = NonNullable<ComponentProps<typeof StudentBadge>["size"]>;
type StudentDepth = NonNullable<ComponentProps<typeof StudentBadge>["depth"]>;
type MentorSize = NonNullable<ComponentProps<typeof MentorBadge>["size"]>;

export type ControlSection = {
  id: string;
  title: string;
  description: string;
  sources: string[];
  preview: ReactNode;
};

const BUTTON_VARIANTS = [
  "default",
  "brand",
  "filterActive",
  "marketing",
  "marketingOutline",
  "marketingOnDark",
  "onboarding",
  "learning",
  "learningComplete",
  "learningAttention",
  "brandOutline",
  "reference",
  "context",
  "contextSelected",
  "attentionOutline",
  "attention",
  "dangerOutline",
  "inverseOutline",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] satisfies readonly ButtonVariant[];

const BUTTON_SIZES = [
  "default",
  "xs",
  "sm",
  "lg",
  "marketing",
  "marketingCompact",
  "onboarding",
  "learning",
  "learningAttention",
  "icon",
  "icon-xs",
  "icon-sm",
  "icon-lg",
] satisfies readonly ButtonSize[];

const BADGE_VARIANTS = ["accent", "mint", "neutral"] satisfies readonly BadgeVariant[];
const BADGE_SIZES = ["section", "card", "footer", "ui"] satisfies readonly BadgeSize[];

const STUDENT_TONES = [
  "category",
  "neutral",
  "active",
  "attention",
  "success",
  "info",
  "danger",
] satisfies readonly StudentTone[];
const STUDENT_SIZES = ["xs", "sm", "md"] satisfies readonly StudentSize[];
const STUDENT_DEPTHS = ["flat", "sunken"] satisfies readonly StudentDepth[];

const MENTOR_SIZES = ["compact", "xs", "sm", "md"] satisfies readonly MentorSize[];
const MENTOR_DEPTH_OPTIONS = ["default", "flat", "sunken"] as const;
type MentorDepthOption = (typeof MENTOR_DEPTH_OPTIONS)[number];

const STUDENT_TONE_LABELS: Record<StudentTone, string> = {
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
      variant={active ? "secondary" : "outline"}
    >
      {children}
    </Button>
  );
}

function ButtonPreview() {
  const [variant, setVariant] = useState<ButtonVariant>("brand");
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

      <DemoGroup api="buttonVariants · 23 nilai variant" title="Semua varian">
        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
          {BUTTON_VARIANTS.map((option) => {
            const usesDarkSurface = option === "inverseOutline" || option === "marketingOnDark";

            return (
              <div
                className={usesDarkSurface ? "flex min-w-0 flex-col items-start gap-2 rounded-2xl bg-voyage-deep p-3" : "flex min-w-0 flex-col items-start gap-2 border-b border-voyage-soft-border py-3"}
                key={option}
              >
                <Button
                  aria-pressed={variant === option}
                  onClick={() => setVariant(option)}
                  size="sm"
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

      <DemoGroup api="buttonVariants · 13 nilai size" title="Semua ukuran">
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
                  variant="brand"
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
          <Button disabled type="button" variant="brand">Nonaktif</Button>
          <Button aria-busy="true" disabled type="button" variant="brand">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            Memuat…
          </Button>
          <Button type="button" variant="brand">
            <Sparkles aria-hidden="true" data-icon="inline-start" size={16} />
            Ikon di kiri
          </Button>
          <Button type="button" variant="brandOutline">
            Ikon di kanan
            <ArrowRight aria-hidden="true" data-icon="inline-end" size={16} />
          </Button>
          <Button aria-label="Simpan contoh" size="icon" type="button" variant="brand">
            <Check aria-hidden="true" size={18} />
          </Button>
        </div>
      </DemoGroup>
    </div>
  );
}

function BadgePreview() {
  const [variant, setVariant] = useState<BadgeVariant>("accent");
  const [size, setSize] = useState<BadgeSize>("ui");

  return (
    <div className="space-y-7">
      <DemoGroup api="Badge · variant · size" title="Pratinjau yang bisa diubah">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Varian</span>
            {BADGE_VARIANTS.map((option) => (
              <DemoChoice active={variant === option} key={option} onClick={() => setVariant(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ukuran</span>
            {BADGE_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>{option}</DemoChoice>
            ))}
          </div>
          <Badge size={size} variant={variant}>Contoh badge</Badge>
        </div>
      </DemoGroup>

      <DemoGroup api="badgeVariants · 3 variant × 4 size" title="Seluruh kombinasi">
        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
          {BADGE_VARIANTS.map((badgeVariant) => (
            <div className="space-y-3 border-b border-voyage-soft-border pb-4" key={badgeVariant}>
              <code className="text-xs text-voyage-muted-ink">{`variant="${badgeVariant}"`}</code>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                {BADGE_SIZES.map((badgeSize) => (
                  <div className="flex min-w-0 flex-col items-start gap-2" key={badgeSize}>
                    <Badge size={badgeSize} variant={badgeVariant}>Kategori</Badge>
                    <code className="text-xs text-voyage-muted-ink">{`size="${badgeSize}"`}</code>
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

function StudentBadgePreview() {
  const [tone, setTone] = useState<StudentTone>("category");
  const [size, setSize] = useState<StudentSize>("sm");
  const [depth, setDepth] = useState<StudentDepth>("sunken");

  return (
    <div className="space-y-7">
      <DemoGroup api="StudentBadge · tone · size · depth" title="Pratinjau yang bisa diubah">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Nada</span>
            {STUDENT_TONES.map((option) => (
              <DemoChoice active={tone === option} key={option} onClick={() => setTone(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ukuran</span>
            {STUDENT_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>{option}</DemoChoice>
            ))}
            <span className="ml-2 text-xs font-semibold text-voyage-muted-ink">Kedalaman</span>
            {STUDENT_DEPTHS.map((option) => (
              <DemoChoice active={depth === option} key={option} onClick={() => setDepth(option)}>{option}</DemoChoice>
            ))}
          </div>
          <StudentBadge depth={depth} size={size} tone={tone}>{STUDENT_TONE_LABELS[tone]}</StudentBadge>
        </div>
      </DemoGroup>

      <DemoGroup api="studentBadgeVariants · 7 tone × 3 size · flat/sunken" title="Semua nada dan ukuran">
        <div className="space-y-4">
          {STUDENT_TONES.map((badgeTone) => (
            <div className="flex min-w-0 flex-col gap-3 border-b border-voyage-soft-border pb-4" key={badgeTone}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="text-xs font-semibold text-voyage-ink">{`tone="${badgeTone}"`}</code>
                <span className="text-xs text-voyage-muted-ink">{STUDENT_TONE_LABELS[badgeTone]}</span>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {STUDENT_SIZES.map((badgeSize) => (
                  <div className="flex flex-col items-start gap-2" key={badgeSize}>
                    <StudentBadge depth={depth} size={badgeSize} tone={badgeTone}>
                      {STUDENT_TONE_LABELS[badgeTone]}
                    </StudentBadge>
                    <code className="text-xs text-voyage-muted-ink">{`size="${badgeSize}"`}</code>
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

function MentorBadgePreview() {
  const [tone, setTone] = useState<StudentTone>("category");
  const [size, setSize] = useState<MentorSize>("sm");
  const [depth, setDepth] = useState<MentorDepthOption>("default");
  const resolvedDepth = depth === "default" ? undefined : depth;

  return (
    <div className="space-y-7">
      <DemoGroup api="MentorBadge · tone · size · depth" title="Pratinjau yang bisa diubah">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Nada</span>
            {STUDENT_TONES.map((option) => (
              <DemoChoice active={tone === option} key={option} onClick={() => setTone(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Ukuran</span>
            {MENTOR_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-voyage-muted-ink">Kedalaman</span>
            {MENTOR_DEPTH_OPTIONS.map((option) => (
              <DemoChoice active={depth === option} key={option} onClick={() => setDepth(option)}>{option}</DemoChoice>
            ))}
          </div>
          <MentorBadge depth={resolvedDepth} size={size} tone={tone}>
            {STUDENT_TONE_LABELS[tone]}
          </MentorBadge>
        </div>
      </DemoGroup>

      <DemoGroup api="MentorBadge · 7 tone × 4 size · default/flat/sunken" title="Semua nada dan ukuran">
        <div className="space-y-4">
          {STUDENT_TONES.map((badgeTone) => (
            <div className="flex min-w-0 flex-col gap-3 border-b border-voyage-soft-border pb-4" key={badgeTone}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="text-xs font-semibold text-voyage-ink">{`tone="${badgeTone}"`}</code>
                <span className="text-xs text-voyage-muted-ink">{STUDENT_TONE_LABELS[badgeTone]}</span>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                {MENTOR_SIZES.map((badgeSize) => (
                  <div className="flex flex-col items-start gap-2" key={badgeSize}>
                    <MentorBadge depth={resolvedDepth} size={badgeSize} tone={badgeTone}>
                      {STUDENT_TONE_LABELS[badgeTone]}
                    </MentorBadge>
                    <code className="text-xs text-voyage-muted-ink">{`size="${badgeSize}"`}</code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-5 border-t border-voyage-soft-border pt-4">
          {MENTOR_DEPTH_OPTIONS.map((option) => (
            <div className="flex flex-col items-start gap-2" key={option}>
              <MentorBadge
                depth={option === "default" ? undefined : option}
                size={size}
                tone={tone}
              >
                {STUDENT_TONE_LABELS[tone]}
              </MentorBadge>
              <code className="text-xs text-voyage-muted-ink">
                {option === "default" ? "depth omitted" : "depth=\"" + option + "\""}
              </code>
            </div>
          ))}
        </div>
        <p className="text-xs leading-5 text-voyage-muted-ink">
          Pilih satu kedalaman untuk melihat seluruh kombinasi nada dan ukuran; perbandingan di atas selalu menampilkan nilai default, <code>flat</code>, dan <code>sunken</code>.
        </p>
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
      <DemoGroup api="FileUploadSlot · file · disabled · uploading · progress · completed" title="File upload slot">
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

type AvatarSize = NonNullable<ComponentProps<typeof Avatar>["size"]>;
const AVATAR_SIZES = ["sm", "default", "lg"] satisfies readonly AvatarSize[];

function AvatarPreview() {
  const [size, setSize] = useState<AvatarSize>("default");

  return (
    <div className="space-y-7">
      <DemoGroup api="Avatar · size · AvatarImage · AvatarFallback · AvatarBadge" title="Pratinjau ukuran">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_SIZES.map((option) => (
              <DemoChoice active={size === option} key={option} onClick={() => setSize(option)}>{option}</DemoChoice>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Avatar size={size}>
              <AvatarImage alt="Ilustrasi siluet contoh" src={AVATAR_PLACEHOLDER_SRC} />
              <AvatarFallback>AR</AvatarFallback>
              <AvatarBadge aria-label="Sedang aktif" />
            </Avatar>
            <p className="text-sm text-voyage-muted-ink">Gambar contoh dengan inisial sebagai fallback.</p>
          </div>
        </div>
      </DemoGroup>

      <DemoGroup api="Avatar · sm | default | lg" title="Semua ukuran">
        <div className="flex flex-wrap items-end gap-8">
          {AVATAR_SIZES.map((avatarSize) => (
            <div className="flex flex-col items-center gap-2" key={avatarSize}>
              <Avatar size={avatarSize}>
                <AvatarImage alt="Ilustrasi siluet contoh" src={AVATAR_PLACEHOLDER_SRC} />
                <AvatarFallback>AR</AvatarFallback>
              </Avatar>
              <code className="text-xs text-voyage-muted-ink">{`size="${avatarSize}"`}</code>
            </div>
          ))}
        </div>
      </DemoGroup>

      <DemoGroup api="AvatarGroup · AvatarGroupCount" title="Kelompok avatar">
        <div className="flex items-center gap-4">
          <AvatarGroup aria-label="Tiga anggota kelompok" role="group">
            <Avatar size="default"><AvatarFallback>AR</AvatarFallback></Avatar>
            <Avatar size="default"><AvatarFallback>BK</AvatarFallback></Avatar>
            <Avatar size="default"><AvatarFallback>CN</AvatarFallback></Avatar>
            <AvatarGroupCount>+2</AvatarGroupCount>
          </AvatarGroup>
          <span className="text-sm text-voyage-muted-ink">Tiga avatar dan jumlah anggota lain.</span>
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

function CoreTabsPreview() {
  const [defaultValue, setDefaultValue] = useState<TabValue>("materi");
  const [lineValue, setLineValue] = useState<TabValue>("kuis");
  const [verticalValue, setVerticalValue] = useState<TabValue>("tryout");

  function renderTabContent(value: TabValue) {
    return TAB_ITEMS.find((item) => item.value === value)?.summary;
  }

  return (
    <div className="space-y-7">
      <DemoGroup api={'Tabs · TabsList variant="default" · TabsTrigger · TabsContent'} title="Tabs standar">
        <Tabs onValueChange={(value) => setDefaultValue(value as TabValue)} value={defaultValue}>
          <TabsList aria-label="Konten belajar" variant="default">
            {TAB_ITEMS.map((item) => (
              <TabsTrigger disabled={item.value === "arsip"} key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.map((item) => (
            <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
              {renderTabContent(item.value)}
            </TabsContent>
          ))}
        </Tabs>
      </DemoGroup>

      <DemoGroup api={'TabsList variant="line" · orientation="horizontal"'} title="Tabs garis">
        <Tabs onValueChange={(value) => setLineValue(value as TabValue)} value={lineValue}>
          <TabsList aria-label="Ringkasan belajar" variant="line">
            {TAB_ITEMS.map((item) => (
              <TabsTrigger disabled={item.value === "arsip"} key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.map((item) => (
            <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
              {renderTabContent(item.value)}
            </TabsContent>
          ))}
        </Tabs>
      </DemoGroup>

      <DemoGroup api={'Tabs · orientation="vertical" · TabsList · TabsTrigger'} title="Arah vertikal">
        <Tabs
          className="min-h-36 sm:flex-row"
          onValueChange={(value) => setVerticalValue(value as TabValue)}
          orientation="vertical"
          value={verticalValue}
        >
          <TabsList aria-label="Ruang belajar" className="w-fit" variant="default">
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>
            ))}
          </TabsList>
          {TAB_ITEMS.slice(0, 3).map((item) => (
            <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
              {renderTabContent(item.value)}
            </TabsContent>
          ))}
        </Tabs>
      </DemoGroup>
    </div>
  );
}

function SpecialtyTabsPreview() {
  const [sunkenContentValue, setSunkenContentValue] = useState<TabValue>("materi");
  const [sunkenEqualValue, setSunkenEqualValue] = useState<TabValue>("kuis");
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
      <DemoGroup api={'SunkenTabsList · SunkenTabsTrigger · layout="content" | "equal"'} title="Sunken tabs">
        <div className="space-y-4">
          <Tabs onValueChange={(value) => setSunkenContentValue(value as TabValue)} value={sunkenContentValue}>
            <SunkenTabsList aria-label="Filter belajar" layout="content">
              {TAB_ITEMS.slice(0, 3).map((item) => (
                <SunkenTabsTrigger key={item.value} layout="content" value={item.value}>{item.label}</SunkenTabsTrigger>
              ))}
            </SunkenTabsList>
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
                {item.summary}
              </TabsContent>
            ))}
          </Tabs>
          <Tabs onValueChange={(value) => setSunkenEqualValue(value as TabValue)} value={sunkenEqualValue}>
            <SunkenTabsList aria-label="Area kerja" layout="equal">
              {TAB_ITEMS.slice(0, 3).map((item) => (
                <SunkenTabsTrigger key={item.value} layout="equal" value={item.value}>{item.label}</SunkenTabsTrigger>
              ))}
            </SunkenTabsList>
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <TabsContent className="pt-2 text-sm text-voyage-muted-ink" key={item.value} value={item.value}>
                {item.summary}
              </TabsContent>
            ))}
          </Tabs>
        </div>
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
            <SunkenTabLink href="/developer/components" selected>
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

      <DemoGroup api="FullWidthLineTabsList · FullWidthLineTabsTrigger" title="Full-width line tabs">
        <Tabs onValueChange={(value) => setFullWidthValue(value as TabValue)} value={fullWidthValue}>
          <FullWidthLineTabsList aria-label="Area belajar">
            {TAB_ITEMS.slice(0, 3).map((item) => (
              <FullWidthLineTabsTrigger key={item.value} value={item.value}>{item.label}</FullWidthLineTabsTrigger>
            ))}
          </FullWidthLineTabsList>
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
    description: "Semua varian, ukuran, status nonaktif dan memuat, serta contoh penempatan ikon.",
    sources: [
      "components/ui/button.tsx — Button",
      "components/ui/button-variants.ts — buttonVariants",
    ],
    preview: <ButtonPreview />,
  },
  {
    id: "badges",
    title: "Badge umum",
    description: "Tiga varian umum dalam seluruh ukuran yang tersedia.",
    sources: [
      "components/ui/badge.tsx — Badge",
      "components/ui/badge-variants.ts — badgeVariants",
    ],
    preview: <BadgePreview />,
  },
  {
    id: "student-badges",
    title: "Badge pelajar",
    description: "Nada status, ukuran, dan kedalaman untuk label pada pengalaman pelajar.",
    sources: [
      "components/ui/student-badge.tsx — StudentBadge",
      "components/ui/student-badge-variants.ts — studentBadgeVariants",
    ],
    preview: <StudentBadgePreview />,
  },
  {
    id: "mentor-badges",
    title: "Badge mentor",
    description: "Seluruh nada dan ukuran yang digunakan pada ruang kerja Kapten.",
    sources: [
      "components/ui/mentor-badge.tsx — MentorBadge",
      "components/ui/student-badge-variants.ts — peta nada bersama",
    ],
    preview: <MentorBadgePreview />,
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
    description: "Contoh status upload lokal dan unduhan templat CSV.",
    sources: [
      "components/ui/file-upload-slot.tsx — FileUploadSlot",
      "components/ui/csv-template-download.tsx — CsvTemplateDownload",
    ],
    preview: <FileControlsPreview />,
  },
  {
    id: "avatars",
    title: "Avatar",
    description: "Ukuran avatar, gambar dengan fallback, tanda status, dan kelompok avatar.",
    sources: [
      "components/ui/avatar.tsx — Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount",
    ],
    preview: <AvatarPreview />,
  },
  {
    id: "tabs",
    title: "Tabs dasar",
    description: "Tabs standar dan garis, dengan arah horizontal maupun vertikal.",
    sources: [
      "components/ui/tabs.tsx — Tabs, TabsList, TabsTrigger, TabsContent",
      "components/ui/tabs-variants.ts — tabsListVariants",
    ],
    preview: <CoreTabsPreview />,
  },
  {
    id: "specialty-tabs",
    title: "Tabs khusus",
    description: "Sunken tabs, compact filter tabs, full-width line tabs, dan mode card tabs.",
    sources: [
      "components/ui/sunken-tabs.tsx — SunkenTabsList, SunkenTabsTrigger, SunkenTabButton, SunkenTabNavigation, SunkenTabLink",
      "components/ui/compact-filter-tabs.tsx — CompactFilterTabs, CompactTabsList, CompactTabsTrigger",
      "components/ui/full-width-line-tabs.tsx — FullWidthLineTabsList, FullWidthLineTabsTrigger",
      "components/ui/mode-card-tabs.tsx — ModeCardTabs",
    ],
    preview: <SpecialtyTabsPreview />,
  },
];
