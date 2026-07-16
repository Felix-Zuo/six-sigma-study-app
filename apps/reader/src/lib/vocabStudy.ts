import { normalizeLookup, tokenizeEnglish } from "./tokenize";

export type DictionaryTarget<T> = {
  query: string;
  entry: T;
  sourceStart: number;
  sourceEnd: number;
  sourceOccurrence: number;
  entryKind: "word" | "phrase";
};

export type StudyExample = {
  text: string;
  targetStart: number;
  targetEnd: number;
};

function validOffset(value: number | undefined, text: string): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= text.length;
}

function occurrenceForRange(sourceText: string, query: string, sourceStart: number): number {
  const source = sourceText.toLocaleLowerCase();
  const target = query.toLocaleLowerCase();
  if (!target) return 0;
  let occurrence = 0;
  let cursor = 0;
  while (cursor < sourceStart) {
    const match = source.indexOf(target, cursor);
    if (match < 0 || match >= sourceStart) break;
    occurrence += 1;
    cursor = match + Math.max(1, target.length);
  }
  return occurrence;
}

export function resolveDictionaryTarget<T>(
  surface: string,
  sourceText: string,
  sourceStart: number | undefined,
  sourceEnd: number | undefined,
  lookup: (normalized: string) => T | undefined,
  maxPhraseWords = 6
): DictionaryTarget<T> | undefined {
  const fallbackStart = sourceText.toLocaleLowerCase().indexOf(surface.toLocaleLowerCase());
  const explicitStartMatches = validOffset(sourceStart, sourceText)
    && sourceText.slice(sourceStart, sourceStart + surface.length).toLocaleLowerCase() === surface.toLocaleLowerCase();
  if (!explicitStartMatches && fallbackStart < 0) return undefined;
  const start = explicitStartMatches && sourceStart !== undefined ? sourceStart : fallbackStart;
  const end = validOffset(sourceEnd, sourceText) && sourceEnd >= start
    ? sourceEnd
    : Math.min(sourceText.length, start + surface.length);
  const normalizedSurface = normalizeLookup(surface);
  if (normalizedSurface.includes(" ")) {
    const exactEntry = lookup(normalizedSurface);
    return exactEntry ? {
      query: sourceText.slice(start, end).trim() || surface.trim(),
      entry: exactEntry,
      sourceStart: start,
      sourceEnd: end,
      sourceOccurrence: occurrenceForRange(sourceText, surface.trim(), start),
      entryKind: "phrase"
    } : undefined;
  }
  const words = tokenizeEnglish(sourceText).filter((token) => token.kind === "word");
  const selectedWordIndex = words.findIndex((token) => token.start < Math.max(end, start + 1) && token.end > start);

  let best: DictionaryTarget<T> | undefined;
  if (selectedWordIndex >= 0) {
    const leftLimit = Math.max(0, selectedWordIndex - maxPhraseWords + 1);
    const rightLimit = Math.min(words.length - 1, selectedWordIndex + maxPhraseWords - 1);
    for (let left = leftLimit; left <= selectedWordIndex; left += 1) {
      for (let right = selectedWordIndex; right <= rightLimit; right += 1) {
        const wordCount = right - left + 1;
        if (wordCount > maxPhraseWords) continue;
        const candidateStart = words[left].start;
        const candidateEnd = words[right].end;
        const query = sourceText.slice(candidateStart, candidateEnd).trim();
        const key = normalizeLookup(query);
        const entry = key ? lookup(key) : undefined;
        if (!entry) continue;
        if (!best || wordCount > normalizeLookup(best.query).split(" ").length) {
          best = {
            query,
            entry,
            sourceStart: candidateStart,
            sourceEnd: candidateEnd,
            sourceOccurrence: occurrenceForRange(sourceText, query, candidateStart),
            entryKind: wordCount > 1 ? "phrase" : "word"
          };
        }
      }
    }
  }

  if (best) return best;
  const entry = normalizedSurface ? lookup(normalizedSurface) : undefined;
  if (!entry) return undefined;
  return {
    query: surface.trim(),
    entry,
    sourceStart: start,
    sourceEnd: end,
    sourceOccurrence: occurrenceForRange(sourceText, surface.trim(), start),
    entryKind: normalizedSurface.includes(" ") ? "phrase" : "word"
  };
}

function sentenceBoundaryBefore(text: string, index: number): number {
  const before = text.slice(0, index);
  const boundary = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("?"),
    before.lastIndexOf("!"),
    before.lastIndexOf(";"),
    before.lastIndexOf("\n")
  );
  return boundary >= 0 ? boundary + 1 : 0;
}

function sentenceBoundaryAfter(text: string, index: number): number {
  const after = text.slice(index);
  const candidates = [after.indexOf("."), after.indexOf("?"), after.indexOf("!"), after.indexOf(";"), after.indexOf("\n")]
    .filter((value) => value >= 0);
  return candidates.length > 0 ? index + Math.min(...candidates) + 1 : text.length;
}

export function compactStudyExample(
  sourceText: string,
  target: string,
  preferredStart?: number,
  maxLength = 170
): StudyExample {
  const cleanSource = sourceText.replace(/\s+/g, " ").trim();
  if (!cleanSource) return { text: "", targetStart: -1, targetEnd: -1 };
  const directPreferred = validOffset(preferredStart, sourceText)
    ? sourceText.slice(preferredStart, preferredStart + target.length).toLocaleLowerCase() === target.toLocaleLowerCase()
      ? preferredStart
      : -1
    : -1;
  const sourceTargetStart = directPreferred >= 0
    ? directPreferred
    : sourceText.toLocaleLowerCase().indexOf(target.toLocaleLowerCase());

  if (sourceTargetStart < 0) {
    const text = cleanSource.length <= maxLength ? cleanSource : `${cleanSource.slice(0, maxLength - 1).trim()}…`;
    return { text, targetStart: -1, targetEnd: -1 };
  }

  const sentenceStart = sentenceBoundaryBefore(sourceText, sourceTargetStart);
  const sentenceEnd = sentenceBoundaryAfter(sourceText, sourceTargetStart + target.length);
  let excerptStart = sentenceStart;
  let excerptEnd = sentenceEnd;
  if (excerptEnd - excerptStart > maxLength) {
    const leftBudget = Math.floor((maxLength - target.length) * 0.44);
    excerptStart = Math.max(sentenceStart, sourceTargetStart - leftBudget);
    excerptEnd = Math.min(sentenceEnd, excerptStart + maxLength);
    if (excerptEnd < sourceTargetStart + target.length) {
      excerptEnd = Math.min(sentenceEnd, sourceTargetStart + target.length + 34);
      excerptStart = Math.max(sentenceStart, excerptEnd - maxLength);
    }
    while (excerptStart > sentenceStart && /[A-Za-z0-9]/.test(sourceText[excerptStart - 1] ?? "")) excerptStart += 1;
    while (excerptEnd < sentenceEnd && /[A-Za-z0-9]/.test(sourceText[excerptEnd] ?? "")) excerptEnd -= 1;
  }

  const leadingEllipsis = excerptStart > sentenceStart;
  const trailingEllipsis = excerptEnd < sentenceEnd;
  const raw = sourceText.slice(excerptStart, excerptEnd).replace(/\s+/g, " ").trim();
  const text = `${leadingEllipsis ? "…" : ""}${raw}${trailingEllipsis ? "…" : ""}`;
  const targetStart = text.toLocaleLowerCase().indexOf(target.toLocaleLowerCase());
  return {
    text,
    targetStart,
    targetEnd: targetStart >= 0 ? targetStart + target.length : -1
  };
}

export function compactStudyTranslation(value: string | undefined, maxLength = 110): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1).trim()}…`;
}
