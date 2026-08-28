import assert from "node:assert/strict";

import {
  MOCK_STUDENT_EMAILS,
  MOCK_USAGE_FEATURES,
  MOCK_USAGE_NAMESPACE,
  buildMockAdmissionRows,
  buildMockUsageRows,
  parseSeedArgs,
} from "../prisma/seed-ai-usage.mjs";

const now = new Date("2026-08-29T05:00:00.000Z");
const students = MOCK_STUDENT_EMAILS.map((email, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  email,
}));
const requests = buildMockUsageRows({ now, students });
const admissions = buildMockAdmissionRows({ now, students });

assert.ok(requests.length >= students.length * MOCK_USAGE_FEATURES.length * 3);
assert.equal(new Set(requests.map((request) => request.clientRequestId)).size, requests.length);
assert.ok(requests.every((request) => request.clientRequestId.startsWith(`${MOCK_USAGE_NAMESPACE}:`)));
assert.ok(requests.every((request) => request.requestFingerprint.length === 64));
assert.ok(requests.every((request) => request.inputTokens > 0 && request.outputTokens > 0));
assert.ok(requests.some((request) => request.status === "fallback"));
assert.ok(requests.some((request) => request.status === "failed"));
assert.ok(requests.every((request) => !Object.hasOwn(request, "contentMarkdown")));
assert.ok(requests.every((request) => !Object.hasOwn(request, "contentEnvelope")));
assert.ok(requests.every((request) => request.createdAt <= now));
assert.ok(requests.every((request) => request.createdAt >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)));

for (const feature of MOCK_USAGE_FEATURES) {
  const featureStudents = new Set(requests.filter((request) => request.featureKey === feature.featureKey).map((request) => request.studentId));
  assert.ok(featureStudents.size >= 5, `${feature.featureKey} should satisfy the privacy cohort threshold`);
  const recentFeatureStudents = new Set(
    requests
      .filter((request) => request.featureKey === feature.featureKey && request.createdAt >= new Date(now.getTime() - 24 * 60 * 60 * 1000))
      .map((request) => request.studentId),
  );
  assert.ok(recentFeatureStudents.size >= 5, `${feature.featureKey} should be visible in today's dashboard range`);
}

assert.ok(admissions.length >= students.length);
assert.ok(admissions.every((admission) => admission.policyBundleVersion === "mock-admin-ai-usage-v1"));
assert.ok(admissions.every((admission) => admission.localQuotaDate instanceof Date));
assert.ok(admissions.some((admission) => admission.reason === "quota"));
assert.ok(admissions.some((admission) => admission.reason === "burst"));
assert.deepEqual(parseSeedArgs(["--dry-run"]), { dryRun: true, help: false });
assert.deepEqual(parseSeedArgs(["--", "--dry-run"]), { dryRun: true, help: false });
assert.deepEqual(parseSeedArgs(["--help"]), { dryRun: false, help: true });
assert.throws(() => parseSeedArgs(["--apply"]), /Unknown option/);

console.log("admin AI usage seed fixture checks passed");
