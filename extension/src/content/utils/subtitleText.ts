import { CAPTION_SEGMENT, CAPTION_VISUAL_LINE } from "../consts/consts.ts";
import { isVisibleCaptionSegment } from "./domUtils.ts";

/** Reads YouTube's live lines, not our overlay; styled transparent copies are ignored. */
export function getCaptionText(captionWindow: HTMLElement): string {
  // A track may be hidden by a style change rather than by removing its nodes.
  for (let element: HTMLElement | null = captionWindow; element; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (element.hidden || element.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden") return "";
    if (element.classList.contains("html5-video-player")) break;
  }
  const visualLines = Array.from(captionWindow.querySelectorAll<HTMLElement>(`.${CAPTION_VISUAL_LINE}`));
  const lines = visualLines.length ? visualLines : [captionWindow];
  return lines.map((line) => Array.from(line.querySelectorAll<HTMLElement>(`.${CAPTION_SEGMENT}`))
    .filter(isVisibleCaptionSegment)
    .map((segment) => segment.textContent ?? "")
    .join("")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/\s+/g, " ").trim())
    .filter(Boolean).join(" ");
}

/** The feature is explicitly for English captions; never send a Russian line back for translation. */
export function looksLikeEnglishCaption(text: string): boolean {
  return /[a-z]/i.test(text) && !/[\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}
