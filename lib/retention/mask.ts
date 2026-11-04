/**
 * Masking for places that list or summarize payment evidence. The raw address
 * and the full email stay on the owner's order page and in the dispute export;
 * lists, case pages, audit summaries and logs show only these shortened forms.
 */

/** 203.0.113.9 becomes 203.0.*.*; an IPv6 address keeps its first two groups. */
function maskIp(value: string | null | undefined) {
  const ip = value?.trim();
  if (!ip) return null;
  if (ip.includes(":")) return `${ip.split(":").filter(Boolean).slice(0, 2).join(":")}:****`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.*` : "*";
}

/** budi.santoso@mail.com becomes bu***@m***.com. */
function maskEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return `${email.slice(0, Math.min(2, at))}***@${domain.slice(0, 1)}***${dot > 0 ? domain.slice(dot) : ""}`;
}

/** Audit rows that belong to the payment evidence, whose address the general audit page masks. */
function isPaymentAuditRow(row: { action: string; targetType: string | null }) {
  return (
    row.action.startsWith("payment.")
    || row.action.startsWith("dispute.")
    || row.action.startsWith("refund.")
    || ["checkout_intent", "payment_event", "payment_order"].includes(row.targetType ?? "")
  );
}

export { isPaymentAuditRow, maskEmail, maskIp };
