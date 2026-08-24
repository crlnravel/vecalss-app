type DecimalPointValue = bigint | number | string | { toString(): string } | null | undefined;

type PackageLifecycleItem = {
  pointValue: DecimalPointValue;
  sortOrder: number;
  sourceContentDigest?: string | null;
  sourceQuestionId: string;
  sourceQuestionRevisionId?: string | null;
};

type PackageLifecycleVersion = {
  id: string;
  items: readonly PackageLifecycleItem[];
  versionNo: number;
};

type PackageLifecycleSummary = {
  active: {
    itemCount: number;
    totalPoints: number;
    versionId: string;
    versionNo: number;
  } | null;
  availability: "draft" | "ready";
  draft: {
    itemCount: number;
    totalPoints: number;
  };
  hasDraftChanges: boolean;
  usageCount: number;
};

type TryoutPackageUsageBinding = {
  packageId: string;
  tryoutId: string;
};

function decimalText(value: DecimalPointValue) {
  if (value === null || value === undefined) return "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Point value must be finite.");
    return String(value);
  }
  return value.toString().trim() || "0";
}

function normalizedDecimalPoint(value: DecimalPointValue) {
  const raw = decimalText(value);
  const match = raw.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new TypeError(`Invalid decimal point value: ${raw}`);

  const sign = match[1] === "-" ? "-" : "";
  const integerPart = match[2] ?? "0";
  const fractionPart = match[3] ?? match[4] ?? "";
  const exponent = Number(match[5] ?? 0);
  const digits = `${integerPart}${fractionPart}` || "0";
  const decimalIndex = integerPart.length + exponent;

  let integerDigits: string;
  let fractionDigits: string;
  if (decimalIndex <= 0) {
    integerDigits = "0";
    fractionDigits = `${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  } else if (decimalIndex >= digits.length) {
    integerDigits = `${digits}${"0".repeat(decimalIndex - digits.length)}`;
    fractionDigits = "";
  } else {
    integerDigits = digits.slice(0, decimalIndex);
    fractionDigits = digits.slice(decimalIndex);
  }

  integerDigits = integerDigits.replace(/^0+(?=\d)/, "") || "0";
  fractionDigits = fractionDigits.replace(/0+$/, "");
  if (integerDigits === "0" && !fractionDigits) return "0";
  return `${sign}${integerDigits}${fractionDigits ? `.${fractionDigits}` : ""}`;
}

function decimalToNumber(value: string) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new TypeError(`Decimal point value is outside the supported number range: ${value}`);
  return result;
}

function addDecimalPoints(left: string, right: string) {
  const leftMatch = left.match(/^(-?)(\d+)(?:\.(\d+))?$/)!;
  const rightMatch = right.match(/^(-?)(\d+)(?:\.(\d+))?$/)!;
  const scale = Math.max(leftMatch[3]?.length ?? 0, rightMatch[3]?.length ?? 0);
  const scaleLeft = BigInt(`${leftMatch[2]}${(leftMatch[3] ?? "").padEnd(scale, "0")}`) * BigInt(leftMatch[1] ? -1 : 1);
  const scaleRight = BigInt(`${rightMatch[2]}${(rightMatch[3] ?? "").padEnd(scale, "0")}`) * BigInt(rightMatch[1] ? -1 : 1);
  const total = scaleLeft + scaleRight;
  const sign = total < BigInt(0) ? "-" : "";
  const digits = (total < BigInt(0) ? -total : total).toString().padStart(scale + 1, "0");
  const integerPart = scale ? digits.slice(0, -scale) : digits;
  const fractionPart = scale ? digits.slice(-scale) : "";
  return normalizedDecimalPoint(`${sign}${integerPart}${fractionPart ? `.${fractionPart}` : ""}`);
}

function sumPointValues(items: readonly PackageLifecycleItem[]) {
  const total = items.reduce((sum, item) => addDecimalPoints(sum, normalizedDecimalPoint(item.pointValue)), "0");
  return decimalToNumber(total);
}

function packageItemSignature(item: PackageLifecycleItem) {
  return JSON.stringify([
    item.sourceQuestionId,
    item.sourceQuestionRevisionId ?? null,
    item.sourceContentDigest ?? null,
    item.sortOrder,
    normalizedDecimalPoint(item.pointValue),
  ]);
}

function orderedPackageItemSignatures(items: readonly PackageLifecycleItem[]) {
  return items.map(packageItemSignature);
}

function packageItemsMatch(left: readonly PackageLifecycleItem[], right: readonly PackageLifecycleItem[]) {
  const leftSignatures = orderedPackageItemSignatures(left);
  const rightSignatures = orderedPackageItemSignatures(right);
  return leftSignatures.length === rightSignatures.length && leftSignatures.every((signature, index) => signature === rightSignatures[index]);
}

function distinctTryoutUsageCounts(bindings: readonly TryoutPackageUsageBinding[]) {
  const tryoutIdsByPackage = new Map<string, Set<string>>();
  for (const binding of bindings) {
    if (!binding.packageId || !binding.tryoutId) continue;
    const tryoutIds = tryoutIdsByPackage.get(binding.packageId) ?? new Set<string>();
    tryoutIds.add(binding.tryoutId);
    tryoutIdsByPackage.set(binding.packageId, tryoutIds);
  }
  return new Map([...tryoutIdsByPackage].map(([packageId, tryoutIds]) => [packageId, tryoutIds.size]));
}

function countDistinctTryoutUsage(bindings: readonly TryoutPackageUsageBinding[], packageId: string) {
  return distinctTryoutUsageCounts(bindings).get(packageId) ?? 0;
}

function summarizePackageLifecycle(input: {
  draftItems: readonly PackageLifecycleItem[];
  latestPublishedVersion?: PackageLifecycleVersion | null;
  usageCount?: number;
}): PackageLifecycleSummary {
  const activeVersion = input.latestPublishedVersion ?? null;
  const draft = {
    itemCount: input.draftItems.length,
    totalPoints: sumPointValues(input.draftItems),
  };
  const active = activeVersion
    ? {
        itemCount: activeVersion.items.length,
        totalPoints: sumPointValues(activeVersion.items),
        versionId: activeVersion.id,
        versionNo: activeVersion.versionNo,
      }
    : null;

  return {
    active,
    availability: active ? "ready" : "draft",
    draft,
    hasDraftChanges: Boolean(activeVersion && !packageItemsMatch(input.draftItems, activeVersion.items)),
    usageCount: Math.max(0, input.usageCount ?? 0),
  };
}

export {
  countDistinctTryoutUsage,
  distinctTryoutUsageCounts,
  normalizedDecimalPoint,
  orderedPackageItemSignatures,
  packageItemSignature,
  packageItemsMatch,
  summarizePackageLifecycle,
};
export type { DecimalPointValue, PackageLifecycleItem, PackageLifecycleSummary, PackageLifecycleVersion, TryoutPackageUsageBinding };
