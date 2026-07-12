import type { ContextExplanation } from "./contextLookup";

export type CorrectionStatus = "proposed" | "accepted" | "rejected" | "revoked" | "superseded";
export type CorrectionSourceType = "manual" | "question";
export type AiConfidence = "high" | "medium" | "low";

export type AiContextResult = {
  detectedPhrase: string;
  lemma: string;
  partOfSpeech: string;
  phrasePattern: string;
  contextMeaningZh: string;
  sentenceTranslationZh: string;
  explanationZh: string;
  alternativesZh: string[];
  confidence: AiConfidence;
};

export type ContextCorrectionRecord = {
  id: string;
  status: CorrectionStatus;
  source: {
    sourceType: CorrectionSourceType;
    chapterId: string | null;
    sectionId: string;
    blockId: string | null;
    page: number;
    sentenceIndex: number | null;
    sourceText: string;
    sourceTextSha256: string;
  };
  lexical: {
    surface: string;
    lemma: string;
    partOfSpeech: string;
    phrase: string;
    phrasePattern: string;
  };
  before: {
    contextMeaningZh: string | null;
    sentenceTranslationZh: string | null;
  };
  after: {
    contextMeaningZh: string;
    sentenceTranslationZh: string;
    explanationZh: string;
    alternativesZh: string[];
  };
  matching: {
    exactSignature: string;
    autoApplyExact: true;
    similarMode: "suggestion-only";
    similarityThreshold: number;
  };
  review: {
    acceptedBy: string | null;
    acceptedAt: string | null;
  };
  provenance: {
    provider: "deepseek" | "human";
    model: string;
    promptVersion: string;
    appVersion: string;
    generatedAt: string;
    responseSha256: string;
  };
};

export type ContextCorrectionBundle = {
  schemaVersion: "1.0.0";
  format: "six-sigma-context-corrections";
  bookId: string;
  contentVersion: string;
  exportedAt: string;
  corrections: ContextCorrectionRecord[];
};

export type CorrectionAnchorInput = {
  bookId: string;
  contentVersion: string;
  sourceType: CorrectionSourceType;
  chapterId?: string;
  sectionId: string;
  blockId?: string;
  page: number;
  sentenceIndex?: number;
  sourceText: string;
  surface: string;
  partOfSpeech?: string;
  currentMeaning?: string;
  currentTranslation?: string;
};

const storageKeyPrefix = "six-sigma-study:context-corrections:v1";
const schemaVersion = "1.0.0" as const;
const bundleFormat = "six-sigma-context-corrections" as const;
const defaultThreshold = 0.88;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalized(value: string): string {
  return clean(value).normalize("NFKC").toLocaleLowerCase();
}

function normalizeChinese(value: string): string {
  return clean(value).replace(/\s*;\s*/g, "；");
}

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function fallbackDigest(value: string): string {
  const chunks: string[] = [];
  for (let seed = 0; seed < 8; seed += 1) {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    chunks.push(hash.toString(16).padStart(8, "0"));
  }
  return chunks.join("");
}

export async function sha256Hex(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
  }
  return fallbackDigest(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAiContextResult(value: unknown, sourceText: string): AiContextResult {
  if (!isRecord(value)) {
    throw new Error("AI 返回内容不是结构化对象");
  }
  const required = [
    "detectedPhrase", "lemma", "partOfSpeech", "phrasePattern", "contextMeaningZh",
    "sentenceTranslationZh", "explanationZh", "alternativesZh", "confidence"
  ];
  if (Object.keys(value).some((key) => !required.includes(key)) || required.some((key) => !(key in value))) {
    throw new Error("AI 返回字段与统一格式不一致");
  }
  const strings = required.filter((key) => !["alternativesZh", "confidence"].includes(key));
  if (strings.some((key) => typeof value[key] !== "string" || !clean(value[key] as string))) {
    throw new Error("AI 返回内容存在空字段");
  }
  if (!Array.isArray(value.alternativesZh) || value.alternativesZh.some((item) => typeof item !== "string")) {
    throw new Error("AI 备选释义格式错误");
  }
  if (!(["high", "medium", "low"] as unknown[]).includes(value.confidence)) {
    throw new Error("AI 置信度格式错误");
  }
  const detectedPhrase = clean(value.detectedPhrase as string);
  if (!normalized(sourceText).includes(normalized(detectedPhrase))) {
    throw new Error("AI 返回的短语不在当前原句中");
  }
  const contextMeaningZh = normalizeChinese(value.contextMeaningZh as string);
  const sentenceTranslationZh = clean(value.sentenceTranslationZh as string);
  const explanationZh = clean(value.explanationZh as string);
  if (![contextMeaningZh, sentenceTranslationZh, explanationZh].every(hasChinese)) {
    throw new Error("AI 返回的中文释义或译文不完整");
  }
  const lemma = normalized(value.lemma as string);
  if (!/^[a-z]+(?:[-'][a-z]+)*$/.test(lemma)) {
    throw new Error("AI 返回的英文原形格式错误");
  }
  const alternativesZh = [...new Set((value.alternativesZh as string[]).map(normalizeChinese).filter(Boolean))].slice(0, 5);
  if (alternativesZh.some((item) => !hasChinese(item))) {
    throw new Error("AI 备选释义必须为中文");
  }
  return {
    detectedPhrase,
    lemma,
    partOfSpeech: normalized(value.partOfSpeech as string),
    phrasePattern: normalized(value.phrasePattern as string),
    contextMeaningZh,
    sentenceTranslationZh,
    explanationZh,
    alternativesZh,
    confidence: value.confidence as AiConfidence
  };
}

function isCorrectionRecord(value: unknown): value is ContextCorrectionRecord {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.startsWith("ctxcorr-")) {
    return false;
  }
  return isRecord(value.source) && isRecord(value.lexical) && isRecord(value.after)
    && isRecord(value.matching) && isRecord(value.review) && isRecord(value.provenance);
}

export function loadContextCorrectionBundle(bookId: string, contentVersion: string): ContextCorrectionBundle {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${storageKeyPrefix}:${bookId}`) ?? "null");
    if (isRecord(parsed) && parsed.schemaVersion === schemaVersion && parsed.format === bundleFormat && Array.isArray(parsed.corrections)) {
      return {
        schemaVersion,
        format: bundleFormat,
        bookId,
        contentVersion,
        exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
        corrections: parsed.corrections.filter(isCorrectionRecord)
      };
    }
  } catch {
    // Invalid legacy or partial data is ignored; corrections never block reading.
  }
  return { schemaVersion, format: bundleFormat, bookId, contentVersion, exportedAt: new Date().toISOString(), corrections: [] };
}

export function persistContextCorrectionBundle(bundle: ContextCorrectionBundle): void {
  try {
    window.localStorage.setItem(`${storageKeyPrefix}:${bundle.bookId}`, JSON.stringify({ ...bundle, exportedAt: new Date().toISOString() }));
  } catch {
    // Corrections are optional enhancements and must not crash the reader.
  }
}

export function clearContextCorrectionBundle(bookId: string): void {
  try {
    window.localStorage.removeItem(`${storageKeyPrefix}:${bookId}`);
  } catch {
    // Clearing optional local corrections must not block other data cleanup.
  }
}

export async function createProposedCorrection(input: CorrectionAnchorInput, result: AiContextResult, provenance: {
  provider: "deepseek" | "human";
  model: string;
  promptVersion: string;
  appVersion: string;
  responseSha256: string;
}): Promise<ContextCorrectionRecord> {
  const sourceText = clean(input.sourceText);
  const sourceTextSha256 = await sha256Hex(sourceText);
  const exactSignature = [result.lemma, result.partOfSpeech, result.phrasePattern].map(normalized).join("|");
  const identity = [input.bookId, input.sourceType, input.blockId ?? "", input.sentenceIndex ?? "", sourceTextSha256, exactSignature].join("|");
  const id = `ctxcorr-${await sha256Hex(identity)}`;
  return {
    id,
    status: "proposed",
    source: {
      sourceType: input.sourceType,
      chapterId: input.chapterId ?? null,
      sectionId: input.sectionId,
      blockId: input.blockId ?? null,
      page: Math.max(1, Math.trunc(input.page)),
      sentenceIndex: Number.isInteger(input.sentenceIndex) ? input.sentenceIndex ?? null : null,
      sourceText,
      sourceTextSha256
    },
    lexical: {
      surface: clean(input.surface),
      lemma: result.lemma,
      partOfSpeech: result.partOfSpeech,
      phrase: result.detectedPhrase,
      phrasePattern: result.phrasePattern
    },
    before: {
      contextMeaningZh: input.currentMeaning ? normalizeChinese(input.currentMeaning) : null,
      sentenceTranslationZh: input.currentTranslation ? clean(input.currentTranslation) : null
    },
    after: {
      contextMeaningZh: result.contextMeaningZh,
      sentenceTranslationZh: result.sentenceTranslationZh,
      explanationZh: result.explanationZh,
      alternativesZh: result.alternativesZh
    },
    matching: {
      exactSignature,
      autoApplyExact: true,
      similarMode: "suggestion-only",
      similarityThreshold: defaultThreshold
    },
    review: { acceptedBy: null, acceptedAt: null },
    provenance: { ...provenance, generatedAt: new Date().toISOString() }
  };
}

export function upsertCorrection(bundle: ContextCorrectionBundle, correction: ContextCorrectionRecord): ContextCorrectionBundle {
  const corrections = bundle.corrections.filter((item) => item.id !== correction.id);
  return { ...bundle, exportedAt: new Date().toISOString(), corrections: [correction, ...corrections] };
}

export function setCorrectionStatus(
  bundle: ContextCorrectionBundle,
  id: string,
  status: CorrectionStatus
): ContextCorrectionBundle {
  const now = new Date().toISOString();
  return {
    ...bundle,
    exportedAt: now,
    corrections: bundle.corrections.map((item) => item.id === id ? {
      ...item,
      status,
      review: status === "accepted"
        ? { acceptedBy: "user", acceptedAt: now }
        : { acceptedBy: item.review.acceptedBy, acceptedAt: item.review.acceptedAt }
    } : item)
  };
}

type LookupCorrectionInput = {
  bookId: string;
  sourceType: CorrectionSourceType;
  blockId?: string;
  surface: string;
  partOfSpeech?: string;
  sourceText: string;
};

function lexicalTokens(value: string): Set<string> {
  return new Set(normalized(value).match(/[a-z]+(?:[-'][a-z]+)*/g) ?? []);
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  return intersection / union.size;
}

export function findAcceptedCorrection(
  bundle: ContextCorrectionBundle,
  input: LookupCorrectionInput
): ContextCorrectionRecord | undefined {
  const surface = normalized(input.surface);
  const source = normalized(input.sourceText);
  const candidates = bundle.corrections.filter((item) =>
    item.status === "accepted" &&
    item.source.sourceType === input.sourceType &&
    (normalized(item.lexical.surface) === surface || normalized(item.lexical.lemma) === surface) &&
    (bundle.bookId === input.bookId || item.source.sourceType === "question")
  );
  return candidates.find((item) => item.source.blockId === (input.blockId ?? null) && normalized(item.source.sourceText) === source)
    ?? candidates.find((item) => source.includes(normalized(item.lexical.phrase)));
}

export function findSimilarCorrection(
  bundle: ContextCorrectionBundle,
  input: LookupCorrectionInput,
  excludeId?: string
): { correction: ContextCorrectionRecord; similarity: number } | undefined {
  const surface = normalized(input.surface);
  const sourceTokens = lexicalTokens(input.sourceText);
  const ranked = bundle.corrections
    .filter((item) => item.status === "accepted" && item.id !== excludeId && normalized(item.lexical.lemma || item.lexical.surface) === surface)
    .map((correction) => {
      const contextScore = jaccard(sourceTokens, lexicalTokens(correction.source.sourceText));
      const phraseTokens = lexicalTokens(correction.lexical.phrase);
      const phraseCoverage = phraseTokens.size === 0
        ? 0
        : [...phraseTokens].filter((token) => sourceTokens.has(token)).length / phraseTokens.size;
      const similarity = Math.min(1, phraseCoverage * 0.72 + contextScore * 0.28);
      return { correction, similarity };
    })
    .filter((item) => item.similarity >= item.correction.matching.similarityThreshold)
    .sort((left, right) => right.similarity - left.similarity);
  return ranked[0];
}

export function contextFromCorrection(base: ContextExplanation, correction: ContextCorrectionRecord): ContextExplanation {
  return {
    ...base,
    meaning: correction.after.contextMeaningZh,
    explanation: correction.after.explanationZh,
    confidence: "curated",
    evidence: "accepted-correction",
    needsVerification: false,
    sourceTranslation: correction.after.sentenceTranslationZh,
    exampleTranslation: correction.after.sentenceTranslationZh
  };
}

export function acceptedCorrectionExport(bundle: ContextCorrectionBundle): ContextCorrectionBundle {
  return {
    ...bundle,
    exportedAt: new Date().toISOString(),
    corrections: bundle.corrections.filter((item) => item.status === "accepted")
  };
}
