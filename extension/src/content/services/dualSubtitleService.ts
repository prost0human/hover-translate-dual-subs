import { CAPTION_WINDOW, VIDEO_PLAYER } from "../consts/consts.ts";
import { TranslationCore } from "../core/translationCore.ts";
import { getCaptionText, looksLikeEnglishCaption } from "../utils/subtitleText.ts";
import { alignTranslation } from "../utils/alignTranslation.ts";
import { DUAL_SETTINGS_KEY, DualSubtitleSettings, normalizeDualSettings } from "../../common/types/dualSubtitles.ts";
import { TranslationCacheData } from "../../common/types/translations.ts";

const DEBOUNCE_MS = 350;
const ERROR_COOLDOWN_MS = 15_000;
const MAX_IN_FLIGHT = 2;

type Selection = { text: string; translation?: string };
interface CaptionView {
  window: HTMLElement;
  player: HTMLElement;
  overlay: HTMLDivElement;
  resizeObserver?: ResizeObserver;
  text: string;
  translation: string;
  selection?: Selection;
  revision: number;
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
  private failures = new Map<string, number>();
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
      if (view.text !== text) {
        view.text = text;
        view.translation = "";
        view.revision++;
        clearTimeout(view.timeout);
        view.overlay.textContent = "";
        view.overlay.removeAttribute("data-alignment");
        const revision = view.revision;
        view.timeout = setTimeout(() => void this.translate(view!, revision), DEBOUNCE_MS);
      }
      this.applyStyle(view);
      this.position(view);
    }
    for (const [caption, view] of this.views) {
      if (!live.has(caption)) {
        this.removeView(view);
        this.views.delete(caption);
      }
    }
    this.abortObsoleteRequests();
  }

  /** Selection is supplied by HoverTranslate, including Shift-selected phrases. */
  public setSelection(caption: HTMLElement | null, text: string, translation?: string): void {
    for (const view of this.views.values()) {
      view.selection = view.window === caption && text ? { text, translation } : undefined;
      this.render(view);
    }
  }

  public clearSelection(): void {
    this.setSelection(null, "");
  }

  public getTranslation(caption: HTMLElement | null, source: string): string | undefined {
    const view = caption && this.views.get(caption);
    return view && view.text === source && view.translation ? view.translation : undefined;
  }

  public getOverlay(caption: HTMLElement): HTMLElement | null {
    const view = this.views.get(caption);
    return view?.overlay.textContent ? view.overlay : null;
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
  };

  private createView(caption: HTMLElement, player: HTMLElement): CaptionView {
    const overlay = document.createElement("div");
    overlay.className = "ht-dual-subtitle";
    overlay.lang = "ru";
    overlay.setAttribute("aria-live", "polite");
    player.appendChild(overlay);
    const view: CaptionView = { window: caption, player, overlay, text: "", translation: "", revision: 0 };
    if (typeof ResizeObserver !== "undefined") {
      view.resizeObserver = new ResizeObserver(() => this.position(view));
      view.resizeObserver.observe(player);
      view.resizeObserver.observe(caption);
    }
    return view;
  }

  private removeView(view: CaptionView): void {
    view.revision++;
    clearTimeout(view.timeout);
    view.resizeObserver?.disconnect();
    view.overlay.remove();
  }

  private abortObsoleteRequests(): void {
    const needed = new Set(Array.from(this.views.values(), (view) => view.text));
    for (const [text, request] of this.requests) {
      if (needed.has(text)) continue;
      this.requests.delete(text);
      request.controller.abort();
    }
  }

  private async translate(view: CaptionView, revision: number): Promise<void> {
    if (!this.isCurrent(view, revision)) return;
    const text = view.text;
    if ((this.failures.get(text) ?? 0) > Date.now()) {
      this.showError(view);
      return;
    }
    let request = this.requests.get(text);
    if (!request) {
      if (this.requests.size >= MAX_IN_FLIGHT) {
        view.timeout = setTimeout(() => void this.translate(view, revision), DEBOUNCE_MS);
        return;
      }
      const controller = new AbortController();
      const promise = this.core.translateText(text, undefined, controller.signal, { sourceLanguageCode: "en", targetLanguageCode: "ru" });
      request = { controller, promise };
      this.requests.set(text, request);
    }
    try {
      const result = await request.promise;
      if (!this.isCurrent(view, revision)) return;
      if (!result?.translatedText) {
        if (!request.controller.signal.aborted) this.showError(view);
        return;
      }
      this.failures.delete(text);
      view.translation = result.translatedText;
      this.render(view);
      this.position(view);
    } catch (error) {
      if (!this.isCurrent(view, revision) || request.controller.signal.aborted) return;
      console.warn("Subtitle translation failed", error);
      this.failures.set(text, Date.now() + ERROR_COOLDOWN_MS);
      this.showError(view);
    } finally {
      if (this.requests.get(text) === request) this.requests.delete(text);
    }
  }

  private isCurrent(view: CaptionView, revision: number): boolean {
    return !this.destroyed && this.views.get(view.window) === view && view.revision === revision && view.window.isConnected;
  }

  private showError(view: CaptionView): void {
    view.translation = "";
    view.overlay.textContent = chrome.i18n.getMessage("dualSubtitleError") || "Subtitle translation unavailable";
    view.overlay.setAttribute("data-status", "error");
    this.position(view);
  }

  private render(view: CaptionView): void {
    if (!view.translation) return;
    const selection = this.settings.crossHighlight ? view.selection : undefined;
    const alignment = selection
      ? alignTranslation(view.text, view.translation, selection.text, selection.translation)
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
    view.overlay.style.fontSize = `${this.settings.fontSize}px`;
    view.overlay.style.color = `rgba(255, 255, 255, ${this.settings.textOpacity / 100})`;
    view.overlay.style.backgroundColor = `rgba(8, 8, 8, ${this.settings.backgroundOpacity / 100})`;
  }

  private positionAll = (): void => {
    for (const view of this.views.values()) this.position(view);
  };

  private position(view: CaptionView): void {
    const caption = view.window.getBoundingClientRect();
    const player = view.player.getBoundingClientRect();
    view.overlay.style.left = `${caption.left + caption.width / 2 - player.left}px`;
    view.overlay.style.top = `${caption.top - player.top - this.settings.verticalGap}px`;
    view.overlay.style.maxWidth = `${Math.max(0, player.width * 0.9)}px`;
  }
}
