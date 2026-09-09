import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

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
  readonly nodeType = 9;
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

function findElements(root: TestNode, tagName: string): TestElement[] {
  const matches: TestElement[] = [];
  const normalizedTagName = tagName.toUpperCase();
  const visit = (node: TestNode) => {
    if (node instanceof TestElement && node.nodeName === normalizedTagName) matches.push(node);
    for (const child of node.childNodes) visit(child);
  };
  visit(root);
  return matches;
}

async function withReactDomTest(callback: (rootElement: TestElement, render: (node: ReactNode) => Promise<void>) => Promise<void>) {
  const previousGlobalDescriptors = new Map<GlobalShimKey, PropertyDescriptor | undefined>();
  for (const key of globalShimKeys) previousGlobalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
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

export { TestElement, TestEvent, findElements, withReactDomTest };
