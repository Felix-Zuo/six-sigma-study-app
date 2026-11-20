import type { PersonalMaterialTerm } from "./personalLibrary";

export type PhraseCardRange = {
  start: number;
  end: number;
  text: string;
  card: PersonalMaterialTerm;
  sentenceStart: number;
  sentenceEnd: number;
  sourceSentence: string;
  /** False for legacy/generic entries without an original-sentence anchor. */
  contextMatched: boolean;
};

type Word = { text: string; key: string; start: number; end: number };
const normalized = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

function normalizedOffsets(text: string) {
  const characters: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (!characters.length) continue;
      if (characters[characters.length - 1] === " ") ends[ends.length - 1] = index + 1;
      else { characters.push(" "); starts.push(index); ends.push(index + 1); }
    } else {
      for (const part of char.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase()) {
        characters.push(part); starts.push(index); ends.push(index + 1);
      }
    }
  }
  if (characters[characters.length - 1] === " ") { characters.pop(); starts.pop(); ends.pop(); }
  return { text: characters.join(""), starts, ends };
}

function words(text: string, offset = 0): Word[] {
  // Contractions and initialisms stay single words; all offsets remain UTF-16
  // offsets into the original text, as used by reader selections and DOM tokens.
  return [...text.matchAll(/(?:[A-Za-z]\.){2,}|[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*|\d+/g)]
    .map((match) => ({ text: match[0], key: normalized(match[0]), start: offset + match.index!, end: offset + match.index! + match[0].length }));
}

function sentenceRanges(text: string): Array<{ start: number; end: number }> {
  const result: Array<{ start: number; end: number }> = [];
  let start = 0;
  const push = (end: number) => {
    while (start < end && /\s/.test(text[start])) start++;
    let trimmedEnd = end;
    while (trimmedEnd > start && /\s/.test(text[trimmedEnd - 1])) trimmedEnd--;
    if (trimmedEnd > start) result.push({ start, end: trimmedEnd });
    start = end;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\n" || char === "\r") { push(index); start = index + 1; continue; }
    if (!/[.!?。！？;；]/.test(char)) continue;
    if (char === ".") {
      if (/\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) continue;
      if (/[A-Za-z]/.test(text[index - 1] ?? "") && /[A-Za-z]/.test(text[index + 1] ?? "")) continue;
      const before = text.slice(start, index + 1);
      const after = text.slice(index + 1).match(/^[ \t]*([^\s])/u)?.[1] ?? "";
      if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St)\.$/i.test(before) && after) continue;
      if (/\b(?:e\.g|i\.e)\.$/i.test(before) && after) continue;
      if (/(?:\b[A-Za-z]\.){2,}$/.test(before) && /[a-z]/.test(after)) continue;
    }
    while (index + 1 < text.length && /[.!?。！？"'”’\])]/.test(text[index + 1])) index++;
    push(index + 1);
  }
  push(text.length);
  return result;
}

/** Enumerate non-overlapping, source-anchored cards once per material/block. */
export function findPhraseCardRanges(text: string, terms: readonly PersonalMaterialTerm[]): PhraseCardRange[] {
  const source = normalizedOffsets(text);
  const anchorCache = new Map<string, Array<{ start: number; end: number }>>();
  const splitsWordAt = (position: number) => {
    const left = source.text[position - 1] ?? "";
    const right = source.text[position] ?? "";
    const letter = (value: string) => /\p{L}/u.test(value);
    const alphanumeric = (value: string) => /[\p{L}\p{N}]/u.test(value);
    return (alphanumeric(left) && alphanumeric(right))
      || (left === "'" && letter(source.text[position - 2] ?? "") && letter(right))
      || (right === "'" && letter(left) && letter(source.text[position + 1] ?? ""));
  };
  const anchorsFor = (sentence: string) => {
    const key = normalized(sentence);
    if (anchorCache.has(key)) return anchorCache.get(key)!;
    const anchors: Array<{ start: number; end: number }> = [];
    for (let cursor = 0; key && cursor < source.text.length;) {
      const start = source.text.indexOf(key, cursor);
      if (start < 0) break;
      const end = start + key.length;
      // A quotation mark is a wrapper. Only an apostrophe between letters is
      // part of a contraction and can make this a partial-word anchor.
      if (!splitsWordAt(start) && !splitsWordAt(end)) {
        anchors.push({ start: source.starts[start], end: source.ends[end - 1] });
      }
      cursor = start + 1;
    }
    anchorCache.set(key, anchors);
    return anchors;
  };
  const index = new Map<string, Array<{ card: PersonalMaterialTerm; keys: string[]; order: number; anchors?: Array<{ start: number; end: number }> }>>();
  terms.forEach((card, order) => {
    const tokens = words(card.term);
    if (!tokens.length || tokens.length > 6 || card.term.slice(0, tokens[0].start).trim()
      || card.term.slice(tokens[tokens.length - 1].end).trim()
      || tokens.some((word, position) => position > 0 && !/^\s+$/.test(card.term.slice(tokens[position - 1].end, word.start)))) return;
    const item = { card, keys: tokens.map((word) => word.key), order,
      ...(card.sourceSentence?.trim() ? { anchors: anchorsFor(card.sourceSentence) } : {}) };
    const matches = index.get(item.keys[0]) ?? [];
    matches.push(item); index.set(item.keys[0], matches);
  });
  const candidates: Array<PhraseCardRange & { wordCount: number; order: number; wordStarts: number[] }> = [];
  for (const sentence of sentenceRanges(text)) {
    const sourceSentence = text.slice(sentence.start, sentence.end);
    const tokens = words(sourceSentence, sentence.start);
    tokens.forEach((word, position) => {
      for (const { card, keys, order, anchors } of index.get(word.key) ?? []) {
        const selected = tokens.slice(position, position + keys.length);
        if (selected.length !== keys.length || selected.some((token, part) => token.key !== keys[part]
          || (part > 0 && !/^\s+$/.test(text.slice(selected[part - 1].end, token.start))))) continue;
        const end = selected[selected.length - 1].end;
        if (anchors && !anchors.some((anchor) => anchor.start <= word.start && anchor.end >= end)) continue;
        candidates.push({ start: word.start, end, text: text.slice(word.start, end), card,
          sentenceStart: sentence.start, sentenceEnd: sentence.end, sourceSentence,
          contextMatched: Boolean(anchors), wordCount: keys.length, order, wordStarts: selected.map((token) => token.start) });
      }
    });
  }
  // Select the longest applicable expression first, including when the user
  // clicks a nested word. Stable tie-breaking makes repeated renders predictable.
  candidates.sort((a, b) => b.wordCount - a.wordCount || (b.end - b.start) - (a.end - a.start)
    || Number(b.contextMatched) - Number(a.contextMatched) || a.order - b.order || a.start - b.start);
  const selected: typeof candidates = [];
  const coveredWords = new Set<number>();
  for (const candidate of candidates) {
    if (!candidate.wordStarts.some((start) => coveredWords.has(start))) {
      selected.push(candidate);
      for (const start of candidate.wordStarts) coveredWords.add(start);
    }
  }
  return selected.sort((a, b) => a.start - b.start).map(({ wordCount: _count, order: _order, wordStarts: _starts, ...range }) => range);
}

/** Match this exact clicked occurrence. Never fall back to a different occurrence. */
export function findPhraseCardAtRange(ranges: readonly PhraseCardRange[], sourceStart: number, sourceEnd?: number): PhraseCardRange | undefined {
  if (!Number.isInteger(sourceStart) || sourceStart < 0
    || (sourceEnd !== undefined && (!Number.isInteger(sourceEnd) || sourceEnd < sourceStart))) return undefined;
  const end = sourceEnd === undefined || sourceEnd === sourceStart ? sourceStart + 1 : sourceEnd;
  return ranges.find((range) => range.start <= sourceStart && range.end >= end);
}
