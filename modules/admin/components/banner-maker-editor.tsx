"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark } from "@/modules/home/components/home-primitives";
import { showToast } from "@/components/ui/toast";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
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
  type BannerLayer,
  type BannerMakerFormState,
  type BannerTextLayer,
} from "@/lib/admin/banner-maker";
import type { SessionContext } from "@/lib/auth/types";
import { imageMediaMimeTypes } from "@/lib/media/domain";
import type { MediaAssetDto } from "@/lib/media/types";
import { MediaLibrary } from "@/modules/media/media-library";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { SubmitButton } from "@/modules/auth/components/submit-button";
import { cn } from "@/lib/utils";
import { BannerCanvas, LayerContextMenu } from "./banner-maker-canvas";
import {
  clampClient,
  createBannerMakerEditorActions,
  type BannerDesignSetter,
  type BannerMakerEditorActions,
} from "./banner-maker-editor-actions";

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
            variant="outline"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{ariaLabel}</TooltipContent>
    </Tooltip>
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
    <label className="flex items-center justify-between gap-3 rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
      <span className="text-sm font-medium text-secondary-700">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-ui-xs font-semibold uppercase text-secondary-500">{value}</span>
        <input
          aria-label={label}
          className="size-9 cursor-pointer rounded-field border border-white bg-transparent p-0.5 shadow-sm"
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
      <div className="grid grid-cols-3 gap-1.5 rounded-control bg-primary-50 p-1" role="group" aria-label="Jenis latar">
        {backgroundModes.map((mode) => (
          <button
            aria-pressed={background.type === mode.type}
            className={cn(
              "min-h-10 rounded-control px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-700/20",
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
          <label className="block rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
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
            <div className="overflow-hidden rounded-card border border-primary-100 bg-primary-50">
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
            <div className="rounded-field border border-dashed border-primary-200 bg-primary-50/50 px-4 py-5 text-center">
              <ImageOff aria-hidden="true" className="mx-auto size-6 text-primary-600" />
              <p className="mt-2 text-xs leading-5 text-secondary-500">Pilih gambar.</p>
            </div>
          )}
          <Button onClick={onPickImage} size="sm" type="button" variant="outline">
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
      <label className="block rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
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
      <label className="block rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
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
      <label className="flex min-h-11 items-center gap-2.5 rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5 text-sm font-medium text-secondary-700">
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
                className="h-11 w-full cursor-pointer rounded-field border border-primary-100 bg-primary-50/70 p-1"
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

      <label className="block rounded-field border border-primary-100/80 bg-primary-50/55 px-3 py-2.5">
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
          className="min-h-32 rounded-card border border-dashed border-primary-200 bg-primary-50/35 px-4 py-5"
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
          <Button aria-label="Tutup panel impor gambar" onClick={onClose} size="icon" type="button" variant="quiet">
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
      <Button aria-label="Kembali ke dashboard admin" nativeButton={false} render={<Link href="/admin" />} size="icon-sm" variant="inverse">
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden sm:block"><BrandMark compact /></span>
        <h1 className="whitespace-nowrap text-base font-semibold">Editor banner</h1>
      </div>
      <label className="order-last w-full min-w-0 sm:order-none sm:ml-3 sm:w-auto sm:max-w-72 sm:flex-1">
        <span className="sr-only">Nama banner</span>
        <Input aria-label="Nama banner" maxLength={120} onChange={(event) => actions.changeDesign((current) => ({ ...current, name: event.target.value }))} value={controller.design.name} />
      </label>
      <div className="ml-auto flex items-center gap-2">
        <SubmitButton aria-label="Simpan draf" name="intent" pendingLabel="Menyimpan…" type="submit" value="save-draft" variant="inverse">
          <Save data-icon="inline-start" /><span className="hidden sm:inline">Simpan</span>
        </SubmitButton>
        <SubmitButton aria-label="Rilis banner" name="intent" pendingLabel="Merilis…" type="submit" value="publish" variant="default">
          <SendHorizontal data-icon="inline-start" /><span>Rilis</span>
        </SubmitButton>
        <StudentAccountMenu audience="admin" session={session} />
      </div>
    </header>
  );
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
        {controller.savedHasUnpublishedChanges ? <p className="text-xs font-medium text-secondary-600">Draf belum dirilis</p> : null}
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

function BannerMakerEditorPageStatus({
  dirty,
  formRef,
}: {
  dirty: boolean;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const { data, pending } = useFormStatus();
  const isPublishing = data?.get("intent") === "publish";

  usePageStatusToast({
    active: dirty || pending,
    action: dirty && !pending
      ? {
          label: "Simpan draf",
          onClick: () => {
            const form = formRef.current;
            const submitter = form?.querySelector<HTMLButtonElement>('button[name="intent"][value="save-draft"]');
            if (form && submitter) form.requestSubmit(submitter);
          },
        }
      : undefined,
    message: pending
      ? isPublishing ? "Menerbitkan banner…" : "Menyimpan perubahan banner…"
      : "Perubahan banner belum disimpan.",
    variant: pending ? "info" : "warning",
  });

  return null;
}

function BannerMakerEditorPropertiesSidebar({ controller }: { controller: BannerMakerEditorController }) {
  return <aside aria-label="Edit elemen" className="hidden w-72 shrink-0 overflow-y-auto border-l border-primary-100 bg-white lg:block"><div className="sticky top-0 z-10 flex min-h-16 items-center border-b border-primary-100 bg-white px-4"><h2 className="text-sm font-semibold text-secondary-900">Edit banner</h2></div><div className="p-4"><BannerMakerEditorProperties controller={controller} idPrefix="desktop" /></div></aside>;
}

function BannerMakerEditorWorkspace({ controller }: { controller: BannerMakerEditorController }) {
  return <div className="relative flex min-h-0 flex-1"><BannerMakerEditorLeftSidebar controller={controller} /><BannerMakerEditorCanvasArea controller={controller} /><BannerMakerEditorPropertiesSidebar controller={controller} /></div>;
}

function BannerMakerEditorForm({ controller, session }: { controller: BannerMakerEditorController; session: SessionContext }) {
  const formRef = useRef<HTMLFormElement>(null);
  return <form action={controller.formAction} className="flex h-full min-h-0 flex-col" onSubmit={controller.prepareSubmit} ref={formRef}><input name="design" type="hidden" value={JSON.stringify(controller.design)} readOnly /><input name="version" type="hidden" value={controller.version ?? ""} readOnly /><BannerMakerEditorPageStatus dirty={controller.isDirty} formRef={formRef} /><BannerMakerEditorHeader controller={controller} session={session} /><BannerMakerEditorWorkspace controller={controller} /></form>;
}

function BannerMakerEditorShell({ controller, session }: { controller: BannerMakerEditorController; session: SessionContext }) {
  return <div className="relative h-svh min-h-[38rem] overflow-hidden workspace-page-canvas text-secondary-900"><BannerMakerEditorForm controller={controller} session={session} />{controller.pickerMode ? <AssetPickerPanel mode={controller.pickerMode} onClose={controller.actions.closePicker} onSelect={controller.actions.handleAssetSelected} selectedAssetId={controller.selectedPickerAssetId} /> : null}</div>;
}

function BannerMakerEditor({ action, assetUrls: initialAssetUrls, design: initialDesign, hasUnpublishedChanges, session, version: initialVersion }: BannerMakerEditorProps) {
  const controller = useBannerMakerEditorController({ action, assetUrls: initialAssetUrls, design: initialDesign, hasUnpublishedChanges, version: initialVersion });

  return <BannerMakerEditorShell controller={controller} session={session} />;
}


export {
  AssetPickerPanel,
  BannerCanvas,
  BannerMakerEditor,
  EditorPropertiesPanel,
  LayerList,
};
export type {
  BannerMakerAction,
  BannerMakerEditorActions,
  BannerMakerEditorProps,
};
