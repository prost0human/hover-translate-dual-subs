// YouTube's automatic captions extend a line, then roll its first visual line
// away. Compare words rather than positions in the translated sentence.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

const comparable = (text: string): string => text
  .toLocaleLowerCase("en")
  .replace(/’/g, "'")
  .replace(/[\s\p{P}\p{Cf}]+$/gu, "")
  .replace(/\s+/g, " ")
  .trim();

/** A snapshot can be displayed while its English text is still growing. */
export function isCaptionPrefix(snapshot: string, current: string): boolean {
  const prefix = comparable(snapshot);
  const visible = comparable(current);
  if (!prefix || !visible.startsWith(prefix)) return false;
  // "We" and "Welcome" are not the same caption just because the first
  // letters match. Auto captions normally append whole English words.
  return visible.length === prefix.length || !/^[\p{L}\p{N}'’]/u.test(visible.slice(prefix.length));
}

/**
 * Rolling captions retain the end of the old window at the start of the new
 * one. Require at least two words and a meaningful amount of text so that a
 * common short word does not make unrelated captions look continuous.
 */
export function hasRollingOverlap(previous: string, current: string): boolean {
  const before = comparable(previous).match(WORD) ?? [];
  const after = comparable(current).match(WORD) ?? [];
  for (let length = Math.min(before.length, after.length); length >= 2; length--) {
    const suffix = before.slice(-length);
    if (suffix.join("").length < 8) continue;
    if (suffix.every((word, index) => word === after[index])) return true;
  }
  return false;
}

/** Also recognise corrections/backspaces as one line, but do not show their old translation. */
export function isCaptionContinuation(previous: string, current: string): boolean {
  return isCaptionPrefix(previous, current) || isCaptionPrefix(current, previous) || hasRollingOverlap(previous, current);
}

/** Keep a displayed result only while its source still overlaps the visible line. */
export function isTranslationRelevant(source: string, current: string): boolean {
  return isCaptionPrefix(source, current) || hasRollingOverlap(source, current);
}
