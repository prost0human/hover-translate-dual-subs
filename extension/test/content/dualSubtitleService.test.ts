// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseTranslator, TranslatedData } from "../../src/common/translators/baseTranslator.ts";
import { TranslationCore } from "../../src/content/core/translationCore.ts";
import { DualSubtitleService } from "../../src/content/services/dualSubtitleService.ts";
import { getCaptionText } from "../../src/content/utils/subtitleText.ts";
import { defaultSettings } from "../../src/common/consts/defaultValues.ts";
import { DUAL_SETTINGS_KEY, normalizeDualSettings } from "../../src/common/types/dualSubtitles.ts";
import { state } from "../../src/content/state/stateManager.ts";
import { installFakeChrome } from "../fakeChrome.ts";

class FakeTranslator extends BaseTranslator {
  calls: string[] = [];
  answers = new Map<string, string>();
  wait = new Map<string, (value: TranslatedData) => void>();
  signals = new Map<string, AbortSignal | undefined>();
  delayed = false;
  fails = false;
  get name() { return "Fake"; }
  get key() { return "fake"; }
  async getAvailableLanguages() { return { sourceLanguages: [], targetLanguages: [] }; }
  async translate(text: string, source: string, target: string, signal?: AbortSignal): Promise<TranslatedData> {
    this.calls.push(`${source}:${target}:${text}`);
    this.signals.set(text, signal);
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
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const reply = (text: string, translatedText: string) => {
  const resolve = translator.wait.get(text);
  expect(resolve, `a request for ${text}`).toBeDefined();
  resolve!({ detectedLanguageCode: "en", translatedText });
};
const restart = (text: string) => {
  dual.destroy();
  segment.textContent = text;
  dual = new DualSubtitleService(core, { enabled: true });
  dual.setContainer(container);
};
const changeText = (text: string) => { segment.textContent = text; dual.sync(); };

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
  it("updates during a stream of words without erasing the previous fragment or inventing dictionary context", async () => {
    translator.delayed = true;
    restart("I");
    await vi.advanceTimersByTimeAsync(120);
    expect(translator.calls).toEqual(["en:ru:I"]);

    changeText("I look"); await vi.advanceTimersByTimeAsync(200);
    changeText("I look forward"); await vi.advanceTimersByTimeAsync(200);
    expect(translator.signals.get("I")?.aborted).toBe(false);
    reply("I", "Я"); await flush();
    expect(overlay()?.textContent).toBe("Я");
    expect(dual.getTranslation(caption, "I look forward")).toBeUndefined();
    dual.setSelection(caption, "look", "посмотри");
    expect(overlay()?.getAttribute("data-alignment")).toBe("none");
    expect(overlay()?.querySelector("mark")).toBeNull();

    changeText("I look forward to"); await vi.advanceTimersByTimeAsync(200);
    expect(overlay()?.textContent).toBe("Я");
    changeText("I look forward to learning"); await vi.advanceTimersByTimeAsync(200);
    expect(translator.calls).toEqual(["en:ru:I", "en:ru:I look forward to learning"]);
    changeText("I look forward to learning English"); await vi.advanceTimersByTimeAsync(200);
    expect(overlay()?.textContent).toBe("Я");
    reply("I look forward to learning", "Я с нетерпением жду учёбы"); await flush();
    expect(overlay()?.textContent).toBe("Я с нетерпением жду учёбы");
    expect(dual.getTranslation(caption, "I look forward to learning English")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(600);
    reply("I look forward to learning English", "Я с нетерпением жду изучения английского"); await flush();
    expect(overlay()?.textContent).toBe("Я с нетерпением жду изучения английского");
    expect(dual.getTranslation(caption, "I look forward to learning English")).toBe("Я с нетерпением жду изучения английского");
  });

  it("ignores out-of-order prefix replies and bounds concurrent requests", async () => {
    translator.delayed = true;
    restart("We"); await vi.advanceTimersByTimeAsync(120);
    changeText("We are"); await vi.advanceTimersByTimeAsync(800);
    changeText("We are learning"); await vi.advanceTimersByTimeAsync(800);
    expect(translator.calls).toEqual(["en:ru:We", "en:ru:We are"]);
    reply("We are", "Мы есть"); await flush();
    expect(overlay()?.textContent).toBe("Мы есть");
    await vi.advanceTimersByTimeAsync(150);
    expect(translator.calls).toEqual(["en:ru:We", "en:ru:We are", "en:ru:We are learning"]);
    reply("We are learning", "Мы учимся"); await flush();
    reply("We", "УСТАРЕВШИЙ"); await flush();
    expect(overlay()?.textContent).toBe("Мы учимся");
    expect(dual.getTranslation(caption, "We are learning")).toBe("Мы учимся");
  });

  it("can use a cached fragment even when two older network requests are still in flight", async () => {
    await core.translateText("We are learning", undefined, undefined, { sourceLanguageCode: "en", targetLanguageCode: "ru" });
    translator.calls = [];
    translator.delayed = true;
    restart("We"); await vi.advanceTimersByTimeAsync(120);
    changeText("We are"); await vi.advanceTimersByTimeAsync(800);
    changeText("We are learning"); await vi.advanceTimersByTimeAsync(800);
    expect(translator.calls).toEqual(["en:ru:We", "en:ru:We are"]);
    expect(overlay()?.textContent).toBe("русский We are learning");
    reply("We are", "Устаревший"); await flush();
    expect(overlay()?.textContent).toBe("русский We are learning");
  });

  it("clears immediately for an unrelated line, a hidden track or a removed window, even when replies arrive late", async () => {
    translator.delayed = true;
    restart("First line"); await vi.advanceTimersByTimeAsync(120);
    changeText("A different line");
    expect(translator.signals.get("First line")?.aborted).toBe(true);
    expect(overlay()?.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(120);
    reply("A different line", "Другая строка"); await flush();
    reply("First line", "Старая строка"); await flush();
    expect(overlay()?.textContent).toBe("Другая строка");
    changeText("A different line grows"); await vi.advanceTimersByTimeAsync(800);
    caption.style.display = "none"; dual.sync();
    expect(overlay()).toBeNull();
    reply("A different line grows", "Поздний ответ"); await flush();
    expect(overlay()).toBeNull();
    caption.style.display = ""; changeText("A fresh track"); await vi.advanceTimersByTimeAsync(120);
    caption.remove(); dual.sync();
    reply("A fresh track", "Ещё позже"); await flush();
    expect(overlay()).toBeNull();
  });

  it("retains a relevant translation over roll-up, replaces it, and clears it when the translated words roll away", async () => {
    restart("First line");
    const secondLine = document.createElement("div");
    secondLine.className = "caption-visual-line";
    secondLine.innerHTML = "<span class=\"ytp-caption-segment\" style=\"color: white\">second line stays</span>";
    caption.appendChild(secondLine); dual.sync();
    await vi.advanceTimersByTimeAsync(120);
    expect(overlay()?.textContent).toBe("русский First line second line stays");

    // YouTube removes the first line and redraws the remaining line as new nodes.
    caption.querySelector(".caption-visual-line")?.remove();
    secondLine.querySelector("span")!.textContent = "second line stays here";
    dual.sync();
    expect(overlay()?.textContent).toBe("русский First line second line stays");
    expect(dual.getTranslation(caption, "second line stays here")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(800);
    expect(overlay()?.textContent).toBe("русский second line stays here");

    secondLine.querySelector("span")!.textContent = "completely unrelated words";
    dual.sync();
    expect(overlay()?.textContent).toBe("");
  });

  it("preserves the previous fragment on failure and retries the latest text after a shared cooldown", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    restart("A line"); await vi.advanceTimersByTimeAsync(120);
    expect(overlay()?.textContent).toBe("русский A line");
    translator.fails = true;
    changeText("A line grows"); await vi.advanceTimersByTimeAsync(800);
    expect(overlay()?.textContent).toBe("русский A line");
    changeText("A line grows longer"); await vi.advanceTimersByTimeAsync(3_000);
    expect(translator.calls).toHaveLength(2);
    translator.fails = false;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(translator.calls).toHaveLength(3);
    expect(overlay()?.textContent).toBe("русский A line grows longer");
  });

  it("defaults old or malformed position settings to above and moves/stacks overlays at the top of each player", async () => {
    expect(normalizeDualSettings({ enabled: true }).position).toBe("above");
    expect(normalizeDualSettings({ position: "invalid" as "top" }).position).toBe("above");
    await waitForDebounce();
    const player = caption.closest<HTMLElement>(".html5-video-player")!;
    vi.spyOn(player, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, width: 600 } as DOMRect);
    vi.spyOn(caption, "getBoundingClientRect").mockReturnValue({ left: 250, top: 350, width: 300 } as DOMRect);
    dual.sync();
    expect(overlay()?.dataset.position).toBe("above");
    expect(overlay()?.style.left).toBe("300px");
    expect(overlay()?.style.top).toBe("294px");
    expect(dual.getOverlay(caption)).toBe(overlay());

    const second = caption.cloneNode(true) as HTMLElement;
    second.querySelector(".ytp-caption-segment")!.textContent = "Another speaker";
    container.appendChild(second); dual.sync();
    await vi.advanceTimersByTimeAsync(120);
    const overlays = Array.from(document.querySelectorAll<HTMLElement>(".ht-dual-subtitle"));
    vi.spyOn(overlays[0], "getBoundingClientRect").mockReturnValue({ height: 30 } as DOMRect);
    const update = chrome.storage.sync.set({ [DUAL_SETTINGS_KEY]: { enabled: true, position: "top", verticalGap: 10 } });
    await flush(); await update;
    expect(overlays[0].dataset.position).toBe("top");
    expect(overlays[0].style.left).toBe("300px");
    expect(overlays[0].style.top).toBe("18px");
    expect(overlays[1].style.top).toBe("52px");
    expect(dual.getOverlay(caption)).toBeNull();
    window.dispatchEvent(new Event("resize"));
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(overlays[1].style.top).toBe("52px");
  });

});
