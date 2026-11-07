import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { DEVICE_COOKIE_MAX_AGE_SECONDS } from "@/lib/fraud/device";
import {
  PRIVACY_POLICY_VERSIONS,
  TERMS_OF_SERVICE_VERSIONS,
  approvalProblems,
  documentText,
  getPrivacyPolicy,
  getTermsOfService,
  hasPlaceholder,
  isLegalApproved,
} from "@/lib/legal";
import { OWNER_INPUTS, OWNER_INPUT_VALUES, containsPlaceholder } from "@/lib/legal/owner-inputs";
import type { LegalDocument } from "@/lib/legal/types";
import { SECURITY_LOG_RETENTION_DAYS } from "@/lib/maintenance/retention";

/**
 * MS-21: the privacy policy and the terms of service. The owner inputs are not
 * known yet, so the pages are drafts with visible placeholders; what must hold
 * whatever the owner fills in is that a document cannot be approved with a
 * placeholder left in it, that every placeholder lives in one file, and that
 * what the text says about the system matches the system.
 */

const read = (path: string) => readFileSync(path, "utf8");
const pass = (message: string) => process.stdout.write(`ok  ${message}\n`);

const ALL = [
  ...PRIVACY_POLICY_VERSIONS.map((document) => ["privacy", document] as const),
  ...TERMS_OF_SERVICE_VERSIONS.map((document) => ["terms", document] as const),
];

// ---- Approval: no placeholder in an approved document ----------------------------------------
for (const [name, document] of ALL) {
  if (document.status !== "approved") continue;
  assert.equal(hasPlaceholder(document), false, `the approved ${name} version ${document.version} still has a placeholder`);
}
pass("every approved legal version is free of placeholders");

const draft = getPrivacyPolicy();
const approvedWithPlaceholder: LegalDocument = { ...draft, status: "approved" };
assert.ok(hasPlaceholder(approvedWithPlaceholder), "the shipped privacy draft carries placeholders (the owner inputs are open)");
assert.ok(approvalProblems(approvedWithPlaceholder).length > 0);
assert.equal(isLegalApproved(approvedWithPlaceholder), false, "marked approved with a placeholder left in: still not approved");
assert.equal(isLegalApproved({ ...draft, status: "draft" }), false, "a draft is never approved");

const clean: LegalDocument = {
  draftedOn: "2026-11-09",
  intro: ["Teks tanpa placeholder."],
  sections: [{ heading: "Pasal 1. Uji", paragraphs: ["Isi yang lengkap."] }],
  status: "approved",
  title: "Uji",
  version: "uji-1",
};
assert.equal(isLegalApproved(clean), true, "a clean approved document passes");
assert.equal(isLegalApproved({ ...clean, version: " " }), false, "an approved document needs a version");
// Each owner input is caught on its own, in any part of the text, and so is an unknown bracketed note.
for (const [key, value] of Object.entries(OWNER_INPUTS)) {
  for (const place of ["intro", "heading", "paragraph", "item", "after"] as const) {
    const section = {
      heading: place === "heading" ? value : "Pasal 1",
      paragraphs: place === "paragraph" ? [value] : ["Isi."],
      ...(place === "item" ? { items: [value] } : {}),
      ...(place === "after" ? { after: [value] } : {}),
    };
    const document: LegalDocument = { ...clean, intro: place === "intro" ? [value] : clean.intro, sections: [section] };
    assert.equal(isLegalApproved(document), false, `${key} left in the ${place} blocks approval`);
  }
}
assert.equal(containsPlaceholder("[sesuatu yang belum diisi]"), true, "an unknown bracketed note counts as a placeholder");
assert.equal(containsPlaceholder("Kurung tanpa isi [1] atau [ ] bukan placeholder."), false);
pass("a legal version cannot be approved while any placeholder is left, wherever it sits");

// ---- Placeholders live in one file ----------------------------------------------------------
const allowed = new Set(OWNER_INPUT_VALUES);
for (const [name, document] of ALL) {
  for (const match of documentText(document).matchAll(/\[[A-Za-z][^\]]*\]/gu)) {
    assert.ok(allowed.has(match[0]), `${name} ${document.version}: "${match[0]}" is a placeholder that is not in lib/legal/owner-inputs.ts`);
  }
}
const sourceOfLegal = read("lib/legal/privacy-policy.ts") + read("lib/legal/terms-of-service.ts");
assert.equal(/"\[[A-Za-z]|`\[[A-Za-z]/u.test(sourceOfLegal), false, "the legal text files hold no hand-typed placeholder");
const used = new Set(ALL.flatMap(([, document]) => OWNER_INPUT_VALUES.filter((value) => documentText(document).includes(value))));
for (const [key, value] of Object.entries(OWNER_INPUTS)) assert.ok(used.has(value), `owner input ${key} is not used by any legal text`);
for (const value of OWNER_INPUT_VALUES) assert.match(value, /^\[[a-z]/u, "placeholders read as a short Indonesian note in brackets");
pass("every placeholder is defined once in owner-inputs.ts and every one is used");

// ---- Versions -------------------------------------------------------------------------------
for (const versions of [PRIVACY_POLICY_VERSIONS, TERMS_OF_SERVICE_VERSIONS]) {
  assert.ok(versions.length >= 1);
  assert.equal(new Set(versions.map((document) => document.version)).size, versions.length, "versions are unique");
}
assert.equal(getPrivacyPolicy(), PRIVACY_POLICY_VERSIONS[PRIVACY_POLICY_VERSIONS.length - 1], "the current policy is the last version");
assert.equal(getTermsOfService(), TERMS_OF_SERVICE_VERSIONS[TERMS_OF_SERVICE_VERSIONS.length - 1], "the current terms are the last version");
pass("versions are unique and the last one is current");

// ---- Content: what the policy says matches what the system does ---------------------------------
const privacy = documentText(getPrivacyPolicy());
const terms = documentText(getTermsOfService());

for (const processor of ["Vercel", "Neon", "Cloudflare", "Resend", "OpenAI", "E2Pay"]) {
  assert.ok(privacy.includes(processor), `the privacy policy names ${processor}`);
}
assert.ok(privacy.includes(OWNER_INPUTS.redisProvider), "the privacy policy has a place for the Redis provider");
assert.ok(privacy.includes("R2") && privacy.includes("Turnstile"), "it says what Cloudflare does");
assert.match(privacy, /Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi/u, "it cites UU PDP");
assert.match(privacy, /pesan yang kamu tulis[^.]*dikirim ke OpenAI/iu, "it says Vera messages go to OpenAI");
assert.match(privacy, /di luar Indonesia/u, "it says some processing is outside Indonesia");
assert.match(privacy, /18 tahun ke atas, atau sudah mendapat izin orang tua atau wali/u, "it states the age rule");
assert.match(privacy, /memberi tahu kamu secara tertulis[^.]*melaporkannya kepada lembaga yang berwenang/u, "it commits to breach notice");
assert.ok(privacy.includes(OWNER_INPUTS.responseTime), "it gives a response time for requests");
assert.match(privacy, /hak atas data pribadimu/u);
assert.match(privacy, /kirim email ke/u, "it says how to use the rights");
pass("the privacy policy names the processors, cites UU PDP and covers Vera, children, rights and breaches");

const retention = [
  [/Catatan pesanan, pembayaran[^:]*: 10 tahun/u, "orders and payments: 10 years"],
  [/Alamat IP dan bukti perangkat[^:]*: 12 bulan/u, "buyer IP and device evidence: 12 months"],
  [/peninjauan penipuan: 2 tahun setelah kasusnya ditutup/u, "fraud review records: 2 years after closing"],
  [/Niat checkout[^:]*: 30 hari/u, "unfinished checkout intents: 30 days"],
  [/Log aplikasi di server: 30 hari/u, "app logs: 30 days"],
  [/belum diverifikasi: dihapus 7 hari/u, "unverified signups: 7 days"],
  [/Log keamanan[^:]*: 90 hari/u, "security logs: 90 days"],
] as const;
for (const [pattern, label] of retention) assert.match(privacy, pattern, `retention stated: ${label}`);
assert.equal(SECURITY_LOG_RETENTION_DAYS, 90, "the 90 days the policy states are what the daily job removes after");
assert.ok(privacy.includes(OWNER_INPUTS.veraChatRetention), "Vera chat retention is a placeholder until the owner decides");
assert.ok(privacy.includes(OWNER_INPUTS.consentRecordRetention), "consent record retention is a placeholder until the owner decides");
assert.equal(SESSION_MAX_AGE_SECONDS / 86_400, 7);
assert.match(privacy, /Aktif sampai 7 hari/u, "the sign-in cookie age matches SESSION_MAX_AGE_SECONDS");
assert.equal(DEVICE_COOKIE_MAX_AGE_SECONDS / 86_400, 365);
assert.match(privacy, /Berlaku 1 tahun/u, "the device cookie age matches DEVICE_COOKIE_MAX_AGE_SECONDS");
assert.match(privacy, /Tautan verifikasinya berlaku 24 jam/u);
pass("the retention periods and cookie ages stated are the owner's decisions and match the code");

for (const processor of ["Vercel", "Neon", "OpenAI"]) assert.ok(privacy.includes(processor));
assert.match(terms, /Syarat Pembelian/u, "the terms point to the purchase terms");
assert.match(terms, /jawaban Vera[^.]*keliru|bisa keliru/iu, "the terms say AI output may be wrong");
assert.match(terms, /hukum Republik Indonesia/u);
assert.ok(terms.includes(OWNER_INPUTS.disputeCity), "the terms name the dispute city through the owner input");
assert.match(terms, /menangguhkan atau menutup akunmu/u, "the terms cover suspension");
assert.match(terms, /Batas tanggung jawab/u);
assert.match(terms, /hanya untuk siswa/u, "only students register themselves");
assert.match(terms, /mencentang kotak/u, "the age box is part of the account rules");
pass("the terms cover accounts, use, materials, AI output, suspension, liability, law and disputes, and point to the purchase terms");

// ---- Voice: PTN Pro, no implementation words --------------------------------------------------
for (const [name, document] of ALL) {
  const text = documentText(document);
  assert.equal(/vecalss/iu.test(text), false, `${name} says PTN Pro, never Vecalss`);
  assert.match(text, /PTN Pro/u);
  for (const marker of [/\bv\d+\b/iu, /\bversi \d/iu, /\bUUID\b/u, /\bUTF-8\b/u, /\bAPI\b/u, /\bMIME\b/u, /\bbcrypt\b/iu, /\bHMAC\b/u, /\bhash\b/iu, /\btoken\b/iu]) {
    assert.equal(marker.test(text), false, `${name} shows an implementation word to readers: ${marker}`);
  }
  assert.equal(/—|–/u.test(text), false, `${name} uses no dash as punctuation`);
  assert.equal(/"/u.test(text), false, `${name} uses typographic quotes only`);
}
pass("both pages say PTN Pro and show no implementation words");

// ---- Pages and footer ------------------------------------------------------------------------
const privacyPage = read("app/kebijakan-privasi/page.tsx");
const termsPage = read("app/syarat-ketentuan/page.tsx");
assert.match(privacyPage, /getPrivacyPolicy\(\)/u);
assert.match(termsPage, /getTermsOfService\(\)/u);
const footer = read("modules/home/components/home-footer.tsx");
for (const href of ["/kebijakan-privasi", "/syarat-ketentuan", "/syarat-pembelian"]) {
  assert.ok(footer.includes(`href: "${href}"`), `the footer links to ${href}`);
}
assert.match(read("modules/pricing/PurchaseTermsPageModule.tsx"), /<HomeFooter \/>/u, "the purchase terms page carries the footer too");
assert.match(read("modules/legal/LegalPageModule.tsx"), /<HomeFooter \/>/u, "the legal pages carry the footer");
assert.match(read("modules/legal/LegalPageModule.tsx"), /document\.status === "draft"/u, "a draft says it is a draft");
pass("both pages render the current version, and the footer links to all three legal pages");

process.stdout.write("legal documents: all checks passed\n");
