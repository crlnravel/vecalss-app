import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createDefaultBannerDesign, parseBannerDesign } from "../lib/admin/banner-maker";
import {
  calculateBannerGeometry,
  getBannerAccessibleText,
  getBannerImageSlots,
  hasAllBannerImages,
  shouldUseBannerFallback,
  type BannerPresentationAssetMap,
  type BannerPresentationDesign,
} from "../lib/banner/renderer";
import { bannerImageEndpoint, buildBannerPresentationAssetMap } from "../lib/banner/presentation-assets";
import { BannerPresentation } from "../modules/student/components/banner-presentation";

const revision = "11111111-1111-4111-8111-111111111111";
const assetId = "33333333-3333-4333-8333-333333333333";

const presentationDesign = parseBannerDesign({
  ...createDefaultBannerDesign(),
  background: { assetId, type: "image" },
  frame: { height: 600, padding: 48, radius: 28, snapToPadding: false, width: 1600 },
  layers: [
    {
      align: "left",
      color: "#FFFFFF",
      fontSize: 12,
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
}) as BannerPresentationDesign;

const assetMap: BannerPresentationAssetMap = {
  [assetId]: {
    alt: "Peta perjalanan",
    src: `/api/student-banners/beranda/${revision}/background`,
  },
};

for (const width of [320, 360, 390]) {
  const geometry = calculateBannerGeometry(
    { height: 600, padding: 48, radius: 28, width: 1600 },
    width,
  );
  assert.equal(geometry.width, width);
  assert.ok(Math.abs(geometry.height - width * 0.375) < 1e-9);
  assert.ok(Math.abs(geometry.padding - width * 48 / 1600) < 1e-9);
  assert.ok(Math.abs(geometry.textInset - width / 200) < 1e-9);
  assert.ok(Math.abs(geometry.radius - width * 28 / 1600) < 1e-9);
}

const tallGeometry = calculateBannerGeometry(
  { height: 1200, padding: 96, radius: 80, width: 1600 },
  320,
);
const shortGeometry = calculateBannerGeometry(
  { height: 160, padding: 8, radius: 4, width: 1600 },
  390,
);
assert.equal(tallGeometry.height, 240);
assert.equal(shortGeometry.height, 39);
assert.equal(getBannerImageSlots(presentationDesign).length, 2);
assert.equal(hasAllBannerImages(presentationDesign, assetMap), true);
assert.equal(shouldUseBannerFallback({ assetMap: {}, design: presentationDesign, failedImage: false }), true);
assert.equal(shouldUseBannerFallback({ assetMap, design: presentationDesign, failedImage: true }), true);

const accessibleText = getBannerAccessibleText(presentationDesign, {
  firstName: "Alya",
  target: "Kedokteran UI",
});
assert.match(accessibleText, /Alya/u);
assert.match(accessibleText, /Kedokteran UI/u);

assert.equal(
  bannerImageEndpoint({ destination: "beranda", revision, slot: "background", source: "published" }),
  `/api/student-banners/beranda/${revision}/background`,
);
assert.equal(
  bannerImageEndpoint({ destination: "beranda", revision, slot: "journey-image", source: "draft" }),
  `/api/admin/student-banners/beranda/draft/${revision}/journey-image`,
);
const derivedAssetMap = buildBannerPresentationAssetMap({
  design: presentationDesign,
  destination: "beranda",
  revision,
});
assert.equal(derivedAssetMap[assetId]?.src, `/api/student-banners/beranda/${revision}/background`);
assert.doesNotMatch(Object.values(derivedAssetMap).map(({ src }) => src).join("\n"), /api\/media\/admin/u);

const escapedMarkup = renderToStaticMarkup(createElement(BannerPresentation, {
  assets: assetMap,
  design: presentationDesign,
  destination: "beranda",
  revision,
  variables: { firstName: "<Alya>", target: "Kedokteran UI" },
}));
assert.doesNotMatch(escapedMarkup, /<Alya>/u);
assert.match(escapedMarkup, /&lt;Alya&gt;/u);
assert.match(escapedMarkup, /role="img"/u);
assert.match(escapedMarkup, /font-size:12px/u);
assert.match(escapedMarkup, /white-space:pre-wrap/u);
assert.match(escapedMarkup, /word-break:break-word/u);
assert.ok(Math.abs(12 * calculateBannerGeometry(presentationDesign.frame, 320).scale - 2.4) < 1e-9);

const fallbackMarkup = renderToStaticMarkup(createElement(BannerPresentation, {
  assets: {},
  design: presentationDesign,
  destination: "beranda",
  variables: { firstName: "Alya", target: "Kedokteran UI" },
}));
assert.match(fallbackMarkup, /Lanjutkan rute belajarmu/u);
assert.doesNotMatch(fallbackMarkup, /api\/student-banners/u);

console.log("banner presentation contract checks passed");
