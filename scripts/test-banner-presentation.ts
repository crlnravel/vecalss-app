import assert from "node:assert/strict";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { createDefaultBannerDesign, parseBannerDesign } from "../lib/admin/banner-maker";
import {
  calculateBannerGeometry,
  getBannerImagePaint,
  getBannerAccessibleText,
  getBannerImageSlots,
  getBannerLayerLayout,
  getBannerPresentationGenerationFingerprint,
  hasAllBannerImages,
  getBannerTextPaint,
  shouldUseBannerFallback,
  type BannerPresentationAssetMap,
  type BannerPresentationDesign,
} from "../lib/banner/renderer";
import { bannerImageEndpoint, bannerLayerSlot, buildBannerPresentationAssetMap } from "../lib/banner/presentation-assets";
import { BannerPresentation } from "../modules/student/components/banner-presentation";

const revision = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

const presentationDesign = parseBannerDesign({
  ...createDefaultBannerDesign(),
  background: { assetId, type: "image" },
  frame: { height: 600, padding: 48, radius: 28, snapToPadding: false, width: 1600 },
  layers: [
    {
      align: "left",
      color: "#FFFFFF",
      fontSize: 12,
      height: 24,
      id: "headline",
      opacity: 1,
      rotation: 0,
      text: "Halo, {firstName}",
      type: "text",
      weight: "bold",
      width: 70,
      x: 8,
      y: 24,
    },
    {
      alt: "Peta perjalanan {target}",
      assetId,
      height: 38,
      id: "journey-image",
      opacity: 1,
      rotation: 0,
      type: "image",
      width: 24,
      x: 68,
      y: 26,
    },
  ],
}) as BannerPresentationDesign;

const assetMap: BannerPresentationAssetMap = {
  [assetId]: {
    alt: "Peta perjalanan",
    src: `/api/student-banners/beranda/${revision}/background`,
  },
};

/** A tiny DOM host keeps the mounted-event test browser-free and deterministic. */
type TestEventListener = (event: TestEvent) => void;
type TestNodeType = 1 | 3 | 9;

class TestEvent {
  readonly bubbles: boolean;
  readonly cancelable = true;
  readonly composed = true;
  readonly isTrusted = true;
  readonly timeStamp = Date.now();
  readonly type: string;
  cancelBubble = false;
  defaultPrevented = false;
  eventPhase = 2;
  target: TestNode | null = null;
  currentTarget: TestNode | null = null;
  returnValue = true;

  constructor(type: string, { bubbles = false } = {}) {
    this.bubbles = bubbles;
    this.type = type;
  }

  stopPropagation(): void {
    this.cancelBubble = true;
  }

  stopImmediatePropagation(): void {
    this.cancelBubble = true;
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }

  composedPath(): TestNode[] {
    return this.target ? [this.target] : [];
  }
}

class TestNode {
  readonly childNodes: TestNode[] = [];
  readonly nodeType: TestNodeType = 1;
  parentNode: TestNode | null = null;
  ownerDocument: TestDocument | null;

  constructor(ownerDocument: TestDocument | null) {
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null;
  }

  appendChild<T extends TestNode>(node: T): T {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore<T extends TestNode>(node: T, before: TestNode | null): T {
    if (!before) return this.appendChild(node);
    if (node === before) return node;
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = this.childNodes.indexOf(before);
    if (index < 0) return this.appendChild(node);
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild<T extends TestNode>(node: T): T {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  contains(node: TestNode | null): boolean {
    if (node === this) return true;
    return this.childNodes.some((child) => child.contains(node));
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes.length = 0;
    if (value && this.ownerDocument) this.appendChild(this.ownerDocument.createTextNode(value));
  }
}

class TestTextNode extends TestNode {
  readonly nodeType = 3;
  value: string;

  constructor(ownerDocument: TestDocument, value: string) {
    super(ownerDocument);
    this.value = value;
  }

  get textContent(): string {
    return this.value;
  }

  set textContent(value: string) {
    this.value = value;
  }
}

class TestElement extends TestNode {
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<TestEventListener>>();
  readonly nodeName: string;
  readonly style: Record<string, unknown> & {
    removeProperty?: (name: string) => void;
    setProperty?: (name: string, value: string) => void;
  };
  namespaceURI = "http://www.w3.org/1999/xhtml";
  clientWidth = 320;

  constructor(ownerDocument: TestDocument, tagName: string) {
    super(ownerDocument);
    this.nodeName = tagName.toUpperCase();
    this.style = {
      removeProperty: (name) => { delete this.style[name]; },
      setProperty: (name, value) => { this.style[name] = value; },
    };
    Object.defineProperty(this, "src", {
      configurable: true,
      get: () => this.attributes.get("src") ?? "",
      set: (value: string) => this.attributes.set("src", String(value)),
    });
  }

  get tagName(): string {
    return this.nodeName;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestEvent): boolean {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && !event.cancelBubble && this.parentNode instanceof TestElement) this.parentNode.dispatchEvent(event);
    return true;
  }
}

class TestDocument extends TestNode {
  readonly nodeType: TestNodeType = 9;
  readonly documentElement: TestElement;
  readonly listeners = new Map<string, Set<TestEventListener>>();
  body: TestElement;
  activeElement: TestElement;
  defaultView: Record<string, unknown>;

  constructor() {
    super(null);
    this.ownerDocument = this;
    this.documentElement = new TestElement(this, "html");
    this.body = new TestElement(this, "body");
    this.activeElement = this.body;
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.defaultView = {
      document: this,
      HTMLIFrameElement: TestElement,
      HTMLElement: TestElement,
      Node: TestNode,
    };
  }

  createElement(tagName: string): TestElement {
    return new TestElement(this, tagName);
  }

  createElementNS(namespace: string, tagName: string): TestElement {
    const element = this.createElement(tagName);
    element.namespaceURI = namespace;
    return element;
  }

  createTextNode(value: string): TestTextNode {
    return new TestTextNode(this, value);
  }

  addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestEvent): boolean {
    event.target ??= this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

function findElements(root: TestNode, tagName: string): TestElement[] {
  return root.childNodes.flatMap((node) => [
    ...(node instanceof TestElement && node.tagName === tagName.toUpperCase() ? [node] : []),
    ...findElements(node, tagName),
  ]);
}

type GlobalShimKey =
  | "document"
  | "Element"
  | "Event"
  | "HTMLElement"
  | "HTMLIFrameElement"
  | "IS_REACT_ACT_ENVIRONMENT"
  | "Node"
  | "ResizeObserver"
  | "window";

const globalShimKeys: readonly GlobalShimKey[] = [
  "document",
  "Element",
  "Event",
  "HTMLElement",
  "HTMLIFrameElement",
  "IS_REACT_ACT_ENVIRONMENT",
  "Node",
  "ResizeObserver",
  "window",
];

async function withMountedDomTest(
  callback: (rootElement: TestElement, render: (node: ReactNode) => Promise<void>) => Promise<void>,
) {
  const previousGlobalDescriptors = new Map<GlobalShimKey, PropertyDescriptor | undefined>();
  for (const key of globalShimKeys) {
    previousGlobalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  }
  const document = new TestDocument();
  const rootElement = document.createElement("div");
  document.body.appendChild(rootElement);
  class ResizeObserverStub {
    observe() {}
    disconnect() {}
  }
  let root: ReturnType<typeof createRoot> | null = null;
  try {
    Object.assign(globalThis, {
      document,
      Element: TestElement,
      Event: TestEvent,
      HTMLElement: TestElement,
      HTMLIFrameElement: TestElement,
      IS_REACT_ACT_ENVIRONMENT: true,
      Node: TestNode,
      ResizeObserver: ResizeObserverStub,
      window: document.defaultView,
    });
    const mountedRoot = createRoot(rootElement as unknown as Element);
    root = mountedRoot;
    await callback(rootElement, async (node) => {
      await act(async () => {
        mountedRoot.render(node);
      });
    });
  } finally {
    try {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
    } finally {
      for (const key of globalShimKeys) {
        const previousDescriptor = previousGlobalDescriptors.get(key);
        if (previousDescriptor) Object.defineProperty(globalThis, key, previousDescriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}

for (const width of [320, 360, 390]) {
  const geometry = calculateBannerGeometry(
    { height: 600, padding: 48, radius: 28, width: 1600 },
    width,
  );
  assert.equal(geometry.width, width);
  assert.ok(Math.abs(geometry.height - width * 0.375) < 1e-9);
  assert.ok(Math.abs(geometry.padding - width * 48 / 1600) < 1e-9);
  assert.ok(Math.abs(geometry.textInset - width / 200) < 1e-9);
  assert.ok(Math.abs(geometry.radius - width * 28 / 1600) < 1e-9);
}

const tallGeometry = calculateBannerGeometry(
  { height: 1200, padding: 96, radius: 80, width: 1600 },
  320,
);
const shortGeometry = calculateBannerGeometry(
  { height: 160, padding: 8, radius: 4, width: 1600 },
  390,
);
assert.equal(tallGeometry.height, 240);
assert.equal(shortGeometry.height, 39);
assert.equal(getBannerImageSlots(presentationDesign).length, 2);
assert.equal(getBannerImageSlots(presentationDesign)[1]?.slot, bannerLayerSlot("journey-image"));
assert.equal(hasAllBannerImages(presentationDesign, assetMap), true);
assert.equal(shouldUseBannerFallback({ assetMap: {}, design: presentationDesign, failedImage: false }), true);
assert.equal(shouldUseBannerFallback({ assetMap, design: presentationDesign, failedImage: true }), true);

const accessibleText = getBannerAccessibleText(presentationDesign, {
  firstName: "Alya",
  target: "Kedokteran UI",
});
assert.match(accessibleText, /Alya/u);
assert.match(accessibleText, /Kedokteran UI/u);

assert.equal(
  bannerImageEndpoint({ destination: "beranda", revision, slot: "background", source: "published" }),
  `/api/student-banners/beranda/${revision}/background`,
);
assert.equal(
  bannerImageEndpoint({ destination: "beranda", revision, slot: "journey-image", source: "draft" }),
  `/api/admin/student-banners/beranda/draft/${revision}/journey-image`,
);
assert.equal(
  bannerImageEndpoint({ destination: "beranda", revision, slot: bannerLayerSlot("journey-image"), source: "draft" }),
  `/api/admin/student-banners/beranda/draft/${revision}/layer%3Ajourney-image`,
);
const derivedAssetMap = buildBannerPresentationAssetMap({
  design: presentationDesign,
  destination: "beranda",
  revision,
});
assert.equal(derivedAssetMap[assetId]?.src, `/api/student-banners/beranda/${revision}/background`);
assert.doesNotMatch(Object.values(derivedAssetMap).map(({ src }) => src).join("\n"), /api\/media\/admin/u);

const escapedMarkup = renderToStaticMarkup(createElement(BannerPresentation, {
  assets: assetMap,
  design: presentationDesign,
  destination: "beranda",
  revision,
  variables: { firstName: "<Alya>", target: "Kedokteran UI" },
}));
assert.doesNotMatch(escapedMarkup, /<Alya>/u);
assert.match(escapedMarkup, /&lt;Alya&gt;/u);
assert.match(escapedMarkup, /role="img"/u);
assert.match(escapedMarkup, /font-size:12px/u);
assert.match(escapedMarkup, /white-space:pre-wrap/u);
assert.match(escapedMarkup, /word-break:break-word/u);
assert.ok(Math.abs(12 * calculateBannerGeometry(presentationDesign.frame, 320).scale - 2.4) < 1e-9);
const textPaint = getBannerTextPaint(presentationDesign.layers[0] as Extract<BannerPresentationDesign["layers"][number], { type: "text" }>, calculateBannerGeometry(presentationDesign.frame, 320));
assert.ok(Math.abs(textPaint.fontSize - 2.4) < 1e-9);
assert.ok(Math.abs(textPaint.padding - 1.6) < 1e-9);
assert.equal(textPaint.fontFamily, "var(--font-heading), Plus Jakarta Sans, sans-serif");
assert.equal(textPaint.fontWeight, 700);
assert.equal(textPaint.lineHeight, 1.05);
assert.equal(textPaint.boxSizing, "border-box");
assert.equal(textPaint.whiteSpace, "pre-wrap");
assert.equal(textPaint.wordBreak, "break-word");
assert.deepEqual(getBannerImagePaint("background"), { objectFit: "cover", objectPosition: "center" });
assert.deepEqual(getBannerImagePaint("layer"), { objectFit: "contain", objectPosition: "center" });
assert.equal(getBannerLayerLayout(presentationDesign.layers[1] as Extract<BannerPresentationDesign["layers"][number], { type: "image" }>).left, "68%");
const generationA = getBannerPresentationGenerationFingerprint({ assets: assetMap, design: presentationDesign, destination: "beranda", revision });
const generationB = getBannerPresentationGenerationFingerprint({ assets: { ...assetMap, [assetId]: { ...assetMap[assetId], src: "/changed" } }, design: presentationDesign, destination: "beranda", revision });
assert.notEqual(generationA, generationB);

const fallbackMarkup = renderToStaticMarkup(createElement(BannerPresentation, {
  assets: {},
  design: presentationDesign,
  destination: "beranda",
  variables: { firstName: "Alya", target: "Kedokteran UI" },
}));
assert.match(fallbackMarkup, /Lanjutkan rute belajarmu/u);
assert.doesNotMatch(fallbackMarkup, /api\/student-banners/u);

await withMountedDomTest(async (rootElement, render) => {
  const oldAssets = { ...assetMap, [assetId]: { src: "/banner-old.png", alt: "Peta" } };
  const changedDesign = {
    ...presentationDesign,
    layers: presentationDesign.layers.map((layer) => layer.type === "text"
      ? { ...layer, text: `${layer.text} berubah` }
      : layer),
  };
  await render(createElement(BannerPresentation, {
    assets: oldAssets,
    design: presentationDesign,
    destination: "beranda",
    revision,
    variables: { firstName: "Alya", target: "Kedokteran UI" },
  }));
  const oldImage = findElements(rootElement, "img")[0];
  assert.ok(oldImage, "mounted banner must contain a real image element");

  const nextAssets = { ...oldAssets, [assetId]: { src: "/banner-new.png", alt: "Peta" } };
  await render(createElement(BannerPresentation, {
    assets: nextAssets,
    design: changedDesign,
    destination: "beranda",
    revision,
    variables: { firstName: "Alya", target: "Kedokteran UI" },
  }));
  await act(async () => {
    oldImage?.dispatchEvent(new TestEvent("error", { bubbles: true }));
  });
  assert.equal(findElements(rootElement, "h2").length, 0, "stale old-generation error must not force fallback");

  const currentImage = findElements(rootElement, "img")[0];
  assert.ok(currentImage, "new generation must remain mounted");
  assert.equal(currentImage?.getAttribute("src"), "/banner-new.png");
  assert.ok(currentImage && (currentImage.listeners.get("error")?.size ?? 0) > 0, "mounted image must have a real error listener");
  await act(async () => {
    currentImage?.dispatchEvent(new TestEvent("error", { bubbles: true }));
  });
  assert.equal(findElements(rootElement, "img").length, 0, "current image failure must switch the whole banner to fallback");

  await render(createElement(BannerPresentation, {
    assets: nextAssets,
    design: changedDesign,
    destination: "beranda",
    revision: "22222222-2222-4222-8222-222222222222",
    variables: { firstName: "Alya", target: "Kedokteran UI" },
  }));
  assert.ok(findElements(rootElement, "img").length > 0, "revision change must reset fallback state");
});

console.log("banner presentation contract checks passed");
