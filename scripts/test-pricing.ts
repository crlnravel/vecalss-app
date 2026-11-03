import assert from "node:assert/strict";

import {
  getSafeLoginReturnPath,
  getSafePricingReturnPath,
} from "../lib/auth/paths";
import {
  getPackageCode,
} from "../lib/pricing/checkout";
import {
  PRICING_SCHEDULE,
  formatPricingMonth,
  formatRupiah,
  getPlanPrice,
  getPlanValidityLabel,
  isPricingPlanId,
  resolvePricing,
} from "../lib/pricing/schedule";

// Schedule follows the business table, resolved in Asia/Jakarta.
const expected: Array<[string, number, number]> = [
  ["2026-11-15T05:00:00+07:00", 49_000, 200_000],
  ["2026-12-15T05:00:00+07:00", 59_000, 250_000],
  ["2027-01-15T05:00:00+07:00", 59_000, 250_000],
  ["2027-02-15T05:00:00+07:00", 59_000, 200_000],
  ["2027-03-15T05:00:00+07:00", 59_000, 150_000],
  ["2027-04-15T05:00:00+07:00", 59_000, 200_000],
];
for (const [date, monthly, full] of expected) {
  const { entry, status } = resolvePricing(new Date(date));
  assert.equal(status, "active");
  assert.equal(entry?.monthlyPrice, monthly);
  assert.equal(entry?.fullPrice, full);
}

// 00:30 WIB on 1 December is still 30 November in UTC.
assert.equal(resolvePricing(new Date("2026-11-30T17:30:00Z")).entry?.month, "2026-12");
assert.equal(resolvePricing(new Date("2026-11-30T16:59:00Z")).entry?.month, "2026-11");

// Before the schedule the first month applies; after it sales are closed.
const upcoming = resolvePricing(new Date("2026-10-29T05:00:00+07:00"));
assert.equal(upcoming.status, "upcoming");
assert.equal(upcoming.entry?.month, "2026-11");
const closed = resolvePricing(new Date("2027-05-01T00:00:00+07:00"));
assert.equal(closed.status, "closed");
assert.equal(closed.entry, null);

// Validity wording distinguishes UTBK from Ujian Mandiri.
const march = PRICING_SCHEDULE[4];
const april = PRICING_SCHEDULE[5];
assert.equal(getPlanValidityLabel(march, "full"), "Akses sampai UTBK-SNBT");
assert.equal(getPlanValidityLabel(april, "full"), "Akses sampai Ujian Mandiri");
assert.equal(getPlanValidityLabel(april, "monthly"), "Akses 1 bulan");
assert.equal(getPlanPrice(march, "full"), 150_000);

assert.equal(formatRupiah(49_000), "Rp49.000");
assert.equal(formatRupiah(250_000), "Rp250.000");
assert.equal(formatPricingMonth("2027-04"), "April 2027");
assert.equal(isPricingPlanId("full"), true);
assert.equal(isPricingPlanId("gold"), false);

// Package codes come from configuration; nothing is defaulted. The editable
// checkout redirect is retired, so there is no URL to build here any more.
const env = {
  PRICING_PACKAGE_CODE_FULL_MANDIRI: "FULL-MANDIRI",
  PRICING_PACKAGE_CODE_FULL_UTBK: "FULL-UTBK",
  PRICING_PACKAGE_CODE_MONTHLY: "MONTHLY",
};
assert.equal(getPackageCode("full", march, {}), null);
assert.equal(getPackageCode("monthly", march, {}), null);
assert.equal(getPackageCode("full", march, env), "FULL-UTBK");
assert.equal(getPackageCode("full", april, env), "FULL-MANDIRI");
assert.equal(getPackageCode("monthly", april, env), "MONTHLY");
assert.equal(getPackageCode("monthly", april, { ...env, PRICING_PACKAGE_CODE_MONTHLY: " " }), null);

// Login may only return to admin or pricing paths.
assert.equal(getSafePricingReturnPath("/pricing"), "/pricing");
assert.equal(
  getSafePricingReturnPath("/pricing/checkout?plan=full&ref=SALSA2027"),
  "/pricing/checkout?plan=full&ref=SALSA2027",
);
for (const bad of [
  "//evil.example/pricing",
  "https://evil.example/pricing",
  "/pricingx",
  "/pricing/other",
  "/pricing?x=\\evil",
  "/pricing#hash",
  "/dashboard",
  null,
]) {
  assert.equal(getSafePricingReturnPath(bad), null, String(bad));
}
assert.equal(getSafeLoginReturnPath("/admin/imports"), "/admin/imports");
assert.equal(getSafeLoginReturnPath("/pricing?ref=A1B2"), "/pricing?ref=A1B2");
assert.equal(getSafeLoginReturnPath("/mentor/dashboard"), null);

console.log("Pricing schedule, checkout config, and return-path checks passed.");
