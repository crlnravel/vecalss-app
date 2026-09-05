"use client";

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
  ReferenceSectionHeading,
  ReferenceSurface,
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
  canMoveBack,
  canMoveDown,
  canMoveFront,
  canMoveUp,
  onDelete,
  onMoveBack,
  onMoveDown,
  onMoveFront,
  onMoveUp,
  trigger,
}: {
  canMoveBack: boolean;
  canMoveDown: boolean;
  canMoveFront: boolean;
  canMoveUp: boolean;
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
        <ContextMenuItem disabled={!canMoveFront} onClick={onMoveFront}>
          <ArrowUp />Bawa ke depan
        </ContextMenuItem>
        <ContextMenuItem disabled={!canMoveBack} onClick={onMoveBack}>
          <ArrowDown />Kirim ke belakang
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
          <ArrowUp />Naikkan satu tingkat
        </ContextMenuItem>
        <ContextMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
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
  const backgroundModes: Array<{ label: string; type: BannerBackground["type"] }> = [
    { label: "Warna", type: "color" },
    { label: "Gradasi", type: "gradient" },
    { label: "Gambar", type: "image" },
  ];

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
              <img
                alt={assetUrls[background.assetId].name}
                className="aspect-[2.2] w-full object-cover"
                src={assetUrls[background.assetId].url}
              />
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
  const [dragState, setDragState] = useState<LayerDragState | null>(null);
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
    setDragState({
      id: layer.id,
      originX: layer.x,
      originY: layer.y,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    });
  };

  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
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

  const stopDragging = () => setDragState(null);

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
            canMoveBack={layerIndex > 0}
            canMoveDown={layerIndex > 0}
            canMoveFront={layerIndex < design.layers.length - 1}
            canMoveUp={layerIndex < design.layers.length - 1}
            key={layer.id}
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
                    <img alt={layer.alt || "Gambar banner"} className="size-full object-contain" src={imageUrl} />
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
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/25 px-2.5 py-1 text-ui-xs font-semibold tracking-[0.08em] text-white/80 uppercase">
        {design.frame.width} × {design.frame.height}
      </span>
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
          canMoveBack={index < visibleLayers.length - 1}
          canMoveDown={index < visibleLayers.length - 1}
          canMoveFront={index > 0}
          canMoveUp={index > 0}
          key={layer.id}
          onDelete={() => onDeleteLayer(layer.id)}
          onMoveBack={() => onMoveToBack(layer.id)}
          onMoveDown={() => onMoveDown(layer.id)}
          onMoveFront={() => onMoveToFront(layer.id)}
          onMoveUp={() => onMoveUp(layer.id)}
          trigger={
            <div
              className={cn(
                "flex w-full cursor-grab items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:cursor-grabbing",
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
                className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20"
                draggable
                onClick={() => onSelect(layer.id)}
                onDragStart={(event) => startLayerDrag(event, layer.id)}
                type="button"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700">
                  <LayerIcon layer={layer} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{layerLabel(layer)}</span>
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
    <ReferenceSurface as="section" className="p-4" variant="inset">
      <ReferenceSectionHeading title={layer ? "Edit elemen" : "Latar"} />
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
    </ReferenceSurface>
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
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    const firstElement = getFocusableElements()[0];
    firstElement?.focus();
    const keepFocusInside = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    dialog.addEventListener("keydown", keepFocusInside);
    return () => dialog.removeEventListener("keydown", keepFocusInside);
  }, []);

  return (
    <>
      <button
        aria-label="Tutup panel impor gambar"
        className="absolute inset-x-0 top-16 bottom-0 z-20 bg-secondary-950/20 sm:hidden"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-label={mode === "background" ? "Pilih gambar latar" : "Impor gambar ke banner"}
        aria-modal="true"
        className="absolute inset-x-auto top-16 bottom-0 left-0 z-30 flex w-[min(27rem,calc(100vw-0.75rem))] flex-col border-r border-primary-100 bg-white shadow-[0_24px_70px_-34px_rgba(1,76,56,0.45)] sm:w-[27rem]"
        role="dialog"
        ref={dialogRef}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">Media admin</p>
            <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-secondary-900">
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
      </aside>
    </>
  );
}

function MediaSidebar({ onSelectAsset }: { onSelectAsset: (asset: MediaAssetDto) => void }) {
  return (
    <section className="flex min-h-0 flex-[1.15] flex-col overflow-hidden px-3 pt-3">
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

function BannerMakerEditor({
  action,
  assetUrls: initialAssetUrls,
  design: initialDesign,
  hasUnpublishedChanges,
  session,
  version: initialVersion,
}: BannerMakerEditorProps) {
  const [design, setDesign] = useState(initialDesign);
  const [assetUrls, setAssetUrls] = useState(initialAssetUrls);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const pickerRestoreRef = useRef<HTMLElement | null>(null);
  const submittedDesignRef = useRef<BannerDesign | null>(null);
  const [state, formAction] = useActionState(action, {
    status: "idle",
    version: initialVersion,
  });
  const selectedLayer = design.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const canAddLayer = design.layers.length < BANNER_MAX_LAYERS;
  const persistedDesign = state.design ?? initialDesign;
  const version = state.version ?? initialVersion;
  const savedHasUnpublishedChanges = state.hasUnpublishedChanges ?? hasUnpublishedChanges;
  const isDirty = !bannerDesignsEqual(design, persistedDesign);

  useEffect(() => {
    if (!state.message) return;
    showToast(state.message, { variant: state.status === "error" ? "error" : "success" });
  }, [state.message, state.status]);

  useEffect(() => {
    if (!pickerMode) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setPickerMode(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerMode]);

  useEffect(() => {
    if (!pickerMode) return;
    pickerRestoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const element = pickerRestoreRef.current;
      pickerRestoreRef.current = null;
      if (element?.isConnected) element.focus();
    };
  }, [pickerMode]);

  useEffect(() => {
    if (state.status !== "success" || !state.design) return;
    const submittedDesign = submittedDesignRef.current;
    if (!submittedDesign) return;
    submittedDesignRef.current = null;
    if (!bannerDesignsEqual(design, submittedDesign)) return;
    setDesign(state.design);
  }, [design, state.design, state.status]);

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
      // Reorder in the same front-to-back order shown in the layer list, then
      // restore draw order for the canvas and persisted design.
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
    const assetView: BannerAssetView = {
      assetId: asset.id,
      height: asset.height,
      name: asset.name,
      url,
      width: asset.width,
    };
    setAssetUrls((current) => ({ ...current, [asset.id]: assetView }));

    if (pickerMode === "background") {
      setDesign((current) => ({ ...current, background: { assetId: asset.id, type: "image" } }));
    } else if (pickerMode === "image") {
      addImageLayer(assetView);
    }
    setPickerMode(null);
  };

  const handleSidebarAssetSelected = (asset: MediaAssetDto) => {
    const url = assetPreviewUrl(asset);
    const assetView: BannerAssetView = {
      assetId: asset.id,
      height: asset.height,
      name: asset.name,
      url,
      width: asset.width,
    };
    setAssetUrls((current) => ({ ...current, [asset.id]: assetView }));
    addImageLayer(assetView);
  };

  const selectedPickerAssetId = pickerMode === "background"
    ? design.background.type === "image" ? design.background.assetId : null
    : selectedLayer?.type === "image" ? selectedLayer.assetId : null;

  return (
    <div className="relative h-svh min-h-[38rem] overflow-hidden bg-voyage-canvas text-secondary-900">
      <form
        action={formAction}
        className="flex h-full min-h-0 flex-col"
        onSubmit={() => {
          submittedDesignRef.current = design;
        }}
      >
        <input name="design" type="hidden" value={JSON.stringify(design)} readOnly />
        <input name="version" type="hidden" value={version ?? ""} readOnly />

        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-white/15 bg-[linear-gradient(105deg,#014C38_0%,#176B4D_58%,#2F8A5D_100%)] px-3 py-2 text-white sm:px-4">
          <Link
            aria-label="Kembali ke dashboard admin"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/35"
            href="/admin"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">Kembali</span>
          </Link>
          <span aria-hidden="true" className="hidden h-8 w-px bg-white/20 sm:block" />
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <BrandMark compact />
            <div className="min-w-0">
              <p className="text-ui-xs font-semibold tracking-[0.14em] text-white/65 uppercase">Vecalss Studio</p>
              <p className="truncate text-sm font-semibold text-white">Banner maker</p>
            </div>
          </div>
          <label className="min-w-0 flex-1 sm:ml-2 sm:max-w-[19rem]">
            <span className="sr-only">Nama banner</span>
            <Input
              aria-label="Nama banner"
              className="h-10 border-white/20 bg-white/10 text-sm font-semibold text-white placeholder:text-white/55 focus-visible:border-white/65 focus-visible:ring-white/20"
              maxLength={120}
              onChange={(event) => setDesign((current) => ({ ...current, name: event.target.value }))}
              value={design.name}
            />
          </label>
          <TooltipProvider>
            <div className="flex shrink-0 items-center gap-1">
              <IconAction
                ariaLabel="Tambahkan teks"
                className="text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-white/45"
                disabled={!canAddLayer}
                onClick={addTextLayer}
              >
                <PenTool />
              </IconAction>
              <IconAction
                ariaLabel="Impor gambar"
                className="text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-white/45"
                disabled={!canAddLayer}
                onClick={() => setPickerMode("image")}
              >
                <ImagePlus />
              </IconAction>
              <IconAction
                ariaLabel={showGuides ? "Sembunyikan panduan" : "Tampilkan panduan"}
                className="text-white/90 hover:bg-white/10 hover:text-white focus-visible:ring-white/45"
                onClick={() => setShowGuides((current) => !current)}
                pressed={showGuides}
              >
                <Eye />
              </IconAction>
            </div>
          </TooltipProvider>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/90 lg:flex">
              <span className={cn("size-2 rounded-full", isDirty ? "bg-voyage-warm-sun" : "bg-emerald-200")} />
              <span>{isDirty ? "Perubahan belum disimpan" : savedHasUnpublishedChanges ? "Draf belum dirilis" : "Banner aktif"}</span>
            </div>
            <SubmitButton
              aria-label="Simpan draf"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              name="intent"
              pendingLabel="Menyimpan..."
              size="sm"
              type="submit"
              value="save-draft"
              variant="inverseOutline"
            >
              <Save data-icon="inline-start" />
              <span className="hidden sm:inline">Simpan</span>
            </SubmitButton>
            <SubmitButton
              aria-label="Rilis banner"
              className="border-white/80 bg-white text-primary-800 hover:bg-white/90 focus-visible:border-white focus-visible:ring-white/45"
              name="intent"
              pendingLabel="Merilis..."
              size="sm"
              type="submit"
              value="publish"
              variant="brand"
            >
              <SendHorizontal data-icon="inline-start" />
              <span>Rilis</span>
            </SubmitButton>
            <StudentAccountMenu audience="admin" session={session} />
          </div>
        </header>

        {state.status === "error" && state.message ? (
          <div
            className="mx-3 mt-3 rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg sm:mx-5"
            role="alert"
          >
            {state.message}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          <aside
            aria-label="Media dan layer banner"
            className={cn(
              "hidden shrink-0 flex-col border-r border-primary-100 bg-white transition-[width] duration-200 md:flex",
              isLeftSidebarOpen ? "w-[20rem] xl:w-[22rem]" : "w-14",
            )}
          >
            <div className={cn("flex shrink-0 p-2", isLeftSidebarOpen ? "justify-end" : "justify-center")}>
              <TooltipProvider>
                <IconAction
                  ariaLabel={isLeftSidebarOpen ? "Ciutkan panel kiri" : "Buka panel kiri"}
                  className="text-secondary-600 hover:bg-primary-50 hover:text-secondary-900"
                  onClick={() => setIsLeftSidebarOpen((current) => !current)}
                  pressed={isLeftSidebarOpen}
                >
                  {isLeftSidebarOpen ? <ChevronLeft /> : <ChevronRight />}
                </IconAction>
              </TooltipProvider>
            </div>
            {isLeftSidebarOpen ? (
              <>
                <MediaSidebar onSelectAsset={handleSidebarAssetSelected} />
                <section aria-label="Layer banner" className="min-h-0 flex-[0.95] overflow-y-auto p-4">
                  <h2 className="text-sm font-semibold text-secondary-900">Layer</h2>
                  <div className="mt-3">
                    <LayerList
                      design={design}
                      onDeleteLayer={deleteLayer}
                      onDropLayer={dropLayer}
                      onMoveDown={(id) => moveLayer(id, "down")}
                      onMoveToBack={(id) => moveLayerToEdge(id, "back")}
                      onMoveToFront={(id) => moveLayerToEdge(id, "front")}
                      onMoveUp={(id) => moveLayer(id, "up")}
                      onSelect={setSelectedLayerId}
                      selectedLayerId={selectedLayerId}
                    />
                  </div>
                </section>
              </>
            ) : null}
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto bg-voyage-canvas">
            <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 p-4 sm:p-6 xl:p-8">
              <ReferenceSurface as="section" className="p-3 sm:p-5" variant="inset">
                <div className="rounded-[1.75rem] bg-[#e5eee9] p-3 sm:p-7 lg:p-10">
                  <BannerCanvas
                    assetUrls={assetUrls}
                    design={design}
                    onChange={setDesign}
                    onDeleteLayer={deleteLayer}
                    onMoveLayer={moveLayer}
                    onMoveToBack={(id) => moveLayerToEdge(id, "back")}
                    onMoveToFront={(id) => moveLayerToEdge(id, "front")}
                    onSelect={setSelectedLayerId}
                    showGuides={showGuides}
                    selectedLayerId={selectedLayerId}
                  />
                </div>
              </ReferenceSurface>

              <section aria-label="Layer banner" className="md:hidden">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-secondary-900">Layer</h2>
                </div>
                <LayerList
                  design={design}
                  onDeleteLayer={deleteLayer}
                  onDropLayer={dropLayer}
                  onMoveDown={(id) => moveLayer(id, "down")}
                  onMoveToBack={(id) => moveLayerToEdge(id, "back")}
                  onMoveToFront={(id) => moveLayerToEdge(id, "front")}
                  onMoveUp={(id) => moveLayer(id, "up")}
                  onSelect={setSelectedLayerId}
                  selectedLayerId={selectedLayerId}
                />
              </section>

              <div className="lg:hidden">
                <EditorPropertiesPanel
                  assetUrls={assetUrls}
                  background={design.background}
                  frame={design.frame}
                  idPrefix="mobile"
                  layer={selectedLayer}
                  onBackgroundChange={(background) => setDesign((current) => ({ ...current, background }))}
                  onChangeFrame={(frame) => setDesign((current) => ({ ...current, frame }))}
                  onChangeLayer={updateLayer}
                  onDeleteLayer={deleteSelectedLayer}
                  onPickBackgroundImage={() => setPickerMode("background")}
                />
              </div>
            </div>
          </main>

          <aside aria-label="Edit elemen" className="hidden w-[19rem] shrink-0 overflow-y-auto border-l border-primary-100 bg-white/80 lg:block xl:w-[21rem]">
            <div className="sticky top-0 z-10 border-b border-primary-100 bg-white/95 px-4 py-4 backdrop-blur-sm">
              <h2 className="text-base font-semibold tracking-[-0.02em] text-secondary-900">Edit banner</h2>
            </div>
            <div className="space-y-4 p-4">
              <EditorPropertiesPanel
                assetUrls={assetUrls}
                background={design.background}
                frame={design.frame}
                idPrefix="desktop"
                layer={selectedLayer}
                onBackgroundChange={(background) => setDesign((current) => ({ ...current, background }))}
                onChangeFrame={(frame) => setDesign((current) => ({ ...current, frame }))}
                onChangeLayer={updateLayer}
                onDeleteLayer={deleteSelectedLayer}
                onPickBackgroundImage={() => setPickerMode("background")}
              />
            </div>
          </aside>
        </div>
      </form>

      {pickerMode ? (
        <AssetPickerPanel
          mode={pickerMode}
          onClose={() => setPickerMode(null)}
          onSelect={handleAssetSelected}
          selectedAssetId={selectedPickerAssetId}
        />
      ) : null}
    </div>
  );
}

export { BannerMakerEditor };
export type { BannerMakerAction, BannerMakerEditorProps };
