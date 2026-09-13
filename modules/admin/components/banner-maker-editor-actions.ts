"use client";

import type { DragEvent, Dispatch, SetStateAction } from "react";

import {
  BANNER_MAX_ALT_LENGTH,
  type BannerAssetView,
  type BannerBackground,
  type BannerDesign,
  type BannerImageLayer,
  type BannerLayer,
  type BannerTextLayer,
} from "@/lib/admin/banner-maker";
import type { MediaAssetDto } from "@/lib/media/types";

type BannerMakerEditorPickerMode = "background" | "image";
type BannerDesignSetter = Dispatch<SetStateAction<BannerDesign>>;
type BannerAssetUrlsSetter = Dispatch<SetStateAction<Record<string, BannerAssetView>>>;
type BannerPickerModeSetter = Dispatch<SetStateAction<BannerMakerEditorPickerMode | null>>;
type BannerLayerIdSetter = Dispatch<SetStateAction<string | null>>;

type BannerMakerEditorActions = {
  addImageLayer: (asset: BannerAssetView) => void;
  addTextLayer: () => void;
  changeBackground: (background: BannerBackground) => void;
  changeDesign: BannerDesignSetter;
  changeFrame: (frame: BannerDesign["frame"]) => void;
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

function clampClient(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createLayerId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}`;
}

function assetPreviewUrl(asset: MediaAssetDto) {
  return asset.thumbnailUrl ?? asset.previewUrl ?? `/api/media/admin/assets/${asset.id}/thumbnail`;
}

function createBannerMakerEditorActions({
  canAddLayer,
  design,
  pickerMode,
  selectedLayerId,
  setAssetUrls,
  setDesign,
  setPickerMode,
  setSelectedLayerId,
}: {
  canAddLayer: boolean;
  design: BannerDesign;
  pickerMode: BannerMakerEditorPickerMode | null;
  selectedLayerId: string | null;
  setAssetUrls: BannerAssetUrlsSetter;
  setDesign: BannerDesignSetter;
  setPickerMode: BannerPickerModeSetter;
  setSelectedLayerId: BannerLayerIdSetter;
}): Omit<BannerMakerEditorActions, "changeBackground" | "changeFrame" | "changeDesign" | "closePicker" | "openBackgroundPicker" | "openImagePicker" | "selectLayer" | "toggleGuides" | "toggleLeftSidebar"> {
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

export { clampClient, createBannerMakerEditorActions };
export type { BannerDesignSetter, BannerMakerEditorActions, BannerMakerEditorPickerMode };
