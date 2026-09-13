import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";

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

import { isBannerV2ReaderEnabled } from "./activation";
import {
  getBannerDestination,
  parseBannerDestination,
  type BannerDestination,
} from "./destinations";
import { isUuid, parseBannerDesignEnvelope } from "./envelope";
import { BANNER_LAYER_SLOT_PREFIX } from "./renderer";

const BANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const BANNER_IMAGE_TIMEOUT_MS = 5_000;
// Legacy HTTPS sources are opt-in, comma-separated exact hostnames. An empty
// value denies every legacy fetch; wildcards, credentials, non-HTTPS URLs, and
// non-default ports are intentionally outside this policy.
const BANNER_TRUSTED_IMAGE_HOSTS_ENV = "BANNER_TRUSTED_IMAGE_HOSTS";

const BANNER_DELIVERY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "Vary": "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

type BannerDeliverySource = "admin-published" | "draft" | "published";

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

type BannerLegacyResponse = {
  body: ReadableStream<Uint8Array>;
  cancel?: (reason?: unknown) => Promise<void>;
  headers: Headers;
  status: number;
};

type BannerLegacyRequest = (input: {
  address: string;
  signal: AbortSignal;
  url: URL;
}) => Promise<BannerLegacyResponse>;

type BannerLegacyAddressResolver = (hostname: string) => Promise<Array<{ address: string }>>;

type BannerDeliveryTestOverrides = {
  readAsset?: (assetId: string) => Promise<BannerDeliveryAsset | null>;
  readDraft?: (destination: BannerDestination, revision: string) => Promise<BannerDesign | null>;
  readPublished?: (destination: BannerDestination) => Promise<{
    design: BannerDesign | null;
    revision: string | null;
  }>;
  resolveSession?: BannerDeliverySessionResolver;
  resolveLegacyAddresses?: BannerLegacyAddressResolver;
  requestLegacyImage?: BannerLegacyRequest;
};

type SafeLegacyImageUrl = {
  address: string;
  url: URL;
};

type BannerDeliveryBudget = {
  abort: (reason?: unknown) => void;
  deadline: number;
  dispose: () => void;
  hasExpired: () => boolean;
  remainingMs: () => number;
  signal: AbortSignal;
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

type ParsedIpAddress = {
  value: bigint;
  version: 4 | 6;
};

type CidrRange = {
  bits: number;
  network: bigint;
  version: 4 | 6;
};

const BANNER_PRIVATE_IPV4_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const BANNER_PRIVATE_IPV6_CIDRS = [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["3fff::", 20],
  ["fc00::", 7],
  ["fec0::", 10],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

function parseIpv4Value(address: string) {
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/u.test(octet))) return null;
  const values = octets.map(Number);
  if (values.some((octet) => octet > 255)) return null;
  return values.reduce((value, octet) => (value << BigInt(8)) | BigInt(octet), BigInt(0));
}

function parseIpv6Value(address: string) {
  let normalized = address.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (!normalized || normalized.includes("%")) return null;

  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    if (separator < 0) return null;
    const embedded = parseIpv4Value(normalized.slice(separator + 1));
    if (embedded === null) return null;
    const high = Number((embedded >> BigInt(16)) & BigInt(0xffff)).toString(16);
    const low = Number(embedded & BigInt(0xffff)).toString(16);
    normalized = `${normalized.slice(0, separator + 1)}${high}:${low}`;
  }

  const sections = normalized.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/u.test(part))) return null;

  const missing = 8 - left.length - right.length;
  if (sections.length === 1 && missing !== 0) return null;
  if (sections.length === 2 && missing < 1) return null;
  const groups = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...right,
  ];
  if (groups.length !== 8) return null;

  return groups.reduce((value, group) => (value << BigInt(16)) | BigInt(Number.parseInt(group, 16)), BigInt(0));
}

function parseIpAddress(address: string): ParsedIpAddress | null {
  const normalized = address.trim().replace(/^\[|\]$/gu, "");
  const version = isIP(normalized);
  if (version === 4) {
    const value = parseIpv4Value(normalized);
    return value === null ? null : { value, version: 4 };
  }
  if (version === 6) {
    const value = parseIpv6Value(normalized);
    return value === null ? null : { value, version: 6 };
  }
  return null;
}

function parseCidrRange(address: string, bits: number): CidrRange {
  const parsed = parseIpAddress(address);
  if (!parsed) throw new Error(`Invalid banner CIDR: ${address}/${bits}`);
  return { bits, network: parsed.value, version: parsed.version };
}

const BANNER_PRIVATE_IPV4_RANGES = BANNER_PRIVATE_IPV4_CIDRS.map(([address, bits]) => parseCidrRange(address, bits));
const BANNER_PRIVATE_IPV6_RANGES = BANNER_PRIVATE_IPV6_CIDRS.map(([address, bits]) => parseCidrRange(address, bits));
const BANNER_NAT64_PREFIX = parseCidrRange("64:ff9b::", 96).network >> BigInt(32);

function isInCidr(value: bigint, range: CidrRange) {
  const totalBits = range.version === 4 ? BigInt(32) : BigInt(128);
  const shift = totalBits - BigInt(range.bits);
  return (value >> shift) === (range.network >> shift);
}

function isPrivateIpv4Value(value: bigint) {
  return BANNER_PRIVATE_IPV4_RANGES.some((range) => isInCidr(value, range));
}

function embeddedIpv4Value(value: bigint) {
  const upper96 = value >> BigInt(32);
  if (upper96 === BigInt(0) || upper96 === BigInt(0xffff) || upper96 === BANNER_NAT64_PREFIX) {
    return Number(value & BigInt(0xffffffff));
  }
  if ((value >> BigInt(112)) === BigInt(0x2002)) {
    return Number((value >> BigInt(80)) & BigInt(0xffffffff));
  }
  return null;
}

function isPrivateIpAddress(address: string): boolean {
  const parsed = parseIpAddress(address);
  if (!parsed) return true;
  if (parsed.version === 4) return isPrivateIpv4Value(parsed.value);
  if (BANNER_PRIVATE_IPV6_RANGES.some((range) => isInCidr(parsed.value, range))) return true;
  const embedded = embeddedIpv4Value(parsed.value);
  return embedded === null ? false : isPrivateIpv4Value(BigInt(embedded));
}

function trustedImageHosts(env: NodeJS.ProcessEnv = process.env) {
  return (env[BANNER_TRUSTED_IMAGE_HOSTS_ENV] ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, ""))
    .filter((host) => {
      if (!host || host.includes("*") || host.includes("/") || host.includes("@")) return false;
      if (isIP(host) !== 0) return true;
      return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/iu.test(host);
    });
}

function isTrustedImageHost(hostname: string, env: NodeJS.ProcessEnv = process.env) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  return trustedImageHosts(env).some((pattern) => host === pattern.replace(/\.$/u, ""));
}

function createBannerDeliveryBudget(incomingSignal?: AbortSignal): BannerDeliveryBudget {
  const controller = new AbortController();
  const deadline = Date.now() + BANNER_IMAGE_TIMEOUT_MS;
  let expired = false;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    expired = true;
    controller.abort(new BannerDeliveryError("Gambar banner terlalu lama dimuat.", 504));
  }, BANNER_IMAGE_TIMEOUT_MS);
  const onIncomingAbort = () => controller.abort(incomingSignal?.reason);
  if (incomingSignal) {
    if (incomingSignal.aborted) onIncomingAbort();
    else incomingSignal.addEventListener("abort", onIncomingAbort, { once: true });
  }

  return {
    abort(reason) {
      if (!controller.signal.aborted) controller.abort(reason);
    },
    deadline,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timeout) clearTimeout(timeout);
      timeout = null;
      if (incomingSignal) incomingSignal.removeEventListener("abort", onIncomingAbort);
    },
    hasExpired() {
      return expired || Date.now() >= deadline;
    },
    remainingMs() {
      return Math.max(0, deadline - Date.now());
    },
    signal: controller.signal,
  };
}

function deliveryAbortError(budget: BannerDeliveryBudget) {
  if (budget.hasExpired()) return new BannerDeliveryError("Gambar banner terlalu lama dimuat.", 504);
  return new BannerDeliveryError("Permintaan gambar banner dibatalkan.", 499);
}

async function awaitWithinDeliveryBudget<T>(promise: Promise<T>, budget: BannerDeliveryBudget) {
  if (budget.signal.aborted) throw deliveryAbortError(budget);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      budget.signal.removeEventListener("abort", onAbort);
      reject(deliveryAbortError(budget));
    };
    budget.signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        if (budget.hasExpired()) {
          settled = true;
          budget.signal.removeEventListener("abort", onAbort);
          const error = new BannerDeliveryError("Gambar banner terlalu lama dimuat.", 504);
          budget.abort(error);
          reject(error);
          return;
        }
        settled = true;
        budget.signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        if (budget.hasExpired()) {
          settled = true;
          budget.signal.removeEventListener("abort", onAbort);
          const timeoutError = new BannerDeliveryError("Gambar banner terlalu lama dimuat.", 504);
          budget.abort(timeoutError);
          reject(timeoutError);
          return;
        }
        settled = true;
        budget.signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function assertSafeLegacyImageUrl(
  rawUrl: string,
  budget: BannerDeliveryBudget,
): Promise<SafeLegacyImageUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BannerDeliveryError("Sumber gambar banner tidak valid.", 404);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/gu, "");
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || !isTrustedImageHost(hostname)
  ) {
    throw new BannerDeliveryError("Sumber gambar banner tidak diizinkan.", 404);
  }

  let addresses: Array<{ address: string }>;
  try {
    const resolveAddresses = bannerDeliveryTestOverrides?.resolveLegacyAddresses
      ?? (async (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));
    addresses = await awaitWithinDeliveryBudget(resolveAddresses(hostname), budget);
  } catch {
    if (budget.signal.aborted) throw deliveryAbortError(budget);
    throw new BannerDeliveryError("Sumber gambar banner tidak dapat diverifikasi.", 502);
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIpAddress(address))) {
    throw new BannerDeliveryError("Sumber gambar banner mengarah ke jaringan privat.", 404);
  }

  return { address: addresses[0].address, url: parsed };
}

function boundedStream(
  source: ReadableStream<Uint8Array>,
  budget: BannerDeliveryBudget,
  cleanup?: (reason?: unknown) => Promise<void>,
) {
  const reader = source.getReader();
  let bytesRead = 0;
  let settled = false;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
  let pendingAbortError: BannerDeliveryError | null = null;
  let consumerCancelled = false;
  const removeAbortListener = () => budget.signal.removeEventListener("abort", onAbort);
  const dispose = (reason?: unknown) => {
    removeAbortListener();
    budget.dispose();
    const cleanupPromise = cleanup?.(reason);
    void cleanupPromise?.catch(() => undefined);
  };
  const fail = (
    target: ReadableStreamDefaultController<Uint8Array>,
    error: unknown,
    abort = true,
  ) => {
    if (settled) return;
    settled = true;
    removeAbortListener();
    if (abort) budget.abort(error);
    void reader.cancel(error).catch(() => undefined);
    dispose(error);
    target.error(error);
  };
  const onAbort = () => {
    const error = deliveryAbortError(budget);
    if (streamController && !consumerCancelled) {
      fail(streamController, error, false);
      return;
    }
    pendingAbortError = error;
    settled = true;
    void reader.cancel(error).catch(() => undefined);
    dispose(error);
  };
  budget.signal.addEventListener("abort", onAbort, { once: true });

  return new ReadableStream<Uint8Array>({
    start(target) {
      streamController = target;
      if (budget.signal.aborted) {
        onAbort();
        if (pendingAbortError && !consumerCancelled) target.error(pendingAbortError);
      }
    },
    async cancel(reason) {
      if (settled) return;
      consumerCancelled = true;
      settled = true;
      removeAbortListener();
      budget.abort(reason);
      await reader.cancel(reason);
      await cleanup?.(reason);
      budget.dispose();
    },
    async pull(target) {
      streamController = target;
      if (settled) return;
      try {
        const next = await reader.read();
        if (settled) return;
        if (next.done) {
          settled = true;
          dispose();
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
          fail(target, error);
        }
      }
    },
  });
}

async function requestLegacyImageFromHttps({
  address,
  signal,
  url,
}: Parameters<BannerLegacyRequest>[0]): Promise<BannerLegacyResponse> {
  return new Promise<BannerLegacyResponse>((resolve, reject) => {
    let settled = false;
    let incomingResponse: IncomingMessage | null = null;
    let request: ReturnType<typeof httpsRequest> | null = null;
    const rejectIfPending = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const onAbort = () => {
      const error = signal.reason instanceof Error
        ? signal.reason
        : new Error("banner image request aborted");
      request?.destroy(error);
      incomingResponse?.destroy(error);
      rejectIfPending(error);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    request = httpsRequest({
      family: isIP(address) === 6 ? 6 : 4,
      headers: {
        Accept: "image/*",
        Host: url.host,
      },
      hostname: address,
      method: "GET",
      path: `${url.pathname}${url.search}`,
      servername: url.hostname.replace(/^\[|\]$/gu, ""),
    }, (response) => {
      incomingResponse = response;
      const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
      const cancel = async (reason?: unknown) => {
        const error = reason instanceof Error ? reason : undefined;
        response.destroy(error);
        await body.cancel(reason).catch(() => undefined);
      };
      if (settled) {
        void cancel(new Error("banner image response arrived after abort"));
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve({
        body,
        cancel,
        headers: new Headers({
          "content-length": response.headers["content-length"]?.toString() ?? "",
          "content-type": response.headers["content-type"]?.toString() ?? "",
          location: response.headers.location?.toString() ?? "",
        }),
        status: response.statusCode ?? 0,
      });
    });
    request.once("error", rejectIfPending);
    signal.addEventListener("abort", onAbort, { once: true });
    request.end();
  });
}

async function cancelLegacyResponse(response: BannerLegacyResponse, reason: unknown) {
  try {
    await response.body.cancel(reason);
  } catch {
    // The source may already be closed by the Node request teardown.
  }
  await response.cancel?.(reason);
}

async function readLegacyImage(
  asset: BannerDeliveryAsset,
  expectedMimeType: string,
  budget: BannerDeliveryBudget,
): Promise<BannerDeliveryObject> {
  if (!asset.url) throw new BannerDeliveryError("Gambar banner belum tersedia.", 404);
  const safeUrl = await assertSafeLegacyImageUrl(asset.url, budget);
  if (budget.signal.aborted) throw deliveryAbortError(budget);
  const requestLegacyImage = bannerDeliveryTestOverrides?.requestLegacyImage ?? requestLegacyImageFromHttps;
  let response: BannerLegacyResponse;
  const responsePromise = requestLegacyImage({
    address: safeUrl.address,
    signal: budget.signal,
    url: safeUrl.url,
  });
  void responsePromise.then((lateResponse) => {
    if (budget.signal.aborted) {
      void cancelLegacyResponse(lateResponse, deliveryAbortError(budget));
    }
  }, () => undefined);
  try {
    response = await awaitWithinDeliveryBudget(responsePromise, budget);
  } catch {
    if (budget.signal.aborted) throw deliveryAbortError(budget);
    throw new BannerDeliveryError("Gambar banner belum dapat dimuat.", 502);
  }

  if (budget.signal.aborted) {
    const error = deliveryAbortError(budget);
    await cancelLegacyResponse(response, error);
    throw error;
  }

  const rejectResponse = async (error: BannerDeliveryError): Promise<never> => {
    budget.abort(error);
    await cancelLegacyResponse(response, error);
    throw error;
  };
  if (response.status >= 300 && response.status < 400) {
    return rejectResponse(new BannerDeliveryError("Pengalihan gambar banner tidak diizinkan.", 502));
  }
  if (response.status < 200 || response.status >= 300) {
    return rejectResponse(new BannerDeliveryError("Gambar banner belum tersedia.", response.status === 404 ? 404 : 502));
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (!isImageMimeType(contentType) || contentType !== expectedMimeType) {
    return rejectResponse(new BannerDeliveryError("Tipe gambar banner tidak valid.", 415));
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > BANNER_IMAGE_MAX_BYTES)) {
    return rejectResponse(new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413));
  }

  return {
    body: boundedStream(response.body, budget, response.cancel),
    contentLength,
    contentType,
  };
}

async function cancelManagedBody(body: ReadableStream<Uint8Array>, reason: unknown) {
  try {
    await body.cancel(reason);
  } catch {
    // Storage adapters may have already closed the body after abort.
  }
}

async function readManagedImage(
  asset: BannerDeliveryAsset,
  expectedMimeType: string,
  budget: BannerDeliveryBudget,
): Promise<BannerDeliveryObject> {
  if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 0) {
    throw new BannerDeliveryError("Metadata gambar banner tidak valid.", 404);
  }
  if (asset.sizeBytes > BANNER_IMAGE_MAX_BYTES) {
    throw new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413);
  }
  if (!asset.objectKey) return readLegacyImage(asset, expectedMimeType, budget);
  if (budget.signal.aborted) throw deliveryAbortError(budget);

  let object: Awaited<ReturnType<typeof readMediaObjectStream>>;
  const objectPromise = readMediaObjectStream(asset.objectKey, budget.signal);
  void objectPromise.then((lateObject) => {
    if (budget.signal.aborted) {
      void cancelManagedBody(lateObject.body, deliveryAbortError(budget));
    }
  }, () => undefined);
  try {
    object = await awaitWithinDeliveryBudget(objectPromise, budget);
  } catch (error) {
    if (budget.signal.aborted) throw deliveryAbortError(budget);
    if (error instanceof R2ConfigurationError) {
      throw new BannerDeliveryError("Penyimpanan gambar banner belum dikonfigurasi.", 503);
    }
    throw new BannerDeliveryError("Gambar banner belum dapat dimuat.", 503);
  }

  if (budget.signal.aborted) {
    const error = deliveryAbortError(budget);
    await cancelManagedBody(object.body, error);
    throw error;
  }

  const rejectObject = async (error: BannerDeliveryError): Promise<never> => {
    budget.abort(error);
    await cancelManagedBody(object.body, error);
    throw error;
  };
  if (object.contentLength !== undefined
    && (!Number.isSafeInteger(object.contentLength) || object.contentLength < 0 || object.contentLength > BANNER_IMAGE_MAX_BYTES)) {
    return rejectObject(new BannerDeliveryError("Gambar banner melebihi batas ukuran.", 413));
  }

  const contentType = normalizeContentType(object.contentType);
  if (!contentType || !isImageMimeType(contentType) || contentType !== expectedMimeType) {
    return rejectObject(new BannerDeliveryError("Tipe gambar banner tidak valid.", 415));
  }

  return {
    body: boundedStream(object.body, budget),
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

  const layerId = slot.startsWith(BANNER_LAYER_SLOT_PREFIX)
    ? slot.slice(BANNER_LAYER_SLOT_PREFIX.length)
    : slot;
  const layer = design.layers.find((candidate) => candidate.id === layerId);
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
  signal,
}: {
  destination: string;
  revision: string;
  signal?: AbortSignal;
  slot: string;
  source: BannerDeliverySource;
}) {
  const budget = createBannerDeliveryBudget(signal);
  try {
    if (!isBannerV2ReaderEnabled()) {
      throw new BannerDeliveryError("Pengiriman banner v2 belum diaktifkan.", 404);
    }

    let destination: BannerDestination;
    try {
      destination = parseBannerDestination(destinationValue);
    } catch {
      throw new BannerDeliveryError("Tujuan banner tidak dikenali.", 404);
    }
    if (!/^(?:background|[A-Za-z0-9_-]{1,80}|layer:[A-Za-z0-9_-]{1,80})$/u.test(slot)) {
      throw new BannerDeliveryError("Slot banner tidak valid.", 404);
    }

    if (budget.signal.aborted) throw deliveryAbortError(budget);
    const design = await readBannerDesignForDelivery({ destination, revision, source });
    if (budget.signal.aborted) throw deliveryAbortError(budget);
    const assetId = readDesignImageReference(design, slot);
    if (!assetId) throw new BannerDeliveryError("Slot banner tidak memiliki gambar.", 404);

    const asset = await readBannerAsset(assetId);
    if (!asset || !isImageMimeType(asset.mimeType)) {
      throw new BannerDeliveryError("Gambar banner belum tersedia.", 404);
    }

    const contentType = normalizeContentType(asset.mimeType);
    const object = await readManagedImage(asset, contentType, budget);

    return {
      ...object,
      destination,
      revision,
      slot,
      source,
    };
  } catch (error) {
    budget.abort(error);
    budget.dispose();
    throw error;
  }
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
  if ((source === "draft" || source === "admin-published") && !session.user.roles.includes(RoleName.admin)) {
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
