import assert from "node:assert/strict";

import { RoleName, UserStatus } from "../generated/prisma/client";
import { GET as GET_ADMIN_DRAFT } from "../app/api/admin/student-banners/[destination]/draft/[revision]/[slot]/route";
import { GET as GET_PUBLISHED } from "../app/api/student-banners/[destination]/[revision]/[slot]/route";
import {
  BANNER_IMAGE_MAX_BYTES,
  BANNER_IMAGE_TIMEOUT_MS,
  isPrivateIpAddress,
  isTrustedImageHost,
  withBannerDeliveryTestOverrides,
  type BannerDeliveryAsset,
} from "../lib/banner/delivery";
import {
  createDefaultBannerDesign,
  parseBannerDesign,
} from "../lib/admin/banner-maker";
import { withMediaStorageTestOverrides } from "../lib/media/r2";
import type { SessionContext } from "../lib/auth/types";

const revision = "11111111-1111-4111-8111-111111111111";
const staleRevision = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";

const studentSession: SessionContext = {
  expiresAt: new Date(Date.now() + 60_000),
  sessionId,
  user: {
    email: "voyager@example.invalid",
    fullName: "Alya Voyager",
    id: "55555555-5555-4555-8555-555555555555",
    mustChangePassword: false,
    onboardingStatus: null,
    roles: [RoleName.student],
    status: UserStatus.active,
  },
};

const adminSession: SessionContext = {
  ...studentSession,
  user: { ...studentSession.user, roles: [RoleName.admin] },
};

const imageDesign = parseBannerDesign({
  ...createDefaultBannerDesign(),
  background: { assetId, type: "image" },
  layers: [
    {
      align: "left",
      color: "#FFFFFF",
      fontSize: 68,
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
});

const asset: BannerDeliveryAsset = {
  mimeType: "image/png",
  objectKey: "admin/banner-image.png",
  sizeBytes: 4,
  url: null,
};

function bytesStream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function routeContext(slot = "background", requestedRevision = revision) {
  return { params: Promise.resolve({ destination: "beranda", revision: requestedRevision, slot }) };
}

async function publishedRoute(overrides: {
  asset?: BannerDeliveryAsset | null;
  body?: Uint8Array;
  contentType?: string | null;
  knownContentLength?: number | null;
  session?: SessionContext | null;
  } = {}) {
  const body = overrides.body ?? new Uint8Array([137, 80, 78, 71]);
  return withBannerDeliveryTestOverrides({
    readAsset: async () => overrides.asset === undefined ? asset : overrides.asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => overrides.session === undefined ? studentSession : overrides.session,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({
      body: bytesStream(body),
      contentLength: overrides.knownContentLength === null
        ? undefined
        : overrides.knownContentLength ?? body.byteLength,
      ...(overrides.contentType === null
        ? {}
        : { contentType: overrides.contentType ?? "image/png" }),
    }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
}

async function main() {
  const response = await publishedRoute();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(new Uint8Array(await response.arrayBuffer()).length, 4);

  assert.equal((await publishedRoute({ session: null })).status, 401);
  assert.equal((await publishedRoute({ session: adminSession })).status, 403);
  assert.equal((await publishedRoute({ asset: null })).status, 404);
  assert.equal((await publishedRoute({ contentType: "application/pdf" })).status, 415);
  assert.equal((await publishedRoute({ contentType: null })).status, 415);
  let missingR2MimeCancelled = false;
  const missingR2Mime = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel() {
          missingR2MimeCancelled = true;
        },
      }),
      contentLength: 1,
    }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
  assert.equal(missingR2Mime.status, 415);
  assert.equal(missingR2MimeCancelled, true);

  const previousTrustedHosts = process.env.BANNER_TRUSTED_IMAGE_HOSTS;
  process.env.BANNER_TRUSTED_IMAGE_HOSTS = "127.0.0.1,images.example.com";
  try {
    assert.equal((await publishedRoute({ asset: { ...asset, objectKey: null, url: "https://127.0.0.1/banner.png" } })).status, 404);
    assert.equal((await publishedRoute({ asset: { ...asset, objectKey: null, url: "https://user:pass@images.example.com/banner.png" } })).status, 404);
  } finally {
    if (previousTrustedHosts === undefined) delete process.env.BANNER_TRUSTED_IMAGE_HOSTS;
    else process.env.BANNER_TRUSTED_IMAGE_HOSTS = previousTrustedHosts;
  }

  let legacyNetworkCalled = false;
  const legacyKnownOversized = await withBannerDeliveryTestOverrides({
    readAsset: async () => ({ ...asset, objectKey: null, sizeBytes: BANNER_IMAGE_MAX_BYTES + 1, url: "https://images.example.com/banner.png" }),
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveLegacyAddresses: async () => {
      legacyNetworkCalled = true;
      return [{ address: "93.184.216.34" }];
    },
    resolveSession: async () => studentSession,
    requestLegacyImage: async () => {
      legacyNetworkCalled = true;
      throw new Error("legacy request must not start");
    },
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext()));
  assert.equal(legacyKnownOversized.status, 413);
  assert.equal(legacyNetworkCalled, false);

  const previousLegacyHosts = process.env.BANNER_TRUSTED_IMAGE_HOSTS;
  process.env.BANNER_TRUSTED_IMAGE_HOSTS = "images.example.com";
  try {
    let legacySourceCancelled = false;
    let legacySignalAborted = false;
    const legacyBadMime = await withBannerDeliveryTestOverrides({
      readAsset: async () => ({ ...asset, objectKey: null, url: "https://images.example.com/banner.png" }),
      readPublished: async () => ({ design: imageDesign, revision }),
      resolveLegacyAddresses: async () => [{ address: "93.184.216.34" }],
      resolveSession: async () => studentSession,
      requestLegacyImage: async ({ signal }) => {
        signal.addEventListener("abort", () => { legacySignalAborted = true; }, { once: true });
        return {
          body: new ReadableStream<Uint8Array>({ cancel() { legacySourceCancelled = true; } }),
          headers: new Headers({ "content-length": "1" }),
          status: 200,
        };
      },
    }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(legacyBadMime.status, 415);
    assert.equal(legacySourceCancelled, true);
    assert.equal(legacySignalAborted, true);

    let mixedDnsRequestStarted = false;
    const mixedDnsResponse = await withBannerDeliveryTestOverrides({
      readAsset: async () => ({ ...asset, objectKey: null, url: "https://images.example.com/banner.png" }),
      readPublished: async () => ({ design: imageDesign, revision }),
      resolveLegacyAddresses: async () => [{ address: "93.184.216.34" }, { address: "10.0.0.8" }],
      resolveSession: async () => studentSession,
      requestLegacyImage: async () => {
        mixedDnsRequestStarted = true;
        throw new Error("HTTPS must not start when any DNS answer is private");
      },
    }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(mixedDnsResponse.status, 404);
    assert.equal(mixedDnsRequestStarted, false);

    let redirectSourceCancelled = false;
    const legacyRedirect = await withBannerDeliveryTestOverrides({
      readAsset: async () => ({ ...asset, objectKey: null, url: "https://images.example.com/banner.png" }),
      readPublished: async () => ({ design: imageDesign, revision }),
      resolveLegacyAddresses: async () => [{ address: "93.184.216.34" }],
      resolveSession: async () => studentSession,
      requestLegacyImage: async () => ({
        body: new ReadableStream<Uint8Array>({ cancel() { redirectSourceCancelled = true; } }),
        headers: new Headers({ "content-type": "image/png", location: "https://evil.example/redirect" }),
        status: 302,
      }),
    }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(legacyRedirect.status, 502);
    assert.equal(redirectSourceCancelled, true);

    let hungResolverRequestStarted = false;
    const hungResolverStartedAt = Date.now();
    const hungResolverResponse = await withBannerDeliveryTestOverrides({
      readAsset: async () => ({ ...asset, objectKey: null, url: "https://images.example.com/banner.png" }),
      readPublished: async () => ({ design: imageDesign, revision }),
      resolveLegacyAddresses: async () => new Promise<Array<{ address: string }>>(() => undefined),
      resolveSession: async () => studentSession,
      requestLegacyImage: async () => {
        hungResolverRequestStarted = true;
        throw new Error("HTTPS must not start after a hung DNS lookup");
      },
    }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(hungResolverResponse.status, 504);
    assert.equal(hungResolverRequestStarted, false);
    assert.ok(Date.now() - hungResolverStartedAt >= BANNER_IMAGE_TIMEOUT_MS - 250);
  } finally {
    if (previousLegacyHosts === undefined) delete process.env.BANNER_TRUSTED_IMAGE_HOSTS;
    else process.env.BANNER_TRUSTED_IMAGE_HOSTS = previousLegacyHosts;
  }

  const staleResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({ body: bytesStream(new Uint8Array([1])), contentLength: 1, contentType: "image/png" }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), {
    params: Promise.resolve({ destination: "beranda", revision: staleRevision, slot: "background" }),
  })));
  assert.equal(staleResponse.status, 404);

  const arbitrarySlotResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), {
    params: Promise.resolve({ destination: "beranda", revision, slot: "untrusted-asset" }),
  }));
  assert.equal(arbitrarySlotResponse.status, 404);

  const namespacedLayerResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({ body: bytesStream(new Uint8Array([1, 2])), contentLength: 2, contentType: "image/png" }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext("layer:journey-image"))));
  assert.equal(namespacedLayerResponse.status, 200);

  const knownOversized = await publishedRoute({ body: new Uint8Array(BANNER_IMAGE_MAX_BYTES + 1) });
  assert.equal(knownOversized.status, 413);

  const oversized = await publishedRoute({
    body: new Uint8Array(BANNER_IMAGE_MAX_BYTES + 1),
    knownContentLength: null,
  });
  assert.equal(oversized.status, 200);
  await assert.rejects(() => oversized.arrayBuffer());

  let sourceCancelled = false;
  let sourceSignalAborted = false;
  const cancellableResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async (_objectKey, signal) => {
      signal?.addEventListener("abort", () => { sourceSignalAborted = true; }, { once: true });
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
          cancel() {
            sourceCancelled = true;
          },
        }),
        contentType: "image/png",
      };
    },
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
  assert.equal(cancellableResponse.status, 200);
  await cancellableResponse.body?.cancel("caller cancelled banner request");
  assert.equal(sourceCancelled, true);
  assert.equal(sourceSignalAborted, true);

  let incomingCancelled = false;
  const incomingAbortController = new AbortController();
  const incomingAbortResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({
      body: new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
        cancel() {
          incomingCancelled = true;
        },
      }),
      contentType: "image/png",
    }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid", { signal: incomingAbortController.signal }), routeContext())));
  assert.equal(incomingAbortResponse.status, 200);
  const incomingBody = incomingAbortResponse.arrayBuffer();
  incomingAbortController.abort();
  await assert.rejects(() => incomingBody);
  assert.equal(incomingCancelled, true);

  let stalledSourceCancelled = false;
  const stalledStartedAt = Date.now();
  const stalledResponse = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => ({
      body: new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => undefined);
        },
        cancel() {
          stalledSourceCancelled = true;
        },
      }),
      contentType: "image/png",
    }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
  assert.equal(stalledResponse.status, 200);
  await assert.rejects(() => stalledResponse.arrayBuffer(), /terlalu lama/u);
  assert.ok(Date.now() - stalledStartedAt >= BANNER_IMAGE_TIMEOUT_MS - 250);
  assert.equal(stalledSourceCancelled, true);

  const storageFailure = await withBannerDeliveryTestOverrides({
    readAsset: async () => asset,
    readPublished: async () => ({ design: imageDesign, revision }),
    resolveSession: async () => studentSession,
  }, async () => withMediaStorageTestOverrides({
    readObject: async () => { throw new Error("storage unavailable"); },
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
  assert.equal(storageFailure.status, 503);

  const studentDraftDenied = await withBannerDeliveryTestOverrides({
    readDraft: async () => imageDesign,
    resolveSession: async () => studentSession,
  }, async () => GET_ADMIN_DRAFT(new Request("https://vecalss.invalid"), routeContext()));
  assert.equal(studentDraftDenied.status, 403);
  const missingDraftSession = await withBannerDeliveryTestOverrides({
    resolveSession: async () => null,
  }, async () => GET_ADMIN_DRAFT(new Request("https://vecalss.invalid"), routeContext()));
  assert.equal(missingDraftSession.status, 401);

  const previousPreviewFlag = process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
  process.env.ADMIN_STUDENT_PREVIEW_ENABLED = "false";
  try {
    const disabledPreviewResponse = await withBannerDeliveryTestOverrides({
      resolveSession: async () => adminSession,
    }, async () => GET_ADMIN_DRAFT(new Request("https://vecalss.invalid"), routeContext()));
    assert.equal(disabledPreviewResponse.status, 404, "disabled managed preview capability must deny draft delivery");
  } finally {
    if (previousPreviewFlag === undefined) delete process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
    else process.env.ADMIN_STUDENT_PREVIEW_ENABLED = previousPreviewFlag;
  }

  assert.equal(isTrustedImageHost("images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "images.example.com", NODE_ENV: "test" }), true);
  assert.equal(isTrustedImageHost("[2001:db8::1]", { BANNER_TRUSTED_IMAGE_HOSTS: "[2001:db8::1]", NODE_ENV: "test" }), true);
  assert.equal(isTrustedImageHost("images.example.com.", { BANNER_TRUSTED_IMAGE_HOSTS: "IMAGES.EXAMPLE.COM.", NODE_ENV: "test" }), true);
  assert.equal(isTrustedImageHost("images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "", NODE_ENV: "test" }), false);
  assert.equal(isTrustedImageHost("cdn.images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "*.images.example.com", NODE_ENV: "test" }), false);
  assert.equal(isTrustedImageHost("images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "https://images.example.com", NODE_ENV: "test" }), false);
  for (const address of [
    "0.0.0.0",
    "10.0.0.8",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.10.20",
    "172.31.255.255",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "224.0.0.1",
    "240.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "100::1",
    "2001:db8::1",
    "fec0::1",
    "fe80::1",
    "fd12:3456::1",
    "ff02::1",
    "2002:7f00:1::1",
  ]) {
    assert.equal(isPrivateIpAddress(address), true, `reserved/private address must be denied: ${address}`);
  }
  for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2001:4860:4860::8888", "2606:4700:4700::1111", "2002:0808:0808::1"]) {
    assert.equal(isPrivateIpAddress(address), false, `public address must remain usable: ${address}`);
  }

  console.log("banner renderer and delivery contract checks passed");
}

await main();
