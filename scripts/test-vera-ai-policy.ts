import {
  AI_POLICY_MIN_GROUP_SIZE,
  AI_POLICY_PROVIDER_GATE_STATE,
  AiPolicyError,
  adminCommandFingerprint,
  capabilitiesForSections,
  policyCapabilityForSection,
} from "@/lib/admin/ai-policy/contracts";
import {
  assertPreviewRange,
  defaultCompletePolicyConfig,
  parseCompletePolicyConfig,
} from "@/lib/admin/ai-policy/validation";
import { isCapabilityGranted } from "@/lib/vera-ai/policy";

let checks = 0;
function check(condition: boolean, message: string) {
  checks += 1;
  if (!condition) throw new Error(`FAIL vera-ai-policy: ${message}`);
}

function rejects(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    check(error instanceof AiPolicyError && error.code === code, `expected ${code}`);
    return;
  }
  throw new Error(`FAIL vera-ai-policy: expected ${code}`);
}

const base = defaultCompletePolicyConfig("fixture-policy", new Date("2026-08-26T00:00:00.000Z"));
check(base.providerGateState === AI_POLICY_PROVIDER_GATE_STATE, "provider gate remains open_blocked");
check(base.quotaConfig.maxProviderAttempts === 2, "provider attempts are exactly two");
check(base.reportConfig.minimumGroupSize >= AI_POLICY_MIN_GROUP_SIZE, "privacy group floor is immutable");
check(policyCapabilityForSection("quota") === "canManageAiPolicy", "quota maps to policy capability");
check(policyCapabilityForSection("settlement") === "canManageAiGovernance", "settlement maps to governance capability");
check(JSON.stringify(capabilitiesForSections(["quota", "settlement", "report"])) === JSON.stringify(["canManageAiGovernance", "canManageAiPolicy"]), "mixed union is complete and sorted");
check(isCapabilityGranted({ capability: "canManageAiPolicy", active: true, role: "ai_policy_operator" }), "policy operator can manage policy");
check(!isCapabilityGranted({ capability: "canManageAiGovernance", active: true, role: "ai_policy_operator" }), "policy operator cannot manage governance");
check(isCapabilityGranted({ capability: "canManageAiGovernance", active: true, role: "ai_governance_operator" }), "governance operator can manage governance");
check(!isCapabilityGranted({ capability: "canManageAiPolicy", active: false, role: "admin" }), "inactive capability is denied");

rejects(() => parseCompletePolicyConfig({ ...base, quotaConfig: { ...base.quotaConfig, maxProviderAttempts: 1 } }), "immutable_safety_floor");
rejects(() => parseCompletePolicyConfig({ ...base, quotaConfig: { ...base.quotaConfig, defaultDailyLimit: 999 } }), "policy_guardrail_violation");
rejects(() => parseCompletePolicyConfig({ ...base, providerGateState: "release_ready" }), "provider_gate_blocked");
rejects(() => parseCompletePolicyConfig({ ...base, retentionConfig: { ...base.retentionConfig, stageTtlHours: 6 } }), "policy_guardrail_violation");
rejects(() => parseCompletePolicyConfig({ ...base, reportConfig: { ...base.reportConfig, unexpected: true } }), "invalid_policy");
rejects(() => assertPreviewRange({ from: "2026-01-01", to: "2026-02-02", timezone: "Asia/Jakarta" }), "invalid_preview_range");
assertPreviewRange({ from: "2026-01-01", to: "2026-01-31", timezone: "Asia/Jakarta" });
const fingerprintA = adminCommandFingerprint({ operation: "ai_policy_preview", payload: { b: 2, a: "x\r\n" }, secret: "policy-test-secret" });
const fingerprintB = adminCommandFingerprint({ operation: "ai_policy_preview", payload: { a: "x\n", b: 2 }, secret: "policy-test-secret" });
check(fingerprintA === fingerprintB, "fingerprint normalizes object key order and line endings");
console.log(`PASS vera-ai-policy: ${checks} checks`);
