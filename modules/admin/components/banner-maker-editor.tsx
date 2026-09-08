"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  ReferenceSelect,
  type ReferenceSelectOption,
} from "@/components/dashboard/reference-dashboard-controls";
import {
  ReferenceEmptyState,
} from "@/components/dashboard/reference-dashboard-primitives";
import {
  REFERENCE_CONTROL_CLASS_NAMES,
  REFERENCE_FIELD_LABEL_CLASS_NAME,
} from "@/components/dashboard/reference-dashboard-tokens";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark } from "@/modules/home/components/home-primitives";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { showToast } from "@/components/ui/toast";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileImage,
  ImageOff,
  ImagePlus,
  PenTool,
  Plus,
  Save,
  SendHorizontal,
  Trash2,
  X,
} from "@/lib/icons";
import {
  BANNER_MAX_HEIGHT,
  BANNER_MAX_ALT_LENGTH,
  BANNER_MAX_LAYERS,
  BANNER_MAX_PADDING,
  BANNER_MAX_RADIUS,
  BANNER_MAX_TEXT_LENGTH,
  BANNER_MAX_WIDTH,
  BANNER_MIN_HEIGHT,
  BANNER_MIN_WIDTH,
  bannerDesignsEqual,
  type BannerAssetView,
  type BannerBackground,
  type BannerDesign,
  type BannerFrame,
  type BannerImageLayer,
  type BannerLayer,
  type BannerMakerFormState,
  type BannerTextLayer,
} from "@/lib/admin/banner-maker";
import type { SessionContext } from "@/lib/auth/types";
import { imageMediaMimeTypes } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import { MediaLibrary } from "@/modules/media/media-library";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { cn } from "@/lib/utils";

type BannerMakerAction = (
  previousState: BannerMakerFormState,
  formData: FormData,
) => Promise<BannerMakerFormState>;

type BannerMakerEditorProps = {
  action: BannerMakerAction;
  assetUrls: Record<string, BannerAssetView>;
  design: BannerDesign;
  hasUnpublishedChanges: boolean;
  session: SessionContext;
  version: string | null;
};

type PickerMode = "background" | "image";

type LayerDragState = {
  id: string;
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

type LayerMoveAvailability = {
  back: boolean;
  down: boolean;
  front: boolean;
  up: boolean;
};

const weightOptions: readonly ReferenceSelectOption[] = [
  { label: "Regular", value: "regular" },
  { label: "Medium", value: "medium" },
  { label: "Tebal", value: "bold" },
];

const alignOptions: readonly ReferenceSelectOption[] = [
  { label: "Kiri", value: "left" },
  { label: "Tengah", value: "center" },
  { label: "Kanan", value: "right" },
];

const backgroundModes: ReadonlyArray<{ label: string; type: BannerBackground["type"] }> = [
  { label: "Warna", type: "color" },
  { label: "Gradasi", type: "gradient" },
  { label: "Gambar", type: "image" },
];

function clampClient(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function snapValue(value: number, targets: readonly number[], threshold = 1.25) {
  let closest = value;
  let distance = threshold;

  for (const target of targets) {
    const targetDistance = Math.abs(target - value);
    if (targetDistance <= distance) {
      closest = target;
      distance = targetDistance;
    }
  }

  return closest;
}

function snapLayerPosition(
  design: BannerDesign,
  layer: BannerLayer,
  x: number,
  y: number,
) {
  const maxX = Math.max(0, 100 - layer.width);
  const maxY = Math.max(0, 100 - layer.height);
  const clampedX = clampClient(x, 0, maxX);
  const clampedY = clampClient(y, 0, maxY);

  if (!design.frame.snapToPadding) return { x: clampedX, y: clampedY };

  const paddingX = (design.frame.padding / design.frame.width) * 100;
  const paddingY = (design.frame.padding / design.frame.height) * 100;
  const xTargets = [paddingX, 50 - layer.width / 2, Math.max(0, 100 - paddingX - layer.width)];
  const yTargets = [paddingY, 50 - layer.height / 2, Math.max(0, 100 - paddingY - layer.height)];

  return {
    x: clampClient(snapValue(clampedX, xTargets), 0, maxX),
    y: clampClient(snapValue(clampedY, yTargets), 0, maxY),
  };
}

function createLayerId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}`;
}

function safeCssUrl(url: string) {
  return url.replaceAll("\\", "%5C").replaceAll('"', "%22").replaceAll("\n", "");
}

function assetPreviewUrl(asset: MediaAssetDto) {
  return asset.thumbnailUrl ?? asset.previewUrl ?? `/api/media/admin/assets/${asset.id}/thumbnail`;
}

function backgroundStyle(
  background: BannerBackground,
  assetUrls: Record<string, BannerAssetView>,
): CSSProperties {
  if (background.type === "color") {
    return { backgroundColor: background.color };
  }

  if (background.type === "gradient") {
    return {
      backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
    };
  }

  const image = assetUrls[background.assetId];
  return image
    ? {
        backgroundImage: `linear-gradient(120deg, rgba(1, 76, 56, 0.48), rgba(23, 107, 77, 0.12)), url("${safeCssUrl(image.url)}")`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }
    : {
        backgroundColor: "#014C38",
        backgroundImage: "linear-gradient(120deg, #014C38, #176B4D)",
      };
}

function layerLabel(layer: BannerLayer) {
  if (layer.type === "text") return layer.text || "Teks kosong";
  return layer.alt || "Gambar";
}

function LayerIcon({ layer }: { layer: BannerLayer }) {
  return layer.type === "text"
    ? <PenTool aria-hidden="true" className="size-4" />
    : <FileImage aria-hidden="true" className="size-4" />;
}

function IconAction({
  ariaLabel,
  children,
  className,
  disabled,
  onClick,
  pressed,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={ariaLabel}
            aria-pressed={pressed}
            className={className}
            disabled={disabled}
            onClick={onClick}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{ariaLabel}</TooltipContent>
    </Tooltip>
  );
}

function LayerContextMenu({
  moveAvailability,
  onDelete,
  onMoveBack,
  onMoveDown,
  onMoveFront,
  onMoveUp,
  trigger,
}: {
  moveAvailability: LayerMoveAvailability;
  onDelete: () => void;
  onMoveBack: () => void;
  onMoveDown: () => void;
  onMoveFront: () => void;
  onMoveUp: () => void;
  trigger: React.ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={trigger} />
      <ContextMenuContent className="w-52">
        <ContextMenuItem disabled={!moveAvailability.front} onClick={onMoveFront}>
          <ArrowUp />Bawa ke depan
        </ContextMenuItem>
        <ContextMenuItem disabled={!moveAvailability.back} onClick={onMoveBack}>
          <ArrowDown />Kirim ke belakang
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!moveAvailability.up} onClick={onMoveUp}>
          <ArrowUp />Naikkan satu tingkat
        </ContextMenuItem>
        <ContextMenuItem disabled={!moveAvailability.down} onClick={onMoveDown}>
          <ArrowDown />Turunkan satu tingkat
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} variant="destructive">
          <Trash2 />Hapus elemen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ColorInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
      <span className="text-sm font-medium text-secondary-700">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-ui-xs font-semibold uppercase text-secondary-500">{value}</span>
        <input
          aria-label={label}
          className="size-9 cursor-pointer rounded-xl border border-white bg-transparent p-0.5 shadow-sm"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={value}
        />
      </span>
    </label>
  );
}

function BackgroundControls({
  assetUrls,
  background,
  onChange,
  onPickImage,
}: {
  assetUrls: Record<string, BannerAssetView>;
  background: BannerBackground;
  onChange: (background: BannerBackground) => void;
  onPickImage: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-primary-50 p-1" role="group" aria-label="Jenis latar">
        {backgroundModes.map((mode) => (
          <button
            aria-pressed={background.type === mode.type}
            className={cn(
              "min-h-10 rounded-xl px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20",
              background.type === mode.type
                ? "bg-white text-primary-800 shadow-sm"
                : "text-secondary-500 hover:bg-white/70 hover:text-secondary-800",
            )}
            key={mode.type}
            onClick={() => {
              if (mode.type === "color") onChange({ color: "#014C38", type: "color" });
              if (mode.type === "gradient") onChange({ angle: 120, from: "#014C38", to: "#2F8A5D", type: "gradient" });
              if (mode.type === "image") onPickImage();
            }}
            type="button"
          >
            {mode.label}
          </button>
        ))}
      </div>

      {background.type === "color" ? (
        <ColorInput
          label="Warna latar"
          onChange={(color) => onChange({ color, type: "color" })}
          value={background.color}
        />
      ) : null}

      {background.type === "gradient" ? (
        <div className="space-y-2.5">
          <ColorInput
            label="Warna awal"
            onChange={(from) => onChange({ ...background, from })}
            value={background.from}
          />
          <ColorInput
            label="Warna akhir"
            onChange={(to) => onChange({ ...background, to })}
            value={background.to}
          />
          <label className="block rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
            <span className="flex items-center justify-between gap-3 text-sm font-medium text-secondary-700">
              <span>Arah gradasi</span>
              <span className="font-mono text-xs text-secondary-500">{background.angle}°</span>
            </span>
            <input
              aria-label="Arah gradasi"
              className="mt-2 w-full accent-primary-700"
              max={360}
              min={0}
              onChange={(event) => onChange({ ...background, angle: Number(event.target.value) })}
              type="range"
              value={background.angle}
            />
          </label>
        </div>
      ) : null}

      {background.type === "image" ? (
        <div className="space-y-2.5">
          {background.assetId && assetUrls[background.assetId] ? (
            <div className="overflow-hidden rounded-2xl border border-primary-100 bg-primary-50">
              <div className="relative aspect-[2.2]">
                <Image
                  alt={assetUrls[background.assetId].name}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 100vw, 27rem"
                  src={assetUrls[background.assetId].url}
                  unoptimized
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-xs font-semibold text-secondary-700">{assetUrls[background.assetId].name}</span>
                <button
                  className="shrink-0 text-xs font-semibold text-primary-700 hover:text-primary-900"
                  onClick={() => onChange({ color: "#014C38", type: "color" })}
                  type="button"
                >
                  Hapus
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/50 px-4 py-5 text-center">
              <ImageOff aria-hidden="true" className="mx-auto size-6 text-primary-600" />
              <p className="mt-2 text-xs leading-5 text-secondary-500">Pilih gambar.</p>
            </div>
          )}
          <Button onClick={onPickImage} size="sm" type="button" variant="brandOutline">
            <ImagePlus data-icon="inline-start" />
            {background.assetId ? "Ganti gambar" : "Pilih gambar"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FrameControls({
  frame,
  idPrefix,
  onChange,
}: {
  frame: BannerFrame;
  idPrefix: string;
  onChange: (frame: BannerFrame) => void;
}) {
  const maxPadding = Math.min(BANNER_MAX_PADDING, Math.floor(Math.min(frame.width, frame.height) / 2));
  const maxRadius = Math.min(BANNER_MAX_RADIUS, Math.floor(Math.min(frame.width, frame.height) / 2));
  const [widthDraft, setWidthDraft] = useState(() => ({ frameValue: frame.width, value: String(frame.width) }));
  const [heightDraft, setHeightDraft] = useState(() => ({ frameValue: frame.height, value: String(frame.height) }));
  const widthInput = widthDraft.frameValue === frame.width ? widthDraft.value : String(frame.width);
  const heightInput = heightDraft.frameValue === frame.height ? heightDraft.value : String(frame.height);

  const updateDimension = (key: "height" | "width", value: number) => {
    const nextFrame = { ...frame, [key]: value } as BannerFrame;
    onChange({
      ...nextFrame,
      padding: Math.min(nextFrame.padding, Math.min(BANNER_MAX_PADDING, Math.floor(Math.min(nextFrame.width, nextFrame.height) / 2))),
      radius: Math.min(nextFrame.radius, Math.min(BANNER_MAX_RADIUS, Math.floor(Math.min(nextFrame.width, nextFrame.height) / 2))),
    });
  };

  const commitDimension = (key: "height" | "width", rawValue: string) => {
    const min = key === "width" ? BANNER_MIN_WIDTH : BANNER_MIN_HEIGHT;
    const max = key === "width" ? BANNER_MAX_WIDTH : BANNER_MAX_HEIGHT;
    const value = clampClient(Number(rawValue) || min, min, max);
    if (key === "width") setWidthDraft({ frameValue: value, value: String(value) });
    else setHeightDraft({ frameValue: value, value: String(value) });
    updateDimension(key, value);
  };

  return (
    <div className="space-y-3 border-t border-primary-100 pt-4">
      <p className="text-ui-xs font-semibold uppercase tracking-[0.12em] text-secondary-500">Bingkai</p>
      <div className="grid grid-cols-2 gap-2.5">
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-banner-frame-width`}>Lebar</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-banner-frame-width`}
            max={BANNER_MAX_WIDTH}
            min={BANNER_MIN_WIDTH}
            onBlur={() => commitDimension("width", widthInput)}
            onChange={(event) => setWidthDraft({ frameValue: frame.width, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            type="number"
            value={widthInput}
          />
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-banner-frame-height`}>Tinggi</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-banner-frame-height`}
            max={BANNER_MAX_HEIGHT}
            min={BANNER_MIN_HEIGHT}
            onBlur={() => commitDimension("height", heightInput)}
            onChange={(event) => setHeightDraft({ frameValue: frame.height, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            type="number"
            value={heightInput}
          />
        </Field>
      </div>
      <label className="block rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
        <span className="flex items-center justify-between gap-3 text-sm font-medium text-secondary-700">
          <span>Radius</span>
          <span className="font-mono text-ui-xs text-secondary-500">{frame.radius}px</span>
        </span>
        <input
          aria-label="Radius banner"
          className="mt-2 w-full accent-primary-700"
          max={maxRadius}
          min={0}
          onChange={(event) => onChange({ ...frame, radius: Number(event.target.value) })}
          type="range"
          value={frame.radius}
        />
      </label>
      <label className="block rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
        <span className="flex items-center justify-between gap-3 text-sm font-medium text-secondary-700">
          <span>Padding</span>
          <span className="font-mono text-ui-xs text-secondary-500">{frame.padding}px</span>
        </span>
        <input
          aria-label="Padding banner"
          className="mt-2 w-full accent-primary-700"
          max={maxPadding}
          min={0}
          onChange={(event) => onChange({ ...frame, padding: Number(event.target.value) })}
          type="range"
          value={frame.padding}
        />
      </label>
      <label className="flex min-h-11 items-center gap-2.5 rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5 text-sm font-medium text-secondary-700">
        <input
          aria-label="Snap ke padding"
          checked={frame.snapToPadding}
          className="size-4 accent-primary-700"
          onChange={(event) => onChange({ ...frame, snapToPadding: event.target.checked })}
          type="checkbox"
        />
        <span>Snap ke padding</span>
      </label>
    </div>
  );
}

function LayerInspector({
  idPrefix,
  layer,
  onChange,
  onDelete,
}: {
  idPrefix: string;
  layer: BannerLayer;
  onChange: (layer: BannerLayer) => void;
  onDelete: () => void;
}) {
  const maxLayerX = Math.max(0, 100 - layer.width);
  const maxLayerY = Math.max(0, 100 - layer.height);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800">
            <LayerIcon layer={layer} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-secondary-900">{layerLabel(layer)}</p>
          </div>
        </div>
        <TooltipProvider>
          <IconAction ariaLabel="Hapus layer" onClick={onDelete}>
            <Trash2 className="text-student-status-danger-fg" />
          </IconAction>
        </TooltipProvider>
      </div>

      {layer.type === "text" ? (
        <div className="space-y-3">
          <Field>
            <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-text`}>Teks</FieldLabel>
            <textarea
              aria-label="Teks layer"
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} min-h-24 resize-y`}
              id={`${idPrefix}-layer-text`}
              maxLength={BANNER_MAX_TEXT_LENGTH}
              onChange={(event) => onChange({ ...layer, text: event.target.value })}
              value={layer.text}
            />
            <span className="text-right text-xs text-secondary-400">{layer.text.length}/{BANNER_MAX_TEXT_LENGTH}</span>
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field>
              <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-size`}>Ukuran</FieldLabel>
              <Input
                className={REFERENCE_CONTROL_CLASS_NAMES.input}
                id={`${idPrefix}-layer-size`}
                max={240}
                min={12}
                onChange={(event) => onChange({ ...layer, fontSize: clampClient(Number(event.target.value) || 12, 12, 240) })}
                type="number"
                value={layer.fontSize}
              />
            </Field>
            <Field>
              <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-color`}>Warna</FieldLabel>
              <input
                aria-label="Warna teks"
                className="h-11 w-full cursor-pointer rounded-2xl border border-primary-100 bg-primary-50/70 p-1"
                id={`${idPrefix}-layer-color`}
                onChange={(event) => onChange({ ...layer, color: event.target.value.toUpperCase() })}
                type="color"
                value={layer.color}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field>
              <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-weight`}>Ketebalan</FieldLabel>
              <ReferenceSelect
                aria-label="Ketebalan teks"
                id={`${idPrefix}-layer-weight`}
                onValueChange={(weight) => onChange({ ...layer, weight: weight as BannerTextLayer["weight"] })}
                options={weightOptions}
                value={layer.weight}
              />
            </Field>
            <Field>
              <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-align`}>Perataan</FieldLabel>
              <ReferenceSelect
                aria-label="Perataan teks"
                id={`${idPrefix}-layer-align`}
                onValueChange={(align) => onChange({ ...layer, align: align as BannerTextLayer["align"] })}
                options={alignOptions}
                value={layer.align}
              />
            </Field>
          </div>
        </div>
      ) : (
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-alt`}>Deskripsi gambar</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-alt`}
            maxLength={120}
            onChange={(event) => onChange({ ...layer, alt: event.target.value })}
            placeholder="Contoh: Ilustrasi siswa belajar"
            value={layer.alt}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2.5 border-t border-primary-100 pt-3">
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-width`}>Lebar (%)</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-width`}
            max={100}
            min={1}
            onChange={(event) => {
              const width = clampClient(Number(event.target.value) || 1, 1, 100);
              onChange({ ...layer, width, x: clampClient(layer.x, 0, Math.max(0, 100 - width)) });
            }}
            type="number"
            value={layer.width}
          />
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-height`}>Tinggi (%)</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-height`}
            max={100}
            min={1}
            onChange={(event) => {
              const height = clampClient(Number(event.target.value) || 1, 1, 100);
              onChange({ ...layer, height, y: clampClient(layer.y, 0, Math.max(0, 100 - height)) });
            }}
            type="number"
            value={layer.height}
          />
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-x`}>Posisi X (%)</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-x`}
            max={maxLayerX}
            min={0}
            onChange={(event) => onChange({ ...layer, x: clampClient(Number(event.target.value) || 0, 0, maxLayerX) })}
            type="number"
            value={layer.x}
          />
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-y`}>Posisi Y (%)</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-y`}
            max={maxLayerY}
            min={0}
            onChange={(event) => onChange({ ...layer, y: clampClient(Number(event.target.value) || 0, 0, maxLayerY) })}
            type="number"
            value={layer.y}
          />
        </Field>
        <Field>
          <FieldLabel className={REFERENCE_FIELD_LABEL_CLASS_NAME} htmlFor={`${idPrefix}-layer-rotation`}>Rotasi (°)</FieldLabel>
          <Input
            className={REFERENCE_CONTROL_CLASS_NAMES.input}
            id={`${idPrefix}-layer-rotation`}
            max={180}
            min={-180}
            onChange={(event) => onChange({ ...layer, rotation: clampClient(Number(event.target.value) || 0, -180, 180) })}
            type="number"
            value={layer.rotation}
          />
        </Field>
      </div>

      <label className="block rounded-2xl border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
        <span className="flex items-center justify-between gap-3 text-sm font-medium text-secondary-700">
          <span>Opasitas</span>
          <span className="font-mono text-xs text-secondary-500">{Math.round(layer.opacity * 100)}%</span>
        </span>
        <input
          aria-label="Opasitas layer"
          className="mt-2 w-full accent-primary-700"
          max={1}
          min={0}
          onChange={(event) => onChange({ ...layer, opacity: Number(event.target.value) })}
          step={0.05}
          type="range"
          value={layer.opacity}
        />
      </label>
    </div>
  );
}

function BannerCanvas({
  assetUrls,
  design,
  onChange,
  onDeleteLayer,
  onMoveLayer,
  onMoveToBack,
  onMoveToFront,
  onSelect,
  showGuides,
  selectedLayerId,
}: {
  assetUrls: Record<string, BannerAssetView>;
  design: BannerDesign;
  onChange: (design: BannerDesign) => void;
  onDeleteLayer: (id: string) => void;
  onMoveLayer: (id: string, direction: "down" | "up") => void;
  onMoveToBack: (id: string) => void;
  onMoveToFront: (id: string) => void;
  onSelect: (id: string | null) => void;
  showGuides: boolean;
  selectedLayerId: string | null;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const dragStateRef = useRef<LayerDragState | null>(null);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  const editingTextRef = useRef<HTMLDivElement>(null);
  const scale = canvasWidth > 0 ? canvasWidth / design.frame.width : 1;

  useEffect(() => {
    if (!editingTextLayerId) return;
    const editor = editingTextRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editingTextLayerId]);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;

    const updateSize = () => setCanvasWidth(node.clientWidth);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const updateLayer = (id: string, updater: (layer: BannerLayer) => BannerLayer) => {
    onChange({
      ...design,
      layers: design.layers.map((layer) => layer.id === id ? updater(layer) : layer),
    });
  };

  const onLayerPointerDown = (event: PointerEvent<HTMLButtonElement>, layer: BannerLayer) => {
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(layer.id);
    dragStateRef.current = {
      id: layer.id,
      originX: layer.x,
      originY: layer.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const deltaX = ((event.clientX - dragState.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - dragState.startY) / bounds.height) * 100;
    updateLayer(dragState.id, (layer) => ({
      ...layer,
      ...snapLayerPosition(design, layer, dragState.originX + deltaX, dragState.originY + deltaY),
    }));
  };

  const stopDragging = () => {
    dragStateRef.current = null;
  };

  const onLayerKeyDown = (event: KeyboardEvent<HTMLButtonElement>, layer: BannerLayer) => {
    if (layer.type === "text" && (event.key === "Enter" || event.key === "F2")) {
      event.preventDefault();
      setEditingTextLayerId(layer.id);
      return;
    }

    const step = event.shiftKey ? 5 : 1;
    let deltaX = 0;
    let deltaY = 0;
    if (event.key === "ArrowLeft") deltaX = -step;
    if (event.key === "ArrowRight") deltaX = step;
    if (event.key === "ArrowUp") deltaY = -step;
    if (event.key === "ArrowDown") deltaY = step;
    if (!deltaX && !deltaY) return;
    event.preventDefault();
    updateLayer(layer.id, (current) => ({
      ...current,
      ...snapLayerPosition(design, current, current.x + deltaX, current.y + deltaY),
    }));
  };

  const paddingX = (design.frame.padding / design.frame.width) * 100;
  const paddingY = (design.frame.padding / design.frame.height) * 100;

  return (
    <div
      aria-label="Canvas banner"
      className="relative w-full touch-none select-none overflow-hidden border border-primary-200 bg-primary-800 shadow-[0_26px_60px_-36px_rgba(1,76,56,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-700/45"
      onPointerCancel={stopDragging}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={stopDragging}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          setEditingTextLayerId(null);
          onSelect(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setEditingTextLayerId(null);
          onSelect(null);
        }
      }}
      ref={canvasRef}
      role="region"
      style={{
        aspectRatio: `${design.frame.width} / ${design.frame.height}`,
        borderRadius: `${design.frame.radius * scale}px`,
      }}
      tabIndex={0}
    >
      <div className="pointer-events-none absolute inset-0" style={backgroundStyle(design.background, assetUrls)} />
      {showGuides ? (
        <>
          <div className="pointer-events-none absolute inset-x-[5%] top-1/2 border-t border-dashed border-white/30" />
          <div className="pointer-events-none absolute inset-y-[10%] left-1/2 border-l border-dashed border-white/30" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-voyage-warm-sun/65"
            style={{
              bottom: `${paddingY}%`,
              left: `${paddingX}%`,
              right: `${paddingX}%`,
              top: `${paddingY}%`,
            }}
          />
        </>
      ) : null}

      {design.layers.map((layer) => {
        const imageUrl = layer.type === "image" ? assetUrls[layer.assetId]?.url : null;
        const layerStyle: CSSProperties = {
          height: `${layer.height}%`,
          left: `${layer.x}%`,
          opacity: layer.opacity,
          top: `${layer.y}%`,
          transform: `rotate(${layer.rotation}deg)`,
          width: `${layer.width}%`,
        };

        const isEditingText = layer.type === "text" && editingTextLayerId === layer.id;
        const textStyle: CSSProperties = layer.type === "text" ? {
          color: layer.color,
          fontSize: `${Math.max(10, layer.fontSize * scale)}px`,
          fontWeight: layer.weight === "bold" ? 700 : layer.weight === "medium" ? 500 : 400,
          textAlign: layer.align,
        } : {};

        if (isEditingText && layer.type === "text") {
          return (
            <div
              aria-label="Edit teks banner"
              aria-multiline="true"
              autoFocus
              className="absolute z-20 flex min-w-0 items-center overflow-hidden border border-white bg-transparent p-2 leading-[1.05] outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              contentEditable
              key={layer.id}
              onBlur={() => setEditingTextLayerId(null)}
              onInput={(event) => {
                const editor = event.currentTarget;
                const text = editor.textContent ?? "";
                const nextText = text.slice(0, BANNER_MAX_TEXT_LENGTH);
                if (nextText !== text) {
                  editor.textContent = nextText;
                  const selection = window.getSelection();
                  selection?.selectAllChildren(editor);
                  selection?.collapseToEnd();
                }
                updateLayer(layer.id, (current) => current.type === "text" ? { ...current, text: nextText } : current);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setEditingTextLayerId(null);
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              ref={editingTextRef}
              role="textbox"
              style={{ ...layerStyle, ...textStyle }}
              suppressContentEditableWarning
              tabIndex={0}
            >
              {layer.text}
            </div>
          );
        }

        const layerIndex = design.layers.findIndex((item) => item.id === layer.id);

        return (
          <LayerContextMenu
            key={layer.id}
            moveAvailability={{
              back: layerIndex > 0,
              down: layerIndex > 0,
              front: layerIndex < design.layers.length - 1,
              up: layerIndex < design.layers.length - 1,
            }}
            onDelete={() => onDeleteLayer(layer.id)}
            onMoveBack={() => onMoveToBack(layer.id)}
            onMoveDown={() => onMoveLayer(layer.id, "down")}
            onMoveFront={() => onMoveToFront(layer.id)}
            onMoveUp={() => onMoveLayer(layer.id, "up")}
            trigger={
              <button
                aria-label={`Pilih ${layerLabel(layer)}${layer.type === "text" ? ". Klik dua kali atau tekan Enter untuk edit teks." : ""}`}
                aria-pressed={selectedLayerId === layer.id}
                className={cn(
                  "absolute z-10 flex min-w-0 cursor-grab items-center overflow-hidden rounded-none border border-transparent p-2 text-left outline-none transition-shadow active:cursor-grabbing",
                  selectedLayerId === layer.id ? "border-white" : "focus-visible:ring-2 focus-visible:ring-white/90",
                  layer.type === "text" ? "break-words" : "justify-center",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(layer.id);
                }}
                onContextMenu={() => onSelect(layer.id)}
                onDoubleClick={() => {
                  if (layer.type === "text") setEditingTextLayerId(layer.id);
                }}
                onKeyDown={(event) => onLayerKeyDown(event, layer)}
                onPointerDown={(event) => onLayerPointerDown(event, layer)}
                style={layerStyle}
                type="button"
              >
                {layer.type === "image" ? (
                  imageUrl ? (
                    <Image
                      alt={layer.alt || "Gambar banner"}
                      className="object-contain"
                      fill
                      sizes="100vw"
                      src={imageUrl}
                      unoptimized
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/60 bg-black/15 text-white/80">
                      <ImageOff aria-hidden="true" className="size-5" />
                      <span className="text-ui-xs font-semibold">Gambar tidak tersedia</span>
                    </span>
                  )
                ) : (
                  <span className="block w-full whitespace-pre-wrap leading-[1.05]" style={textStyle}>
                    {layer.text}
                  </span>
                )}
              </button>
            }
          />
        );
      })}
    </div>
  );
}

function LayerList({
  design,
  onDeleteLayer,
  onDropLayer,
  onMoveDown,
  onMoveUp,
  onMoveToBack,
  onMoveToFront,
  onSelect,
  selectedLayerId,
}: {
  design: BannerDesign;
  onDeleteLayer: (id: string) => void;
  onDropLayer: (event: DragEvent<HTMLDivElement>, targetId: string) => void;
  onMoveDown: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveToBack: (id: string) => void;
  onMoveToFront: (id: string) => void;
  onSelect: (id: string) => void;
  selectedLayerId: string | null;
}) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const visibleLayers = [...design.layers].reverse();
  const startLayerDrag = (event: DragEvent<HTMLElement>, id: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/banner-layer", id);
    setDraggedLayerId(id);
  };

  return (
    <div className="space-y-2">
      {visibleLayers.length === 0 ? (
        <ReferenceEmptyState
          className="min-h-32 rounded-2xl border border-dashed border-primary-200 bg-primary-50/35 px-4 py-5"
          description="Tambahkan layer."
          icon={Plus}
          title="Belum ada layer"
        />
      ) : visibleLayers.map((layer, index) => (
        <LayerContextMenu
          key={layer.id}
          moveAvailability={{
            back: index < visibleLayers.length - 1,
            down: index < visibleLayers.length - 1,
            front: index > 0,
            up: index > 0,
          }}
          onDelete={() => onDeleteLayer(layer.id)}
          onMoveBack={() => onMoveToBack(layer.id)}
          onMoveDown={() => onMoveDown(layer.id)}
          onMoveFront={() => onMoveToFront(layer.id)}
          onMoveUp={() => onMoveUp(layer.id)}
          trigger={
            <div
              className={cn(
                "flex w-full cursor-grab items-center gap-2 rounded-xl border px-2 py-2 text-left transition-colors active:cursor-grabbing",
                selectedLayerId === layer.id
                  ? "border-primary-300 bg-primary-50 text-primary-900"
                  : "border-primary-100 bg-white text-secondary-700 hover:border-primary-200 hover:bg-primary-50/45",
                draggedLayerId === layer.id && "opacity-50",
              )}
              draggable
              onDragEnd={() => setDraggedLayerId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) => startLayerDrag(event, layer.id)}
              onContextMenu={() => onSelect(layer.id)}
              onDrop={(event) => {
                setDraggedLayerId(null);
                onDropLayer(event, layer.id);
              }}
            >
              <button
                aria-pressed={selectedLayerId === layer.id}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20"
                draggable
                onClick={() => onSelect(layer.id)}
                onDragStart={(event) => startLayerDrag(event, layer.id)}
                type="button"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
                  <LayerIcon layer={layer} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{layerLabel(layer)}</span>
                </span>
              </button>
              <TooltipProvider>
                <span className="flex shrink-0 items-center gap-0.5">
                  <IconAction ariaLabel="Naikkan layer" disabled={index === 0} onClick={() => onMoveUp(layer.id)}><ArrowUp /></IconAction>
                  <IconAction ariaLabel="Turunkan layer" disabled={index === visibleLayers.length - 1} onClick={() => onMoveDown(layer.id)}><ArrowDown /></IconAction>
                </span>
              </TooltipProvider>
            </div>
          }
        />
      ))}
    </div>
  );
}

function EditorPropertiesPanel({
  assetUrls,
  background,
  frame,
  idPrefix,
  layer,
  onBackgroundChange,
  onChangeLayer,
  onChangeFrame,
  onDeleteLayer,
  onPickBackgroundImage,
}: {
  assetUrls: Record<string, BannerAssetView>;
  background: BannerBackground;
  frame: BannerFrame;
  idPrefix: string;
  layer: BannerLayer | null;
  onBackgroundChange: (background: BannerBackground) => void;
  onChangeLayer: (layer: BannerLayer) => void;
  onChangeFrame: (frame: BannerFrame) => void;
  onDeleteLayer: () => void;
  onPickBackgroundImage: () => void;
}) {
  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold text-secondary-900">{layer ? "Edit elemen" : "Latar"}</h3>
      <div className="mt-4">
        {layer ? (
          <LayerInspector
            idPrefix={idPrefix}
            layer={layer}
            onChange={onChangeLayer}
            onDelete={onDeleteLayer}
          />
        ) : (
          <div className="space-y-4">
            <BackgroundControls
              assetUrls={assetUrls}
              background={background}
              onChange={onBackgroundChange}
              onPickImage={onPickBackgroundImage}
            />
            <FrameControls frame={frame} idPrefix={idPrefix} onChange={onChangeFrame} />
          </div>
        )}
      </div>
    </section>
  );
}

function AssetPickerPanel({
  mode,
  onClose,
  onSelect,
  selectedAssetId,
}: {
  mode: PickerMode;
  onClose: () => void;
  onSelect: (asset: MediaAssetDto) => void;
  selectedAssetId: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open) dialog.showModal();
    const firstElement = dialog.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstElement?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
        aria-labelledby="asset-picker-title"
        className="absolute inset-x-auto top-16 bottom-0 left-0 m-0 flex w-[min(27rem,calc(100vw-0.75rem))] max-h-none max-w-none flex-col border-r border-primary-100 bg-white p-0 shadow-[0_24px_70px_-34px_rgba(1,76,56,0.45)] backdrop:bg-secondary-950/20 sm:w-[27rem] sm:backdrop:bg-transparent"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        ref={dialogRef}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">Media admin</p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-secondary-900" id="asset-picker-title">
              {mode === "background" ? "Pilih gambar latar" : "Impor gambar"}
            </h2>
          </div>
          <Button aria-label="Tutup panel impor gambar" onClick={onClose} size="icon-sm" type="button" variant="ghost">
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          <MediaLibrary
            allowedMimeTypes={imageMediaMimeTypes}
            className="min-h-0"
            onSelect={onSelect}
            scope="admin"
            selectedAssetId={selectedAssetId}
            appearance="banner"
            variant="picker"
          />
        </div>
      </dialog>
  );
}

function MediaSidebar({ onSelectAsset }: { onSelectAsset: (asset: MediaAssetDto) => void }) {
  return (
    <section aria-label="Media admin" className="flex min-h-48 flex-1 flex-col overflow-hidden border-b border-primary-100 px-3 py-4">
      <div className="min-h-0 flex-1 overflow-hidden">
        <MediaLibrary
          appearance="banner"
          allowedMimeTypes={imageMediaMimeTypes}
          className="min-h-0"
          onSelect={onSelectAsset}
          scope="admin"
          variant="picker"
        />
      </div>
    </section>
  );
}

type BannerDesignSetter = import("react").Dispatch<import("react").SetStateAction<BannerDesign>>;
type BannerAssetUrlsSetter = import("react").Dispatch<import("react").SetStateAction<Record<string, BannerAssetView>>>;
type BannerPickerModeSetter = import("react").Dispatch<import("react").SetStateAction<PickerMode | null>>;
type BannerLayerIdSetter = import("react").Dispatch<import("react").SetStateAction<string | null>>;

type BannerMakerEditorActions = {
  addImageLayer: (asset: BannerAssetView) => void;
  addTextLayer: () => void;
  changeBackground: (background: BannerBackground) => void;
  changeDesign: BannerDesignSetter;
  changeFrame: (frame: BannerFrame) => void;
  closePicker: () => void;
  deleteLayer: (id: string) => void;
  deleteSelectedLayer: () => void;
  dropLayer: (event: DragEvent<HTMLDivElement>, targetId: string) => void;
  handleAssetSelected: (asset: MediaAssetDto) => void;
  handleSidebarAssetSelected: (asset: MediaAssetDto) => void;
  moveLayer: (id: string, direction: "down" | "up") => void;
  moveLayerToEdge: (id: string, edge: "back" | "front") => void;
  openBackgroundPicker: () => void;
  openImagePicker: () => void;
  selectLayer: (id: string | null) => void;
  toggleGuides: () => void;
  toggleLeftSidebar: () => void;
  updateLayer: (layer: BannerLayer) => void;
};

type BannerMakerEditorController = {
  actions: BannerMakerEditorActions;
  assetUrls: Record<string, BannerAssetView>;
  canAddLayer: boolean;
  design: BannerDesign;
  formAction: (formData: FormData) => void;
  formState: BannerMakerFormState;
  isDirty: boolean;
  isLeftSidebarOpen: boolean;
  pickerMode: PickerMode | null;
  prepareSubmit: () => void;
  savedHasUnpublishedChanges: boolean;
  selectedLayer: BannerLayer | null;
  selectedLayerId: string | null;
  selectedPickerAssetId: string | null;
  showGuides: boolean;
  version: string | null;
};

function useBannerMakerEditorForm({ action, design, initialVersion, setDesign }: { action: BannerMakerAction; design: BannerDesign; initialVersion: string | null; setDesign: BannerDesignSetter }) {
  const submittedDesignRef = useRef<BannerDesign | null>(null);
  const currentDesignRef = useRef(design);

  useEffect(() => {
    currentDesignRef.current = design;
  }, [design]);

  const [formState, formAction] = useActionState(async (previousState: BannerMakerFormState, formData: FormData) => {
    const nextState = await action(previousState, formData);
    const submittedDesign = submittedDesignRef.current;
    if (nextState.status === "success" && nextState.design && submittedDesign && bannerDesignsEqual(currentDesignRef.current, submittedDesign)) {
      setDesign(nextState.design);
      submittedDesignRef.current = null;
    }
    return nextState;
  }, {
    status: "idle",
    version: initialVersion,
  });

  return {
    formAction,
    formState,
    prepareSubmit: () => {
      submittedDesignRef.current = design;
    },
  };
}

function createBannerMakerEditorActions({ canAddLayer, design, pickerMode, selectedLayerId, setAssetUrls, setDesign, setPickerMode, setSelectedLayerId }: { canAddLayer: boolean; design: BannerDesign; pickerMode: PickerMode | null; selectedLayerId: string | null; setAssetUrls: BannerAssetUrlsSetter; setDesign: BannerDesignSetter; setPickerMode: BannerPickerModeSetter; setSelectedLayerId: BannerLayerIdSetter }): Omit<BannerMakerEditorActions, "changeBackground" | "changeFrame" | "changeDesign" | "closePicker" | "openBackgroundPicker" | "openImagePicker" | "selectLayer" | "toggleGuides" | "toggleLeftSidebar"> {
  const updateLayer = (nextLayer: BannerLayer) => {
    setDesign((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === nextLayer.id ? nextLayer : layer),
    }));
  };

  const deleteLayer = (id: string) => {
    setDesign((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== id),
    }));
    setSelectedLayerId((current) => current === id ? null : current);
  };

  const deleteSelectedLayer = () => {
    if (selectedLayerId) deleteLayer(selectedLayerId);
  };

  const moveLayer = (id: string, direction: "down" | "up") => {
    setDesign((current) => {
      const index = current.layers.findIndex((layer) => layer.id === id);
      const targetIndex = direction === "up" ? index + 1 : index - 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.layers.length) return current;
      const layers = [...current.layers];
      const [layer] = layers.splice(index, 1);
      if (!layer) return current;
      layers.splice(targetIndex, 0, layer);
      return { ...current, layers };
    });
  };

  const moveLayerToEdge = (id: string, edge: "back" | "front") => {
    setDesign((current) => {
      const index = current.layers.findIndex((layer) => layer.id === id);
      if (index < 0 || (edge === "back" && index === 0) || (edge === "front" && index === current.layers.length - 1)) return current;
      const layers = [...current.layers];
      const [layer] = layers.splice(index, 1);
      if (!layer) return current;
      if (edge === "back") layers.unshift(layer);
      else layers.push(layer);
      return { ...current, layers };
    });
  };

  const dropLayer = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/banner-layer");
    if (!sourceId || sourceId === targetId) return;
    setDesign((current) => {
      const visibleLayers = [...current.layers].reverse();
      const sourceIndex = visibleLayers.findIndex((layer) => layer.id === sourceId);
      if (sourceIndex < 0 || !visibleLayers.some((layer) => layer.id === targetId)) return current;
      const [source] = visibleLayers.splice(sourceIndex, 1);
      if (!source) return current;
      const targetIndex = visibleLayers.findIndex((layer) => layer.id === targetId);
      if (targetIndex < 0) return current;
      visibleLayers.splice(targetIndex, 0, source);
      return { ...current, layers: visibleLayers.reverse() };
    });
  };

  const addTextLayer = () => {
    const layer: BannerTextLayer = {
      align: "left",
      color: "#FFFFFF",
      fontSize: 52,
      height: 22,
      id: createLayerId("text"),
      opacity: 1,
      rotation: 0,
      text: "Teks baru",
      type: "text",
      weight: "bold",
      width: 55,
      x: 8,
      y: 22,
    };
    setDesign((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const addImageLayer = (asset: BannerAssetView) => {
    if (!canAddLayer) return;
    const ratio = asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : 1.5;
    const width = 30;
    const height = clampClient((width * design.frame.width) / (design.frame.height * ratio), 10, 70);
    const layer: BannerImageLayer = {
      alt: asset.name.trim().slice(0, BANNER_MAX_ALT_LENGTH),
      assetId: asset.assetId,
      height,
      id: createLayerId("image"),
      opacity: 1,
      rotation: 0,
      type: "image",
      width,
      x: 62,
      y: clampClient(50 - height / 2, 0, 100 - height),
    };
    setDesign((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const handleAssetSelected = (asset: MediaAssetDto) => {
    const url = assetPreviewUrl(asset);
    const assetView: BannerAssetView = { assetId: asset.id, height: asset.height, name: asset.name, url, width: asset.width };
    setAssetUrls((current) => ({ ...current, [asset.id]: assetView }));
    if (pickerMode === "background") setDesign((current) => ({ ...current, background: { assetId: asset.id, type: "image" } }));
    else if (pickerMode === "image") addImageLayer(assetView);
    setPickerMode(null);
  };

  const handleSidebarAssetSelected = (asset: MediaAssetDto) => {
    const url = assetPreviewUrl(asset);
    const assetView: BannerAssetView = { assetId: asset.id, height: asset.height, name: asset.name, url, width: asset.width };
    setAssetUrls((current) => ({ ...current, [asset.id]: assetView }));
    addImageLayer(assetView);
  };

  return { addImageLayer, addTextLayer, deleteLayer, deleteSelectedLayer, dropLayer, handleAssetSelected, handleSidebarAssetSelected, moveLayer, moveLayerToEdge, updateLayer };
}

function useBannerMakerEditorController({ action, assetUrls: initialAssetUrls, design: initialDesign, hasUnpublishedChanges, version: initialVersion }: Omit<BannerMakerEditorProps, "session">): BannerMakerEditorController {
  const [design, setDesign] = useState(initialDesign);
  const [assetUrls, setAssetUrls] = useState(initialAssetUrls);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const form = useBannerMakerEditorForm({ action, design, initialVersion, setDesign });
  const selectedLayer = design.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const canAddLayer = design.layers.length < BANNER_MAX_LAYERS;
  const persistedDesign = form.formState.design ?? initialDesign;
  const version = form.formState.version ?? initialVersion;
  const savedHasUnpublishedChanges = form.formState.hasUnpublishedChanges ?? hasUnpublishedChanges;
  const isDirty = !bannerDesignsEqual(design, persistedDesign);

  useEffect(() => {
    if (!form.formState.message) return;
    showToast(form.formState.message, { variant: form.formState.status === "error" ? "error" : "success" });
  }, [form.formState.message, form.formState.status]);

  useEffect(() => {
    if (!pickerMode) return;
    const element = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (element?.isConnected) element.focus();
    };
  }, [pickerMode]);

  const layerActions = createBannerMakerEditorActions({ canAddLayer, design, pickerMode, selectedLayerId, setAssetUrls, setDesign, setPickerMode, setSelectedLayerId });
  const actions: BannerMakerEditorActions = {
    ...layerActions,
    changeBackground: (background) => setDesign((current) => ({ ...current, background })),
    changeDesign: setDesign,
    changeFrame: (frame) => setDesign((current) => ({ ...current, frame })),
    closePicker: () => setPickerMode(null),
    openBackgroundPicker: () => setPickerMode("background"),
    openImagePicker: () => setPickerMode("image"),
    selectLayer: setSelectedLayerId,
    toggleGuides: () => setShowGuides((current) => !current),
    toggleLeftSidebar: () => setIsLeftSidebarOpen((current) => !current),
  };
  const selectedPickerAssetId = pickerMode === "background"
    ? design.background.type === "image" ? design.background.assetId : null
    : selectedLayer?.type === "image" ? selectedLayer.assetId : null;

  return { actions, assetUrls, canAddLayer, design, formAction: form.formAction, formState: form.formState, isDirty, isLeftSidebarOpen, pickerMode, prepareSubmit: form.prepareSubmit, savedHasUnpublishedChanges, selectedLayer, selectedLayerId, selectedPickerAssetId, showGuides, version };
}

function BannerMakerEditorHeader({ controller, session }: { controller: BannerMakerEditorController; session: SessionContext }) {
  const { actions } = controller;

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-white/15 bg-voyage-deep px-3 py-3 text-white sm:px-4">
      <Link aria-label="Kembali ke dashboard admin" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/35" href="/admin">
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden sm:block"><BrandMark compact /></span>
        <h1 className="whitespace-nowrap text-base font-semibold">Banner maker</h1>
      </div>
      <label className="order-last w-full min-w-0 sm:order-none sm:ml-3 sm:w-auto sm:max-w-72 sm:flex-1">
        <span className="sr-only">Nama banner</span>
        <Input aria-label="Nama banner" className="h-11 rounded-xl border-white/20 bg-white/10 text-sm font-semibold text-white placeholder:text-white/70 focus-visible:border-white/65 focus-visible:ring-white/20" maxLength={120} onChange={(event) => actions.changeDesign((current) => ({ ...current, name: event.target.value }))} value={controller.design.name} />
      </label>
      <div className="ml-auto flex items-center gap-2">
        <SubmitButton aria-label="Simpan draf" className="min-h-11 rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10" name="intent" pendingLabel="Menyimpan…" size="sm" type="submit" value="save-draft" variant="inverseOutline">
          <Save data-icon="inline-start" /><span className="hidden sm:inline">Simpan</span>
        </SubmitButton>
        <SubmitButton aria-label="Rilis banner" className="min-h-11 rounded-xl border-white/80 bg-white text-primary-800 hover:bg-white/90 focus-visible:border-white focus-visible:ring-white/45" name="intent" pendingLabel="Merilis…" size="sm" type="submit" value="publish" variant="brand">
          <SendHorizontal data-icon="inline-start" /><span>Rilis</span>
        </SubmitButton>
        <StudentAccountMenu audience="admin" session={session} />
      </div>
    </header>
  );
}

function BannerMakerEditorStatus({ controller }: { controller: BannerMakerEditorController }) {
  return controller.formState.status === "error" && controller.formState.message ? <div className="mx-3 mt-3 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg sm:mx-5" role="alert">{controller.formState.message}</div> : null;
}

function BannerMakerEditorLayerList({ controller }: { controller: BannerMakerEditorController }) {
  return <LayerList design={controller.design} onDeleteLayer={controller.actions.deleteLayer} onDropLayer={controller.actions.dropLayer} onMoveDown={(id) => controller.actions.moveLayer(id, "down")} onMoveToBack={(id) => controller.actions.moveLayerToEdge(id, "back")} onMoveToFront={(id) => controller.actions.moveLayerToEdge(id, "front")} onMoveUp={(id) => controller.actions.moveLayer(id, "up")} onSelect={controller.actions.selectLayer} selectedLayerId={controller.selectedLayerId} />;
}

function BannerMakerEditorLeftSidebar({ controller }: { controller: BannerMakerEditorController }) {
  return (
    <aside aria-label="Media dan layer banner" className={cn("hidden shrink-0 flex-col border-r border-primary-100 bg-white transition-[width] duration-200 motion-reduce:transition-none md:flex", controller.isLeftSidebarOpen ? "w-64 xl:w-72" : "w-14")}>
      <div className={cn("flex min-h-16 shrink-0 items-center border-b border-primary-100 px-3", controller.isLeftSidebarOpen ? "justify-between" : "justify-center")}>
        {controller.isLeftSidebarOpen ? <h2 className="text-sm font-semibold">Media</h2> : null}
        <TooltipProvider><IconAction ariaLabel={controller.isLeftSidebarOpen ? "Ciutkan panel kiri" : "Buka panel kiri"} className="size-10 text-secondary-600 hover:bg-primary-50 hover:text-secondary-900" onClick={controller.actions.toggleLeftSidebar} pressed={controller.isLeftSidebarOpen}>{controller.isLeftSidebarOpen ? <ChevronLeft /> : <ChevronRight />}</IconAction></TooltipProvider>
      </div>
      {controller.isLeftSidebarOpen ? <>
        <MediaSidebar onSelectAsset={controller.actions.handleSidebarAssetSelected} />
        <section aria-label="Layer banner" className="min-h-40 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex items-center justify-between gap-3 px-1"><h2 className="text-sm font-semibold text-secondary-900">Layer</h2><span className="text-xs tabular-nums text-secondary-500">{controller.design.layers.length}</span></div>
          <BannerMakerEditorLayerList controller={controller} />
        </section>
      </> : null}
    </aside>
  );
}

function BannerMakerEditorProperties({ controller, idPrefix }: { controller: BannerMakerEditorController; idPrefix: string }) {
  return <EditorPropertiesPanel assetUrls={controller.assetUrls} background={controller.design.background} frame={controller.design.frame} idPrefix={idPrefix} layer={controller.selectedLayer} onBackgroundChange={controller.actions.changeBackground} onChangeFrame={controller.actions.changeFrame} onChangeLayer={controller.actions.updateLayer} onDeleteLayer={controller.actions.deleteSelectedLayer} onPickBackgroundImage={controller.actions.openBackgroundPicker} />;
}

function BannerMakerEditorCanvasArea({ controller }: { controller: BannerMakerEditorController }) {
  const { actions } = controller;

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-voyage-canvas">
      <div className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary-100 bg-white px-3 py-2 sm:px-5">
        <TooltipProvider>
          <div aria-label="Alat banner" className="flex items-center gap-1">
            <IconAction ariaLabel="Tambahkan teks" className="size-11" disabled={!controller.canAddLayer} onClick={actions.addTextLayer}><PenTool /></IconAction>
            <IconAction ariaLabel="Impor gambar" className="size-11" disabled={!controller.canAddLayer} onClick={actions.openImagePicker}><ImagePlus /></IconAction>
            <span aria-hidden="true" className="mx-2 h-5 w-px bg-primary-100" />
            <IconAction ariaLabel={controller.showGuides ? "Sembunyikan panduan" : "Tampilkan panduan"} className={cn("size-11", controller.showGuides && "bg-primary-50 text-primary-800")} onClick={actions.toggleGuides} pressed={controller.showGuides}><Eye /></IconAction>
          </div>
        </TooltipProvider>
        <p className="text-xs font-medium text-secondary-600" role="status">{controller.isDirty ? "Perubahan belum disimpan" : controller.savedHasUnpublishedChanges ? "Draf belum dirilis" : "Banner aktif"}</p>
      </div>
      <div className="flex flex-1 flex-col">
        <section aria-label="Area kerja banner" className="flex min-h-72 flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:py-12 xl:px-8">
          <div className="mx-auto w-full max-w-[1500px]">
            <div className="mb-4 flex items-center justify-between gap-3 text-xs text-secondary-500"><span className="truncate font-medium">{controller.design.name}</span><span className="shrink-0 tabular-nums">{controller.design.frame.width} × {controller.design.frame.height} px</span></div>
            <BannerCanvas assetUrls={controller.assetUrls} design={controller.design} onChange={actions.changeDesign} onDeleteLayer={actions.deleteLayer} onMoveLayer={actions.moveLayer} onMoveToBack={(id) => actions.moveLayerToEdge(id, "back")} onMoveToFront={(id) => actions.moveLayerToEdge(id, "front")} onSelect={actions.selectLayer} showGuides={controller.showGuides} selectedLayerId={controller.selectedLayerId} />
          </div>
        </section>
        <section aria-label="Layer banner" className="border-t border-primary-100 bg-white p-4 md:hidden"><h2 className="mb-3 text-sm font-semibold text-secondary-900">Layer</h2><BannerMakerEditorLayerList controller={controller} /></section>
        <div className="border-t border-primary-100 bg-white p-4 lg:hidden"><BannerMakerEditorProperties controller={controller} idPrefix="mobile" /></div>
      </div>
    </main>
  );
}

function BannerMakerEditorPropertiesSidebar({ controller }: { controller: BannerMakerEditorController }) {
  return <aside aria-label="Edit elemen" className="hidden w-72 shrink-0 overflow-y-auto border-l border-primary-100 bg-white lg:block"><div className="sticky top-0 z-10 flex min-h-16 items-center border-b border-primary-100 bg-white px-4"><h2 className="text-sm font-semibold text-secondary-900">Edit banner</h2></div><div className="p-4"><BannerMakerEditorProperties controller={controller} idPrefix="desktop" /></div></aside>;
}

function BannerMakerEditorWorkspace({ controller }: { controller: BannerMakerEditorController }) {
  return <div className="relative flex min-h-0 flex-1"><BannerMakerEditorLeftSidebar controller={controller} /><BannerMakerEditorCanvasArea controller={controller} /><BannerMakerEditorPropertiesSidebar controller={controller} /></div>;
}

function BannerMakerEditorForm({ controller, session }: { controller: BannerMakerEditorController; session: SessionContext }) {
  return <form action={controller.formAction} className="flex h-full min-h-0 flex-col" onSubmit={controller.prepareSubmit}><input name="design" type="hidden" value={JSON.stringify(controller.design)} readOnly /><input name="version" type="hidden" value={controller.version ?? ""} readOnly /><BannerMakerEditorHeader controller={controller} session={session} /><BannerMakerEditorStatus controller={controller} /><BannerMakerEditorWorkspace controller={controller} /></form>;
}

function BannerMakerEditorShell({ controller, session }: { controller: BannerMakerEditorController; session: SessionContext }) {
  return <div className="relative h-svh min-h-[38rem] overflow-hidden bg-voyage-canvas text-secondary-900"><BannerMakerEditorForm controller={controller} session={session} />{controller.pickerMode ? <AssetPickerPanel mode={controller.pickerMode} onClose={controller.actions.closePicker} onSelect={controller.actions.handleAssetSelected} selectedAssetId={controller.selectedPickerAssetId} /> : null}</div>;
}

function BannerMakerEditor({ action, assetUrls: initialAssetUrls, design: initialDesign, hasUnpublishedChanges, session, version: initialVersion }: BannerMakerEditorProps) {
  const controller = useBannerMakerEditorController({ action, assetUrls: initialAssetUrls, design: initialDesign, hasUnpublishedChanges, version: initialVersion });

  return <BannerMakerEditorShell controller={controller} session={session} />;
}


export { BannerMakerEditor };
export type { BannerMakerAction, BannerMakerEditorProps };
