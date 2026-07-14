import type { QuestionAssistResult, ReadingAssistResult } from "./deepSeekAssistant";

export type AiStudyCacheRecord =
  | {
      id: string;
      kind: "reading";
      model: string;
      generatedAt: string;
      result: ReadingAssistResult;
      usage: { promptTokens: number; completionTokens: number };
    }
  | {
      id: string;
      kind: "question";
      model: string;
      generatedAt: string;
      result: QuestionAssistResult;
      usage: { promptTokens: number; completionTokens: number };
    };

const storageKey = "six-sigma-study:ai-study-cache:v1";
const maxRecords = 80;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidUsage(value: unknown): value is { promptTokens: number; completionTokens: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const usage = value as Record<string, unknown>;
  return typeof usage.promptTokens === "number" && Number.isFinite(usage.promptTokens)
    && typeof usage.completionTokens === "number" && Number.isFinite(usage.completionTokens);
}

function isReadingResult(value: unknown): value is ReadingAssistResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return isText(result.translationZh)
    && isText(result.explanationZh)
    && isText(result.plainEnglish)
    && isText(result.grammarZh)
    && (result.confidence === "high" || result.confidence === "medium" || result.confidence === "low")
    && Array.isArray(result.terms)
    && result.terms.every((term) => {
      if (!term || typeof term !== "object" || Array.isArray(term)) return false;
      const item = term as Record<string, unknown>;
      return isText(item.term) && isText(item.meaningZh) && isText(item.noteZh);
    });
}

function isQuestionResult(value: unknown): value is QuestionAssistResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return isText(result.conceptZh)
    && isText(result.explanationZh)
    && isText(result.pitfallZh)
    && isText(result.reviewTipZh)
    && (result.confidence === "high" || result.confidence === "medium" || result.confidence === "low")
    && Array.isArray(result.optionNotes)
    && result.optionNotes.length > 0
    && result.optionNotes.every((note) => {
      if (!note || typeof note !== "object" || Array.isArray(note)) return false;
      const item = note as Record<string, unknown>;
      return isText(item.optionId)
        && (item.verdict === "correct" || item.verdict === "wrong" || item.verdict === "partial")
        && isText(item.noteZh);
    });
}

function isCacheRecord(value: unknown): value is AiStudyCacheRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!isText(item.id) || !isText(item.model) || !isText(item.generatedAt) || !hasValidUsage(item.usage)) {
    return false;
  }
  return item.kind === "reading"
    ? isReadingResult(item.result)
    : item.kind === "question" && isQuestionResult(item.result);
}

function loadRecords(): AiStudyCacheRecord[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isCacheRecord).slice(0, maxRecords) : [];
  } catch {
    return [];
  }
}

export function createAiStudyCacheId(kind: "reading" | "question", sourceId: string, content: string): string {
  let hash = 2166136261;
  const input = `${kind}\u0000${sourceId}\u0000${content}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}:${sourceId}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function findAiStudyCache(id: string, kind: "reading"): Extract<AiStudyCacheRecord, { kind: "reading" }> | undefined;
export function findAiStudyCache(id: string, kind: "question"): Extract<AiStudyCacheRecord, { kind: "question" }> | undefined;
export function findAiStudyCache(id: string, kind: "reading" | "question"): AiStudyCacheRecord | undefined {
  return loadRecords().find((item) => item.id === id && item.kind === kind);
}

export function persistAiStudyCache(record: AiStudyCacheRecord): void {
  try {
    const next = [record, ...loadRecords().filter((item) => item.id !== record.id)].slice(0, maxRecords);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // AI assistance still works when local caching is unavailable.
  }
}

export function clearAiStudyCache(): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Local reset can continue even when WebView storage is unavailable.
  }
}

export const aiStudyCacheStorageKey = storageKey;
