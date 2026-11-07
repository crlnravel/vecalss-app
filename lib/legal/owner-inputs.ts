/**
 * Facts about the business that only the owner can supply. They are not known
 * yet, so each one is a visible placeholder in square brackets, and this is the
 * only file that holds them: the privacy policy and the terms of service read
 * every one of these values from here.
 *
 * To fill one in, replace the bracketed text below with the real value. A legal
 * document cannot be marked "approved" (lib/legal/index.ts) while any
 * placeholder is still in its text, and signup stays closed until both are
 * approved (lib/registration/switch.ts).
 */
const OWNER_INPUTS = {
  /** What the legal pages say about analytics, or "kami tidak memakai analitik". */
  analyticsNote: "[keterangan penggunaan analitik]",
  /** Date from which an approved version applies. */
  effectiveDate: "[tanggal berlaku]",
  /** Court or city that settles disputes when talking it through fails. */
  disputeCity: "[kota penyelesaian sengketa]",
  /** Registered address of the business. */
  legalEntityAddress: "[alamat badan usaha]",
  /** Registered name of the business that runs PTN Pro. */
  legalEntityName: "[nama badan usaha]",
  /** Email for privacy questions and data requests. */
  privacyContactEmail: "[email kontak privasi]",
  /** Where the Redis provider's servers are. */
  redisRegions: "[lokasi server Redis]",
  /** Who provides Redis. */
  redisProvider: "[penyedia Redis]",
  /** How long we answer a privacy or data request in. */
  responseTime: "[batas waktu menjawab permintaan]",
  /** Email for ordinary support. */
  supportContactEmail: "[email kontak bantuan]",
  /** WhatsApp number for support, if one is used. */
  supportWhatsapp: "[nomor WhatsApp bantuan]",
  /** How long a stored Vera conversation is kept. */
  veraChatRetention: "[masa simpan riwayat chat Vera]",
  /** How long the record of the age and agreement box is kept. */
  consentRecordRetention: "[masa simpan catatan persetujuan]",
} as const;

type OwnerInputName = keyof typeof OWNER_INPUTS;

/** Every placeholder value, for checks that a text still contains one. */
const OWNER_INPUT_VALUES: readonly string[] = Object.values(OWNER_INPUTS);

/**
 * Whether a text still has a placeholder in it: any owner input, or any other
 * bracketed note that starts with a letter ("[nama ...]"). The legal text uses
 * no square brackets for any other purpose.
 */
function containsPlaceholder(text: string) {
  return OWNER_INPUT_VALUES.some((value) => text.includes(value)) || /\[[A-Za-z][^\]]*\]/u.test(text);
}

export { OWNER_INPUTS, OWNER_INPUT_VALUES, containsPlaceholder };
export type { OwnerInputName };
