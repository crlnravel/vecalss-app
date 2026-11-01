import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_AVATAR_BYTES,
  validateKaptenAvatarDataUrl,
} from "@/modules/mentor/avatar-validation";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

// 1. Clearing avatar
assert.deepEqual(validateKaptenAvatarDataUrl(null), {
  avatarUrl: null,
  ok: true,
});
assert.deepEqual(validateKaptenAvatarDataUrl("   "), {
  avatarUrl: null,
  ok: true,
});

// 2. Valid PNG, JPEG, GIF, WebP magic headers
const validPng = toDataUrl(
  "image/png",
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
);
const validJpeg = toDataUrl(
  "image/jpeg",
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
);
const validGif = toDataUrl(
  "image/gif",
  new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]),
);
const validWebp = toDataUrl(
  "image/webp",
  new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]),
);

for (const sample of [validPng, validJpeg, validGif, validWebp]) {
  const result = validateKaptenAvatarDataUrl(sample);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.avatarUrl, sample);
  }
}

// 3. Reject spoofed magic bytes, unsupported MIME types, non-data URLs, and oversized payloads
const spoofedPng = toDataUrl(
  "image/png",
  new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e]),
);
const svgDataUrl = toDataUrl(
  "image/svg+xml",
  new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0x3e]),
);
const oversizedPngBytes = new Uint8Array(MAX_AVATAR_BYTES + 16);
oversizedPngBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
const oversizedPng = toDataUrl("image/png", oversizedPngBytes);

for (const invalidSample of [
  spoofedPng,
  svgDataUrl,
  oversizedPng,
  "https://example.com/avatar.png",
  "data:image/png;base64,not-valid-base64!",
  12345,
]) {
  const result = validateKaptenAvatarDataUrl(invalidSample);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.field, "avatarUrl");
  }
}

// 4. Verify integration across mentor settings, auth session, and navbar account menu
const settingsTypes = read("modules/mentor/settings-types.ts");
const settingsActions = read("modules/mentor/settings-actions.ts");
const settingsModule = read("modules/mentor/KaptenSettingsPageModule.tsx");
const authTypes = read("lib/auth/types.ts");
const authSession = read("lib/auth/session.ts");
const accountMenu = read("modules/student/components/student-account-menu.tsx");

assert.ok(
  settingsTypes.includes("avatarUrl: string | null;"),
  "KaptenSettings must expose avatarUrl.",
);
assert.ok(
  settingsActions.includes("validateKaptenAvatarDataUrl"),
  "saveKaptenSettingsAction must validate avatarUrl on the server.",
);
assert.ok(
  settingsActions.includes("data: { avatarUrl: validatedAvatarUrl, fullName: profileName }"),
  "saveKaptenSettingsAction must persist validated avatarUrl alongside fullName.",
);
assert.ok(
  settingsModule.includes('id="kapten-profile-avatar"'),
  "KaptenSettingsPageModule must render the profile photo file input.",
);
assert.ok(
  settingsModule.includes("avatarUrl !== savedSettings.avatarUrl"),
  "KaptenSettingsPageModule must track avatar changes in dirty state.",
);
assert.ok(
  settingsModule.includes("saveKaptenSettingsAction({ avatarUrl, profileName })"),
  "KaptenSettingsPageModule must submit avatarUrl with profileName.",
);
assert.ok(
  !settingsModule.includes("Hapus foto"),
  "KaptenSettingsPageModule must not include a separate Hapus foto button.",
);
assert.ok(
  !settingsModule.includes('avatarUrl ? "Ganti foto" : "Pilih foto"'),
  "KaptenSettingsPageModule must not include a separate Ganti foto button.",
);
assert.ok(
  settingsModule.includes('onClick={() => avatarInputRef.current?.click()}'),
  "KaptenSettingsPageModule must trigger the file input from the avatar camera overlay.",
);
assert.ok(
  authTypes.includes("avatarUrl?: string | null;"),
  "AuthenticatedUser must carry optional avatarUrl.",
);
assert.ok(
  authSession.includes("avatarUrl: session.user.avatarUrl"),
  "Session context mapping must include user.avatarUrl.",
);
assert.ok(
  accountMenu.includes("src={session.user.avatarUrl}"),
  "StudentAccountMenu must display session.user.avatarUrl when present.",
);

console.log("PASS mentor-settings-avatar checks");
