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

function routeContext() {
  return { params: Promise.resolve({ destination: "beranda", revision, slot: "background" }) };
}

async function publishedRoute(overrides: {
  asset?: BannerDeliveryAsset | null;
  body?: Uint8Array;
  contentType?: string;
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
      contentType: overrides.contentType ?? "image/png",
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
  assert.equal((await publishedRoute({ asset: null })).status, 404);
  assert.equal((await publishedRoute({ contentType: "application/pdf" })).status, 415);

  const previousTrustedHosts = process.env.BANNER_TRUSTED_IMAGE_HOSTS;
  process.env.BANNER_TRUSTED_IMAGE_HOSTS = "127.0.0.1,images.example.com";
  try {
    assert.equal((await publishedRoute({ asset: { ...asset, objectKey: null, url: "https://127.0.0.1/banner.png" } })).status, 404);
    assert.equal((await publishedRoute({ asset: { ...asset, objectKey: null, url: "https://user:pass@images.example.com/banner.png" } })).status, 404);
  } finally {
    if (previousTrustedHosts === undefined) delete process.env.BANNER_TRUSTED_IMAGE_HOSTS;
    else process.env.BANNER_TRUSTED_IMAGE_HOSTS = previousTrustedHosts;
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

  const knownOversized = await publishedRoute({ body: new Uint8Array(BANNER_IMAGE_MAX_BYTES + 1) });
  assert.equal(knownOversized.status, 413);

  const oversized = await publishedRoute({
    body: new Uint8Array(BANNER_IMAGE_MAX_BYTES + 1),
    knownContentLength: null,
  });
  assert.equal(oversized.status, 200);
  await assert.rejects(() => oversized.arrayBuffer());

  let sourceCancelled = false;
  const cancellableResponse = await withBannerDeliveryTestOverrides({
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
          sourceCancelled = true;
        },
      }),
      contentType: "image/png",
    }),
  }, async () => GET_PUBLISHED(new Request("https://vecalss.invalid"), routeContext())));
  assert.equal(cancellableResponse.status, 200);
  await cancellableResponse.body?.cancel("caller cancelled banner request");
  assert.equal(sourceCancelled, true);

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

  const previousPreviewFlag = process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
  process.env.ADMIN_STUDENT_PREVIEW_ENABLED = "true";
  try {
    const adminDraftResponse = await withBannerDeliveryTestOverrides({
      readAsset: async () => asset,
      readDraft: async (_destination, requestedRevision) => requestedRevision === revision ? imageDesign : null,
      resolveSession: async () => adminSession,
    }, async () => withMediaStorageTestOverrides({
      readObject: async () => ({ body: bytesStream(new Uint8Array([1, 2])), contentLength: 2, contentType: "image/png" }),
    }, async () => GET_ADMIN_DRAFT(new Request("https://vecalss.invalid"), routeContext())));
    assert.equal(adminDraftResponse.status, 200);
    assert.equal((await adminDraftResponse.arrayBuffer()).byteLength, 2);
  } finally {
    if (previousPreviewFlag === undefined) delete process.env.ADMIN_STUDENT_PREVIEW_ENABLED;
    else process.env.ADMIN_STUDENT_PREVIEW_ENABLED = previousPreviewFlag;
  }

  assert.equal(isTrustedImageHost("images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "images.example.com", NODE_ENV: "test" }), true);
  assert.equal(isTrustedImageHost("cdn.images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "*.images.example.com", NODE_ENV: "test" }), false);
  assert.equal(isTrustedImageHost("images.example.com", { BANNER_TRUSTED_IMAGE_HOSTS: "https://images.example.com", NODE_ENV: "test" }), false);
  assert.equal(isPrivateIpAddress("127.0.0.1"), true);
  assert.equal(isPrivateIpAddress("10.0.0.8"), true);
  assert.equal(isPrivateIpAddress("::1"), true);
  assert.equal(isPrivateIpAddress("169.254.10.20"), true);
  assert.equal(isPrivateIpAddress("8.8.8.8"), false);

  console.log("banner renderer and delivery contract checks passed");
}

await main();
