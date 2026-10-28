import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderPopup } from "./renderPopup.tsx";
import { dictionaryLinks } from "@/pages/DictionaryPage/lib/helpers/dictionaryLinks.ts";
import { getAnkiCSVToExport, getCSVToExport, getJSONToExport } from "@/features/ExportTranslations/lib/helpers/getFormattedData.ts";
import { parseDictionaryBackup } from "@/features/ExportTranslations/lib/helpers/importDictionary.ts";
import { installFakeChrome } from "@extension-test/fakeChrome.ts";

const entry = {
  id: "a", originalText: "back down", translatedText: "отступить", sourceLanguageCode: "en", targetLanguageCode: "ru", timestamp: 1,
  translatorName: "Google", exampleOriginal: "He said, \"back down\".\nAgain", exampleTranslation: "Он сказал: отступи", videoUrl: "https://www.youtube.com/watch?v=abc&t=42", note: "=note",
};

describe("Anki, backup and external dictionaries", () => {
  it("exports six UTF-8 CSV fields with quotes, newlines and spreadsheet protection", async () => {
    installFakeChrome({ local: { savedTranslations: [entry] } });
    const csv = await getAnkiCSVToExport();
    expect(csv).toBe("#separator:Comma\n#html:false\n#columns:English,Russian,Example,Example translation,Video URL,Note\n\"back down\",отступить,\"He said, \"\"back down\"\".\nAgain\",Он сказал: отступи,https://www.youtube.com/watch?v=abc&t=42,'=note");
    installFakeChrome({ local: { savedTranslations: [{ ...entry, originalText: "#hashtag" }] } });
    expect(await getAnkiCSVToExport()).toContain("\n\"#hashtag\",");
    installFakeChrome({ local: { savedTranslations: [entry] } });
    expect(await getCSVToExport()).toContain("Example translation,Video title,Video URL,Video time (seconds),Note");
    expect(JSON.parse(await getJSONToExport())[0]).toMatchObject({ Example: entry.exampleOriginal, Note: entry.note });
  });
  it("imports original-formatted JSON without losing the fields and rejects broken data before writing", () => {
    const [restored] = parseDictionaryBackup(JSON.stringify([{ Original: "back down", Translation: "отступить", Language: "en-ru", Translator: "Google", Date: "23/09/2026 12:30:05", Example: "He backed down", Note: "remember" }]));
    expect(restored).toMatchObject({ originalText: "back down", translatedText: "отступить", sourceLanguageCode: "en", targetLanguageCode: "ru", exampleOriginal: "He backed down", note: "remember" });
    expect(new Date(restored.timestamp).getFullYear()).toBe(2026);
    expect(() => parseDictionaryBackup("[{}, 7]")).toThrow();
    expect(() => parseDictionaryBackup("{}")).toThrow();
  });
  it("encodes words and phrases without turning them into URL parameters", () => {
    const links = dictionaryLinks("look forward to");
    expect(links[0].url).toBe("https://dictionary.cambridge.org/us/dictionary/english-russian/look-forward-to");
    expect(links[1].url).toBe("https://context.reverso.net/translation/english-russian/look%20forward%20to");
    const multi = new URL(links[2].url);
    expect(multi.searchParams.get("s")).toBe("look forward to");
    expect(multi.searchParams.get("l1")).toBe("1");
    expect(multi.searchParams.get("l2")).toBe("2");
    expect(new URL(dictionaryLinks("a&b")[2].url).searchParams.get("s")).toBe("a&b");
  });
  it("lets a viewer edit a saved entry and inspect all three links", async () => {
    const { user, fake } = await renderPopup({ route: "/dictionary", local: { savedTranslations: [entry] } });
    await screen.findByText("back down");
    await user.click(screen.getByRole("button", { name: "Open in an external dictionary" }));
    expect((await screen.findByRole("menuitem", { name: "Cambridge" })).getAttribute("href")).toContain("back-down");
    expect(screen.getByRole("menuitem", { name: "Reverso Context" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Multitran" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Edit translation" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit dictionary entry" });
    const note = within(dialog).getByLabelText("Note");
    await user.clear(note); await user.type(note, "my note");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect((fake.storage.local.savedTranslations as typeof entry[])[0].note).toBe("my note"));
    expect(await screen.findByText("my note")).toBeTruthy();
  });
  it("reports a read failure instead of silently hiding dual subtitle settings", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderPopup({ failingReads: { sync: ["dualSubtitleSettings"] } });
    expect(await screen.findByText("Could not load dual subtitle settings. Reopen settings to try again.")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Dual subtitles (English → Russian)" })).toBeNull();
  });
  it("enables the mode without rewriting the original settings", async () => {
    const { fake, user } = await renderPopup();
    const toggle = await screen.findByRole("switch", { name: "Dual subtitles (English → Russian)" });
    await user.click(toggle);
    await waitFor(() => expect(fake.storage.sync.dualSubtitleSettings).toMatchObject({ enabled: true, showRussian: true }));
    expect(await screen.findByRole("switch", { name: "Cross-highlight translation" })).toBeTruthy();
    expect(fake.storage.sync.settings).toBeUndefined();
  });
  it("defaults old settings to above, saves the top position, and restores it when settings reopen", async () => {
    const { fake, user, unmount } = await renderPopup({ sync: { dualSubtitleSettings: { enabled: true, showRussian: true } } });
    const position = await screen.findByRole("combobox", { name: "Russian subtitle position" });
    expect(position.textContent).toBe("Above the English captions");
    await user.click(position);
    await user.click(await screen.findByRole("option", { name: "Top of the video" }));
    await waitFor(() => expect(fake.storage.sync.dualSubtitleSettings).toMatchObject({ enabled: true, position: "top" }));
    expect(screen.getByText(/Distance from the top/)).toBeTruthy();
    const saved = fake.storage.sync.dualSubtitleSettings;
    unmount();
    await renderPopup({ sync: { dualSubtitleSettings: saved } });
    expect((await screen.findByRole("combobox", { name: "Russian subtitle position" })).textContent).toBe("Top of the video");
  });
  it("shows and saves the position choices in Russian", async () => {
    const { fake, user } = await renderPopup({ language: "ru", sync: { dualSubtitleSettings: { enabled: true, position: "top" } } });
    const position = await screen.findByRole("combobox", { name: "Расположение русского текста" });
    expect(position.textContent).toBe("Вверху видеоплеера");
    expect(screen.getByText(/Расстояние от верха/)).toBeTruthy();
    await user.click(position);
    await user.click(await screen.findByRole("option", { name: "Над английскими субтитрами" }));
    await waitFor(() => expect(fake.storage.sync.dualSubtitleSettings).toMatchObject({ position: "above" }));
  });
});
