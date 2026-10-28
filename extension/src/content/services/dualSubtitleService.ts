import { CAPTION_WINDOW, VIDEO_PLAYER } from "../consts/consts.ts";
import { TranslationCore } from "../core/translationCore.ts";
import { getCaptionText, looksLikeEnglishCaption } from "../utils/subtitleText.ts";
import { alignTranslation } from "../utils/alignTranslation.ts";
import { isCaptionContinuation, isCaptionPrefix, isTranslationRelevant } from "../utils/captionProgress.ts";
import { DUAL_SETTINGS_KEY, DualSubtitleSettings, normalizeDualSettings } from "../../common/types/dualSubtitles.ts";
import { TranslationCacheData } from "../../common/types/translations.ts";

// Start the first fragment promptly, then coalesce updates without waiting for
// the stream of words to stop. Limit traffic even when captions change rapidly.
const FIRST_FRAGMENT_DELAY_MS = 120;
const UPDATE_INTERVAL_MS = 800;
const CAPACITY_RETRY_MS = 150;
const ERROR_COOLDOWN_MS = 15_000;
const MAX_IN_FLIGHT = 2;
const TOP_INSET_PX = 8;
const TOP_STACK_GAP_PX = 4;
const SUBTITLE_LANGUAGES = { sourceLanguageCode: "en", targetLanguageCode: "ru" };

type Selection = { text: string; translation?: string };
interface CaptionView {
  window: HTMLElement;
  player: HTMLElement;
  overlay: HTMLDivElement;
  resizeObserver?: ResizeObserver;
  text: string;
  translation: string;
  /** The exact English snapshot used for the translation currently on screen. */
  translationSource: string;
  selection?: Selection;
  revision: number;
  generation: number;
  appliedRevision: number;
  lastRequestedText: string;
  lastRequestedRevision: number;
  lastRequestAt: number | null;
  timeout?: ReturnType<typeof setTimeout>;
}
interface Request { controller: AbortController; promise: Promise<TranslationCacheData | null> }

/**
 * Uses the existing YouTube captions and TranslationCore. The overlay is a
 * player sibling, not a caption child, so the existing observer never watches
 * our own rendering and YouTube's hover/pause/drag handlers remain intact.
 */
export class DualSubtitleService {
  private settings: DualSubtitleSettings;
  private container: Element | null = null;
  private views = new Map<HTMLElement, CaptionView>();
  private requests = new Map<string, Request>();
  private retryAfter = 0;
  private destroyed = false;

  constructor(private readonly core: TranslationCore, settings?: Partial<DualSubtitleSettings>) {
    this.settings = normalizeDualSettings(settings);
    chrome.storage.onChanged.addListener(this.onStorageChanged);
    window.addEventListener("resize", this.positionAll);
    document.addEventListener("fullscreenchange", this.positionAll);
  }

  public setContainer(container: Element | null): void {
    this.container = container;
    this.sync();
  }

  /** Called after native caption mutations have been processed. */
  public sync(): void {
    if (this.destroyed) return;
    const windows = this.settings.enabled && this.settings.showRussian && this.container
      ? Array.from(this.container.querySelectorAll<HTMLElement>(`.${CAPTION_WINDOW}`))
      : [];
    const live = new Set<HTMLElement>();
    for (const caption of windows) {
      const player = caption.closest<HTMLElement>(`.${VIDEO_PLAYER}`);
      const text = getCaptionText(caption);
      if (!player || !looksLikeEnglishCaption(text)) continue;
      live.add(caption);
      let view = this.views.get(caption);
      if (!view) {
        view = this.createView(caption, player);
        this.views.set(caption, view);
      }
      if (view.text !== text) this.updateText(view, text);
      this.applyStyle(view);
    }
    for (const [caption, view] of this.views) {
      if (!live.has(caption)) {
        this.removeView(view);
        this.views.delete(caption);
      }
    }
    this.abortObsoleteRequests();
    this.positionAll();
  }

  /** Selection is supplied by HoverTranslate, including Shift-selected phrases. */
  public setSelection(caption: HTMLElement | null, text: string, translation?: string): void {
    for (const view of this.views.values()) {
      view.selection = view.window === caption && text ? { text, translation } : undefined;
      this.render(view);
    }
    this.positionAll();
  }

  public clearSelection(): void {
    this.setSelection(null, "");
  }

  public getTranslation(caption: HTMLElement | null, source: string): string | undefined {
    const view = caption && this.views.get(caption);
    // A partial translation must not be saved as the translation of a longer
    // example sentence that has appeared since the request was made.
    return view && view.text === source && view.translationSource === source && view.translation
      ? view.translation : undefined;
  }

  /** Only an overlay above the original needs to make room for the word card. */
  public getOverlay(caption: HTMLElement): HTMLElement | null {
    const view = this.views.get(caption);
    return this.settings.position === "above" && view?.overlay.textContent ? view.overlay : null;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
    window.removeEventListener("resize", this.positionAll);
    document.removeEventListener("fullscreenchange", this.positionAll);
    for (const view of this.views.values()) this.removeView(view);
    this.views.clear();
    for (const request of this.requests.values()) request.controller.abort();
    this.requests.clear();
  }

  private onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== "sync" || !changes[DUAL_SETTINGS_KEY]) return;
    this.settings = normalizeDualSettings(changes[DUAL_SETTINGS_KEY].newValue as Partial<DualSubtitleSettings> | undefined);
    this.sync();
    for (const view of this.views.values()) this.render(view);
    this.positionAll();
  };

  private createView(caption: HTMLElement, player: HTMLElement): CaptionView {
    const overlay = document.createElement("div");
    overlay.className = "ht-dual-subtitle";
    overlay.lang = "ru";
    overlay.setAttribute("aria-live", "polite");
    player.appendChild(overlay);
    const view: CaptionView = {
      window: caption, player, overlay, text: "", translation: "", translationSource: "",
      revision: 0, generation: 0, appliedRevision: 0,
      lastRequestedText: "", lastRequestedRevision: 0, lastRequestAt: null,
    };
    if (typeof ResizeObserver !== "undefined") {
      view.resizeObserver = new ResizeObserver(this.positionAll);
      view.resizeObserver.observe(player);
      view.resizeObserver.observe(caption);
    }
    return view;
  }

  private removeView(view: CaptionView): void {
    view.generation++;
    clearTimeout(view.timeout);
    view.timeout = undefined;
    view.resizeObserver?.disconnect();
    view.overlay.remove();
  }

  private updateText(view: CaptionView, text: string): void {
    const continued = isCaptionContinuation(view.text, text);
    if (!continued) {
      // The same DOM window can be reused for an unrelated caption. Nothing
      // from its previous generation may be rendered or selected in this one.
      view.generation++;
      view.selection = undefined;
      view.lastRequestedText = "";
      view.lastRequestAt = null;
      clearTimeout(view.timeout);
      view.timeout = undefined;
    }
    view.text = text;
    view.revision++;
    if (view.translation && isTranslationRelevant(view.translationSource, text)) {
      this.render(view);
    } else if (view.translation || !continued) {
      this.clearTranslation(view);
    }
    // Do not restart this timer on every word: a live stream may never pause.
    this.schedule(view);
  }

  private clearTranslation(view: CaptionView): void {
    view.translation = "";
    view.translationSource = "";
    view.overlay.textContent = "";
    view.overlay.removeAttribute("data-alignment");
    view.overlay.removeAttribute("data-status");
  }

  private schedule(view: CaptionView): void {
    if (!this.isLive(view)) return;
    const now = Date.now();
    if (this.retryAfter > now && !view.translation && view.overlay.dataset.status !== "error") this.showError(view);
    if (view.timeout !== undefined) return;
    const nextUpdate = view.lastRequestAt === null ? now + FIRST_FRAGMENT_DELAY_MS : view.lastRequestAt + UPDATE_INTERVAL_MS;
    const delay = Math.max(0, nextUpdate - now, this.retryAfter - now);
    view.timeout = setTimeout(() => {
      view.timeout = undefined;
      void this.translate(view);
    }, delay);
  }

  private abortObsoleteRequests(): void {
    for (const [text, request] of this.requests) {
      // A request for a prefix is still useful as a growing line is displayed.
      // Rolling off that prefix or switching to another line makes it obsolete.
      const needed = Array.from(this.views.values()).some((view) => isCaptionPrefix(text, view.text));
      if (needed) continue;
      this.requests.delete(text);
      request.controller.abort();
    }
  }

  private async translate(view: CaptionView): Promise<void> {
    if (!this.isLive(view) || view.lastRequestedText === view.text) return;
    if (this.retryAfter > Date.now()) {
      this.schedule(view);
      return;
    }
    const text = view.text;
    let request = this.requests.get(text);
    if (!request) {
      if (this.requests.size >= MAX_IN_FLIGHT && !this.core.hasCachedTranslation(text, undefined, SUBTITLE_LANGUAGES)) {
        view.timeout = setTimeout(() => {
          view.timeout = undefined;
          void this.translate(view);
        }, CAPACITY_RETRY_MS);
        return;
      }
      const controller = new AbortController();
      const promise = this.core.translateText(text, undefined, controller.signal, SUBTITLE_LANGUAGES);
      request = { controller, promise };
      this.requests.set(text, request);
    }
    const revision = view.revision;
    const generation = view.generation;
    view.lastRequestedText = text;
    view.lastRequestedRevision = revision;
    view.lastRequestAt = Date.now();
    try {
      const result = await request.promise;
      if (!this.canApply(view, generation, revision, text) || request.controller.signal.aborted) return;
      if (!result?.translatedText) {
        this.failed(view, revision);
        return;
      }
      view.translation = result.translatedText;
      view.translationSource = text;
      view.appliedRevision = revision;
      this.render(view);
      this.positionAll();
      if (this.retryAfter > Date.now()) {
        // Another in-flight request succeeded, so retry pending captions now
        // rather than making them wait out an obsolete provider cooldown.
        this.retryAfter = 0;
        for (const pending of this.views.values()) {
          clearTimeout(pending.timeout);
          pending.timeout = undefined;
          if (pending.lastRequestedText !== pending.text) this.schedule(pending);
        }
      }
    } catch (error) {
      if (!this.canApply(view, generation, revision, text) || request.controller.signal.aborted) return;
      console.warn("Subtitle translation failed", error);
      this.failed(view, revision);
    } finally {
      if (this.requests.get(text) === request) this.requests.delete(text);
    }
  }

  private failed(view: CaptionView, revision: number): void {
    this.retryAfter = Date.now() + ERROR_COOLDOWN_MS;
    // Do not erase a newer request that is already running.
    if (view.lastRequestedRevision === revision) view.lastRequestedText = "";
    if (!view.translation) this.showError(view);
    if (view.lastRequestedText !== view.text) this.schedule(view);
  }

  private isLive(view: CaptionView): boolean {
    return !this.destroyed && this.views.get(view.window) === view && view.window.isConnected;
  }

  private canApply(view: CaptionView, generation: number, revision: number, source: string): boolean {
    return this.isLive(view) && view.generation === generation && revision >= view.appliedRevision && isCaptionPrefix(source, view.text);
  }

  private showError(view: CaptionView): void {
    view.overlay.textContent = chrome.i18n.getMessage("dualSubtitleError") || "Subtitle translation unavailable";
    view.overlay.setAttribute("data-status", "error");
    this.positionAll();
  }

  private render(view: CaptionView): void {
    if (!view.translation) return;
    const selection = this.settings.crossHighlight ? view.selection : undefined;
    const alignment = selection
      ? alignTranslation(view.translationSource, view.translation, selection.text, selection.translation)
      : { kind: "none" as const, ranges: [] };
    view.overlay.removeAttribute("data-status");
    view.overlay.setAttribute("data-alignment", alignment.kind);
    view.overlay.textContent = "";
    let offset = 0;
    for (const range of alignment.ranges) {
      view.overlay.append(document.createTextNode(view.translation.slice(offset, range.start)));
      const mark = document.createElement("mark");
      mark.textContent = view.translation.slice(range.start, range.end);
      view.overlay.appendChild(mark);
      offset = range.end;
    }
    view.overlay.append(document.createTextNode(view.translation.slice(offset)));
  }

  private applyStyle(view: CaptionView): void {
    view.overlay.dataset.position = this.settings.position;
    view.overlay.style.fontSize = `${this.settings.fontSize}px`;
    view.overlay.style.color = `rgba(255, 255, 255, ${this.settings.textOpacity / 100})`;
    view.overlay.style.backgroundColor = `rgba(8, 8, 8, ${this.settings.backgroundOpacity / 100})`;
  }

  private positionAll = (): void => {
    const topOffsets = new Map<HTMLElement, number>();
    for (const view of this.views.values()) {
      const player = view.player.getBoundingClientRect();
      view.overlay.style.maxWidth = `${Math.max(0, player.width * 0.9)}px`;
      if (this.settings.position === "top") {
        const top = topOffsets.get(view.player) ?? TOP_INSET_PX + this.settings.verticalGap;
        view.overlay.style.left = `${player.width / 2}px`;
        view.overlay.style.top = `${top}px`;
        if (view.overlay.textContent) topOffsets.set(view.player, top + view.overlay.getBoundingClientRect().height + TOP_STACK_GAP_PX);
      } else {
        const caption = view.window.getBoundingClientRect();
        view.overlay.style.left = `${caption.left + caption.width / 2 - player.left}px`;
        view.overlay.style.top = `${caption.top - player.top - this.settings.verticalGap}px`;
      }
    }
  };
}
