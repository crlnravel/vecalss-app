import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import {
  MediaAssetState,
  MediaLibraryScope,
  RoleName,
} from "@/generated/prisma/client";
import { getReadOnlySessionContext } from "@/lib/auth/session";
import type { SessionContext } from "@/lib/auth/types";
import { getPublishedBannerMakerDestinationDesign } from "@/lib/admin/banner-maker-repository";
import type { BannerDesign } from "@/lib/admin/banner-maker";
import { isImageMimeType } from "@/lib/media/domain";
import {
  R2ConfigurationError,
  readMediaObjectStream,
} from "@/lib/media/r2";
import { prisma } from "@/lib/prisma";

import {
  getBannerDestination,
  parseBannerDestination,
  type BannerDestination,
} from "./destinations";
import { isUuid, parseBannerDesignEnvelope } from "./envelope";

const BANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const BANNER_IMAGE_TIMEOUT_MS = 5_000;
const BANNER_TRUSTED_IMAGE_HOSTS_ENV = "BANNER_TRUSTED_IMAGE_HOSTS";

const BANNER_DELIVERY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

type BannerDeliverySource = "draft" | "published";

type BannerDeliveryAsset = {
  mimeType: string;
  objectKey: string | null;
  sizeBytes: number;
  url: string | null;
};

type BannerDeliveryObject = {
  body: ReadableStream<Uint8Array>;
  contentLength: number | null;
  contentType: string;
};

type BannerDeliverySessionResolver = () => Promise<SessionContext | null>;

type BannerDeliveryTestOverrides = {
  readAsset?: (assetId: string) => Promise<BannerDeliveryAsset | null>;
  readDraft?: (destination: BannerDestination, revision: string) => Promise<BannerDesign | null>;
  readPublished?: (destination: BannerDestination) => Promise<{
    design: BannerDesign | null;
    revision: string | null;
  }>;
  resolveSession?: BannerDeliverySessionResolver;
};

type SafeLegacyImageUrl = {
  address: string;
  url: URL;
};

let bannerDeliveryTestOverrides: BannerDeliveryTestOverrides | null = null;

class BannerDeliveryError extends Error {
  readonly status: number;

  constructor(message: string, status = 404) {
    super(message);
    this.name = "BannerDeliveryError";
    this.status = status;
  }
}

function normalizeContentType(value: string | null | undefined) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const version = isIP(normalized);

  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    const [first, second] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || (first === 198 && second === 51)
      || (first === 203 && second === 0)
      || first >= 224;
  }

  if (version === 6) {
    const compact = normalized.replace(/^\[|\]$/gu, "");
    if (compact === "::" || compact === "::1" || compact.startsWith("fe8") || compact.startsWith("fe9") || compact.startsWith("fea") || compact.startsWith("feb")) {
      return true;
    }

    if (compact.startsWith("fc") || compact.startsWith("fd") || compact.startsWith("ff")) {
      return true;
    }

    const mappedIpv4 = compact.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
    return mappedIpv4 ? isPrivateIpAddress(mappedIpv4) : false;
  }

  return true;
}

function trustedImageHosts(env: NodeJS.ProcessEnv = process.env) {
  return (env[BANNER_TRUSTED_IMAGE_HOSTS_ENV] ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/\.$/u, ""))
    .filter((host) => {
      if (!host || host.includes("*") || host.includes("/") || host.includes("@")) return false;
      if (isIP(host) !== 0) return true;
      return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/iu.test(host);
    });
}

function isTrustedImageHost(hostname: string, env: NodeJS.ProcessEnv = process.env) {
  const host = hostname.trim().toLowerCase().replace(/\.$/u, "");
  return trustedImageHosts(env).some((pattern) => host === pattern.replace(/\.$/u, ""));
}

async function assertSafeLegacyImageUrl(rawUrl: string): Promise<SafeLegacyImageUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BannerDeliveryError("Sumber gambar banner tidak valid.", 404);
  }

  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !isTrustedImageHost(parsed.hostname)
  ) {
    throw new BannerDeliveryError("Sumber gambar banner tidak diizinkan.", 404);
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(parsed.hostname, { all: true, verbatim: true });
  } catch {
    throw new BannerDeliveryError("Sumber gambar banner tidak dapat diverifikasi.", 502);
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new BannerDeliveryError("Sumber gambar banner mengarah ke jaringan privat.", 404);
  }

  return { address: addresses[0].address, url: parsed };
}

function abortAfterTimeout(controller: AbortController) {
  return setTimeout(() => controller.abort(), BANNER_IMAGE_TIMEOUT_MS);
}

function boundedStream(
  source: ReadableStream<Uint8Array>,
  controller: AbortController,
) {
  const reader = source.getReader();
  let bytesRead = 0;
  let settled = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutError = new BannerDeliveryError("Gambar banner terlalu lama dimuat.", 504);
  const removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
  const clear = () => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    removeAbortListener();
  };
  const fail = (
    target: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
    abort = true,
  ) => {
    if (settled) return;
    clear();
    if (abort && !controller.signal.aborted) controller.abort();
    void reader.cancel(error).catch(() => undefined);
    target.error(error);
  };
  const onAbort = () => {
    if (streamController) fail(streamController, timeoutError, false);
  };
  controller.signal.addEventListener("abort", onAbort, { once: true });
  timeout = setTimeout(() => {
    if (streamController) {
      fail(streamController, timeoutError);
      return;
    }
    controller.abort();
  }, BANNER_IMAGE_TIMEOUT_MS);

  return new ReadableStream<Uint8Array>({
    start(target) {
      streamController = target;
      if (controller.signal.aborted) onAbort();
    },
    async cancel(reason) {
      clear();
      await reader.cancel(reason);
    },
    async pull(target) {
      streamController = target;
      if (settled) return;
      try {
        const next = await reader.read();
        if (settled) return;
        if (next.done) {
          clear();
          target.close();
          return;
        }

        const chunk = next.value;
        bytesRead += chunk.byteLength;
        if (bytesRead > BANNER_IMAGE_MAX_BYTES) {
          fail(target, new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413));
          return;
        }

        target.enqueue(chunk);
      } catch (error) {
        if (!settled) {
          clear();
          target.error(error);
        }
      }
    },
  });
}

async function readLegacyImage(
  asset: BannerDeliveryAsset,
  expectedMimeType: string,
): Promise<BannerDeliveryObject> {
  if (!asset.url) throw new BannerDeliveryError("Gambar banner belum tersedia.", 404);
  const safeUrl = await assertSafeLegacyImageUrl(asset.url);
  const controller = new AbortController();
  const timeout = abortAfterTimeout(controller);
  let response: {
    body: ReadableStream<Uint8Array>;
    headers: Headers;
    status: number;
  };
  try {
    response = await new Promise<{
      body: ReadableStream<Uint8Array>;
      headers: Headers;
      status: number;
    }>((resolve, reject) => {
      const request = httpsRequest({
        headers: {
          Accept: "image/*",
          Host: safeUrl.url.host,
        },
        hostname: safeUrl.address,
        method: "GET",
        path: `${safeUrl.url.pathname}${safeUrl.url.search}`,
        servername: safeUrl.url.hostname,
      }, (incomingResponse) => {
        resolve({
          body: Readable.toWeb(incomingResponse) as ReadableStream<Uint8Array>,
          headers: new Headers({
            "content-length": incomingResponse.headers["content-length"]?.toString() ?? "",
            "content-type": incomingResponse.headers["content-type"]?.toString() ?? "",
            location: incomingResponse.headers.location?.toString() ?? "",
          }),
          status: incomingResponse.statusCode ?? 0,
        });
      });
      request.once("error", reject);
      controller.signal.addEventListener(
        "abort",
        () => request.destroy(new Error("banner image request timed out")),
        { once: true },
      );
      request.end();
    });
  } catch {
    throw new BannerDeliveryError("Gambar banner belum dapat dimuat.", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new BannerDeliveryError("Pengalihan gambar banner tidak diizinkan.", 502);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new BannerDeliveryError("Gambar banner belum tersedia.", response.status === 404 ? 404 : 502);
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (!isImageMimeType(contentType) || contentType !== expectedMimeType) {
    throw new BannerDeliveryError("Tipe gambar banner tidak valid.", 415);
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength > BANNER_IMAGE_MAX_BYTES)) {
    throw new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413);
  }

  return {
    body: boundedStream(response.body, controller),
    contentLength,
    contentType,
  };
}

async function readManagedImage(
  asset: BannerDeliveryAsset,
  expectedMimeType: string,
): Promise<BannerDeliveryObject> {
  if (!asset.objectKey) return readLegacyImage(asset, expectedMimeType);
  if (asset.sizeBytes > BANNER_IMAGE_MAX_BYTES) {
    throw new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413);
  }

  const controller = new AbortController();
  const requestTimeout = abortAfterTimeout(controller);
  let object: Awaited<ReturnType<typeof readMediaObjectStream>>;
  try {
    object = await readMediaObjectStream(asset.objectKey, controller.signal);
  } catch (error) {
    if (error instanceof R2ConfigurationError) {
      throw new BannerDeliveryError("Penyimpanan gambar banner belum dikonfigurasi.", 503);
    }
    throw new BannerDeliveryError("Gambar banner belum dapat dimuat.", 503);
  } finally {
    clearTimeout(requestTimeout);
  }

  if (object.contentLength !== undefined && object.contentLength > BANNER_IMAGE_MAX_BYTES) {
    controller.abort();
    throw new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413);
  }

  const contentType = normalizeContentType(object.contentType || expectedMimeType);
  if (!isImageMimeType(contentType) || contentType !== expectedMimeType) {
    controller.abort();
    throw new BannerDeliveryError("Tipe gambar banner tidak valid.", 415);
  }

  return {
    body: boundedStream(object.body, controller),
    contentLength: object.contentLength ?? null,
    contentType,
  };
}

async function readBannerAsset(assetId: string) {
  if (bannerDeliveryTestOverrides?.readAsset) {
    return bannerDeliveryTestOverrides.readAsset(assetId);
  }

  return prisma.asset.findFirst({
    select: {
      mimeType: true,
      objectKey: true,
      sizeBytes: true,
      url: true,
    },
    where: {
      id: assetId,
      libraryScope: MediaLibraryScope.admin,
      state: MediaAssetState.ready,
      trashedAt: null,
    },
  });
}

function readDesignImageReference(design: BannerDesign, slot: string) {
  if (slot === "background") {
    return design.background.type === "image" ? design.background.assetId : null;
  }

  const layer = design.layers.find((candidate) => candidate.id === slot);
  return layer?.type === "image" ? layer.assetId : null;
}

async function readPublishedDesign(destination: BannerDestination) {
  if (bannerDeliveryTestOverrides?.readPublished) {
    return bannerDeliveryTestOverrides.readPublished(destination);
  }

  return getPublishedBannerMakerDestinationDesign(destination);
}

async function readDraftDesign(destination: BannerDestination, revision: string) {
  if (bannerDeliveryTestOverrides?.readDraft) {
    return bannerDeliveryTestOverrides.readDraft(destination, revision);
  }

  const definition = getBannerDestination(destination);
  if (!definition) return null;
  const config = await prisma.systemConfig.findUnique({
    select: { draftValue: true, draftUpdatedAt: true },
    where: { configKey: definition.configKey },
  });

  if (!config?.draftValue || !config.draftUpdatedAt) return null;

  try {
    const envelope = parseBannerDesignEnvelope(config.draftValue);
    return envelope.revision === revision ? envelope.design : null;
  } catch {
    return null;
  }
}

async function readBannerDesignForDelivery({
  destination: destinationValue,
  revision,
  source,
}: {
  destination: string;
  revision: string;
  source: BannerDeliverySource;
}) {
  let destination: BannerDestination;
  try {
    destination = parseBannerDestination(destinationValue);
  } catch {
    throw new BannerDeliveryError("Tujuan banner tidak dikenali.", 404);
  }
  if (!isUuid(revision)) throw new BannerDeliveryError("Revisi banner tidak valid.", 404);

  if (source === "draft") {
    const design = await readDraftDesign(destination, revision);
    if (!design) throw new BannerDeliveryError("Draf banner tidak tersedia.", 404);
    return design;
  }

  const published = await readPublishedDesign(destination);
  if (!published.design || published.revision !== revision) {
    throw new BannerDeliveryError("Banner terbit tidak tersedia.", 404);
  }
  return published.design;
}

async function deliverBannerImage({
  destination: destinationValue,
  revision,
  slot,
  source,
}: {
  destination: string;
  revision: string;
  slot: string;
  source: BannerDeliverySource;
}) {
  let destination: BannerDestination;
  try {
    destination = parseBannerDestination(destinationValue);
  } catch {
    throw new BannerDeliveryError("Tujuan banner tidak dikenali.", 404);
  }
  if (!/^(?:background|[A-Za-z0-9_-]{1,80})$/u.test(slot)) {
    throw new BannerDeliveryError("Slot banner tidak valid.", 404);
  }

  const design = await readBannerDesignForDelivery({ destination, revision, source });
  const assetId = readDesignImageReference(design, slot);
  if (!assetId) throw new BannerDeliveryError("Slot banner tidak memiliki gambar.", 404);

  const asset = await readBannerAsset(assetId);
  if (!asset || !isImageMimeType(asset.mimeType)) {
    throw new BannerDeliveryError("Gambar banner belum tersedia.", 404);
  }

  const contentType = normalizeContentType(asset.mimeType);
  const object = await readManagedImage(asset, contentType);

  return {
    ...object,
    destination,
    revision,
    slot,
    source,
  };
}

async function resolveBannerDeliverySession() {
  return bannerDeliveryTestOverrides?.resolveSession?.() ?? getReadOnlySessionContext();
}

function assertBannerDeliverySession(
  session: SessionContext | null,
  source: BannerDeliverySource,
) {
  if (!session) throw new BannerDeliveryError("Sesi tidak tersedia.", 401);
  if (source === "published" && !session.user.roles.includes(RoleName.student)) {
    throw new BannerDeliveryError("Akses banner tidak diizinkan.", 403);
  }
  if (source === "draft" && !session.user.roles.includes(RoleName.admin)) {
    throw new BannerDeliveryError("Akses banner tidak diizinkan.", 403);
  }
}

async function withBannerDeliveryTestOverrides<T>(
  overrides: BannerDeliveryTestOverrides,
  callback: () => Promise<T>,
) {
  const previous = bannerDeliveryTestOverrides;
  bannerDeliveryTestOverrides = overrides;
  try {
    return await callback();
  } finally {
    bannerDeliveryTestOverrides = previous;
  }
}

export {
  BANNER_DELIVERY_HEADERS,
  BANNER_IMAGE_MAX_BYTES,
  BANNER_IMAGE_TIMEOUT_MS,
  BannerDeliveryError,
  assertBannerDeliverySession,
  deliverBannerImage,
  isPrivateIpAddress,
  isTrustedImageHost,
  normalizeContentType,
  readBannerDesignForDelivery,
  resolveBannerDeliverySession,
  withBannerDeliveryTestOverrides,
};
export type {
  BannerDeliveryAsset,
  BannerDeliveryObject,
  BannerDeliverySessionResolver,
  BannerDeliverySource,
  BannerDeliveryTestOverrides,
};
