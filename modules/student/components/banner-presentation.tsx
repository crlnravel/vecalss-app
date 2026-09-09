"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import type {
  StudentBannerKey,
  StudentBannerVariables,
} from "@/lib/student/banner-content";

import {
  calculateBannerGeometry,
  getBannerImagePaint,
  getBannerAccessibleText,
  getBannerLayerLayout,
  getBannerPresentationGenerationFingerprint,
  getBannerPresentationFallback,
  getBannerTextPaint,
  hasAllBannerImages,
  resolveBannerPresentationText,
  type BannerPresentationAssetMap,
  type BannerPresentationDesign,
  type BannerPresentationFallback,
} from "@/lib/banner/renderer";

type BannerPresentationProps = {
  assets: BannerPresentationAssetMap;
  className?: string;
  design: BannerPresentationDesign;
  destination: StudentBannerKey;
  fallback?: BannerPresentationFallback;
  revision?: string | null;
  variables?: StudentBannerVariables;
};

function BannerPresentation({
  assets,
  className,
  design,
  destination,
  fallback,
  revision = null,
  variables = {},
}: BannerPresentationProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [failedImageKey, setFailedImageKey] = useState<string | null>(null);
  const generation = getBannerPresentationGenerationFingerprint({
    assets,
    design,
    destination,
    revision,
  });
  const generationRef = useRef(generation);
  useLayoutEffect(() => {
    generationRef.current = generation;
  }, [generation]);
  const geometry = calculateBannerGeometry(design.frame, frameWidth || design.frame.width);
  const resolvedFallback = fallback
    ? {
        description: resolveBannerPresentationText(fallback.description, variables),
        title: resolveBannerPresentationText(fallback.title, variables),
      }
    : getBannerPresentationFallback(destination, variables);
  const imageReady = hasAllBannerImages(design, assets);
  const showFallback = failedImageKey === generation || !imageReady;
  const accessibleText = showFallback
    ? `${resolvedFallback.title} ${resolvedFallback.description}`.trim()
    : getBannerAccessibleText(design, variables) || resolvedFallback.title;

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const updateWidth = () => setFrameWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const frameStyle: CSSProperties = {
    aspectRatio: `${design.frame.width} / ${design.frame.height}`,
    borderRadius: `${geometry.radius}px`,
  };

  const handleImageError = useCallback((imageGeneration: string) => () => {
    if (generationRef.current !== imageGeneration) return;
    setFailedImageKey(imageGeneration);
  }, []);
  const bindImageError = useCallback((imageGeneration: string) => (node: HTMLImageElement | null) => {
    if (!node) return;
    const listener = handleImageError(imageGeneration);
    node.addEventListener("error", listener);
    return () => node.removeEventListener("error", listener);
  }, [handleImageError]);

  if (showFallback) {
    return (
      <div
        aria-label={accessibleText}
        className={cn("relative isolate w-full overflow-hidden bg-[var(--voyage-deep)]", className)}
        ref={frameRef}
        role="img"
        style={frameStyle}
      >
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(120deg,var(--voyage-deep),var(--voyage-forest))]" />
        <div aria-hidden="true" className="relative flex size-full flex-col justify-center gap-3 px-6 py-8 text-white sm:px-10">
          <h2 className="max-w-[30ch] font-display text-[clamp(1.25rem,4vw,2.5rem)] leading-[1.05] font-extrabold tracking-[-0.04em]">
            {resolvedFallback.title}
          </h2>
          <p className="max-w-[60ch] text-sm leading-6 font-medium text-white/80 sm:text-base sm:leading-7">
            {resolvedFallback.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={accessibleText}
      className={cn("relative isolate w-full overflow-hidden bg-[var(--voyage-deep)]", className)}
      ref={frameRef}
      role="img"
      style={frameStyle}
    >
      <div aria-hidden="true" className="absolute inset-0" style={backgroundStyle(design.background)} />
      {design.background.type === "image" ? (
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover"
          key={`${generation}:background:${assets[design.background.assetId]?.src ?? ""}`}
          onError={handleImageError(generation)}
          ref={bindImageError(generation)}
          src={assets[design.background.assetId]?.src ?? ""}
          style={getBannerImagePaint("background")}
        />
      ) : null}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(1,76,56,0.42),rgba(23,107,77,0.08))]" />

      {design.layers.map((layer) => {
        const layerStyle: CSSProperties = getBannerLayerLayout(layer);

        if (layer.type === "image") {
          const source = assets[layer.assetId]?.src ?? "";
          return (
            <img
              alt=""
              aria-hidden="true"
              className="absolute object-contain"
              key={`${generation}:layer:${layer.id}:${source}`}
              onError={handleImageError(generation)}
              ref={bindImageError(generation)}
              src={source}
              style={layerStyle}
            />
          );
        }

        const textPaint = getBannerTextPaint(layer, geometry);
        return (
          <span
            className="absolute overflow-hidden break-words"
            key={layer.id}
            style={{
              ...layerStyle,
              ...textPaint,
              fontSize: `${textPaint.fontSize}px`,
              padding: `${textPaint.padding}px`,
            }}
          >
            {resolveBannerPresentationText(layer.text, variables)}
          </span>
        );
      })}
    </div>
  );
}

function backgroundStyle(background: BannerPresentationDesign["background"]): CSSProperties {
  if (background.type === "color") return { backgroundColor: background.color };
  if (background.type === "gradient") {
    return { backgroundImage: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})` };
  }
  return { backgroundColor: "var(--voyage-deep)" };
}

export { BannerPresentation };
export type { BannerPresentationProps };
