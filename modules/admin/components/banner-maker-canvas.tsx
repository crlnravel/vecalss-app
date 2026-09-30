"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ArrowDown,
  ArrowUp,
  FileImage,
  ImageOff,
  PenTool,
  Trash2,
} from "@/lib/icons";
import {
  BANNER_MAX_TEXT_LENGTH,
  type BannerAssetView,
  type BannerBackground,
  type BannerDesign,
  type BannerLayer,
} from "@/lib/admin/banner-maker";
import {
  getBannerImagePaint,
  getBannerLayerLayout,
  getBannerTextPaint,
  calculateBannerGeometry,
} from "@/lib/banner/renderer";
import { cn } from "@/lib/utils";
import { clampClient } from "./banner-maker-editor-actions";

type LayerDragState = {
  id: string;
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

export type LayerMoveAvailability = {
  back: boolean;
  down: boolean;
  front: boolean;
  up: boolean;
};

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

function backgroundStyle(background: BannerBackground, hasImageSource = false): CSSProperties {
  if (background.type === "color") {
    return { backgroundColor: background.color };
  }

  if (background.type === "gradient") {
    return {
      backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`,
    };
  }

  return hasImageSource
    ? { backgroundColor: "#014C38" }
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

export function LayerContextMenu({
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

export function BannerCanvas({
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
  const geometry = calculateBannerGeometry(design.frame, canvasWidth || design.frame.width);
  const backgroundImageUrl = design.background.type === "image"
    ? assetUrls[design.background.assetId]?.url || null
    : null;

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
      <div className="pointer-events-none absolute inset-0" style={backgroundStyle(design.background, Boolean(backgroundImageUrl))} />
      {backgroundImageUrl ? (
        <>
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover"
            src={backgroundImageUrl}
            style={getBannerImagePaint("background")}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(1,76,56,0.42),rgba(23,107,77,0.08))]" />
        </>
      ) : null}
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

      {design.layers.map((layer) => <BannerCanvasLayer assetUrls={assetUrls} design={design} editingTextLayerId={editingTextLayerId} editingTextRef={editingTextRef} geometry={geometry} key={layer.id} layer={layer} onDeleteLayer={onDeleteLayer} onLayerKeyDown={onLayerKeyDown} onLayerPointerDown={onLayerPointerDown} onMoveLayer={onMoveLayer} onMoveToBack={onMoveToBack} onMoveToFront={onMoveToFront} onSelect={onSelect} selectedLayerId={selectedLayerId} setEditingTextLayerId={setEditingTextLayerId} updateLayer={updateLayer} />)}
    </div>
  );
}

function BannerCanvasLayer({ assetUrls, design, editingTextLayerId, editingTextRef, geometry, layer, onDeleteLayer, onLayerKeyDown, onLayerPointerDown, onMoveLayer, onMoveToBack, onMoveToFront, onSelect, selectedLayerId, setEditingTextLayerId, updateLayer }: {
  assetUrls: Record<string, BannerAssetView>;
  design: BannerDesign;
  editingTextLayerId: string | null;
  editingTextRef: RefObject<HTMLDivElement | null>;
  geometry: ReturnType<typeof calculateBannerGeometry>;
  layer: BannerLayer;
  onDeleteLayer: (id: string) => void;
  onLayerKeyDown: (event: KeyboardEvent<HTMLButtonElement>, layer: BannerLayer) => void;
  onLayerPointerDown: (event: PointerEvent<HTMLButtonElement>, layer: BannerLayer) => void;
  onMoveLayer: (id: string, direction: "down" | "up") => void;
  onMoveToBack: (id: string) => void;
  onMoveToFront: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedLayerId: string | null;
  setEditingTextLayerId: (id: string | null) => void;
  updateLayer: (id: string, updater: (layer: BannerLayer) => BannerLayer) => void;
}) {
  const imageUrl = layer.type === "image" ? assetUrls[layer.assetId]?.url : null;
  const layerStyle: CSSProperties = getBannerLayerLayout(layer);
  const isEditingText = layer.type === "text" && editingTextLayerId === layer.id;
  const textStyle: CSSProperties = layer.type === "text"
    ? { ...getBannerTextPaint(layer, geometry), boxSizing: "border-box", fontSize: `${layer.fontSize * geometry.scale}px`, padding: `${geometry.textInset}px` }
    : {};

  if (isEditingText && layer.type === "text") {
    return (
      <div
        aria-label="Edit teks banner"
        aria-multiline="true"
        autoFocus
        className="absolute z-20 flex min-w-0 items-center overflow-hidden border border-white bg-transparent leading-[1.05] outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        contentEditable
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
      moveAvailability={{ back: layerIndex > 0, down: layerIndex > 0, front: layerIndex < design.layers.length - 1, up: layerIndex < design.layers.length - 1 }}
      onDelete={() => onDeleteLayer(layer.id)}
      onMoveBack={() => onMoveToBack(layer.id)}
      onMoveDown={() => onMoveLayer(layer.id, "down")}
      onMoveFront={() => onMoveToFront(layer.id)}
      onMoveUp={() => onMoveLayer(layer.id, "up")}
      trigger={
        <button
          aria-label={`Pilih ${layerLabel(layer)}${layer.type === "text" ? ". Klik dua kali atau tekan Enter untuk edit teks." : ""}`}
          aria-pressed={selectedLayerId === layer.id}
          className={cn("absolute z-10 flex min-w-0 cursor-grab items-center overflow-hidden rounded-none border border-transparent text-left outline-none transition-shadow active:cursor-grabbing", selectedLayerId === layer.id ? "border-white" : "focus-visible:ring-2 focus-visible:ring-white/90", layer.type === "text" ? "break-words" : "justify-center")}
          onClick={(event) => { event.stopPropagation(); onSelect(layer.id); }}
          onContextMenu={() => onSelect(layer.id)}
          onDoubleClick={() => { if (layer.type === "text") setEditingTextLayerId(layer.id); }}
          onKeyDown={(event) => onLayerKeyDown(event, layer)}
          onPointerDown={(event) => onLayerPointerDown(event, layer)}
          style={{ ...layerStyle, boxSizing: "border-box" }}
          type="button"
        >
          {layer.type === "image" ? imageUrl ? <Image alt={layer.alt || "Gambar banner"} className="object-contain" fill sizes="100vw" src={imageUrl} style={getBannerImagePaint("layer")} unoptimized /> : <span className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/60 bg-black/15 text-white/80"><ImageOff aria-hidden="true" className="size-5" /><span className="text-ui-xs font-semibold">Gambar tidak tersedia</span></span> : <span className="block w-full whitespace-pre-wrap leading-[1.05]" style={textStyle}>{layer.text}</span>}
        </button>
      }
    />
  );
}
