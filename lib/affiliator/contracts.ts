const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

function requirePurchaseText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} must be between 1 and ${maxLength} characters.`);
  }

  return normalized;
}

function requirePurchaseUuid(value: unknown, field: string) {
  const normalized = requirePurchaseText(value, field, 80);
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${field} must be a UUID.`);
  }

  return normalized;
}

export { normalizeReferralCode, requirePurchaseText, requirePurchaseUuid };
