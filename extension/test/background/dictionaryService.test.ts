import { beforeEach, describe, expect, it } from "vitest";
import { DictionaryService } from "../../src/background/services/dictionaryService.ts";
import { TranslationData } from "../../src/common/types/translations.ts";
import { FakeChrome, installFakeChrome } from "../fakeChrome.ts";

const entry = (id: string, extra: Partial<TranslationData> = {}): TranslationData => ({
  id, originalText: id, translatedText: `перевод ${id}`, sourceLanguageCode: "en", targetLanguageCode: "ru", translatorName: "Google", timestamp: 1, ...extra,
});
let fake: FakeChrome;
let dictionary: DictionaryService;
beforeEach(() => { fake = installFakeChrome(); dictionary = new DictionaryService(); });

describe("dictionary mutations", () => {
  it("serializes simultaneous saves and preserves older records", async () => {
    fake.storage.local.savedTranslations = [entry("legacy")];
    await Promise.all([dictionary.save(entry("a")), dictionary.save(entry("b"))]);
    expect((fake.storage.local.savedTranslations as TranslationData[]).map(({ id }) => id)).toEqual(["b", "a", "legacy"]);
  });
  it("deduplicates without erasing the original note, id or date; fills missing context", async () => {
    fake.storage.local.savedTranslations = [entry("word", { note: "my note" })];
    const result = await dictionary.save(entry("word", { id: "new", originalText: "WORD", exampleOriginal: "A word", timestamp: 9 }));
    expect(result).toEqual({ count: 1, duplicate: true });
    expect(fake.storage.local.savedTranslations).toEqual([entry("word", { note: "my note", exampleOriginal: "A word" })]);
  });
  it("edits and removes by id without destroying unrelated fields", async () => {
    fake.storage.local.savedTranslations = [entry("a", { videoUrl: "https://www.youtube.com/watch?v=1" }), entry("b")];
    await dictionary.update("a", { note: "review", translatedText: "новый", timestamp: 99 });
    await dictionary.remove("b");
    expect(fake.storage.local.savedTranslations).toEqual([entry("a", { videoUrl: "https://www.youtube.com/watch?v=1", note: "review", translatedText: "новый" })]);
    await dictionary.clear();
    expect(fake.storage.local.savedTranslations).toEqual([]);
  });
  it("reports read/write failures without wiping the dictionary", async () => {
    fake.storage.local.savedTranslations = [entry("kept")];
    fake.failingWrites.local = ["savedTranslations"];
    await expect(dictionary.remove("kept")).rejects.toThrow();
    expect(fake.storage.local.savedTranslations).toEqual([entry("kept")]);
    fake.failingWrites.local = [];
    await expect(dictionary.update("missing", { note: "x" })).rejects.toThrow("not found");
  });
});
