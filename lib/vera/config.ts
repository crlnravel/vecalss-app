/**
 * Vera settings that both the server and the client read. Nothing here is
 * secret; the model id, prices and API key stay in server-only modules.
 */

export const VERA_TIME_ZONE = "Asia/Jakarta";

export const VERA_EFFORT_IDS = ["cepat", "seimbang", "mendalam"] as const;

export type VeraEffortId = (typeof VERA_EFFORT_IDS)[number];

/**
 * Thinking levels. `maxOutputTokens` caps every model step. The credit
 * figures are the reservation and the per-answer ceiling used by the ledger.
 */
export const VERA_EFFORTS = {
  cepat: {
    label: "Cepat",
    hint: "Jawaban singkat dengan sedikit berpikir. Paling hemat kredit.",
    openaiReasoningEffort: "low",
    maxOutputTokens: 1_500,
    reserveCredits: 2,
    ceilingCredits: 4,
  },
  seimbang: {
    label: "Seimbang",
    hint: "Cocok untuk sebagian besar pertanyaan.",
    openaiReasoningEffort: "medium",
    maxOutputTokens: 3_000,
    reserveCredits: 3,
    ceilingCredits: 6,
  },
  mendalam: {
    label: "Mendalam",
    hint: "Penjelasan lebih lengkap. Memakai lebih banyak kredit.",
    openaiReasoningEffort: "high",
    maxOutputTokens: 6_000,
    reserveCredits: 5,
    ceilingCredits: 10,
  },
} as const satisfies Record<VeraEffortId, unknown>;

/** From the product spec. The ledger (T3) enforces these; 1 credit = USD 0.00235. */
export const VERA_LIMITS = {
  day: { softCredits: 10, hardCredits: 15 },
  week: { softCredits: 70, hardCredits: 80 },
  month: { hardCredits: 300 },
  burstPerMinute: 5,
  concurrentAnswers: 1,
  spendCapMicroUsd: 700_000,
  microUsdPerCredit: 2_350,
  maxSteps: 5,
  maxInputTokensPerStep: 16_000,
  /** Most tool output a single step can add to the next step's input. Each reader's output is bounded well below this. */
  maxToolOutputTokensPerStep: 8_000,
  maxMessageChars: 4_000,
} as const;

export const VERA_CONVERSATION_TITLE = "Sesi baru";
