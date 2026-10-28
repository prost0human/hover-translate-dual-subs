import { describe, expect, it } from "vitest";
import { alignTranslation } from "../../src/content/utils/alignTranslation.ts";

const alignedText = (source: string, russian: string, selected: string, selectedTranslation?: string) => {
  const result = alignTranslation(source, russian, selected, selectedTranslation);
  return { kind: result.kind, text: result.ranges.map(({ start, end }) => russian.slice(start, end)).join("|") };
};

describe("evidence-based alignment", () => {
  it("finds a literal token without assuming word order", () => {
    expect(alignedText("We saw a red car", "Мы увидели красную машину", "car", "машину"))
      .toEqual({ kind: "exact", text: "машину" });
  });
  it("aligns one English word to several Russian words", () => {
    expect(alignedText("That is wonderful", "Это просто замечательно", "wonderful", "просто замечательно"))
      .toEqual({ kind: "phrase", text: "просто замечательно" });
  });
  it("matches a phrasal verb to a different Russian inflection, approximately", () => {
    expect(alignedText("I didn't expect him to back down.", "Я не ожидал, что он отступит.", "back down", "отступить"))
      .toEqual({ kind: "phrase", text: "отступит" });
  });
  it("matches a phrase with an anchored irregular form", () => {
    expect(alignedText("I look forward to it", "Я с нетерпением ждал этого", "look forward to", "с нетерпением жду"))
      .toEqual({ kind: "phrase", text: "с нетерпением ждал" });
  });
  it("handles punctuation, apostrophes, case, hyphens and ё", () => {
    expect(alignedText("Don't re-enter!", "Не входи ещё раз.", "re-enter!", "ещё раз"))
      .toEqual({ kind: "phrase", text: "ещё раз" });
    expect(alignedText("Don't leave", "Не уходи", "don't", "не").kind).toBe("exact");
  });
  it("does not guess from positions or choose between duplicate matches", () => {
    expect(alignedText("one word", "одно слово, ещё одно слово", "word", "слово"))
      .toEqual({ kind: "sentence", text: "одно слово, ещё одно слово" });
    expect(alignedText("hello world", "привет мир", "world", "земля"))
      .toEqual({ kind: "sentence", text: "привет мир" });
    expect(alignedText("hello world", "привет мир", "world").kind).toBe("sentence");
  });
  it("returns none for a selection not in the original or an empty translation", () => {
    expect(alignTranslation("hello", "привет", "goodbye", "привет").kind).toBe("none");
    expect(alignTranslation("hello", "", "hello", "привет").kind).toBe("none");
  });
});
