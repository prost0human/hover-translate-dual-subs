/** Offsets are UTF-16 offsets into the original Russian string, suitable for slice(). */
export interface TextRange { start: number; end: number }
export type Alignment =
  | { kind: "exact" | "phrase"; ranges: TextRange[] }
  | { kind: "sentence"; ranges: TextRange[] }
  | { kind: "none"; ranges: [] };

interface Token extends TextRange { value: string }
const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const normalize = (word: string) => word.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/’/g, "'");
const tokens = (text: string): Token[] => Array.from(text.matchAll(TOKEN), (match) => ({
  value: normalize(match[0]), start: match.index!, end: match.index! + match[0].length,
}));

const containsTokens = (haystack: Token[], needle: Token[]) => needle.length > 0 &&
  haystack.some((_, i) => needle.every((token, j) => haystack[i + j]?.value === token.value));

/** Conservative inflection heuristic, never an index-based word alignment. */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  if (!/^[а-я]+$/u.test(a) || !/^[а-я]+$/u.test(b)) return false;
  let common = 0;
  while (common < Math.min(a.length, b.length) && a[common] === b[common]) common++;
  return common >= 5 && common >= Math.min(a.length, b.length) * 0.6;
}

/**
 * Align a selection only with evidence: the translator's translation of that
 * very selection must occur uniquely in the Russian sentence, verbatim or with
 * conservative inflection. Uncertain/ambiguous matches fall back to the whole
 * sentence. "exact" means a literal textual match, not a linguistic guarantee.
 */
export function alignTranslation(source: string, russian: string, selection: string, selectionTranslation?: string): Alignment {
  const sourceWords = tokens(source);
  const selectedWords = tokens(selection);
  const russianWords = tokens(russian);
  if (!russianWords.length || !containsTokens(sourceWords, selectedWords)) return { kind: "none", ranges: [] };

  const sentence: Alignment = { kind: "sentence", ranges: [{ start: 0, end: russian.length }] };
  if (!selectionTranslation || !/[а-яё]/iu.test(selectionTranslation)) return sentence;
  const translatedWords = tokens(selectionTranslation);
  if (!translatedWords.length || translatedWords.length > russianWords.length) return sentence;

  const candidates: { start: number; end: number; exact: boolean }[] = [];
  for (let i = 0; i <= russianWords.length - translatedWords.length; i++) {
    const window = russianWords.slice(i, i + translatedWords.length);
    const exactCount = window.filter((word, j) => word.value === translatedWords[j].value).length;
    const matches = window.every((word, j) => {
      const expected = translatedWords[j].value;
      // Very short forms of "ждать" are usable only within a longer phrase
      // anchored by at least one literal token (e.g. "с нетерпением жду").
      const anchoredWait = translatedWords.length > 1 && exactCount > 0 &&
        /^жд(?:у|е[тмш]|ут|ал[аио]?|ат|ет|ем|ешь|ать)$/u.test(word.value) &&
        /^жд(?:у|е[тмш]|ут|ал[аио]?|ат|ет|ем|ешь|ать)$/u.test(expected);
      return sameStem(word.value, expected) || anchoredWait;
    });
    if (matches) candidates.push({ start: window[0].start, end: window[window.length - 1].end, exact: exactCount === window.length });
  }
  if (candidates.length !== 1) return sentence;
  const match = candidates[0];
  return {
    kind: match.exact && translatedWords.length === 1 ? "exact" : "phrase",
    ranges: [{ start: match.start, end: match.end }],
  };
}
