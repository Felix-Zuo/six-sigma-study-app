export type Token = {
  id: string;
  text: string;
  kind: "word" | "space" | "punctuation";
};

const wordPattern = /^[A-Za-z][A-Za-z0-9'’.-]*$/;

export function tokenizeEnglish(text: string): Token[] {
  const parts = text.match(/[A-Za-z][A-Za-z0-9'’.-]*|\s+|./g) ?? [];
  return parts.map((part, index) => ({
    id: `${index}-${part}`,
    text: part,
    kind: wordPattern.test(part)
      ? "word"
      : /^\s+$/.test(part)
        ? "space"
        : "punctuation"
  }));
}

export function normalizeLookup(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9σ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
