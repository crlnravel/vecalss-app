import { randomUUID } from "node:crypto";

import {
  collectBannerAssetIds,
  parseBannerDesign,
  type BannerDesign,
} from "@/lib/admin/banner-maker";

const BANNER_STORAGE_VERSION = 2 as const;

type BannerDesignEnvelope = {
  design: BannerDesign | null;
  revision: string;
  storageVersion: typeof BANNER_STORAGE_VERSION;
};

class BannerEnvelopeParseError extends Error {
  constructor(message = "Envelope desain banner tidak valid.") {
    super(message);
    this.name = "BannerEnvelopeParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}

function parseBannerDesignEnvelope(
  value: unknown,
  { allowNullDesign = false }: { allowNullDesign?: boolean } = {},
): BannerDesignEnvelope {
  if (!isRecord(value)) {
    throw new BannerEnvelopeParseError("Envelope desain banner harus berupa objek.");
  }

  const keys = Object.keys(value).sort();
  if (keys.length !== 3 || keys.join(",") !== "design,revision,storageVersion") {
    throw new BannerEnvelopeParseError("Envelope desain banner memiliki bidang yang tidak didukung.");
  }
  if (value.storageVersion !== BANNER_STORAGE_VERSION) {
    throw new BannerEnvelopeParseError("Versi penyimpanan desain banner tidak didukung.");
  }
  if (!isUuid(value.revision)) {
    throw new BannerEnvelopeParseError("Revisi desain banner harus berupa UUID.");
  }

  if (value.design === null) {
    if (!allowNullDesign) {
      throw new BannerEnvelopeParseError("Draf desain banner tidak boleh kosong.");
    }

    return {
      design: null,
      revision: value.revision,
      storageVersion: BANNER_STORAGE_VERSION,
    };
  }

  try {
    return {
      design: parseBannerDesign(value.design),
      revision: value.revision,
      storageVersion: BANNER_STORAGE_VERSION,
    };
  } catch {
    throw new BannerEnvelopeParseError("Desain di dalam envelope banner tidak valid.");
  }
}

function createBannerDesignEnvelope(
  design: BannerDesign | null,
  { revision = randomUUID() }: { revision?: string } = {},
): BannerDesignEnvelope {
  if (!isUuid(revision)) {
    throw new BannerEnvelopeParseError("Revisi desain banner harus berupa UUID.");
  }

  if (design === null) {
    return { design: null, revision, storageVersion: BANNER_STORAGE_VERSION };
  }

  return {
    design: parseBannerDesign(design),
    revision,
    storageVersion: BANNER_STORAGE_VERSION,
  };
}

function collectBannerEnvelopeAssetIds(envelope: BannerDesignEnvelope) {
  return envelope.design ? collectBannerAssetIds(envelope.design) : [];
}

export {
  BANNER_STORAGE_VERSION,
  BannerEnvelopeParseError,
  collectBannerEnvelopeAssetIds,
  createBannerDesignEnvelope,
  isUuid,
  parseBannerDesignEnvelope,
};
export type { BannerDesignEnvelope };
