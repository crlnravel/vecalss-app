import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [enrollment, actions, inviteRoute, inviteForm, reissueRoute, paths, studentPage, studentModule, kaptenPage, rootLayout, authShell, authActions, authService, authSession, rateLimit, handoffService, config] = await Promise.all([
  readFile(resolve(root, "lib/admin/enrollment/service.ts"), "utf8"),
  readFile(resolve(root, "modules/admin/actions.ts"), "utf8"),
  readFile(resolve(root, "app/api/invite/[token]/route.ts"), "utf8"),
  readFile(resolve(root, "modules/auth/components/invite-password-setup-form.tsx"), "utf8"),
  readFile(resolve(root, "app/api/admin/handoffs/[handoffId]/reissue/route.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/paths.ts"), "utf8"),
  readFile(resolve(root, "app/admin/enrollment/page.tsx"), "utf8"),
  readFile(resolve(root, "modules/admin/EnrollmentPageModule.tsx"), "utf8"),
  readFile(resolve(root, "app/admin/kapten/page.tsx"), "utf8"),
  readFile(resolve(root, "app/layout.tsx"), "utf8"),
  readFile(resolve(root, "modules/auth/components/auth-shell.tsx"), "utf8"),
  readFile(resolve(root, "modules/auth/actions.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/service.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/session.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/handoffs/rate-limit.ts"), "utf8"),
  readFile(resolve(root, "lib/admin/handoffs/service.ts"), "utf8"),
  readFile(resolve(root, "lib/config.ts"), "utf8"),
]);
const kaptenDirectoryModule = await readFile(resolve(root, "modules/admin/components/kapten-directory-table.tsx"), "utf8");

assert.match(enrollment, /createStudentEnrollment/);
assert.match(enrollment, /createKaptenEnrollment/);
assert.match(enrollment, /createAffiliatorEnrollment/);
assert.match(enrollment, /roleNameForEnrollmentRole/);
assert.match(enrollment, /RoleName\.affiliator/);
assert.match(enrollment, /affiliatorProfile\.create/);
assert.match(enrollment, /createEnrollmentHandoff/);
assert.match(enrollment, /releaseEnrollmentHandoff/);
assert.match(enrollment, /assertNoExistingEmail/);
assert.match(enrollment, /nextStatus === UserStatus\.disabled/);
assert.match(enrollment, /invalid_status_transition/);
assert.match(enrollment, /passwordUpdatedAt: now/);
assert.match(enrollment, /revokeOpenEnrollmentHandoffs/);
assert.match(enrollment, /authSession\.updateMany/);
assert.match(actions, /confirmed: isConfirmed\(formData, "deactivate"\)/);
assert.match(actions, /value === EnrollmentHandoffMethod\.temporary_password/);
assert.match(actions, /reissueEnrollmentHandoff/);
assert.match(actions, /acknowledgeEnrollmentHandoff/);
assert.match(actions, /logEnrollmentCreationFailure\(error, "student"\)/);
assert.match(actions, /logEnrollmentCreationFailure\(error, "kapten"\)/);
assert.match(actions, /logEnrollmentCreationFailure\(error, "affiliator"\)/);
assert.match(actions, /admin\.enrollment\.delete_student\.failed/);
assert.match(actions, /admin\.enrollment\.bulk_status_update\.failed/);
assert.match(actions, /admin\.enrollment\.handoff_acknowledgement\.failed/);
assert.match(actions, /admin\.enrollment\.handoff_reissue\.failed/);
assert.match(inviteRoute, /Cache-Control.*no-store/);
assert.match(inviteRoute, /Referrer-Policy.*no-referrer/);
assert.match(inviteRoute, /consumeInviteRateLimit/);
assert.match(inviteRoute, /readBodyAtMost/);
assert.match(inviteRoute, /invalid_invite/);
assert.match(inviteRoute, /origin/);
assert.match(inviteRoute, /export function isSameOrigin/);
assert.match(inviteRoute, /loginAudience/);
assert.doesNotMatch(inviteRoute, /x-forwarded-for|x-real-ip/);
assert.match(inviteForm, /\/api\/invite\//);
assert.match(inviteForm, /referrerPolicy: "no-referrer"/);
assert.match(inviteForm, /cache: "no-store"/);
assert.doesNotMatch(inviteForm, /useActionState|completeEnrollmentInviteAction/);
assert.match(reissueRoute, /reissueEnrollmentHandoff/);
assert.match(reissueRoute, /Cache-Control.*no-store/);
assert.match(paths, /return "\/admin";/);
assert.match(studentPage, /EnrollmentHandoffStatus/);
assert.match(studentPage, /EnrollmentHandoffStatus\.expired/);
assert.match(kaptenPage, /RoleName\.tutor/);
assert.match(kaptenPage, /EnrollmentHandoffStatus\.expired/);
assert.match(rootLayout, /ConditionalSpeedInsights/);
assert.match(authShell, /\{description\}/);
assert.match(authActions, /changePasswordForUser\(session\.user\.id, session\.sessionId/);
assert.doesNotMatch(authActions, /completeEnrollmentInviteAction/);
assert.match(authService, /changePasswordForUser\(userId: string, sessionId: string/);
assert.match(authService, /must_change_password/);
assert.match(authService, /auth_sessions/);
assert.match(authService, /loginAudience/);
assert.match(authService, /createSessionIfUserStateMatches/);
assert.match(authService, /consumePasswordResetRateLimit/);
assert.match(authService, /handoff\.expires_at === null/);
assert.match(authService, /expiresAt: null/);
assert.match(authSession, /createSessionIfUserStateMatches/);
assert.match(authSession, /expectedPasswordUpdatedAt/);
assert.match(authSession, /tx\.authSession\.create/);
assert.match(rateLimit, /getTrustedInviteIdentity/);
assert.doesNotMatch(rateLimit, /x-forwarded-for|x-real-ip/);
assert.match(rateLimit, /MAX_TRACKED_KEYS/);
assert.match(rateLimit, /consumePasswordResetRateLimit/);
assert.doesNotMatch(rateLimit, /oldestKey|lastSeenAt/);
assert.match(config, /parsed\.pathname !==/);
assert.match(config, /pathless absolute HTTP\(S\) origin/);
assert.match(handoffService, /worker\/scheduler boundary/);
assert.match(handoffService, /passwordResetToken\.updateMany/);
assert.match(studentModule, /studentStatusTone|status === "disabled"/);
assert.match(kaptenDirectoryModule, /status === "disabled"/);

const releaseServiceStart = handoffService.indexOf("async function releaseEnrollmentHandoff");
const releaseServiceEnd = handoffService.indexOf("async function revokeOpenEnrollmentHandoffs");
const releaseService = handoffService.slice(releaseServiceStart, releaseServiceEnd);
const nullableExpiryIndex = releaseService.indexOf("handoff.expires_at === null");
const decryptIndex = releaseService.indexOf("openEnrollmentHandoffSecret");
assert.ok(nullableExpiryIndex >= 0 && nullableExpiryIndex < decryptIndex);
assert.match(releaseService, /enrollmentHandoff\.updateMany/);
assert.match(releaseService, /status: EnrollmentHandoffStatus\.pending/);
assert.match(releaseService, /secretEnvelope: Prisma\.DbNull/);
assert.match(releaseService, /reason: handoff\.expires_at === null/);

const resetServiceStart = authService.indexOf("async function completePasswordReset");
const resetServiceEnd = authService.indexOf("async function changePasswordForUser");
const resetService = authService.slice(resetServiceStart, resetServiceEnd);
const candidateIndex = resetService.indexOf("const candidate");
const claimIndex = resetService.indexOf("const claimed");
const hashIndex = resetService.indexOf("const passwordHash = await hashPassword(nextPassword)");
assert.ok(candidateIndex >= 0 && candidateIndex < claimIndex);
assert.ok(claimIndex >= 0 && claimIndex < hashIndex);

const inviteServiceStart = authService.indexOf("async function completeEnrollmentInvite");
const inviteServiceEnd = authService.indexOf("async function getEnrollmentInviteStatus");
const inviteService = authService.slice(inviteServiceStart, inviteServiceEnd);
assert.match(inviteService, /handoff\.expires_at === null/);
assert.match(inviteService, /expiresAt: null/);
assert.match(authService, /Deployment follow-up \(intentionally not applied here\)/);

console.log("admin enrollment contract checks passed");
