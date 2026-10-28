// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BaseTranslator } from "../../src/common/translators/baseTranslator.ts";
import { TranslationCore } from "../../src/content/core/translationCore.ts";
import { SubtitleCore } from "../../src/content/core/subtitleCore.ts";
import { VideoController } from "../../src/content/core/videoController.ts";
import { DualSubtitleService } from "../../src/content/services/dualSubtitleService.ts";
import { MutationObserverService } from "../../src/content/services/mutationObserverService.ts";
import { TooltipService } from "../../src/content/services/tooltipService.ts";
import { RatingPromptService } from "../../src/content/services/ratingPromptService.ts";
import { MessageService } from "../../src/background/services/messageService.ts";
import { state } from "../../src/content/state/stateManager.ts";
import { defaultSettings } from "../../src/common/consts/defaultValues.ts";
import { FakeChrome, installFakeChrome } from "../fakeChrome.ts";

class Translator extends BaseTranslator {
  calls: string[] = [];
  waitFor?: string;
  finish?: (result: { detectedLanguageCode: string; translatedText: string }) => void;
  get name() { return "Fake"; }
  get key() { return "fake"; }
  async getAvailableLanguages() { return { sourceLanguages: [], targetLanguages: [] }; }
  async translate(text: string) {
    this.calls.push(text);
    if (text === this.waitFor) {
      return new Promise<{ detectedLanguageCode: string; translatedText: string }>((resolve) => { this.finish = resolve; });
    }
    const answers: Record<string, string> = {
      "I didn't expect him to back down": "Я не ожидал, что он отступит.",
      "back down": "отступить", "New caption": "Новая строка",
    };
    return { detectedLanguageCode: "en", translatedText: answers[text] ?? "перевод" };
  }
}
let fake: FakeChrome;
let observer: MutationObserverService;
let core: TranslationCore;
let translator: Translator;
let caption: HTMLElement;
let segment: HTMLElement;
let video: HTMLVideoElement;
let playing: boolean;
const mouse = (node: Element, type: string, shiftKey = false) => node.dispatchEvent(new MouseEvent(type, { bubbles: false, shiftKey, button: 0, clientX: 10, clientY: 10 }));

beforeEach(async () => {
  fake = installFakeChrome(); new MessageService();
  state.settings = { ...defaultSettings, targetLanguageCode: "ru" };
  document.body.innerHTML = "<div class=\"html5-video-player\"><video></video><div class=\"ytp-caption-window-container\"><div class=\"caption-window\"><div class=\"caption-visual-line\"><span class=\"ytp-caption-segment\" style=\"color: white\">I didn't expect him to back down.</span></div></div></div></div>";
  caption = document.querySelector(".caption-window")!; segment = document.querySelector(".ytp-caption-segment")!;
  video = document.querySelector("video")!; playing = true;
  Object.defineProperty(video, "paused", { get: () => !playing });
  video.pause = vi.fn(() => { playing = false; });
  video.play = vi.fn(async () => { playing = true; });
  translator = new Translator(); core = new TranslationCore(translator); await core.loadTranslationCache();
  const dual = new DualSubtitleService(core, { enabled: true });
  const control = new VideoController();
  const rating = new RatingPromptService(control);
  const tooltip = new TooltipService(core, rating, dual);
  observer = new MutationObserverService(new SubtitleCore(tooltip), control, tooltip, rating, dual);
});
afterEach(() => { observer.destroy(); core.destroy(); document.body.innerHTML = ""; });

it("native caption mutation → dual layer → Shift hover, pause, save context and resume", async () => {
  await vi.waitFor(() => expect(document.querySelector(".ht-dual-subtitle")?.textContent).toBe("Я не ожидал, что он отступит."), { timeout: 3000 });
  const words = Array.from(segment.querySelectorAll<HTMLElement>(".custom-tooltip-word"));
  const back = words.find((word) => word.textContent?.trim() === "back")!;
  const down = words.find((word) => word.textContent?.trim() === "down.")!;
  mouse(caption, "pointerenter"); expect(video.paused).toBe(true);
  mouse(back, "pointerenter"); mouse(back, "pointerleave", true); mouse(down, "pointerenter", true);
  await vi.waitFor(() => expect(document.querySelector(".custom-tooltip")?.textContent).toBe("отступить"));
  expect(document.querySelector(".ht-dual-subtitle mark")?.textContent).toBe("отступит");
  mouse(down, "pointerdown"); mouse(down, "pointerup");
  await vi.waitFor(() => expect((fake.storage.local.savedTranslations as unknown[])?.length).toBe(1));
  expect((fake.storage.local.savedTranslations as Record<string, unknown>[])[0]).toMatchObject({ originalText: "back down", exampleOriginal: "I didn't expect him to back down.", exampleTranslation: "Я не ожидал, что он отступит." });
  mouse(down, "pointerleave"); mouse(caption, "pointerleave"); expect(video.paused).toBe(false);
  // YouTube can modify a text node in place, not just insert/remove a line.
  segment.textContent = "New caption";
  await vi.waitFor(() => expect(document.querySelector(".ht-dual-subtitle")?.textContent).toBe("Новая строка"), { timeout: 3000 });
  expect(segment.querySelectorAll(".custom-tooltip-word")).toHaveLength(2);
  expect(translator.calls.filter((text) => text === "New caption")).toHaveLength(1);
});

it("keeps a partial translation visible but never saves it as the translation of a longer example", async () => {
  await vi.waitFor(() => expect(document.querySelector(".ht-dual-subtitle")?.textContent).toBe("Я не ожидал, что он отступит."));
  const extended = "I didn't expect him to back down. today";
  translator.waitFor = extended;
  segment.appendChild(document.createTextNode(" today"));
  await vi.waitFor(() => expect(segment.querySelectorAll(".custom-tooltip-word")).toHaveLength(8));
  expect(document.querySelector(".ht-dual-subtitle")?.textContent).toBe("Я не ожидал, что он отступит.");
  await vi.waitFor(() => expect(translator.finish).toBeDefined(), { timeout: 3000 });
  const words = Array.from(segment.querySelectorAll<HTMLElement>(".custom-tooltip-word"));
  const back = words.find((word) => word.textContent?.trim() === "back")!;
  const down = words.find((word) => word.textContent?.trim() === "down.")!;
  mouse(caption, "pointerenter");
  mouse(back, "pointerenter"); mouse(back, "pointerleave", true); mouse(down, "pointerenter", true);
  await vi.waitFor(() => expect(document.querySelector(".custom-tooltip")?.textContent).toBe("отступить"));
  mouse(down, "pointerdown"); mouse(down, "pointerup");
  await vi.waitFor(() => expect((fake.storage.local.savedTranslations as unknown[])?.length).toBe(1));
  const [saved] = fake.storage.local.savedTranslations as Record<string, unknown>[];
  expect(saved.exampleOriginal).toBe(extended);
  expect(saved.exampleTranslation).toBeUndefined();

  caption.style.display = "none";
  await vi.waitFor(() => expect(document.querySelector(".ht-dual-subtitle")).toBeNull());
  translator.finish?.({ detectedLanguageCode: "en", translatedText: "Поздний перевод" });
  await Promise.resolve();
  expect(document.querySelector(".ht-dual-subtitle")).toBeNull();
});
