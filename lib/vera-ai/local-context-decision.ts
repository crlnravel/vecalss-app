import { canonicalJson, normalizeText, sha256Hex } from "./contracts";
import type { VeraContextKind } from "./context-tool-contracts";

export const VERA_LOCAL_DECISION_PROTOCOL = "respan_span01_lite" as const;
export const VERA_LOCAL_DECISION_COST_PROVENANCE = "respan_published_free_tier_v1" as const;
export const VERA_LOCAL_SHORTLIST_PER_KIND = 4 as const;
export const VERA_LOCAL_SHORTLIST_MAX = 12 as const;
export const VERA_LOCAL_PROMPT_MAX_CHARS = 2_000 as const;
export const VERA_LOCAL_PROMPT_MAX_BYTES = 2_000 as const;
export const VERA_LOCAL_BODY_MAX_BYTES = 4_096 as const;
export const VERA_LOCAL_QUESTION_MAX_BYTES = 600 as const;
export const VERA_LOCAL_FRAMING_MAX_BYTES = 320 as const;
export const VERA_LOCAL_METADATA_MAX_BYTES = 120 as const;

export type LocalContextCandidate = {
  key: string;
  kind: VeraContextKind;
  stableSourceId: string;
  title: string;
  topic: string | null;
  teaser?: string;
  releasedAt: string;
  versionDigest: string;
  releaseVersionHandle?: string;
  evidenceSegments?: string[];
  priorHint?: { citationKey: string; ordinal: number };
  priorHints?: Array<{ citationKey: string; ordinal: number }>;
};

function fold(value: string): string {
  return normalizeText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(value: string): string[] {
  return [...new Set(fold(value).split(/\s+/u).filter(Boolean))];
}

function hintsFor(candidate: LocalContextCandidate): Array<{ citationKey: string; ordinal: number }> {
  return [...(candidate.priorHints ?? []), ...(candidate.priorHint ? [candidate.priorHint] : [])]
    .filter((hint, index, hints) => hints.findIndex((other) => other.citationKey === hint.citationKey && other.ordinal === hint.ordinal) === index);
}

function priorReference(query: string): { kind: "citation" | "ordinal" | "sole"; value?: string | number } | null {
  const citation = /\[\^([A-Za-z0-9_-]{1,64})\]/u.exec(query)?.[1];
  if (citation) return { kind: "citation", value: citation };
  const ordinalText = /\b(?:sumber|nomor|ke)\s+(\d{1,2}|satu|dua|tiga|empat)\b/iu.exec(query)?.[1]?.toLocaleLowerCase("id-ID");
  if (ordinalText) {
    const ordinal = /^\d{1,2}$/u.test(ordinalText)
      ? Number(ordinalText)
      : ({ satu: 1, dua: 2, tiga: 3, empat: 4 } as const)[ordinalText as "satu" | "dua" | "tiga" | "empat"];
    return { kind: "ordinal", value: ordinal };
  }
  if (/\byang tadi\b/iu.test(query)) return { kind: "sole" };
  return null;
}

function priorReferenceTargets(query: string, candidates: readonly LocalContextCandidate[]): Set<string> | null {
  const reference = priorReference(query);
  if (!reference) return null;
  const matches = candidates.filter((candidate) => hintsFor(candidate).some((hint) => {
    if (reference.kind === "citation") return hint.citationKey === reference.value;
    if (reference.kind === "ordinal") return hint.ordinal === reference.value;
    return true;
  }));
  // A follow-up only names a source when the reference uniquely identifies
  // one currently reauthorized source. Missing, revoked, or ambiguous hints
  // deliberately score no candidate.
  if (matches.length !== 1) return new Set();
  return new Set([candidateIdentity(matches[0]!) ]);
}

function deterministicScore(query: string, candidate: LocalContextCandidate, priorTargets: Set<string> | null): number {
  const normalizedQuery = fold(query);
  const title = fold(candidate.title);
  const queryWords = words(query);
  const candidateWords = new Set(words(`${candidate.title} ${candidate.topic ?? ""}`));
  if (!normalizedQuery || queryWords.length === 0) return 0;
  if (priorTargets !== null) return priorTargets.has(candidateIdentity(candidate)) ? 1 : 0;
  if (title === normalizedQuery) return 1;
  if (title.startsWith(normalizedQuery)) return 0.9;
  const overlap = queryWords.filter((word) => candidateWords.has(word)).length;
  if (overlap === 0) return 0;
  return Number((overlap / queryWords.length).toFixed(6));
}

function stableCandidateOrder(left: LocalContextCandidate, right: LocalContextCandidate): number {
  const dateOrder = Date.parse(right.releasedAt) - Date.parse(left.releasedAt);
  return dateOrder || left.stableSourceId.localeCompare(right.stableSourceId);
}

function candidateIdentity(candidate: LocalContextCandidate): string {
  return `${candidate.kind}:${candidate.stableSourceId}`;
}

/**
 * Build the bounded request-local key map. Callers pass only metadata rows
 * returned by the phase-one registry; evidence is intentionally discarded.
 */
export function buildLocalCandidateShortlist(input: {
  candidates: readonly LocalContextCandidate[];
  query: string;
  priorHints?: readonly LocalContextCandidate[];
}): LocalContextCandidate[] {
  const eligible = [...input.candidates].filter((candidate) =>
    candidate.stableSourceId.trim()
    && candidate.title.trim()
    && candidate.versionDigest.trim()
    && Number.isFinite(Date.parse(candidate.releasedAt)));
  const merged = new Map<string, LocalContextCandidate>();
  for (const candidate of eligible) merged.set(candidateIdentity(candidate), { ...candidate });
  for (const hintCandidate of input.priorHints ?? []) {
    const identity = candidateIdentity(hintCandidate);
    const existing = merged.get(identity);
    const hintRows = hintsFor(hintCandidate);
    if (!existing) {
      merged.set(identity, { ...hintCandidate, priorHints: hintRows, evidenceSegments: undefined });
      continue;
    }
    existing.priorHints = [...hintsFor(existing), ...hintRows]
      .filter((hint, index, hints) => hints.findIndex((other) => other.citationKey === hint.citationKey && other.ordinal === hint.ordinal) === index);
  }

  const selected: LocalContextCandidate[] = [];
  const allRows = [...merged.values()];
  const targets = priorReferenceTargets(input.query, allRows);
  // An explicit citation/ordinal/follow-up with no unique reauthorized match
  // is evidence-limited. Do not let ordinary lexical or recent candidates
  // turn an ambiguous reference into an implicit selection.
  if (targets?.size === 0) return [];
  if (targets?.size === 1) {
    const [identity] = targets;
    const target = allRows.find((candidate) => candidateIdentity(candidate) === identity);
    return target ? [{ ...target, key: "cand_01", evidenceSegments: undefined }] : [];
  }
  const recentSlots: LocalContextCandidate[] = [];
  const lexicalRows: LocalContextCandidate[] = [];
  for (const kind of ["materi", "kuis", "tryout"] as const) {
    const rows = allRows.filter((candidate) => candidate.kind === kind);
    const lexical = rows
      .map((candidate) => ({ candidate, score: deterministicScore(input.query, candidate, targets) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || stableCandidateOrder(a.candidate, b.candidate))
      .slice(0, 3)
      .map((entry) => entry.candidate);
    lexicalRows.push(...lexical);
    const recent = rows.filter((candidate) => !lexical.some((row) => candidateIdentity(row) === candidateIdentity(candidate)))
      .sort(stableCandidateOrder)
      .slice(0, 1);
    recentSlots.push(...recent);
  }

  const selectedIdentities = new Set<string>();
  const appendUnique = (rows: readonly LocalContextCandidate[]) => {
    for (const row of rows) {
      const identity = candidateIdentity(row);
      if (selectedIdentities.has(identity)) continue;
      selectedIdentities.add(identity);
      selected.push(row);
    }
  };
  // A uniquely named reauthorized prior source must survive the combined
  // cap. The rest of the shortlist uses lexical rank, recent slots, then the
  // remaining bounded committed-source hints.
  appendUnique(targets ? allRows.filter((candidate) => targets.has(candidateIdentity(candidate))) : []);
  appendUnique(lexicalRows);
  appendUnique(allRows.filter((candidate) => hintsFor(candidate).length > 0));
  appendUnique(recentSlots);

  return selected.slice(0, VERA_LOCAL_SHORTLIST_MAX).map((candidate, index) => ({
    ...candidate,
    key: `cand_${String(index + 1).padStart(2, "0")}`,
    evidenceSegments: undefined,
  }));
}

export type LocalOutboundSource = {
  citationKey: string;
  kind: VeraContextKind;
  evidenceSegments: readonly string[];
};

export type VeraOpenRouterFreeBody = {
  model: "openrouter/free";
  messages: [{ role: "user"; content: string }];
  provider: { allow_fallbacks: false; data_collection: "allow" };
  max_tokens: number;
  stream: true;
};

export type LocalOutboundPayload = {
  prompt: string;
  body: VeraOpenRouterFreeBody;
  bytes: Uint8Array;
  digest: string;
  retainedSources: LocalOutboundSource[];
};

/** Rebuild the prepared body only from bytes already encrypted on attempt 2. */
export function readLocalOutboundPayload(input: {
  bytes: Uint8Array;
  committedSources: readonly LocalOutboundSource[];
}): LocalOutboundPayload {
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > VERA_LOCAL_BODY_MAX_BYTES) throw new Error("local_context_payload_invalid");
  let text: string;
  let parsed: unknown;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
    parsed = JSON.parse(text) as unknown;
    if (JSON.stringify(parsed) !== text) throw new Error("noncanonical_json");
  } catch {
    throw new Error("local_context_payload_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("local_context_payload_invalid");
  const body = parsed as VeraOpenRouterFreeBody;
  if (Object.keys(body).sort().join(",") !== "max_tokens,messages,model,provider,stream"
    || body.model !== "openrouter/free"
    || body.stream !== true
    || !Number.isSafeInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 1_024
    || !body.provider || Object.keys(body.provider).sort().join(",") !== "allow_fallbacks,data_collection"
    || body.provider.allow_fallbacks !== false || body.provider.data_collection !== "allow"
    || !Array.isArray(body.messages) || body.messages.length !== 1
    || body.messages[0]?.role !== "user" || typeof body.messages[0].content !== "string") {
    throw new Error("local_context_payload_invalid");
  }
  const prompt = body.messages[0].content;
  if (prompt.length > VERA_LOCAL_PROMPT_MAX_CHARS
    || Buffer.byteLength(prompt, "utf8") > VERA_LOCAL_PROMPT_MAX_BYTES) throw new Error("local_context_payload_invalid");
  const sourcesByKey = new Map(input.committedSources.map((source) => [source.citationKey, source]));
  const retainedSources: LocalOutboundSource[] = [];
  const framePattern = /\[\[e:([A-Za-z0-9_-]{1,80})\]\]\n([\s\S]*?)\n\[\[\/e\]\]/gu;
  let match: RegExpExecArray | null;
  let cursor = 0;
  let framingBytes = 0;
  while ((match = framePattern.exec(prompt)) !== null) {
    const citationKey = match[1];
    const evidence = match[2];
    if (!citationKey || !evidence?.trim() || !sourcesByKey.has(citationKey)
      || retainedSources.some((source) => source.citationKey === citationKey)) {
      throw new Error("local_context_payload_evidence_invalid");
    }
    const committed = sourcesByKey.get(citationKey)!;
    if (!committed.evidenceSegments.some((segment) => normalizeLocalOutboundEvidence(segment) === evidence)) {
      throw new Error("local_context_payload_evidence_invalid");
    }
    retainedSources.push({ citationKey, kind: committed.kind, evidenceSegments: [evidence] });
    const leading = prompt.slice(cursor, match.index);
    framingBytes += Buffer.byteLength(leading, "utf8")
      + Buffer.byteLength(frameSource(citationKey, ""), "utf8");
    cursor = framePattern.lastIndex;
  }
  framingBytes += Buffer.byteLength(prompt.slice(cursor), "utf8");
  if (retainedSources.length === 0 || retainedSources.length > 4) {
    throw new Error("local_context_payload_evidence_invalid");
  }
  const metadataBytes = retainedSources.reduce((sum, source) => sum
    + Buffer.byteLength(source.citationKey, "utf8")
    + Buffer.byteLength(source.kind, "utf8"), 0);
  const questionPrefix = "Pertanyaan: ";
  const framingStart = "\n\nGunakan hanya bukti di dalam bingkai.";
  const framingIndex = prompt.indexOf(framingStart);
  const question = prompt.startsWith(questionPrefix) && framingIndex > questionPrefix.length
    ? prompt.slice(questionPrefix.length, framingIndex)
    : "";
  if (!question || Buffer.byteLength(question, "utf8") > VERA_LOCAL_QUESTION_MAX_BYTES
    || metadataBytes > VERA_LOCAL_METADATA_MAX_BYTES
    || framingBytes - Buffer.byteLength(question, "utf8") > VERA_LOCAL_FRAMING_MAX_BYTES) throw new Error("local_context_payload_invalid");
  return { prompt, body, bytes: new Uint8Array(input.bytes), digest: sha256Hex(input.bytes), retainedSources };
}

function frameSource(citationKey: string, segment: string): string {
  return `[[e:${citationKey}]]\n${segment}\n[[/e]]`;
}

export function normalizeLocalOutboundEvidence(value: string): string {
  return normalizeText(value).trim().replace(/\[\[/gu, "［［").replace(/\]\]/gu, "］］");
}

/** Build the exact bytes given to the free POC fetch transport. */
export function buildLocalOutboundPayload(input: {
  question: string;
  sources: readonly LocalOutboundSource[];
  maxOutputTokens: number;
}): LocalOutboundPayload | null {
  const question = normalizeText(input.question).trim();
  if (!question || Buffer.byteLength(question, "utf8") > VERA_LOCAL_QUESTION_MAX_BYTES) return null;
  if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 1_024) return null;
  const unique = input.sources.filter((source, index) =>
    source.citationKey.trim()
    && input.sources.findIndex((other) => other.citationKey === source.citationKey) === index
    && source.evidenceSegments.some((segment) => normalizeLocalOutboundEvidence(segment).length > 0));
  const transmittedSources = unique.map((source) => ({
    ...source,
    evidenceSegments: source.evidenceSegments.map(normalizeLocalOutboundEvidence).filter(Boolean),
  }));
  const promptFor = (sources: readonly LocalOutboundSource[]) => [
    `Pertanyaan: ${question}`,
    "Gunakan hanya bukti di dalam bingkai. Setiap paragraf dan butir jawaban harus diakhiri sitasi [^kunci].",
    ...sources.map((source) => frameSource(source.citationKey, source.evidenceSegments[0] ?? "")),
  ].join("\n\n");

  let retained = [...transmittedSources];
  while (retained.length > 0) {
    const prompt = promptFor(retained);
    const promptChars = prompt.length;
    const promptBytes = Buffer.byteLength(prompt, "utf8");
    const emptyEvidencePrompt = promptFor(retained.map((source) => ({ ...source, evidenceSegments: [""] })));
    const framingBytes = Buffer.byteLength(emptyEvidencePrompt, "utf8") - Buffer.byteLength(question, "utf8");
    const metadataBytes = retained.reduce((sum, source) => sum
      + Buffer.byteLength(source.citationKey, "utf8")
      + Buffer.byteLength(source.kind, "utf8"), 0);
    const body: VeraOpenRouterFreeBody = {
      model: "openrouter/free",
      messages: [{ role: "user", content: prompt }],
      provider: { allow_fallbacks: false, data_collection: "allow" },
      max_tokens: input.maxOutputTokens,
      stream: true,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    if (promptChars <= VERA_LOCAL_PROMPT_MAX_CHARS
      && promptBytes <= VERA_LOCAL_PROMPT_MAX_BYTES
      && framingBytes <= VERA_LOCAL_FRAMING_MAX_BYTES
      && metadataBytes <= VERA_LOCAL_METADATA_MAX_BYTES
      && bytes.byteLength <= VERA_LOCAL_BODY_MAX_BYTES) {
      return { prompt, body, bytes, digest: sha256Hex(bytes), retainedSources: [...retained] };
    }
    // Sources are already ranked highest-first. Remove only the lowest-ranked
    // source and retry so every retained source contributes one whole segment.
    retained = retained.slice(0, -1);
  }
  return null;
}

const CITATION = /\[\^([A-Za-z0-9_-]{1,64})\]/gu;

function textBlocks(text: string): string[] {
  const normalized = normalizeText(text).trim();
  if (!normalized) return [];
  if (/```|~~~|<\/?[a-z][^>]*>|!\[[^\]]*\]\(/iu.test(normalized)) throw new Error("automatic_output_unsafe_markup");
  return normalized.split(/\n\s*\n/u).map((block) => block.trim()).filter(Boolean);
}

/** Strict automatic-mode citation check against committed sources and bytes. */
export function validateLocalAutomaticAnswer(input: {
  text: string;
  outbound: LocalOutboundPayload;
  committedSources: readonly LocalOutboundSource[];
}): { text: string; citationKeys: string[]; digest: string } {
  const blocks = textBlocks(input.text);
  if (blocks.length === 0) throw new Error("automatic_output_empty");
  const committed = new Map(input.committedSources.map((source) => [source.citationKey, source]));
  const outboundText = input.outbound.body.messages[0].content;
  const allowed = new Set(input.outbound.retainedSources
    .filter((source) => committed.has(source.citationKey))
    .filter((source) => source.evidenceSegments.some((segment) => segment.trim() && outboundText.includes(frameSource(source.citationKey, normalizeLocalOutboundEvidence(segment)))))
    .map((source) => source.citationKey));
  if (allowed.size === 0) throw new Error("automatic_evidence_not_transmitted");
  const cited = new Set<string>();
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const isTableSeparator = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/u.test(line);
      if (isTableSeparator) continue;
      const citationLine = line.replace(/\|\s*$/u, "").trim();
      CITATION.lastIndex = 0;
      const matches = [...citationLine.matchAll(CITATION)];
      if (matches.length === 0 || !/(?:\[\^[A-Za-z0-9_-]{1,64}\])+$/u.test(citationLine)) {
        throw new Error("automatic_output_uncited_block");
      }
      for (const match of matches) {
        const key = match[1];
        if (!key || !allowed.has(key)) throw new Error("automatic_output_invented_citation");
        cited.add(key);
      }
    }
  }
  const citationKeys = [...cited].sort();
  return { text: normalizeText(input.text).trim(), citationKeys, digest: sha256Hex(canonicalJson({ text: normalizeText(input.text).trim(), citationKeys })) };
}
