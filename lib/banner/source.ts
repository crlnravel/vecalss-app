import "server-only";

import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import type { BannerSourceDescriptor, BannerSourceKind, BannerSourceColumn } from "@/lib/admin/banner-maker";

type BannerSourceRow = {
  configKey: string;
  configValue: Prisma.JsonValue;
  draftUpdatedAt: Date | null;
  draftUpdatedByUserId: string | null;
  draftValue: Prisma.JsonValue | null;
  id: string;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  updatedAt: Date;
  updatedByUserId: string | null;
};

function stableSerialize(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }

  if (value === undefined) return "null";
  return JSON.stringify(value);
}

function bannerSourceDigest(row: BannerSourceRow | null) {
  return createHash("sha256")
    .update(stableSerialize({
      configKey: row?.configKey ?? null,
      configValue: row?.configValue ?? null,
      draftUpdatedAt: row?.draftUpdatedAt ?? null,
      draftUpdatedByUserId: row?.draftUpdatedByUserId ?? null,
      draftValue: row?.draftValue ?? null,
      id: row?.id ?? null,
      publishedAt: row?.publishedAt ?? null,
      publishedByUserId: row?.publishedByUserId ?? null,
      updatedAt: row?.updatedAt ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    }))
    .digest("hex");
}

function createBannerSourceDescriptor(
  row: BannerSourceRow | null,
  kind: BannerSourceKind,
  sourceColumn: BannerSourceColumn,
): BannerSourceDescriptor {
  return {
    configKey: row?.configKey ?? (kind === "legacy-artwork" ? "student.banner-maker.v1" : "student.banners"),
    digest: bannerSourceDigest(row),
    kind,
    rowId: row?.id ?? null,
    sourceColumn,
  };
}

function bannerSourceDescriptorsEqual(
  row: BannerSourceRow | null,
  descriptor: BannerSourceDescriptor,
) {
  return (row?.id ?? null) === descriptor.rowId
    && (row?.configKey ?? descriptor.configKey) === descriptor.configKey
    && bannerSourceDigest(row) === descriptor.digest;
}

export {
  bannerSourceDescriptorsEqual,
  bannerSourceDigest,
  createBannerSourceDescriptor,
};
export type { BannerSourceRow };
