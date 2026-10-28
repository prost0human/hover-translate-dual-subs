// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseTranslator, TranslatedData } from "../../src/common/translators/baseTranslator.ts";
import { TranslationCore } from "../../src/content/core/translationCore.ts";
import { DualSubtitleService } from "../../src/content/services/dualSubtitleService.ts";
import { getCaptionText } from "../../src/content/utils/subtitleText.ts";
import { defaultSettings } from "../../src/common/consts/defaultValues.ts";
import { DUAL_SETTINGS_KEY } from "../../src/common/types/dualSubtitles.ts";
import { state } from "../../src/content/state/stateManager.ts";
import { installFakeChrome } from "../fakeChrome.ts";

class FakeTranslator extends BaseTranslator {
  calls: string[] = [];
  answers = new Map<string, string>();
  wait = new Map<string, (value: TranslatedData) => void>();
  delayed = false;
  fails = false;
  get name() { return "Fake"; }
  get key() { return "fake"; }
  async getAvailableLanguages() { return { sourceLanguages: [], targetLanguages: [] }; }
  async translate(text: string, source: string, target: string): Promise<TranslatedData> {
    this.calls.push(`${source}:${target}:${text}`);
    if (this.fails) throw new Error("offline");
    if (this.delayed) return new Promise((resolve) => this.wait.set(text, resolve));
    return { detectedLanguageCode: "en", translatedText: this.answers.get(text) ?? `русский ${text}` };
  }
}
let translator: FakeTranslator;
let core: TranslationCore;
let dual: DualSubtitleService;
let container: HTMLElement;
let caption: HTMLElement;
let segment: HTMLElement;
const overlay = () => document.querySelector<HTMLElement>(".ht-dual-subtitle");
const waitForDebounce = async () => { await vi.advanceTimersByTimeAsync(400); };

beforeEach(async () => {
  installFakeChrome();
  state.settings = { ...defaultSettings, targetLanguageCode: "en" };
  document.body.innerHTML = "<div class=\"html5-video-player\"><video></video><div class=\"ytp-caption-window-container\"><div class=\"caption-window\"><div class=\"caption-visual-line\"><span class=\"ytp-caption-segment\" style=\"color: white\">I didn't expect him to back down.</span></div></div></div></div>";
  container = document.querySelector(".ytp-caption-window-container")!;
  caption = document.querySelector(".caption-window")!;
  segment = document.querySelector(".ytp-caption-segment")!;
  translator = new FakeTranslator();
  translator.answers.set("I didn't expect him to back down", "Я не ожидал, что он отступит.");
  core = new TranslationCore(translator);
  await core.loadTranslationCache();
  vi.useFakeTimers();
  dual = new DualSubtitleService(core, { enabled: true });
  dual.setContainer(container);
});

afterEach(() => { dual.destroy(); core.destroy(); document.body.innerHTML = ""; vi.useRealTimers(); });

describe("dual captions on the saved player DOM", () => {
  it("uses English→Russian regardless of the hover setting and displays a separate non-destructive layer", async () => {
    expect(getCaptionText(caption)).toBe("I didn't expect him to back down.");
    await waitForDebounce();
    expect(translator.calls).toEqual(["en:ru:I didn't expect him to back down"]);
    expect(overlay()?.textContent).toBe("Я не ожидал, что он отступит.");
    expect(segment.textContent).toBe("I didn't expect him to back down.");
    expect(overlay()?.parentElement).toBe(caption.closest(".html5-video-player"));
  });
  it("cross-highlights an evidenced phrase and falls back to the sentence", async () => {
    await waitForDebounce();
    dual.setSelection(caption, "back down", "отступить");
    expect(overlay()?.getAttribute("data-alignment")).toBe("phrase");
    expect(overlay()?.querySelector("mark")?.textContent).toBe("отступит");
    dual.setSelection(caption, "back down", "сдаться");
    expect(overlay()?.getAttribute("data-alignment")).toBe("sentence");
    expect(overlay()?.querySelector("mark")?.textContent).toBe("Я не ожидал, что он отступит.");
    dual.clearSelection();
    expect(overlay()?.querySelector("mark")).toBeNull();
  });
  it("ignores unchanged DOM and reuses the existing translation cache", async () => {
    await waitForDebounce();
    dual.sync(); dual.sync(); await waitForDebounce();
    expect(translator.calls).toHaveLength(1);
    segment.textContent = "Another line"; dual.sync(); await waitForDebounce();
    segment.textContent = "I didn't expect him to back down."; dual.sync(); await waitForDebounce();
    expect(translator.calls).toHaveLength(2);
    expect(overlay()?.textContent).toBe("Я не ожидал, что он отступит.");
  });
  it("never displays an obsolete answer after text or track changes", async () => {
    translator.delayed = true;
    await waitForDebounce();
    segment.textContent = "New line"; dual.sync(); await waitForDebounce();
    translator.wait.get("New line")?.({ detectedLanguageCode: "en", translatedText: "Новая строка" });
    await Promise.resolve(); await Promise.resolve();
    translator.wait.get("I didn't expect him to back down")?.({ detectedLanguageCode: "en", translatedText: "Устаревший" });
    await Promise.resolve(); await Promise.resolve();
    expect(overlay()?.textContent).toBe("Новая строка");
  });
  it("reacts to live settings, hidden captions and Russian tracks without requests", async () => {
    await waitForDebounce();
    const firstChange = chrome.storage.sync.set({ [DUAL_SETTINGS_KEY]: { enabled: true, crossHighlight: false, fontSize: 30 } });
    await vi.advanceTimersByTimeAsync(0); await firstChange;
    dual.setSelection(caption, "back down", "отступить");
    expect(overlay()?.querySelector("mark")).toBeNull();
    expect(overlay()?.style.fontSize).toBe("30px");
    caption.style.display = "none"; dual.sync();
    expect(overlay()).toBeNull();
    caption.style.display = ""; segment.textContent = "Русские субтитры"; dual.sync(); await waitForDebounce();
    expect(overlay()).toBeNull();
    expect(translator.calls).toHaveLength(1);
    const secondChange = chrome.storage.sync.set({ [DUAL_SETTINGS_KEY]: { enabled: false } });
    await vi.advanceTimersByTimeAsync(0); await secondChange;
    expect(overlay()).toBeNull();
  });
  it("shows an error rather than blocking or repeatedly requesting a failed line", async () => {
    translator.fails = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await waitForDebounce();
    expect(overlay()?.getAttribute("data-status")).toBe("error");
    dual.sync(); await waitForDebounce();
    expect(translator.calls).toHaveLength(1);
  });
});
