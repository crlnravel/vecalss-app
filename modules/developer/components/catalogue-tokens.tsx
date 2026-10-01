"use client";

import { useEffect, useRef, useState } from "react";

import {
  REFERENCE_SHADOW_CLASS_NAMES,
  REFERENCE_SURFACE_CLASS_NAMES,
} from "@/components/dashboard/reference-dashboard-tokens";

import {
  COLOR_TOKEN_GROUPS,
  RADIUS_PROBES,
  SEMANTIC_COLOR_TOKEN_NAMES,
  SPACING_PROBES,
  TYPOGRAPHY_PROBES,
} from "./primitive-inventory";

type ColorGroup = {
  id: string;
  label: string;
  tokens: string[];
};

type ComputedProbe = {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  letterSpacing?: string;
  lineHeight?: string;
  padding?: string;
  radius?: string;
  shadow?: string;
};

const SHADOW_PROBES = [
  {
    id: "inset-surface",
    label: "Permukaan cekung",
    source: "REFERENCE_SURFACE_CLASS_NAMES.inset",
    className: REFERENCE_SURFACE_CLASS_NAMES.inset,
  },
  {
    id: "raised-surface",
    label: "Permukaan terangkat",
    source: "REFERENCE_SURFACE_CLASS_NAMES.raised",
    className: REFERENCE_SURFACE_CLASS_NAMES.raised,
  },
  {
    id: "tactile",
    label: "Bayangan taktil",
    source: "REFERENCE_SHADOW_CLASS_NAMES.tactile",
    className: REFERENCE_SHADOW_CLASS_NAMES.tactile,
  },
  {
    id: "tactile-active",
    label: "Bayangan taktil aktif",
    source: "REFERENCE_SHADOW_CLASS_NAMES.tactileActive",
    className: REFERENCE_SHADOW_CLASS_NAMES.tactileActive,
  },
] as const;

function isPaletteVariable(name: string) {
  return COLOR_TOKEN_GROUPS.some((group) => group.prefixes.some((prefix) => name.startsWith(prefix)))
    || SEMANTIC_COLOR_TOKEN_NAMES.includes(name as (typeof SEMANTIC_COLOR_TOKEN_NAMES)[number]);
}

function addStylePropertyNames(style: CSSStyleDeclaration, names: Set<string>) {
  for (let index = 0; index < style.length; index += 1) {
    const name = style.item(index);
    if (isPaletteVariable(name)) names.add(name);
  }
}

function addRulePropertyNames(rules: CSSRuleList, names: Set<string>) {
  for (const rule of Array.from(rules)) {
    const style = (rule as CSSStyleRule).style;
    if (style) addStylePropertyNames(style, names);

    const nestedRules = (rule as CSSGroupingRule).cssRules;
    if (nestedRules) addRulePropertyNames(nestedRules, names);
  }
}

function discoverColorGroups(): ColorGroup[] {
  const names = new Set<string>();
  addStylePropertyNames(getComputedStyle(document.documentElement), names);
  addStylePropertyNames(getComputedStyle(document.body), names);

  for (const stylesheet of Array.from(document.styleSheets)) {
    try {
      addRulePropertyNames(stylesheet.cssRules, names);
    } catch {
      // A cross-origin stylesheet cannot be inspected; computed styles above still work.
    }
  }

  const sortTokens = (tokens: string[]) => tokens.sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
  const groups: ColorGroup[] = COLOR_TOKEN_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    tokens: sortTokens(
      Array.from(names).filter((name) => group.prefixes.some((prefix) => name.startsWith(prefix))),
    ),
  }));

  const semanticTokens = SEMANTIC_COLOR_TOKEN_NAMES.filter((name) => names.has(name));
  if (semanticTokens.length > 0) {
    groups.push({ id: "semantic", label: "Warna antarmuka", tokens: sortTokens(semanticTokens) });
  }

  return groups.filter((group) => group.tokens.length > 0);
}

function readColorValues(root: HTMLElement) {
  const values: Record<string, string> = {};
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-token-color]"))) {
    const token = element.dataset.tokenColor;
    if (token) values[token] = getComputedStyle(element).backgroundColor;
  }
  return values;
}

function readComputedProbes(root: HTMLElement) {
  const values: Record<string, ComputedProbe> = {};

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-token-type]"))) {
    const id = element.dataset.tokenType;
    if (!id) continue;
    const style = getComputedStyle(element);
    values[id] = {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
    };
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-token-spacing]"))) {
    const id = element.dataset.tokenSpacing;
    if (id) values[id] = { padding: getComputedStyle(element).paddingTop };
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-token-radius]"))) {
    const id = element.dataset.tokenRadius;
    if (id) values[id] = { radius: getComputedStyle(element).borderTopLeftRadius };
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-token-shadow]"))) {
    const id = element.dataset.tokenShadow;
    if (id) values[id] = { shadow: getComputedStyle(element).boxShadow };
  }

  return values;
}

function displayValue(value: string | undefined) {
  return value || "Nilai belum tersedia";
}

function TokenCatalogue() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [colorValues, setColorValues] = useState<Record<string, string>>({});
  const [computedProbes, setComputedProbes] = useState<Record<string, ComputedProbe>>({});
  const [rootFontSize, setRootFontSize] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    setColorGroups(discoverColorGroups());

    const updateComputedProbes = () => {
      setComputedProbes(readComputedProbes(root));
      setRootFontSize(getComputedStyle(document.documentElement).fontSize);
    };

    updateComputedProbes();
    window.addEventListener("resize", updateComputedProbes);
    return () => window.removeEventListener("resize", updateComputedProbes);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || colorGroups.length === 0) return;

    const updateColorValues = () => setColorValues(readColorValues(root));
    updateColorValues();
    window.addEventListener("resize", updateColorValues);
    return () => window.removeEventListener("resize", updateColorValues);
  }, [colorGroups]);

  return (
    <div className="flex min-w-0 flex-col gap-12" ref={rootRef}>
      <section aria-labelledby="catalogue-token-colors" className="min-w-0">
        <div className="mb-5 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-token-colors">Warna</h2>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
            Nilai diambil dari variabel CSS yang aktif. Angka di bawah setiap warna adalah hasil komputasi browser.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          {colorGroups.map((group) => (
            <div className="flex min-w-0 flex-col gap-3" key={group.id}>
              <h3 className="text-sm font-semibold text-secondary-900">{group.label}</h3>
              <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {group.tokens.map((token) => (
                  <div className="min-w-0" key={token}>
                    <div
                      aria-hidden="true"
                      className="mb-2 h-12 rounded-lg border border-primary-100"
                      data-token-color={token}
                      style={{ backgroundColor: `var(${token})` }}
                    />
                    <code className="block break-all text-xs font-medium text-secondary-800">{token}</code>
                    <code className="mt-1 block break-all text-xs tabular-nums text-secondary-600">
                      {colorValues[token] ?? "Mengambil nilai…"}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="catalogue-token-type" className="min-w-0">
        <div className="mb-5 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-token-type">Tipografi</h2>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
            Contoh memakai kelas antarmuka yang sudah dipakai aplikasi. Ukuran akar saat ini: {displayValue(rootFontSize)}.
          </p>
        </div>
        <div className="divide-y divide-primary-100 border-y border-primary-100">
          {TYPOGRAPHY_PROBES.map((probe) => {
            const values = computedProbes[probe.id];
            const sample = (
              <p className={probe.className} data-token-type={probe.id}>
                {probe.sample}
              </p>
            );

            return (
              <div className="grid min-w-0 gap-3 py-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)] md:items-center" key={probe.id}>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold text-secondary-600">{probe.label}</p>
                  {"wrapperClassName" in probe ? <div className={probe.wrapperClassName}>{sample}</div> : sample}
                  <code className="mt-2 block break-all text-xs text-secondary-600">{probe.className}</code>
                </div>
                <div className="min-w-0 text-xs leading-5 text-secondary-700">
                  <p className="tabular-nums">
                    <code>font-size {displayValue(values?.fontSize)}</code>
                    <span aria-hidden="true"> · </span>
                    <code>line-height {displayValue(values?.lineHeight)}</code>
                    <span aria-hidden="true"> · </span>
                    <code>weight {displayValue(values?.fontWeight)}</code>
                    <span aria-hidden="true"> · </span>
                    <code>tracking {displayValue(values?.letterSpacing)}</code>
                  </p>
                  <code className="mt-1 block break-all text-secondary-600">
                    font-family {displayValue(values?.fontFamily)}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="catalogue-token-spacing" className="min-w-0">
        <div className="mb-5 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-token-spacing">Jarak</h2>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
            Setiap contoh memakai kelas padding yang aktif. Nilainya mengikuti ukuran akar dokumen.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SPACING_PROBES.map((probe) => (
            <div className="min-w-0" key={probe.id}>
              <div className="mb-3 flex h-20 items-center justify-center rounded-xl bg-primary-50">
                <div className={`w-fit rounded-md bg-primary-200 ${probe.className}`} data-token-spacing={probe.id}>
                  <span aria-hidden="true" className="block size-3 rounded-sm bg-primary-700" />
                </div>
              </div>
              <code className="block text-xs font-medium text-secondary-800">{probe.className}</code>
              <code className="mt-1 block text-xs tabular-nums text-secondary-600">
                {displayValue(computedProbes[probe.id]?.padding)}
              </code>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="catalogue-token-radius" className="min-w-0">
        <div className="mb-5 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-token-radius">Sudut</h2>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
            Tujuh token radius dipakai untuk peran yang jelas. Nilai yang ditampilkan berasal dari hasil perhitungan browser.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
          {RADIUS_PROBES.map((probe) => (
            <div className="min-w-0" key={probe.id}>
              <div className="mb-3 flex h-20 items-center justify-center rounded-control bg-primary-50 p-3">
                <div className={`h-12 w-full border border-primary-300 bg-white ${probe.className}`} data-token-radius={probe.id} />
              </div>
              <p className="text-sm font-semibold text-secondary-900">{probe.use}</p>
              <code className="mt-1 block break-all text-xs font-medium text-secondary-800">{probe.token}</code>
              <code className="mt-1 block text-xs text-secondary-600">{probe.className}</code>
              <code className="mt-1 block text-xs tabular-nums text-secondary-600">
                {displayValue(computedProbes[probe.id]?.radius)}
              </code>
              <p className="text-xs text-secondary-600">Nilai acuan: {probe.expectedValue}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="catalogue-token-depth" className="min-w-0">
        <div className="mb-5 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-secondary-900" id="catalogue-token-depth">Bayangan</h2>
          <p className="max-w-[65ch] text-sm leading-6 text-secondary-700">
            Contoh memakai class map permukaan bersama. Nilai yang ditampilkan adalah box-shadow terhitung.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {SHADOW_PROBES.map((probe) => (
            <div className="min-w-0" key={probe.id}>
              <div className="mb-3 grid h-24 place-items-center rounded-2xl bg-primary-50 p-3">
                <div
                  className={`grid h-16 w-full place-items-center rounded-2xl bg-white p-3 text-sm font-medium text-secondary-900 ${probe.className}`}
                  data-token-shadow={probe.id}
                >
                  Contoh permukaan
                </div>
              </div>
              <p className="text-sm font-semibold text-secondary-900">{probe.label}</p>
              <code className="mt-1 block break-all text-xs text-secondary-600">{probe.source}</code>
              <code className="mt-2 block break-all text-xs leading-5 text-secondary-700">
                {displayValue(computedProbes[probe.id]?.shadow)}
              </code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { TokenCatalogue };
