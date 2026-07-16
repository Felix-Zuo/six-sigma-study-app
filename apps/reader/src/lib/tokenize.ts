export type Token = {
  id: string;
  text: string;
  kind: "word" | "space" | "punctuation";
  start: number;
  end: number;
};

const wordPattern = /^[A-Za-z](?:[A-Za-z0-9'’.-]*[A-Za-z0-9])?$/;

export function tokenizeEnglish(text: string): Token[] {
  const parts = text.match(/[A-Za-z](?:[A-Za-z0-9'’.-]*[A-Za-z0-9])?|\s+|./g) ?? [];
  let offset = 0;
  return parts.map((part, index) => {
    const start = offset;
    offset += part.length;
    return {
      id: `${index}-${part}`,
      text: part,
      kind: wordPattern.test(part)
        ? "word"
        : /^\s+$/.test(part)
          ? "space"
          : "punctuation",
      start,
      end: offset
    };
  });
}

export function normalizeLookup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9σ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
