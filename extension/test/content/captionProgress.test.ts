import { describe, expect, it } from "vitest";
import { hasRollingOverlap, isCaptionContinuation, isCaptionPrefix, isTranslationRelevant } from "../../src/content/utils/captionProgress.ts";

describe("automatic caption continuity", () => {
  it("accepts whole-word extensions, whitespace and trailing punctuation", () => {
    expect(isCaptionPrefix("Hello.", "hello,   everyone")).toBe(true);
    expect(isCaptionPrefix("I look forward", "I look forward to it")).toBe(true);
    expect(isCaptionPrefix("", "hello")).toBe(false);
    expect(isCaptionPrefix("We", "Welcome back")).toBe(false);
    expect(isCaptionPrefix("part", "party time")).toBe(false);
  });
  it("accepts a meaningful suffix/prefix when a visual line rolls up, but not a short common word", () => {
    expect(hasRollingOverlap("I look forward to working", "forward to working together")).toBe(true);
    expect(hasRollingOverlap("It was in the", "in the house")).toBe(false);
    expect(hasRollingOverlap("The small dog", "the large dog")).toBe(false);
    expect(isCaptionContinuation("one two three", "two three four")).toBe(true);
    expect(isCaptionContinuation("We like this", "A different subject")).toBe(false);
  });
  it("does not retain a translation when its English source was corrected or rolled away", () => {
    expect(isTranslationRelevant("one two three", "two three four")).toBe(true);
    expect(isTranslationRelevant("one two three", "one two")).toBe(false);
    expect(isTranslationRelevant("one two three", "four five six")).toBe(false);
  });
});
