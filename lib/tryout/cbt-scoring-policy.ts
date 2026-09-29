/**
 * Scoring policies for the CBT-only Tryout flow.
 *
 * A policy is copied into the immutable assessment release.  The release,
 * rather than the current Bank Soal row, is the only input used to score an
 * attempt.  IRT here is a deterministic fixed-order 2PL estimate intended
 * for an internal CBT index; it is not an official UTBK/SNBT scale.
 */

export const CBT_FIXED_POINTS_METHOD = "fixed_points" as const;
export const CBT_IRT_2PL_METHOD = "irt_2pl" as const;
export const CBT_IRT_MODEL_VERSION = "irt-2pl-cbt-v1" as const;
export const CBT_IRT_ESTIMATOR_VERSION = "bounded-map-v1" as const;
export const CBT_IRT_NORMALIZATION_VERSION = "logistic-0-100-v1" as const;
export const CBT_IRT_CALIBRATION_REQUIRED_MESSAGE = "Kalibrasi IRT untuk semua soal belum tersedia. Pilih Poin tetap untuk menerbitkan Tryout.";

const MIN_IRT_ABILITY = -4;
const MAX_IRT_ABILITY = 4;
const DEFAULT_IRT_PRIOR_VARIANCE = 1;
const DEFAULT_IRT_MAX_ITERATIONS = 12;

type CbtFixedPointsConfig = {
  correctAnswerPoints: number;
  method: typeof CBT_FIXED_POINTS_METHOD;
  unansweredPoints: number;
  wrongAnswerPoints: number;
};

type CbtIrtItemParameter = {
  a: number;
  b: number;
  itemId: string;
};

type CbtIrt2plConfig = {
  estimatorVersion: typeof CBT_IRT_ESTIMATOR_VERSION;
  itemParameters: CbtIrtItemParameter[];
  method: typeof CBT_IRT_2PL_METHOD;
  modelVersion: typeof CBT_IRT_MODEL_VERSION;
  normalizationVersion: typeof CBT_IRT_NORMALIZATION_VERSION;
};

type CbtScoringConfig = CbtFixedPointsConfig | CbtIrt2plConfig;

const DEFAULT_CBT_SCORING_CONFIG: CbtFixedPointsConfig = {
  correctAnswerPoints: 1,
  method: CBT_FIXED_POINTS_METHOD,
  unansweredPoints: 0,
  wrongAnswerPoints: 0,
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function finite(value: unknown, fallback?: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  throw new Error("Nilai scoring harus berupa angka finite.");
}

function assertPointValue(value: number, label: string) {
  if (value < -100 || value > 100) throw new Error(`${label} harus berada di antara -100 dan 100.`);
}

function parseFixedPoints(value: RecordValue): CbtFixedPointsConfig {
  const correctAnswerPoints = finite(value.correctAnswerPoints ?? value.correctPoints, 1);
  const wrongAnswerPoints = finite(value.wrongAnswerPoints ?? value.wrongPoints, 0);
  const unansweredPoints = finite(value.unansweredPoints ?? value.unanswered, 0);
  assertPointValue(correctAnswerPoints, "Poin jawaban benar");
  assertPointValue(wrongAnswerPoints, "Poin jawaban salah");
  assertPointValue(unansweredPoints, "Poin tidak dijawab");
  return {
    correctAnswerPoints,
    method: CBT_FIXED_POINTS_METHOD,
    unansweredPoints,
    wrongAnswerPoints,
  };
}

function parseIrtParameters(value: unknown): CbtIrtItemParameter[] {
  if (!Array.isArray(value)) throw new Error("Parameter IRT CBT harus berupa daftar.");
  const parameters = value.map((entry, index) => {
    const record = asRecord(entry);
    const itemId = typeof record?.itemId === "string" ? record.itemId.trim() : "";
    const a = finite(record?.a);
    const b = finite(record?.b);
    if (!itemId) throw new Error(`Parameter IRT ke-${index + 1} tidak memiliki itemId.`);
    if (a <= 0 || a > 4) throw new Error(`Parameter diskriminasi IRT untuk ${itemId} harus lebih besar dari 0 dan maksimal 4.`);
    if (b < -6 || b > 6) throw new Error(`Parameter kesulitan IRT untuk ${itemId} harus berada di antara -6 dan 6.`);
    return { a, b, itemId };
  });
  if (new Set(parameters.map((parameter) => parameter.itemId)).size !== parameters.length) throw new Error("Item IRT tidak boleh duplikat.");
  return parameters;
}

function parseIrt(value: RecordValue, itemIds?: readonly string[]): CbtIrt2plConfig {
  const modelVersion = value.modelVersion ?? CBT_IRT_MODEL_VERSION;
  const estimatorVersion = value.estimatorVersion ?? CBT_IRT_ESTIMATOR_VERSION;
  const normalizationVersion = value.normalizationVersion ?? CBT_IRT_NORMALIZATION_VERSION;
  if (modelVersion !== CBT_IRT_MODEL_VERSION) throw new Error(`Model IRT tidak didukung: ${String(modelVersion)}.`);
  if (estimatorVersion !== CBT_IRT_ESTIMATOR_VERSION) throw new Error(`Estimator IRT tidak didukung: ${String(estimatorVersion)}.`);
  if (normalizationVersion !== CBT_IRT_NORMALIZATION_VERSION) throw new Error(`Normalisasi IRT tidak didukung: ${String(normalizationVersion)}.`);
  const rawParameters = value.itemParameters ?? value.items;
  // A draft may select IRT before all Bank Soal calibrations are available.
  // Release validation supplies itemIds and therefore fails closed until the
  // complete parameter set has been materialized into the release payload.
  const itemParameters = rawParameters === undefined && !itemIds ? [] : parseIrtParameters(rawParameters);
  if (itemIds) {
    const expected = [...new Set(itemIds)];
    const actual = itemParameters.map((parameter) => parameter.itemId);
    if (expected.length !== actual.length || expected.some((id) => !actual.includes(id))) {
      throw new Error("Parameter IRT harus mencakup tepat seluruh soal dalam urutan CBT.");
    }
  }
  return {
    estimatorVersion,
    itemParameters,
    method: CBT_IRT_2PL_METHOD,
    modelVersion,
    normalizationVersion,
  };
}

/** Normalize legacy fixed-point aliases and validate a release-ready policy. */
function canonicalizeCbtScoringConfig(value: unknown, itemIds?: readonly string[]): CbtScoringConfig {
  const record = asRecord(value);
  if (!record) return { ...DEFAULT_CBT_SCORING_CONFIG };
  const method = record.method ?? (record.type === "irt" ? CBT_IRT_2PL_METHOD : CBT_FIXED_POINTS_METHOD);
  if (method === CBT_FIXED_POINTS_METHOD || method === "sum_item_points") return parseFixedPoints(record);
  if (method === CBT_IRT_2PL_METHOD) return parseIrt(record, itemIds);
  throw new Error(`Metode penilaian CBT tidak didukung: ${String(method)}.`);
}

function logistic(value: number) {
  return value >= 0
    ? 1 / (1 + Math.exp(-value))
    : Math.exp(value) / (1 + Math.exp(value));
}

function normalizeIrtAbility(ability: number) {
  if (!Number.isFinite(ability)) throw new Error("Estimasi kemampuan IRT harus berupa angka finite.");
  return Math.round(Math.min(100, Math.max(0, logistic(ability) * 100)) * 100) / 100;
}

type IrtResponse = { itemId: string; isCorrect: boolean };

/**
 * Estimate a fixed-order 2PL ability with a bounded MAP/Newton update.
 * Responses are deliberately processed in the supplied release order so the
 * same frozen answer set always produces the same score.
 */
function scoreFixedOrderIrt({
  initialAbility = 0,
  itemParameters,
  maxIterations = DEFAULT_IRT_MAX_ITERATIONS,
  priorVariance = DEFAULT_IRT_PRIOR_VARIANCE,
  responses,
}: {
  initialAbility?: number;
  itemParameters: readonly CbtIrtItemParameter[];
  maxIterations?: number;
  priorVariance?: number;
  responses: readonly IrtResponse[];
}) {
  if (!Number.isFinite(initialAbility) || !Number.isFinite(priorVariance) || priorVariance <= 0) throw new Error("Konfigurasi prior IRT tidak valid.");
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 50) throw new Error("Jumlah iterasi IRT tidak valid.");
  const parameterById = new Map(itemParameters.map((parameter) => [parameter.itemId, parameter]));
  if (responses.some((response) => !parameterById.has(response.itemId))) throw new Error("Jawaban IRT harus berasal dari soal yang dibekukan.");
  let ability = Math.min(MAX_IRT_ABILITY, Math.max(MIN_IRT_ABILITY, initialAbility));
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let gradient = -ability / priorVariance;
    let curvature = -1 / priorVariance;
    for (const response of responses) {
      const parameter = parameterById.get(response.itemId)!;
      const probability = logistic(parameter.a * (ability - parameter.b));
      const information = parameter.a * parameter.a * probability * (1 - probability);
      gradient += parameter.a * ((response.isCorrect ? 1 : 0) - probability);
      curvature -= information;
    }
    if (Math.abs(gradient) < 1e-8 || curvature === 0) break;
    const next = Math.min(MAX_IRT_ABILITY, Math.max(MIN_IRT_ABILITY, ability - gradient / curvature));
    if (Math.abs(next - ability) < 1e-8) {
      ability = next;
      break;
    }
    ability = next;
  }
  return {
    ability,
    normalizedScore: normalizeIrtAbility(ability),
    scoringVersion: `${CBT_IRT_MODEL_VERSION}:${CBT_IRT_ESTIMATOR_VERSION}:${CBT_IRT_NORMALIZATION_VERSION}`,
  };
}

export {
  canonicalizeCbtScoringConfig,
  normalizeIrtAbility,
  scoreFixedOrderIrt,
};
export type { CbtFixedPointsConfig, CbtIrt2plConfig, CbtIrtItemParameter, CbtScoringConfig, IrtResponse };
