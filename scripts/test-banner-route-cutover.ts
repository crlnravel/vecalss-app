import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RoleName, UserStatus } from "../generated/prisma/client";
import {
  createDefaultBannerDesign,
  parseBannerDesign,
  type BannerDesign,
} from "../lib/admin/banner-maker";
import {
  publishBannerMakerDesign,
  saveBannerMakerDraft,
} from "../lib/admin/banner-maker-repository";
import {
  publishStudentBannerContents,
  saveStudentBannerDraft,
} from "../lib/student/banner-repository";
import type { StudentBannerSet } from "../lib/student/banner-content";
import {
  getBannerActivationState,
  LegacyBannerWritesRetiredError,
} from "../lib/banner/activation";
import {
  assertBannerDeliverySession,
  BannerDeliveryError,
} from "../lib/banner/delivery";
import {
  BANNER_DESTINATIONS,
  type BannerDestination,
} from "../lib/banner/destinations";
import {
  getAdminStudentPreviewBannerPresentation,
  getPublishedStudentBannerPresentation,
  withBannerReaderTestOverrides,
} from "../lib/student/banner-reader";
import {
  getStudentBannerHeading,
  isStudentBannerDraftUnavailable,
} from "../lib/student/banner-presentation";
import {
  buildAdminStudentPreviewBannerDraftRoute,
  buildAdminStudentPreviewBannerEditorRoute,
} from "../lib/student/preview-routes";
import { handleBannerMakerDestinationAction } from "../lib/admin/banner-maker-action-handler";
import type { SessionContext } from "../lib/auth/types";

const root = resolve(import.meta.dirname, "..");
const activationKeys = [
  "BANNER_V2_ACTIVATION",
  "BANNER_BP01_WRITER_PROTECTION_ACK",
  "BANNER_LEGACY_WRITER_RETIREMENT_ACK",
  "BANNER_LEGACY_WRITER_DRAIN_ACK",
] as const;

const revisions: Record<BannerDestination, string> = {
  beranda: "11111111-1111-4111-8111-111111111111",
  materi: "22222222-2222-4222-8222-222222222222",
  kuis: "33333333-3333-4333-8333-333333333333",
  tryout: "44444444-4444-4444-8444-444444444444",
};

const assetIds: Record<BannerDestination, string> = {
  beranda: "51111111-1111-4111-8111-111111111111",
  materi: "52222222-2222-4222-8222-222222222222",
  kuis: "53333333-3333-4333-8333-333333333333",
  tryout: "54444444-4444-4444-8444-444444444444",
};

const legacy: StudentBannerSet = {
  beranda: { description: "Legacy beranda description", title: "Legacy beranda" },
  kuis: { description: "Legacy kuis description", title: "Legacy kuis" },
  materi: { description: "Legacy materi description", title: "Legacy materi" },
  tryout: { description: "Legacy tryout description", title: "Legacy tryout" },
};

function authoredDesign(destination: BannerDestination): BannerDesign {
  const defaultDesign = createDefaultBannerDesign();
  return parseBannerDesign({
    ...defaultDesign,
    background: { assetId: assetIds[destination], type: "image" },
    layers: defaultDesign.layers.map((layer, index) => (
      layer.type === "text" && index === 0
        ? { ...layer, text: `Authored ${destination}` }
        : layer
    )),
  });
}

const designs = Object.fromEntries(
  BANNER_DESTINATIONS.map(({ key }) => [key, authoredDesign(key)]),
) as Record<BannerDestination, BannerDesign>;

function applyActivation(values: Partial<Record<(typeof activationKeys)[number], string>>) {
  for (const key of activationKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

function deliveryErrorStatus(callback: () => void) {
  try {
    callback();
    return null;
  } catch (error) {
    assert.ok(error instanceof BannerDeliveryError);
    return error.status;
  }
}

const baseUser = {
  email: "admin@example.invalid",
  fullName: "Admin Preview",
  id: "61111111-1111-4111-8111-111111111111",
  mustChangePassword: false,
  onboardingStatus: null,
  status: UserStatus.active,
};

const studentSession: SessionContext = {
  expiresAt: new Date(Date.now() + 60_000),
  sessionId: "71111111-1111-4111-8111-111111111111",
  user: { ...baseUser, roles: [RoleName.student] },
};

const adminSession: SessionContext = {
  ...studentSession,
  user: { ...baseUser, roles: [RoleName.admin] },
};

const previousActivation = Object.fromEntries(
  activationKeys.map((key) => [key, process.env[key]]),
);

try {
  applyActivation({});
  const defaultState = getBannerActivationState();
  assert.equal(defaultState.mode, "safe-fallback");
  assert.equal(defaultState.editorEnabled, false);
  assert.equal(defaultState.readersEnabled, false);
  assert.equal(defaultState.requested, false);

  applyActivation({ BANNER_V2_ACTIVATION: "enabled" });
  const blockedState = getBannerActivationState();
  assert.equal(blockedState.mode, "safe-fallback");
  assert.match(blockedState.reason ?? "", /BP-01 writer protection/iu);
  assert.match(blockedState.reason ?? "", /legacy writer retirement/iu);
  assert.match(blockedState.reason ?? "", /legacy writer drain/iu);

  applyActivation({
    BANNER_BP01_WRITER_PROTECTION_ACK: "yes",
    BANNER_LEGACY_WRITER_DRAIN_ACK: "1",
    BANNER_LEGACY_WRITER_RETIREMENT_ACK: "true",
    BANNER_V2_ACTIVATION: "enabled",
  });
  const activeState = getBannerActivationState();
  assert.deepEqual(activeState.prerequisites, {
    bp01WriterProtection: true,
    legacyWriterDrain: true,
    legacyWriterRetirement: true,
  });
  assert.equal(activeState.mode, "active");
  assert.equal(activeState.editorEnabled, true);
  assert.equal(activeState.readersEnabled, true);
  assert.equal(activeState.reason, null);

  for (const operation of [
    () => saveBannerMakerDraft({ actorUserId: "stale", design: null as unknown as BannerDesign, expectedVersion: "stale" }),
    () => publishBannerMakerDesign({ actorUserId: "stale", design: null as unknown as BannerDesign, expectedVersion: "stale" }),
    () => saveStudentBannerDraft({ actorUserId: "stale", banners: {} as StudentBannerSet, expectedVersion: "stale" }),
    () => publishStudentBannerContents({ actorUserId: "stale", banners: {} as StudentBannerSet, expectedVersion: "stale" }),
  ]) {
    await assert.rejects(operation, (error: unknown) => error instanceof LegacyBannerWritesRetiredError);
  }

  const publishedReads: BannerDestination[] = [];
  const draftReads: Array<{ destination: BannerDestination; revision: string }> = [];
  await withBannerReaderTestOverrides({
    readDraft: async (destination, revision) => {
      draftReads.push({ destination, revision });
      return revision === revisions[destination]
        ? { design: designs[destination], revision }
        : null;
    },
    readLegacy: async () => legacy,
    readPublished: async (destination) => {
      publishedReads.push(destination);
      return { design: designs[destination], revision: revisions[destination] };
    },
  }, async () => {
    applyActivation({});
    const safeStudent = await getPublishedStudentBannerPresentation("kuis");
    assert.equal(safeStudent.source, "legacy-fallback");
    assert.equal(safeStudent.design, null);
    assert.deepEqual(safeStudent.fallback, legacy.kuis);

    const safePreview = await getAdminStudentPreviewBannerPresentation("materi");
    if (safePreview.kind !== "presentation") throw new Error("safe published preview must return a presentation");
    assert.equal(safePreview.source, "legacy-fallback");
    assert.equal(safePreview.design, null);
    const safeDraft = await getAdminStudentPreviewBannerPresentation("materi", {
      mode: "draft",
      revision: revisions.materi,
    });
    assert.ok(isStudentBannerDraftUnavailable(safeDraft));
    assert.match(safeDraft.message, /mode aman/iu);
    assert.equal(publishedReads.length, 0, "safe fallback must not read v2 published designs");
    assert.equal(draftReads.length, 0, "safe fallback must not read v2 drafts");

    applyActivation({
      BANNER_BP01_WRITER_PROTECTION_ACK: "yes",
      BANNER_LEGACY_WRITER_DRAIN_ACK: "1",
      BANNER_LEGACY_WRITER_RETIREMENT_ACK: "true",
      BANNER_V2_ACTIVATION: "enabled",
    });
    for (const { key } of BANNER_DESTINATIONS) {
      const presentation = await getPublishedStudentBannerPresentation(key);
      assert.equal(presentation.destination, key);
      assert.equal(presentation.source, "published-v2");
      assert.equal(presentation.revision, revisions[key]);
      assert.match(getStudentBannerHeading(presentation), new RegExp(`Authored ${key}`, "u"));
      assert.equal(
        presentation.assets[assetIds[key]]?.src,
        `/api/student-banners/${key}/${revisions[key]}/background`,
      );
    }
    assert.deepEqual(publishedReads, ["beranda", "materi", "kuis", "tryout"]);

    const adminPublished = await getAdminStudentPreviewBannerPresentation("kuis");
    if (adminPublished.kind !== "presentation") throw new Error("published Admin preview must return a presentation");
    assert.equal(adminPublished.source, "published-v2");
    assert.equal(adminPublished.assets[assetIds.kuis]?.src, `/api/admin/student-banners/kuis/published/${revisions.kuis}/background`);

    const draft = await getAdminStudentPreviewBannerPresentation("kuis", {
      mode: "draft",
      revision: revisions.kuis,
    });
    assert.equal(draft.kind, "presentation");
    if (draft.kind === "presentation") {
      assert.equal(draft.mode, "draft");
      assert.equal(draft.source, "draft-v2");
      assert.equal(draft.assets[assetIds.kuis]?.src, `/api/admin/student-banners/kuis/draft/${revisions.kuis}/background`);
    }

    const staleDraft = await getAdminStudentPreviewBannerPresentation("kuis", {
      mode: "draft",
      revision: revisions.materi,
    });
    assert.ok(isStudentBannerDraftUnavailable(staleDraft));
    assert.match(staleDraft.message, /tidak ditemukan|tidak berlaku/iu);
    const missingDraft = await getAdminStudentPreviewBannerPresentation("kuis", { mode: "draft", revision: null });
    assert.ok(isStudentBannerDraftUnavailable(missingDraft));
    assert.match(missingDraft.message, /eksplisit/iu);
    assert.ok(draftReads.some(({ destination, revision }) => destination === "kuis" && revision === revisions.kuis));
    assert.ok(draftReads.some(({ destination, revision }) => destination === "kuis" && revision === revisions.materi));
  });

  const staleForm = new FormData();
  staleForm.set("destination", "materi");
  staleForm.set("design", JSON.stringify(createDefaultBannerDesign()));
  staleForm.set("intent", "publish");
  staleForm.set("requestId", "81111111-1111-4111-8111-111111111111");
  staleForm.set("revision", "91111111-1111-4111-8111-111111111111");
  let staleWriterCalled = false;
  const staleResult = await handleBannerMakerDestinationAction(
    {
      destination: "materi",
      requestId: "81111111-1111-4111-8111-111111111111",
      status: "idle",
    },
    staleForm,
    {
      mutationsEnabled: false,
      publish: async () => {
        staleWriterCalled = true;
        throw new Error("writer must remain unreachable");
      },
      requireAdminSession: async () => ({ user: { id: "a1111111-1111-4111-8111-111111111111" } }),
      saveDraft: async () => {
        staleWriterCalled = true;
        throw new Error("writer must remain unreachable");
      },
    },
  );
  assert.equal(staleResult.status, "error");
  assert.match(staleResult.message ?? "", /belum diaktifkan/iu);
  assert.equal(staleWriterCalled, false, "safe fallback must reject stale forms before a v2 writer");

  assert.equal(deliveryErrorStatus(() => assertBannerDeliverySession(null, "admin-published")), 401);
  assert.equal(deliveryErrorStatus(() => assertBannerDeliverySession(studentSession, "admin-published")), 403);
  assert.equal(deliveryErrorStatus(() => assertBannerDeliverySession(adminSession, "published")), 403);
  assert.doesNotThrow(() => assertBannerDeliverySession(adminSession, "admin-published"));
  assert.doesNotThrow(() => assertBannerDeliverySession(adminSession, "draft"));
  assert.doesNotThrow(() => assertBannerDeliverySession(studentSession, "published"));

  assert.equal(buildAdminStudentPreviewBannerEditorRoute("materi"), "/admin/student-banners?destination=materi");
  assert.equal(
    buildAdminStudentPreviewBannerDraftRoute("tryout", revisions.tryout),
    `/admin/student-preview/tryout?bannerSource=draft&revision=${revisions.tryout}`,
  );
  assert.throws(
    () => buildAdminStudentPreviewBannerDraftRoute("beranda", "stale"),
    /Unsafe admin student preview banner revision/u,
  );

  const previewPageSource = await readFile(resolve(root, "app/admin/student-preview/[[...slug]]/page.tsx"), "utf8");
  const bannerPageSource = await readFile(resolve(root, "app/admin/student-banners/page.tsx"), "utf8");
  assert.match(previewPageSource, /editBanners[\s\S]{0,240}redirect\(buildBannerMakerDestinationRoute/u);
  assert.match(bannerPageSource, /editBanners[\s\S]{0,180}redirect\(`\/admin\/student-banners\?destination=/u);
  assert.doesNotMatch(previewPageSource, /StudentBannerEditor|updateAdminStudentPreviewBannersAction/u);
  assert.doesNotMatch(bannerPageSource, /getBannerMakerSnapshot|BannerMakerPageModule/u);

  console.log("banner route cutover, preview-source, and activation checks passed");
} finally {
  for (const key of activationKeys) {
    const value = previousActivation[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
